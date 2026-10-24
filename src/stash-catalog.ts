import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { CatalogIndex, CatalogRegistration, CreateStashCatalogOptions, DoctorRequest, DoctorResult, ReadRequest, ReadResult, RefreshRequest, RefreshResult, ResolveRequest, ResolveResult, ResolvedSkill, SkillRecord, StashCatalog } from "./types.js";
import { INDEX_SCHEMA_VERSION, RESULT_SCHEMA_VERSION, StashError } from "./types.js";
import { loadConfiguration } from "./internal/configuration.js";
import { scanCatalog } from "./internal/catalog-index.js";
import { loadSnapshot } from "./internal/catalog-snapshot.js";
import { projectManagedCopies } from "./internal/managed-projection.js";
import { classifyIndexes, readClassifications } from "./internal/classification.js";
import { clampPageSize, compactDescription, decodeCursor, encodeCursor, isPathInside, mediaTypeFor, normalizeRelativePath, normalizeSourceIdentity, normalizeSourceUrl, sha256, sha256File, sourceDisplayName } from "./internal/util.js";

const literal = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("und").trim();

function toListedSkill(record: SkillRecord): ResolvedSkill {
  return {
    ref: record.ref, catalogId: record.catalogId, name: record.name,
    description: record.purpose ?? compactDescription(record.description),
    ...(record.group ? { group: record.group } : {}),
    compatibility: record.compatibility, trust: record.trust,
    source: record.source, contentHash: record.contentHash,
    ...(record.managedSkillId ? { managedSkillId: record.managedSkillId } : {}),
    ...(record.relatedCopies?.length ? { relatedCopies: record.relatedCopies } : {}),
  };
}

interface NormalizedSourceSelector {
  identity: string;
  url?: string;
  repositoryUrls?: ReadonlySet<string>;
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
      (selector.url !== undefined && selector.url === sourceUrl) ||
      (sourceUrl !== undefined && selector.repositoryUrls?.has(sourceUrl) === true),
  );
}

function githubRepositoryIdentity(url: string): string | undefined {
  const parsed = new URL(url);
  if (
    parsed.origin !== "https://github.com" || parsed.username || parsed.password ||
    parsed.search || parsed.hash
  ) return undefined;
  const parts = parsed.pathname.replace(/\/$/u, "").split("/").slice(1);
  if (parts.length !== 2 || parts.some((part) => !/^[\w.-]+$/u.test(part))) {
    return undefined;
  }
  const repository = parts[1]!.replace(/\.git$/iu, "");
  if (!repository) return undefined;
  return normalizeSourceIdentity(`${parts[0]!}/${repository}`);
}

