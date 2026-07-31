import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type {
  CatalogIndex,
  CatalogRegistration,
  CreateStashCatalogOptions,
  DoctorRequest,
  DoctorResult,
  ReadRequest,
  ReadResult,
  RefreshRequest,
  RefreshResult,
  ResolveRequest,
  ResolveResult,
  ResolvedSkill,
  SkillRecord,
  StashCatalog,
} from "./types.js";
import {
  INDEX_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION,
  StashError,
} from "./types.js";
import { loadConfiguration } from "./internal/configuration.js";
import {
  loadCatalogIndex,
  scanCatalog,
  writeFreshIndex,
} from "./internal/catalog-index.js";
import {
  ROUTING_PROFILE_VERSION,
  searchRecords,
  toListedSkill,
  toResolvedSkill,
} from "./internal/search.js";
import {
  clampPageSize,
  compactText,
  decodeCursor,
  encodeCursor,
  isPathInside,
  mediaTypeFor,
  normalizeRelativePath,
  normalizeSourceIdentity,
  normalizeSourceUrl,
  normalizeText,
  sha256,
  sha256File,
} from "./internal/util.js";

interface CursorPayload extends Record<string, unknown> {
  version: 1;
  routingProfileVersion: typeof ROUTING_PROFILE_VERSION;
  fingerprint: string;
  requestHash: string;
  offset: number;
}

interface LoadedIndexes {
  indexes: CatalogIndex[];
  registrations: CatalogRegistration[];
  warnings: CatalogIndex["warnings"];
  fingerprint: string;
}

interface NormalizedSourceSelector {
  identity: string;
  url?: string;
}

function normalizeSourceSelector(source: string): NormalizedSourceSelector {
  const url = normalizeSourceUrl(source);
  return {
    identity: normalizeSourceIdentity(source),
    ...(url ? { url } : {}),
  };
}

function matchesSource(
  record: SkillRecord,
  selectors: NormalizedSourceSelector[],
): boolean {
  const identities = [record.source.id, record.source.displayName]
    .filter((value): value is string => value !== undefined)
    .map(normalizeSourceIdentity);
  const sourceUrl = record.source.url
    ? normalizeSourceUrl(record.source.url)
    : undefined;
  return selectors.some(
    (selector) =>
      identities.includes(selector.identity) ||
      (selector.url !== undefined && selector.url === sourceUrl),
  );
}

function sourceSortKey(record: SkillRecord): string {
  if (record.source.id) {
    return `0:${normalizeSourceIdentity(record.source.id)}`;
  }
  if (record.source.displayName) {
    return `1:${normalizeSourceIdentity(record.source.displayName)}`;
  }
  if (record.source.url) {
    return `2:${
      normalizeSourceUrl(record.source.url) ??
      normalizeSourceIdentity(record.source.url)
    }`;
  }
  return "3:";
}

class StashCatalogImplementation implements StashCatalog {
  readonly #configuration;
  readonly #cacheDir: string;
  readonly #now: () => number;

  constructor(
    configuration: Awaited<ReturnType<typeof loadConfiguration>>["configuration"],
    cacheDir: string,
    now: () => number,
  ) {
    this.#configuration = configuration;
    this.#cacheDir = cacheDir;
    this.#now = now;
  }

