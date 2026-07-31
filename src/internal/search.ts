import type {
  RelevanceReason,
  RelevanceTier,
  ResolvedSkill,
  SkillRecord,
} from "../types.js";
import {
  compactDescription,
  compactText,
  jaccard,
  normalizeSourceIdentity,
  normalizeText,
  tokenize,
  trigrams,
} from "./util.js";

interface SearchCandidate {
  record: SkillRecord;
  tier: RelevanceTier;
  score: number;
  reasons: RelevanceReason[];
}

interface SearchResult {
  relevant: SearchCandidate[];
  possible: SearchCandidate[];
  expandedTerms: string[];
}

export const ROUTING_PROFILE_VERSION = 4 as const;

const FIELD_WEIGHTS = {
  name: 6,
  alias: 6,
  intent: 3,
  tag: 3,
  example: 2,
  description: 1.5,
  source: 6,
  group: 0.5,
} as const;

interface Field {
  kind: RelevanceReason["kind"] | "group";
  weight: number;
  values: string[];
}

interface PreparedField {
  kind: Field["kind"];
  weight: number;
  frequencies: Map<string, number>;
  length: number;
}

interface PreparedRecord {
  record: SkillRecord;
  fields: PreparedField[];
  allTokens: Set<string>;
}

function fieldsFor(record: SkillRecord): Field[] {
  return [
    { kind: "name", weight: FIELD_WEIGHTS.name, values: [record.name] },
    { kind: "alias", weight: FIELD_WEIGHTS.alias, values: record.aliases },
    { kind: "intent", weight: FIELD_WEIGHTS.intent, values: record.intents },
    { kind: "tag", weight: FIELD_WEIGHTS.tag, values: record.tags },
    {
      kind: "example",
      weight: FIELD_WEIGHTS.example,
      values: record.positiveExamples,
    },
    {
      kind: "description",
      weight: FIELD_WEIGHTS.description,
      values: [record.description],
    },
    {
      kind: "source",
      weight: FIELD_WEIGHTS.source,
      values: record.source.id ? [record.source.id] : [],
    },
    {
      kind: "group",
      weight: FIELD_WEIGHTS.group,
      values: record.group ? [record.group] : [],
    },
  ];
}

function tokenFrequency(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) {
    for (const token of tokenize(value)) {
      result.set(token, (result.get(token) ?? 0) + 1);
    }
  }
  return result;
}

function prepareRecord(record: SkillRecord): PreparedRecord {
  const preparedFields = fieldsFor(record).map((field) => {
    const frequencies = tokenFrequency(field.values);
    return {
      kind: field.kind,
      weight: field.weight,
      frequencies,
      length: Math.max(
        1,
        field.values.reduce((sum, value) => sum + tokenize(value).length, 0),
      ),
    };
  });
  return {
    record,
    fields: preparedFields,
    allTokens: new Set(
      preparedFields.flatMap((field) => [...field.frequencies.keys()]),
    ),
  };
}

function documentFrequencies(
  records: PreparedRecord[],
  queryTerms: string[],
): Map<string, number> {
  const result = new Map(queryTerms.map((term) => [term, 0]));
  for (const record of records) {
    for (const term of queryTerms) {
      if (record.allTokens.has(term)) {
        result.set(term, (result.get(term) ?? 0) + 1);
      }
    }
  }
  return result;
}

function idf(totalDocuments: number, documentFrequencyValue: number): number {
  return Math.log(
    1 + (totalDocuments - documentFrequencyValue + 0.5) /
      (documentFrequencyValue + 0.5),
  );
}

function negativePenalty(record: SkillRecord, queryTerms: string[]): number {
  if (record.negativeExamples.length === 0) {
    return 1;
  }
  const negativeTerms = new Set(record.negativeExamples.flatMap(tokenize));
  const hits = queryTerms.filter((term) => negativeTerms.has(term)).length;
  if (hits === 0) {
    return 1;
  }
  return Math.max(0.25, 1 - hits / Math.max(2, queryTerms.length));
}