function resolveRepositorySelectors(
  records: SkillRecord[],
  selectors: NormalizedSourceSelector[],
): NormalizedSourceSelector[] {
  // Build only for shorthand requests, parsing each distinct URL once per resolve.
  let repositories: Map<string, Set<string>> | undefined;
  return selectors.map((selector) => {
    if (records.some((record) => matchesSource(record, [selector]))) return selector;
    if (selector.url !== undefined) return selector;
    if (!repositories) {
      repositories = new Map();
      const urls = new Set(records.map((record) => record.source.url));
      for (const value of urls) {
        const url = value && normalizeSourceUrl(value);
        if (!url) continue;
        const identity = githubRepositoryIdentity(url);
        if (!identity) continue;
        const variants = repositories.get(identity) ?? new Set<string>();
        variants.add(url);
        repositories.set(identity, variants);
      }
    }
    const candidates = [...repositories].filter(([identity]) =>
      identity === selector.identity || identity.split("/")[1] === selector.identity,
    );
    // Compare repository identities, retaining all original provenance URLs.
    return candidates.length === 1
      ? { ...selector, repositoryUrls: candidates[0]![1] }
      : selector;
  });
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

function summarizeList(records: SkillRecord[]): NonNullable<ResolveResult["summary"]> {
  const catalogs = new Map<string, number>();
  const groups = new Map<string, number>();
  const sources = new Map<string, {
    label: string; url?: string; count: number; catalogs: Set<string>; groups: Set<string>;
  }>();
  for (const record of records) {
    catalogs.set(record.catalogId, (catalogs.get(record.catalogId) ?? 0) + 1);
    const group = record.group ?? "(ungrouped)";
    groups.set(group, (groups.get(group) ?? 0) + 1);
    const normalizedUrl = record.source.url && normalizeSourceUrl(record.source.url);
    const repository = normalizedUrl ? githubRepositoryIdentity(normalizedUrl) : undefined;
    const key = repository ? `github:${repository}`
      : record.source.url ? `url:${normalizedUrl ?? record.source.url}`
      : record.source.id ? `id:${record.source.id}`
      : record.source.displayName ? `name:${record.source.displayName}` : "unattributed";
    const current = sources.get(key) ?? {
      label: sourceDisplayName(record.source),
      ...(record.source.url ? { url: record.source.url } : {}),
      count: 0, catalogs: new Set<string>(), groups: new Set<string>(),
    };
    current.count++;
    current.catalogs.add(record.catalogId);
    current.groups.add(group);
    sources.set(key, current);
  }
  const byCountThenName = (
    left: { count: number; name: string },
    right: { count: number; name: string },
  ) => right.count - left.count || left.name.localeCompare(right.name, "en");
  return {
    catalogs: [...catalogs].map(([name, count]) => ({ name, count })).sort(byCountThenName),
    groups: [...groups].map(([name, count]) => ({ name, count })).sort(byCountThenName),
    sources: [...sources.values()].map((source) => ({
      label: source.label,
      ...(source.url ? { url: source.url } : {}),
      count: source.count,
      catalogs: [...source.catalogs].sort((a, b) => a.localeCompare(b, "en")),
      groups: [...source.groups].sort((a, b) => a.localeCompare(b, "en")),
    })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en")),
  };
}


class StashCatalogImplementation implements StashCatalog {
  readonly #configuration;
  readonly #cacheDir: string;
  readonly #now: () => number;

  constructor(configuration: Awaited<ReturnType<typeof loadConfiguration>>["configuration"], cacheDir: string, now: () => number) {
    this.#configuration = configuration;
    this.#cacheDir = cacheDir;
    this.#now = now;
  }

  #selectRegistrations(catalogIds?: string[]): CatalogRegistration[] {
    const enabled = this.#configuration.catalogs.filter(c => c.enabled !== false);
    if (!catalogIds?.length) return enabled;
    if (catalogIds.some(id => !enabled.some(c => c.id === id))) {
      throw new StashError("catalog-unavailable", "Unknown or disabled catalog.", 4);
    }
    return enabled.filter(c => catalogIds.includes(c.id));
  }

  async resolve(request: ResolveRequest): Promise<ResolveResult> {
    const started = this.#now();
    const result: ResolveResult = {
      schemaVersion: RESULT_SCHEMA_VERSION, status: "ok", mode: request.kind,
      total: 0, page: { size: 0 }, matches: [],
      diagnostics: { indexVersion: INDEX_SCHEMA_VERSION, elapsedMs: 0 },
    };
    const finish = (status: ResolveResult["status"] = result.status): ResolveResult => {
      result.status = status;
      result.diagnostics.elapsedMs = this.#now() - started;
      return result;
    };
    if (!request || !["exact", "list"].includes(request.kind)) return finish("invalid-request");
    let selected: CatalogRegistration[];
    try { selected = this.#selectRegistrations(request.catalogIds); }
    catch (error) { if (error instanceof StashError && error.code === "catalog-unavailable") return finish("catalog-unavailable"); throw error; }
    let snapshot;
    try { snapshot = await loadSnapshot(this.#configuration, this.#cacheDir, this.#now); }
    catch (error) { if (error instanceof StashError && error.code === "catalog-unavailable") return finish("catalog-unavailable"); throw error; }
    result.diagnostics.snapshotAt = snapshot.generatedAt;
    const warnings = [...snapshot.warnings, ...snapshot.indexes.flatMap(index => index.warnings)];
    if (warnings.length) result.diagnostics.warnings = warnings;
    const available = [...snapshot.indexes.flatMap(index => index.records),
      ...(request.catalogIds?.length || (request.kind === "exact" && request.name.includes(":")) ? snapshot.copies : [])]
      .filter(record => record.trust !== "quarantined");
    const sources = resolveRepositorySelectors(available, (request.sources ?? []).map(normalizeSourceSelector));
    const groups = (request.groups ?? []).map(literal);
    let records = available.filter(record =>
      selected.some(c => c.id === record.catalogId) &&
      (!sources.length || matchesSource(record, sources)) &&
      (!groups.length || groups.includes(literal(record.group ?? "(ungrouped)"))));
    if (request.kind === "exact") {
      const name = literal(request.name);
      if (!name) return finish("invalid-request");
      records = records.filter(record => literal(record.name) === name || literal(record.ref) === name);
      result.matches = records.map(record => ({ ...toListedSkill(record), description: record.description }));
      result.total = result.matches.length;
      result.page.size = result.total;
      return finish(result.total > 1 ? "ambiguous-exact" : result.total ? "ok" : "no-match");
    }
    const text = literal(request.text ?? "");
    if (request.text !== undefined && !text) return finish("invalid-request");
    records = records.filter(record => !text ||
      [record.name, record.description, record.purpose ?? "", record.source.id ?? "", record.source.displayName ?? "", record.source.url ?? ""]
        .some(field => literal(field).includes(text)));
    records.sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "", "en") ||
      sourceSortKey(a).localeCompare(sourceSortKey(b), "en") || a.name.localeCompare(b.name, "en") || a.ref.localeCompare(b.ref, "en"));
    result.total = records.length;
    result.summary = summarizeList(records);
    const requestHash = sha256(JSON.stringify({ catalogIds: request.catalogIds ?? [], sources: request.sources ?? [], groups, text }));
    let offset = 0;
    if (request.cursor) {
      const cursor = decodeCursor<{version: number; fingerprint: string; requestHash: string; offset: number}>(request.cursor);
      if (!cursor || cursor.version !== 2 || cursor.fingerprint !== snapshot.fingerprint ||
          cursor.requestHash !== requestHash || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > records.length) {
        return finish("cursor-stale");
      }
      offset = cursor.offset;
    }
    const size = clampPageSize(request.pageSize, this.#configuration.defaults.pageSize);
    result.matches = records.slice(offset, offset + size).map(toListedSkill);
    result.page.size = result.matches.length;
    if (offset + size < records.length) result.page.nextCursor = encodeCursor({ version: 2, fingerprint: snapshot.fingerprint, requestHash, offset: offset + size });
    return finish(records.length ? "ok" : "no-match");
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
    const registrations = this.#configuration.catalogs.filter(c => c.enabled !== false && c.id === request.ref.split(":")[0]);
    const indexes: CatalogIndex[] = [];
    for (const catalog of registrations) indexes.push((await scanCatalog(catalog, this.#now)).index);
    let record: SkillRecord | undefined;
    let index: CatalogIndex | undefined;
    for (const candidateIndex of indexes) {
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
    const selected = this.#selectRegistrations(request.catalogIds);
    // Rebuild the aggregate snapshot atomically; scoped output never produces a partial cache.
    const snapshot = await loadSnapshot(this.#configuration, this.#cacheDir, this.#now, true);
    return {
      status: "ok",
      catalogs: snapshot.indexes.filter(index => selected.some(c => c.id === index.catalogId)).map(index => ({
        catalogId: index.catalogId, indexed: index.records.length,
        skipped: index.warnings.filter(w => w.code === "invalid-skill").length, warnings: index.warnings,
      })),
    };
  }

  async doctor(request: DoctorRequest = {}): Promise<DoctorResult> {
    const selected = this.#selectRegistrations(request.catalogIds);
    const indexes: CatalogIndex[] = [];
    const results: DoctorResult["catalogs"] = [];
    let failed = 0;
    for (const catalog of selected) {
      try {
        const { index } = await scanCatalog(catalog, this.#now);
        indexes.push(index);
        results.push({ catalogId: catalog.id, root: index.root, records: index.records.length, warnings: index.warnings, fingerprint: index.fingerprint });
      } catch (error) {
        failed++;
        results.push({ catalogId: catalog.id, root: catalog.root, records: 0, warnings: [{code: "doctor-failed", message: String(error)}], fingerprint: "" });
      }
    }
    const projected = await projectManagedCopies(indexes, this.#configuration.managedRoot);
    const classified = classifyIndexes(projected.indexes, await readClassifications(this.#configuration.managedRoot));
    const records = classified.indexes.flatMap(index => index.records).filter(record => record.trust !== "quarantined");
    for (const result of results) result.warnings = classified.indexes.find(index => index.catalogId === result.catalogId)?.warnings ?? result.warnings;
    return {
      status: failed && failed === selected.length ? "failed" : failed || classified.warnings.length || results.some(r => r.warnings.length) ? "warning" : "ok",
      catalogs: results,
      coverage: {
        total: records.length,
        uncategorized: records.filter(record => !record.group).map(record => record.ref).sort(),
        unattributed: records.filter(record => !record.source.id && !record.source.displayName && !record.source.url).map(record => record.ref).sort(),
      },
      ...(classified.warnings.length ? { warnings: classified.warnings } : {}),
    };
  }
}

export async function createStashCatalog(options: CreateStashCatalogOptions = {}): Promise<StashCatalog> {
  const loaded = await loadConfiguration(options);
  return new StashCatalogImplementation(loaded.configuration, loaded.cacheDir, options.now ?? Date.now);
}
