import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import {
  INDEX_SCHEMA_VERSION,
  StashError,
  type CatalogIndex,
  type CatalogRegistration,
  type CatalogWarning,
  type CompatibilityState,
  type SkillRecord,
  type TrustState,
  type Vendor,
  type VendorCompatibility,
} from "../types.js";
import {
  isPathInside,
  safeCatalogSegment,
  sha256,
} from "./util.js";

const DEFAULT_IGNORE = new Set([".git", "node_modules", "dist"]);
const MAX_SKILL_BYTES = 1_048_576;
const MAX_SIDECAR_BYTES = 262_144;
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const INDEX_FILE_NAME = `index-v${INDEX_SCHEMA_VERSION}.json`;

interface Candidate {
  skillFile: string;
  sidecarFile?: string;
  sidecarModifiedMs?: number;
  sidecarSize?: number;
  modifiedMs: number;
  size: number;
}

interface ScanResult {
  index: CatalogIndex;
  skipped: number;
}

interface Sidecar {
  aliases: string[];
  tags: string[];
  intents: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  compatibility: VendorCompatibility;
  trust?: TrustState;
  source: {
    id?: string;
    displayName?: string;
    url?: string;
    revision?: string;
    license?: string;
  };
  risk: {
    level?: string;
    capabilities: string[];
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function compatibilityDefaults(vendors: Vendor[] | undefined): VendorCompatibility {
  const supported = new Set(vendors ?? []);
  return {
    codex: supported.has("codex") ? "supported" : "unknown",
    "claude-code": supported.has("claude-code") ? "supported" : "unknown",
    antigravity: supported.has("antigravity") ? "supported" : "unknown",
  };
}

function compatibilityState(
  value: unknown,
  fallback: CompatibilityState,
): CompatibilityState {
  return value === "supported" ||
    value === "partial" ||
    value === "unsupported" ||
    value === "unknown"
    ? value
    : fallback;
}

function trustState(value: unknown): TrustState | undefined {
  return value === "trusted" ||
    value === "reviewed" ||
    value === "unreviewed" ||
    value === "quarantined"
    ? value
    : undefined;
}

function parseFrontmatter(source: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const normalized = source.replace(/^\uFEFF/u, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(normalized);
  if (!match?.[1]) {
    throw new Error("Missing or unclosed YAML frontmatter.");
  }
  const metadata = asObject(parse(match[1]));
  return {
    metadata,
    body: normalized.slice(match[0].length),
  };
}

function parseSidecar(
  source: string | undefined,
  catalog: CatalogRegistration,
): Sidecar {
  const input = source ? asObject(parse(source)) : {};
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
    throw new Error("stash.meta.yaml must use schemaVersion: 1.");
  }
  const examples = asObject(input.examples);
  const compatibility = asObject(input.compatibility);
  const defaults = compatibilityDefaults(catalog.compatibility);
  const sourceInfo = asObject(input.source);
  const risk = asObject(input.risk);
  const trust = asObject(input.trust);
  const parsedTrust = trustState(trust.state);
  const sourceId =
    typeof sourceInfo.id === "string" ? sourceInfo.id.trim() : undefined;
  if (
    sourceId &&
    (sourceId.length > 64 || !NAME_PATTERN.test(sourceId))
  ) {
    throw new Error(
      "source.id must use 1-64 lowercase letters, digits, or hyphens.",
    );
  }
  const sourceDisplayName =
    typeof sourceInfo.displayName === "string"
      ? sourceInfo.displayName.trim()
      : undefined;
  if (sourceDisplayName && sourceDisplayName.length > 128) {
    throw new Error("source.displayName must be at most 128 characters.");
  }

  return {
    aliases: stringArray(input.aliases),
    tags: stringArray(input.tags),
    intents: stringArray(input.intents),
    positiveExamples: stringArray(examples.positive),
    negativeExamples: stringArray(examples.negative),
    compatibility: {
      codex: compatibilityState(compatibility.codex, defaults.codex),
      "claude-code": compatibilityState(
        compatibility["claude-code"],
        defaults["claude-code"],
      ),
      antigravity: compatibilityState(
        compatibility.antigravity,
        defaults.antigravity,
      ),
    },
    ...(parsedTrust ? { trust: parsedTrust } : {}),
    source: {
      ...(sourceId ? { id: sourceId } : {}),
      ...(sourceDisplayName ? { displayName: sourceDisplayName } : {}),
      ...(typeof sourceInfo.url === "string" ? { url: sourceInfo.url } : {}),
      ...(typeof sourceInfo.revision === "string"
        ? { revision: sourceInfo.revision }
        : {}),
      ...(typeof sourceInfo.license === "string"
        ? { license: sourceInfo.license }
        : {}),
    },
    risk: {
      ...(typeof risk.level === "string" ? { level: risk.level } : {}),
      capabilities: stringArray(risk.capabilities),
    },
  };
}

async function readBounded(filePath: string, maxBytes: number): Promise<string> {
  const info = await stat(filePath);
  if (info.size > maxBytes) {
    throw new Error(`File exceeds ${maxBytes} bytes.`);
  }
  return readFile(filePath, "utf8");
}

async function loadManifest(
  root: string,
  catalog: CatalogRegistration,
  warnings: CatalogWarning[],
): Promise<{
  maxDepth: number;
  ignore: Set<string>;
  effectiveCatalog: CatalogRegistration;
  fingerprintPart: string;
}> {
  const manifestPath = path.join(root, "stash.catalog.yaml");
  let input: Record<string, unknown> = {};
  let fingerprintPart = "";
  try {
    const manifestInfo = await stat(manifestPath);
    input = asObject(parse(await readBounded(manifestPath, MAX_SIDECAR_BYTES)));
    fingerprintPart = [
      "stash.catalog.yaml",
      manifestInfo.mtimeMs,
      manifestInfo.size,
    ].join("\0");
    if (input.schemaVersion !== 1) {
      warnings.push({
        code: "invalid-catalog-manifest",
        message: "stash.catalog.yaml must use schemaVersion: 1; defaults were used.",
        path: "stash.catalog.yaml",
      });
      input = {};
    }
    if (typeof input.id === "string" && input.id !== catalog.id) {
      warnings.push({
        code: "catalog-id-mismatch",
        message: `Manifest id "${input.id}" differs from configured id "${catalog.id}".`,
        path: "stash.catalog.yaml",
      });
    }
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code !== "ENOENT") {
      warnings.push({
        code: "invalid-catalog-manifest",
        message: `Unable to parse stash.catalog.yaml: ${String(error)}`,
        path: "stash.catalog.yaml",
      });
    }
  }

  const discovery = asObject(input.skillDiscovery);
  const defaults = asObject(input.defaults);
  const manifestIgnore = stringArray(discovery.ignore);
  const manifestTrust = trustState(defaults.trust);
  const manifestCompatibility = stringArray(defaults.compatibility).filter(
    (item): item is Vendor =>
      item === "codex" ||
      item === "claude-code" ||
      item === "antigravity",
  );
  return {
    maxDepth: Math.max(
      1,
      Math.min(
        12,
        catalog.maxDepth ??
          (typeof discovery.maxDepth === "number" ? discovery.maxDepth : 4),
      ),
    ),
    ignore: new Set([
      ...DEFAULT_IGNORE,
      ...(catalog.ignore ?? []),
      ...manifestIgnore,
    ]),
    effectiveCatalog: {
      ...catalog,
      ...(catalog.trust
        ? {}
        : manifestTrust
          ? { trust: manifestTrust }
          : {}),
      ...(catalog.compatibility
        ? {}
        : manifestCompatibility.length > 0
          ? { compatibility: manifestCompatibility }
          : {}),
    },
    fingerprintPart,
  };
}

async function discoverCandidates(
  catalog: CatalogRegistration,
): Promise<{
  root: string;
  candidates: Candidate[];
  warnings: CatalogWarning[];
  fingerprint: string;
  effectiveCatalog: CatalogRegistration;
}> {
  const warnings: CatalogWarning[] = [];
  let root: string;
  try {
    root = await realpath(path.resolve(catalog.root));
  } catch (error) {
    throw new StashError(
      "catalog-unavailable",
      `Catalog "${catalog.id}" is unavailable at "${catalog.root}": ${String(error)}`,
      4,
    );
  }
  const rootInfo = await stat(root);
  if (!rootInfo.isDirectory()) {
    throw new StashError(
      "catalog-unavailable",
      `Catalog "${catalog.id}" root is not a directory: "${root}".`,
      4,
    );
  }
  const { maxDepth, ignore, effectiveCatalog, fingerprintPart } =
    await loadManifest(root, catalog, warnings);
  const candidates: Candidate[] = [];
  const visitedDirectories = new Set<string>();

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }
    const canonicalDirectory = await realpath(directory);
    if (visitedDirectories.has(canonicalDirectory)) {
      return;
    }
    visitedDirectories.add(canonicalDirectory);
    const entries = await readdir(directory, { withFileTypes: true });
    const skillEntry = entries.find(
      (entry) => entry.isFile() && entry.name === "SKILL.md",
    );
    if (skillEntry) {
      const skillFile = path.join(directory, skillEntry.name);
      const info = await stat(skillFile);
      const sidecarPath = path.join(directory, "stash.meta.yaml");
      let sidecarFile: string | undefined;
      let sidecarModifiedMs: number | undefined;
      let sidecarSize: number | undefined;
      try {
        const sidecarInfo = await stat(sidecarPath);
        if (sidecarInfo.isFile()) {
          sidecarFile = sidecarPath;
          sidecarModifiedMs = sidecarInfo.mtimeMs;
          sidecarSize = sidecarInfo.size;
        }
      } catch {
        sidecarFile = undefined;
      }
      candidates.push({
        skillFile,
        ...(sidecarFile ? { sidecarFile } : {}),
        ...(sidecarModifiedMs !== undefined ? { sidecarModifiedMs } : {}),
        ...(sidecarSize !== undefined ? { sidecarSize } : {}),
        modifiedMs: info.mtimeMs,
        size: info.size,
      });
    }