function scoreRecord(
  prepared: PreparedRecord,
  totalRecords: number,
  frequenciesByDocument: Map<string, number>,
  queryTerms: string[],
): {
  score: number;
  matchedTerms: Set<string>;
  matchedKinds: Set<Field["kind"]>;
  descriptionMatchedTerms: Set<string>;
  reasons: RelevanceReason[];
} {
  let score = 0;
  const matchedTerms = new Set<string>();
  const matchedKinds = new Set<Field["kind"]>();
  const descriptionMatchedTerms = new Set<string>();
  const reasons: RelevanceReason[] = [];
  const seenReason = new Set<string>();

  for (const field of prepared.fields) {
    for (const term of queryTerms) {
      const frequency = field.frequencies.get(term) ?? 0;
      if (frequency === 0) {
        continue;
      }
      const termIdf = idf(
        totalRecords,
        frequenciesByDocument.get(term) ?? 0,
      );
      const normalizedTf = frequency / (0.25 + 0.75 * field.length);
      const weightedTf = normalizedTf * field.weight;
      score += termIdf * ((weightedTf * 2.2) / (weightedTf + 1.2));
      matchedTerms.add(term);
      matchedKinds.add(field.kind);
      if (field.kind === "description") {
        descriptionMatchedTerms.add(term);
      }
      if (field.kind !== "group") {
        const reasonKey = `${field.kind}:${term}`;
        if (!seenReason.has(reasonKey)) {
          reasons.push({ kind: field.kind, value: term });
          seenReason.add(reasonKey);
        }
      }
    }
  }

  score *= negativePenalty(prepared.record, queryTerms);
  return {
    score,
    matchedTerms,
    matchedKinds,
    descriptionMatchedTerms,
    reasons,
  };
}

function normalizedTerms(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(/\s+/u) : [];
}

function containsTermSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) {
    return false;
  }
  return haystack.some(
    (_, start) =>
      start + needle.length <= haystack.length &&
      needle.every((term, offset) => haystack[start + offset] === term),
  );
}

function hasTermBoundaryMatch(left: string, right: string): boolean {
  const leftTerms = normalizedTerms(left);
  const rightTerms = normalizedTerms(right);
  return (
    containsTermSequence(leftTerms, rightTerms) ||
    containsTermSequence(rightTerms, leftTerms)
  );
}

function hasPhraseMatch(record: SkillRecord, query: string): {
  matched: boolean;
  reason?: RelevanceReason;
} {
  const compactQuery = compactText(query);
  if (!compactQuery) {
    return { matched: false };
  }
  if (compactText(record.name) === compactQuery) {
    return { matched: true, reason: { kind: "name", value: query } };
  }
  for (const alias of record.aliases) {
    if (
      compactText(alias) === compactQuery ||
      hasTermBoundaryMatch(alias, query)
    ) {
      return { matched: true, reason: { kind: "alias", value: alias } };
    }
  }
  const normalizedSourceQuery = normalizeSourceIdentity(query);
  for (const source of [
    record.source.id,
    record.source.displayName,
  ]) {
    if (
      source &&
      normalizeSourceIdentity(source) === normalizedSourceQuery
    ) {
      return { matched: true, reason: { kind: "source", value: source } };
    }
  }
  if (
    hasTermBoundaryMatch(record.name, query)
  ) {
    return { matched: true, reason: { kind: "name", value: record.name } };
  }
  return { matched: false };
}

function highPriorityMatch(kinds: Set<Field["kind"]>): boolean {
  return (
    kinds.has("name") ||
    kinds.has("alias") ||
    kinds.has("intent") ||
    kinds.has("tag")
  );
}

function classifyCandidate(
  prepared: PreparedRecord,
  totalRecords: number,
  frequenciesByDocument: Map<string, number>,
  query: string,
  queryTerms: string[],
  materialScoreThreshold: number,
): SearchCandidate | undefined {
  const record = prepared.record;
  const phrase = hasPhraseMatch(record, query);
  const scored = scoreRecord(
    prepared,
    totalRecords,
    frequenciesByDocument,
    queryTerms,
  );

  if (phrase.matched) {
    return {
      record,
      tier: "strong",
      score: Math.max(scored.score, materialScoreThreshold * 2),
      reasons: phrase.reason
        ? [phrase.reason, ...scored.reasons].slice(0, 8)
        : scored.reasons.slice(0, 8),
    };
  }

  const denseDescriptionEvidence =
    scored.descriptionMatchedTerms.size >= 3;
  const materialEvidence =
    (scored.matchedTerms.size >= 2 &&
      scored.matchedKinds.size >= 2 &&
      highPriorityMatch(scored.matchedKinds)) ||
    denseDescriptionEvidence ||
    (queryTerms.length === 1 &&
      highPriorityMatch(scored.matchedKinds) &&
      !(
        scored.matchedKinds.size === 1 &&
        scored.matchedKinds.has("description")
      ));
  const evidenceAdjustedThreshold = denseDescriptionEvidence
    ? materialScoreThreshold * 0.58
    : scored.matchedTerms.size >= 2 &&
        scored.matchedKinds.size >= 2 &&
        highPriorityMatch(scored.matchedKinds)
      ? materialScoreThreshold * 0.75
      : materialScoreThreshold;

  if (materialEvidence && scored.score >= evidenceAdjustedThreshold) {
    return {
      record,
      tier:
        scored.matchedTerms.size >= 2 && scored.score >= materialScoreThreshold * 2
          ? "strong"
          : "material",
      score: scored.score,
      reasons: scored.reasons.slice(0, 8),
    };
  }

  if (scored.score > 0) {
    return {
      record,
      tier: "possible",
      score: scored.score,
      reasons: scored.reasons.slice(0, 8),
    };
  }

  return undefined;
}