  async #loadIndexes(catalogIds?: string[]): Promise<LoadedIndexes> {
    const selected = this.#selectRegistrations(catalogIds);
    const indexes: CatalogIndex[] = [];
    for (const catalog of selected) {
      const loaded = await loadCatalogIndex(
        catalog,
        this.#cacheDir,
        this.#configuration.defaults.cacheTtlMs,
        this.#now,
      );
      indexes.push(loaded.index);
    }
    return {
      indexes,
      registrations: selected,
      warnings: indexes.flatMap((index) => index.warnings),
      fingerprint: sha256(
        indexes
          .map((index) => `${index.catalogId}:${index.fingerprint}`)
          .sort()
          .join("\n"),
      ),
    };
  }

  #selectRegistrations(catalogIds?: string[]): CatalogRegistration[] {
    const enabled = this.#configuration.catalogs.filter(
      (catalog) => catalog.enabled !== false,
    );
    if (!catalogIds || catalogIds.length === 0) {
      return enabled;
    }
    const requested = new Set(catalogIds);
    const selected = enabled.filter((catalog) => requested.has(catalog.id));
    const missing = [...requested].filter(
      (id) => !selected.some((catalog) => catalog.id === id),
    );
    if (missing.length > 0) {
      throw new StashError(
        "catalog-unavailable",
        `Unknown or disabled catalog(s): ${missing.join(", ")}.`,
        4,
      );
    }
    return selected;
  }

  async resolve(request: ResolveRequest): Promise<ResolveResult> {
    const started = this.#now();
    let loaded: LoadedIndexes;
    try {
      loaded = await this.#loadIndexes(request.catalogIds);
    } catch (error) {
      if (
        error instanceof StashError &&
        error.code === "catalog-unavailable"
      ) {
        return {
          schemaVersion: RESULT_SCHEMA_VERSION,
          status: "catalog-unavailable",
          mode: request.kind,
          totalRelevant: 0,
          totalPossible: 0,
          page: { size: 0 },
          matches: [],
          diagnostics: {
            indexVersion: INDEX_SCHEMA_VERSION,
            stale: false,
            elapsedMs: this.#now() - started,
            warnings: [{ code: error.code, message: error.message }],
          },
        };
      }
      throw error;
    }

    const group = request.group ? normalizeText(request.group) : undefined;
    const sourceSelectors = (request.sources ?? []).map(
      normalizeSourceSelector,
    );
    const hasSourceFilter = (request.sources?.length ?? 0) > 0;
    const records = loaded.indexes
      .flatMap((index) => index.records)
      .filter((record) => record.trust !== "quarantined")
      .filter(
        (record) =>
          !hasSourceFilter ||
          matchesSource(record, sourceSelectors),
      )
      .filter(
        (record) =>
          !group ||
          normalizeText(record.group ?? "") === group ||
          normalizeText(record.group ?? "").startsWith(`${group} `),
      );

    switch (request.kind) {
      case "exact":
        return this.#resolveExact(
          request.name,
          records,
          loaded,
          started,
        );
      case "list":
        return this.#resolveList(request, records, loaded, started);
      case "search":
        return this.#resolveSearch(request, records, loaded, started);
    }
  }

  #resolveExact(
    name: string,
    records: SkillRecord[],
    loaded: LoadedIndexes,
    started: number,
  ): ResolveResult {
    const normalized = compactText(name);
    if (!normalized) {
      return this.#emptyResult("exact", "invalid-request", loaded, started);
    }
    const matches = records.filter(
      (record) =>
        compactText(record.name) === normalized ||
        record.aliases.some((alias) => compactText(alias) === normalized),
    );
    const resolved = matches.map((record) => {
      const skill = toListedSkill(record);
      skill.relevance = {
        tier: "exact",
        score: 1,
        reasons: [
          {
            kind:
              compactText(record.name) === normalized ? "name" : "alias",
            value: name,
          },
        ],
      };
      return skill;
    });
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status:
        resolved.length === 0
          ? "no-match"
          : resolved.length > 1
            ? "ambiguous-exact"
            : "ok",
      mode: "exact",
      totalRelevant: resolved.length,
      totalPossible: 0,
      page: { size: resolved.length },
      matches: resolved,
      diagnostics: {
        indexVersion: INDEX_SCHEMA_VERSION,
        stale: false,
        elapsedMs: this.#now() - started,
        ...(loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}),
      },
    };
  }

  #resolveList(
    request: Extract<ResolveRequest, { kind: "list" }>,
    records: SkillRecord[],
    loaded: LoadedIndexes,
    started: number,
  ): ResolveResult {
    const sorted = [...records].sort(
      (left, right) =>
        sourceSortKey(left).localeCompare(sourceSortKey(right), "en") ||
        left.catalogId.localeCompare(right.catalogId, "en") ||
        (left.group ?? "").localeCompare(right.group ?? "", "en") ||
        left.name.localeCompare(right.name, "en") ||
        left.ref.localeCompare(right.ref, "en"),
    );
    const requestHash = sha256(
      JSON.stringify({
        kind: request.kind,
        catalogIds: request.catalogIds ?? [],
        sources: request.sources ?? [],
        group: request.group ?? "",
      }),
    );
    const paged = this.#page(
      sorted.map(toListedSkill),
      request.cursor,
      request.pageSize,
      loaded.fingerprint,
      requestHash,
    );
    if (paged.status === "cursor-stale") {
      return this.#emptyResult("list", "cursor-stale", loaded, started);
    }
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status: sorted.length > 0 ? "ok" : "no-match",
      mode: "list",
      totalRelevant: sorted.length,
      totalPossible: 0,
      page: {
        size: paged.matches.length,
        ...(paged.nextCursor ? { nextCursor: paged.nextCursor } : {}),
      },
      matches: paged.matches,
      diagnostics: {
        indexVersion: INDEX_SCHEMA_VERSION,
        stale: false,
        elapsedMs: this.#now() - started,
        ...(loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}),
      },
    };
  }

  #resolveSearch(
    request: Extract<ResolveRequest, { kind: "search" }>,
    records: SkillRecord[],
    loaded: LoadedIndexes,
    started: number,
  ): ResolveResult {
    if (!normalizeText(request.query)) {
      return this.#emptyResult("search", "invalid-request", loaded, started);
    }
    const searched = searchRecords(
      records,
      request.query,
      this.#configuration.defaults.materialScoreThreshold,
    );
    const displayed = request.includePossible
      ? [...searched.relevant, ...searched.possible]
      : searched.relevant;
    const requestHash = sha256(
      JSON.stringify({
        kind: request.kind,
        query: normalizeText(request.query),
        catalogIds: request.catalogIds ?? [],
        sources: request.sources ?? [],
        group: request.group ?? "",
        includePossible: request.includePossible ?? false,
      }),
    );
    const paged = this.#page(
      displayed.map(toResolvedSkill),
      request.cursor,
      request.pageSize,
      loaded.fingerprint,
      requestHash,
    );
    if (paged.status === "cursor-stale") {
      return this.#emptyResult("search", "cursor-stale", loaded, started);
    }
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status: searched.relevant.length > 0 ? "ok" : "no-match",
      mode: "search",
      totalRelevant: searched.relevant.length,
      totalPossible: searched.possible.length,
      page: {
        size: paged.matches.length,
        ...(paged.nextCursor ? { nextCursor: paged.nextCursor } : {}),
      },
      matches: paged.matches,
      diagnostics: {
        indexVersion: INDEX_SCHEMA_VERSION,
        stale: false,
        elapsedMs: this.#now() - started,
        expandedTerms: searched.expandedTerms,
        ...(loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}),
      },
    };
  }

  #page(
    matches: ResolvedSkill[],
    cursor: string | undefined,
    requestedPageSize: number | undefined,
    fingerprint: string,
    requestHash: string,
  ):
    | { status: "ok"; matches: ResolvedSkill[]; nextCursor?: string }
    | { status: "cursor-stale"; matches: [] } {
    const pageSize = clampPageSize(
      requestedPageSize,
      this.#configuration.defaults.pageSize,
    );
    let offset = 0;
    if (cursor) {
      const payload = decodeCursor<CursorPayload>(cursor);
      if (
        !payload ||
        payload.version !== 1 ||
        payload.routingProfileVersion !== ROUTING_PROFILE_VERSION ||
        payload.fingerprint !== fingerprint ||
        payload.requestHash !== requestHash ||
        !Number.isInteger(payload.offset) ||
        payload.offset < 0
      ) {
        return { status: "cursor-stale", matches: [] };
      }
      offset = payload.offset;
    }
    const pageMatches = matches.slice(offset, offset + pageSize);
    const nextOffset = offset + pageMatches.length;
    return {
      status: "ok",
      matches: pageMatches,
      ...(nextOffset < matches.length
        ? {
            nextCursor: encodeCursor({
              version: 1,
              routingProfileVersion: ROUTING_PROFILE_VERSION,
              fingerprint,
              requestHash,
              offset: nextOffset,
            }),
          }
        : {}),
    };
  }

  #emptyResult(
    mode: ResolveResult["mode"],
    status: ResolveResult["status"],
    loaded: LoadedIndexes,
    started: number,
  ): ResolveResult {
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status,
      mode,
      totalRelevant: 0,
      totalPossible: 0,
      page: { size: 0 },
      matches: [],
      diagnostics: {
        indexVersion: INDEX_SCHEMA_VERSION,
        stale: false,
        elapsedMs: this.#now() - started,
        ...(loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}),
      },
    };
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    const resource = request.resource ?? "SKILL.md";
    const normalizedResource = normalizeRelativePath(resource);
    if (!normalizedResource) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "resource-outside-skill",
        ref: request.ref,
        resource,
      };
    }
    const loaded = await this.#loadIndexes();
    let record: SkillRecord | undefined;
    let index: CatalogIndex | undefined;
    for (const candidateIndex of loaded.indexes) {
      const candidate = candidateIndex.records.find(
        (item) => item.ref === request.ref,
      );
      if (candidate) {
        record = candidate;
        index = candidateIndex;
        break;
      }
    }
    if (!record || !index) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "not-found",
        ref: request.ref,
        resource,
      };
    }
    if (record.trust === "quarantined") {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "quarantined",
        ref: request.ref,
        resource,
      };
    }

    const skillRoot = path.dirname(
      path.resolve(index.root, record.relativeSkillFile),
    );
    const candidatePath = path.resolve(skillRoot, normalizedResource);
    if (
      !isPathInside(skillRoot, candidatePath) ||
      !isPathInside(index.root, candidatePath)
    ) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "resource-outside-skill",
        ref: request.ref,
        resource,
      };
    }

    let resolvedPath: string;
    let resolvedSize = 0;
    try {
      resolvedPath = await realpath(candidatePath);
      if (
        !isPathInside(skillRoot, resolvedPath) ||
        !isPathInside(index.root, resolvedPath)
      ) {
        return {
          schemaVersion: RESULT_SCHEMA_VERSION,
          status: "resource-outside-skill",
          ref: request.ref,
          resource,
        };
      }
      const info = await stat(resolvedPath);
      if (!info.isFile()) {
        return {
          schemaVersion: RESULT_SCHEMA_VERSION,
          status: "not-found",
          ref: request.ref,
          resource,
        };
      }
      resolvedSize = info.size;
    } catch {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "not-found",
        ref: request.ref,
        resource,
      };
    }

    if (request.representation === "local-path") {
      let contentHash: string | undefined;
      if (request.expectedHash) {
        contentHash = await sha256File(resolvedPath);
        if (request.expectedHash !== contentHash) {
          return {
            schemaVersion: RESULT_SCHEMA_VERSION,
            status: "hash-mismatch",
            ref: request.ref,
            resource,
            contentHash,
            bytes: resolvedSize,
          };
        }
      }
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "ok",
        ref: request.ref,
        resource,
        localPath: resolvedPath,
        ...(contentHash ? { contentHash } : {}),
        bytes: resolvedSize,
      };
    }

    if (resolvedSize > 2_097_152) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "unsupported-resource",
        ref: request.ref,
        resource,
        bytes: resolvedSize,
      };
    }
    const buffer = await readFile(resolvedPath);
    if (buffer.includes(0)) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "unsupported-resource",
        ref: request.ref,
        resource,
        bytes: buffer.byteLength,
      };
    }
    const contentHash = sha256(buffer);
    if (request.expectedHash && request.expectedHash !== contentHash) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "hash-mismatch",
        ref: request.ref,
        resource,
        contentHash,
        bytes: buffer.byteLength,
      };
    }
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status: "ok",
      ref: request.ref,
      resource,
      mediaType: mediaTypeFor(resolvedPath) ?? "text/plain",
      contentHash,
      content: buffer.toString("utf8"),
      bytes: buffer.byteLength,
    };
  }

  async refresh(request: RefreshRequest = {}): Promise<RefreshResult> {
    const registrations = this.#selectRegistrations(request.catalogIds);
    const results: RefreshResult["catalogs"] = [];
    let failed = 0;
    for (const catalog of registrations) {
      try {
        const index = await writeFreshIndex(
          catalog,
          this.#cacheDir,
          this.#now,
        );
        results.push({
          catalogId: catalog.id,
          indexed: index.records.length,
          skipped: index.warnings.filter(
            (warning) => warning.code === "invalid-skill",
          ).length,
          warnings: index.warnings,
        });
      } catch (error) {
        failed += 1;
        results.push({
          catalogId: catalog.id,
          indexed: 0,
          skipped: 0,
          warnings: [
            {
              code: "refresh-failed",
              message: String(error),
            },
          ],
        });
      }
    }
    return {
      status:
        failed === 0 ? "ok" : failed === registrations.length ? "failed" : "partial",
      catalogs: results,
    };
  }

  async doctor(request: DoctorRequest = {}): Promise<DoctorResult> {
    const registrations = this.#selectRegistrations(request.catalogIds);
    const results: DoctorResult["catalogs"] = [];
    let failed = 0;
    for (const catalog of registrations) {
      try {
        const scanned = await scanCatalog(catalog, this.#now);
        results.push({
          catalogId: catalog.id,
          root: scanned.index.root,
          records: scanned.index.records.length,
          warnings: scanned.index.warnings,
          fingerprint: scanned.index.fingerprint,
        });
      } catch (error) {
        failed += 1;
        results.push({
          catalogId: catalog.id,
          root: catalog.root,
          records: 0,
          warnings: [{ code: "doctor-failed", message: String(error) }],
          fingerprint: "",
        });
      }
    }
    const warningCount = results.reduce(
      (sum, result) => sum + result.warnings.length,
      0,
    );
    return {
      status:
        failed === registrations.length
          ? "failed"
          : failed > 0 || warningCount > 0
            ? "warning"
            : "ok",
      catalogs: results,
    };
  }
}

export async function createStashCatalog(
  options: CreateStashCatalogOptions = {},
): Promise<StashCatalog> {
  const loaded = await loadConfiguration(options);
  return new StashCatalogImplementation(
    loaded.configuration,
    loaded.cacheDir,
    options.now ?? Date.now,
  );
}