    for (const entry of entries) {
      if (ignore.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, depth + 1);
        continue;
      }
      if (entry.isSymbolicLink()) {
        if (!catalog.followSymlinks) {
          warnings.push({
            code: "symlink-skipped",
            message: `Skipped symlink "${path.relative(root, entryPath)}".`,
            path: path.relative(root, entryPath),
          });
          continue;
        }
        const target = await realpath(entryPath);
        if (!isPathInside(root, target)) {
          warnings.push({
            code: "symlink-escape",
            message: `Rejected symlink outside catalog root: "${path.relative(root, entryPath)}".`,
            path: path.relative(root, entryPath),
          });
          continue;
        }
        const targetInfo = await stat(target);
        if (targetInfo.isDirectory()) {
          await walk(target, depth + 1);
        }
      }
    }
  }

  await walk(root, 0);
  candidates.sort((left, right) =>
    left.skillFile.localeCompare(right.skillFile, "en"),
  );
  const fingerprintSource = candidates
    .map((candidate) => {
      const skillRelative = path.relative(root, candidate.skillFile);
      const sidecarRelative = candidate.sidecarFile
        ? path.relative(root, candidate.sidecarFile)
        : "";
      return [
        skillRelative,
        candidate.modifiedMs,
        candidate.size,
        sidecarRelative,
        candidate.sidecarModifiedMs ?? "",
        candidate.sidecarSize ?? "",
      ].join("\0");
    })
    .join("\n");

  return {
    root,
    candidates,
    warnings,
    fingerprint: sha256(`${fingerprintPart}\n${fingerprintSource}`),
    effectiveCatalog,
  };
}