function typoFallback(
  records: SkillRecord[],
  query: string,
): SearchCandidate[] {
  const queryTrigrams = trigrams(query);
  if (queryTrigrams.size === 0) {
    return [];
  }
  const candidates = records
    .filter((record) => record.trust !== "quarantined")
    .map((record) => {
      let best = jaccard(queryTrigrams, trigrams(record.name));
      let reasonValue = record.name;
      for (const alias of record.aliases) {
        const similarity = jaccard(queryTrigrams, trigrams(alias));
        if (similarity > best) {
          best = similarity;
          reasonValue = alias;
        }
      }
      return { record, best, reasonValue };
    })
    .filter((candidate) => candidate.best >= 0.62)
    .sort(
      (left, right) =>
        right.best - left.best ||
        left.record.ref.localeCompare(right.record.ref, "en"),
    );

  if (candidates.length === 0) {
    return [];
  }
  const first = candidates[0];
  const second = candidates[1];
  const uniqueStrong =
    first !== undefined &&
    first.best >= 0.76 &&
    (!second || first.best - second.best >= 0.08);

  return candidates.map((candidate, index) => ({
    record: candidate.record,
    tier: uniqueStrong && index === 0 ? "strong" : "possible",
    score: candidate.best,
    reasons: [{ kind: "typo", value: candidate.reasonValue }],
  }));
}

function tierRank(tier: RelevanceTier): number {
  switch (tier) {
    case "exact":
      return 0;
    case "strong":
      return 1;
    case "material":
      return 2;
    case "possible":
      return 3;
  }
}

function sortCandidates(candidates: SearchCandidate[]): SearchCandidate[] {
  return [...candidates].sort(
    (left, right) =>
      tierRank(left.tier) - tierRank(right.tier) ||
      right.score - left.score ||
      left.record.name.localeCompare(right.record.name, "en") ||
      left.record.ref.localeCompare(right.record.ref, "en"),
  );
}

export function searchRecords(
  records: SkillRecord[],
  query: string,
  materialScoreThreshold: number,
): SearchResult {
  const normalizedQuery = normalizeText(query);
  const queryTerms = tokenize(normalizedQuery);
  if (!normalizedQuery || queryTerms.length === 0) {
    return { relevant: [], possible: [], expandedTerms: [] };
  }
  const searchable = records.filter((record) => record.trust !== "quarantined");
  const prepared = searchable.map(prepareRecord);
  const frequenciesByDocument = documentFrequencies(prepared, queryTerms);
  const candidates = prepared
    .map((record) =>
      classifyCandidate(
        record,
        prepared.length,
        frequenciesByDocument,
        query,
        queryTerms,
        materialScoreThreshold,
      ),
    )
    .filter((candidate): candidate is SearchCandidate => candidate !== undefined);

  let relevant = candidates.filter((candidate) => candidate.tier !== "possible");
  let possible = candidates.filter((candidate) => candidate.tier === "possible");
  if (relevant.length === 0) {
    const typo = typoFallback(searchable, normalizedQuery);
    relevant = typo.filter((candidate) => candidate.tier !== "possible");
    possible = [
      ...possible,
      ...typo.filter((candidate) => candidate.tier === "possible"),
    ];
  }

  return {
    relevant: sortCandidates(relevant),
    possible: sortCandidates(possible),
    expandedTerms: queryTerms,
  };
}

export function toResolvedSkill(
  candidate: SearchCandidate,
): ResolvedSkill {
  return {
    ...toListedSkill(candidate.record),
    relevance: {
      tier: candidate.tier,
      score: Number(candidate.score.toFixed(4)),
      reasons: candidate.reasons,
    },
  };
}

export function toListedSkill(record: SkillRecord): ResolvedSkill {
  return {
    ref: record.ref,
    catalogId: record.catalogId,
    ...(record.group ? { group: record.group } : {}),
    name: record.name,
    description: compactDescription(record.description),
    compatibility: record.compatibility,
    trust: record.trust,
    ...(Object.keys(record.source).length > 0
      ? { source: record.source }
      : {}),
    contentHash: record.contentHash,
    ...(record.managedSkillId
      ? { managedSkillId: record.managedSkillId }
      : {}),
    ...(record.relatedCopies && record.relatedCopies.length > 0
      ? { relatedCopies: record.relatedCopies }
      : {}),
  };
}