async function buildRecord(
  root: string,
  candidate: Candidate,
  catalog: CatalogRegistration,
  warnings: CatalogWarning[],
): Promise<SkillRecord | undefined> {
  const relativeSkillFile = path
    .relative(root, candidate.skillFile)
    .split(path.sep)
    .join("/");
  const relativeSkillDirectory = path.posix.dirname(relativeSkillFile);
  const ref = `${catalog.id}:${relativeSkillDirectory}`;

  try {
    const source = await readBounded(candidate.skillFile, MAX_SKILL_BYTES);
    const { metadata } = parseFrontmatter(source);
    if (
      typeof metadata.name !== "string" ||
      metadata.name.length > 64 ||
      !NAME_PATTERN.test(metadata.name)
    ) {
      throw new Error("Frontmatter name must be 1-64 lowercase letters, digits, or hyphens.");
    }
    if (
      typeof metadata.description !== "string" ||
      metadata.description.trim() === "" ||
      metadata.description.length > 1024
    ) {
      throw new Error("Frontmatter description must be a non-empty string up to 1024 characters.");
    }
    const folderName = path.basename(path.dirname(candidate.skillFile));
    if (folderName !== metadata.name) {
      warnings.push({
        code: "name-folder-mismatch",
        message: `Skill name "${metadata.name}" differs from folder "${folderName}".`,
        ref,
        path: relativeSkillFile,
      });
    }

    const sidecarSource = candidate.sidecarFile
      ? await readBounded(candidate.sidecarFile, MAX_SIDECAR_BYTES)
      : undefined;
    const sidecar = parseSidecar(sidecarSource, catalog);
    const groupPath = path.posix.dirname(relativeSkillDirectory);
    const group = groupPath === "." ? undefined : groupPath;
    const sourceLicense =
      sidecar.source.license ??
      (typeof metadata.license === "string" ? metadata.license : undefined);

    return {
      ref,
      catalogId: catalog.id,
      ...(group ? { group } : {}),
      name: metadata.name,
      description: metadata.description.replace(/\s+/gu, " ").trim(),
      relativeSkillFile,
      aliases: sidecar.aliases,
      tags: sidecar.tags,
      intents: sidecar.intents,
      positiveExamples: sidecar.positiveExamples,
      negativeExamples: sidecar.negativeExamples,
      compatibility: sidecar.compatibility,
      trust: sidecar.trust ?? catalog.trust ?? "unreviewed",
      source: {
        ...sidecar.source,
        ...(sourceLicense ? { license: sourceLicense } : {}),
      },
      risk: sidecar.risk,
      contentHash: sha256(source),
      modifiedMs: candidate.modifiedMs,
      size: candidate.size,
    };
  } catch (error) {
    warnings.push({
      code: "invalid-skill",
      message: `Skipped "${relativeSkillFile}": ${String(error)}`,
      ref,
      path: relativeSkillFile,
    });
    return undefined;
  }
}

export async function scanCatalog(
  catalog: CatalogRegistration,
): Promise<ScanResult> {
  const discovered = await discoverCandidates(catalog);
  const warnings = [...discovered.warnings];
  const records: SkillRecord[] = [];
  let skipped = 0;

  for (const candidate of discovered.candidates) {
    const record = await buildRecord(
      discovered.root,
      candidate,
      discovered.effectiveCatalog,
      warnings,
    );
    if (record) {
      records.push(record);
    } else {
      skipped += 1;
    }
  }

  records.sort((left, right) => left.ref.localeCompare(right.ref, "en"));
  const seenRefs = new Set<string>();
  for (const record of records) {
    if (seenRefs.has(record.ref)) {
      warnings.push({
        code: "duplicate-ref",
        message: `Duplicate skill ref "${record.ref}".`,
        ref: record.ref,
      });
    }
    seenRefs.add(record.ref);
  }

  return {
    index: {
      schemaVersion: INDEX_SCHEMA_VERSION,
      catalogId: catalog.id,
      root: discovered.root,
      generatedAt: new Date().toISOString(),
      fingerprint: discovered.fingerprint,
      records,
      warnings,
    },
    skipped,
  };
}

export async function loadCatalogIndex(
  catalog: CatalogRegistration,
  cacheDir: string,
  cacheTtlMs: number,
  now: () => number,
): Promise<{ index: CatalogIndex; refreshed: boolean }> {
  const catalogCacheDir = path.join(cacheDir, safeCatalogSegment(catalog.id));
  const indexPath = path.join(catalogCacheDir, INDEX_FILE_NAME);
  let cached: CatalogIndex | undefined;

  try {
    const source = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(source) as CatalogIndex;
    if (
      parsed.schemaVersion === INDEX_SCHEMA_VERSION &&
      parsed.catalogId === catalog.id &&
      Array.isArray(parsed.records) &&
      parsed.records.every(
        (record) =>
          record !== null &&
          typeof record === "object" &&
          record.source !== null &&
          typeof record.source === "object",
      )
    ) {
      cached = parsed;
      const age = now() - Date.parse(parsed.generatedAt);
      if (Number.isFinite(age) && age >= 0 && age <= cacheTtlMs) {
        return { index: parsed, refreshed: false };
      }
    }
  } catch {
    cached = undefined;
  }

  const discovered = await discoverCandidates(catalog);
  if (cached && cached.fingerprint === discovered.fingerprint) {
    return { index: cached, refreshed: false };
  }

  return {
    index: await writeFreshIndex(catalog, cacheDir),
    refreshed: true,
  };
}

export async function writeFreshIndex(
  catalog: CatalogRegistration,
  cacheDir: string,
): Promise<CatalogIndex> {
  const catalogCacheDir = path.join(cacheDir, safeCatalogSegment(catalog.id));
  await mkdir(catalogCacheDir, { recursive: true });
  const lockPath = path.join(catalogCacheDir, "index.lock");
  const lock = await acquireLock(lockPath);
  try {
    const { index } = await scanCatalog(catalog);
    const indexPath = path.join(catalogCacheDir, INDEX_FILE_NAME);
    const temporaryPath = path.join(
      catalogCacheDir,
      `index-v${INDEX_SCHEMA_VERSION}.${process.pid}.${Date.now()}.tmp`,
    );
    const serialized = `${JSON.stringify(index, null, 2)}\n`;
    await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, indexPath);
    return index;
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

async function acquireLock(lockPath: string) {
  const timeoutAt = Date.now() + 5_000;
  for (;;) {
    try {
      return await open(lockPath, "wx");
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code !== "EEXIST") {
        throw error;
      }
      try {
        const lockInfo = await stat(lockPath);
        if (Date.now() - lockInfo.mtimeMs > 30_000) {
          await unlink(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= timeoutAt) {
        throw new StashError(
          "index-locked",
          `Timed out waiting for index lock "${lockPath}".`,
          4,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
