import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogIndex, CatalogWarning, SkillRecord, StashConfiguration } from "../types.js";
import { INDEX_SCHEMA_VERSION, StashError } from "../types.js";
import { scanCatalog } from "./catalog-index.js";
import { classifyIndexes, readClassifications } from "./classification.js";
import { projectManagedCopies } from "./managed-projection.js";
import { recyclePath } from "./recycle-bin.js";
import { sha256 } from "./util.js";

export interface CatalogSnapshot {
  version: typeof INDEX_SCHEMA_VERSION;
  key: string;
  fingerprint: string;
  generatedAt: string;
  indexes: CatalogIndex[];
  copies: SkillRecord[];
  warnings: CatalogWarning[];
  failures: Array<{ catalogId: string; message: string }>;
}

async function revision(root?: string): Promise<string> {
  if (!root) return "";
  const metadata = path.join(root, ".stash");
  try {
    await lstat(path.join(metadata, "lifecycle.lock"));
    throw new StashError("lifecycle-busy", "The managed store is being changed. Retry when the operation finishes.", 4);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    const parent = await lstat(metadata);
    const file = path.join(metadata, "revision");
    const info = await lstat(file);
    if (!parent.isDirectory() || parent.isSymbolicLink() || !info.isFile() || info.isSymbolicLink() || info.size > 1024) {
      throw new StashError("unsafe-managed-layout", "Snapshot revision must be a regular file in the managed metadata directory.", 3);
    }
    return await readFile(file, "utf8");
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
}

function validRecord(record: SkillRecord): boolean {
  const source = record?.source;
  return !!record && typeof record.ref === "string" && typeof record.catalogId === "string" &&
    typeof record.name === "string" && typeof record.description === "string" &&
    (record.group === undefined || typeof record.group === "string") &&
    (record.purpose === undefined || typeof record.purpose === "string") &&
    typeof record.contentHash === "string" && !!source && typeof source === "object" && !Array.isArray(source) &&
    (source.id === undefined || typeof source.id === "string") &&
    (source.displayName === undefined || typeof source.displayName === "string") &&
    (source.url === undefined || typeof source.url === "string");
}

/** One disposable snapshot. Only refresh and lifecycle changes trigger a scan. */
export async function loadSnapshot(configuration: StashConfiguration, cacheDir: string, now: () => number, force = false): Promise<CatalogSnapshot> {
  const before = await revision(configuration.managedRoot);
  const key = sha256(JSON.stringify({ catalogs: configuration.catalogs, managedRoot: configuration.managedRoot, revision: before }));
  const file = path.join(cacheDir, "catalog.json");
  if (!force) {
    try {
      const cached = JSON.parse(await readFile(file, "utf8")) as CatalogSnapshot;
      if (cached.version === INDEX_SCHEMA_VERSION && cached.key === key &&
          Array.isArray(cached.indexes) && Array.isArray(cached.copies) && Array.isArray(cached.warnings) && typeof cached.fingerprint === "string" &&
          Array.isArray(cached.failures) && cached.failures.every(failure => failure && typeof failure.catalogId === "string" && typeof failure.message === "string") &&
          cached.copies.every(validRecord) && cached.indexes.every(index => Array.isArray(index.records) && Array.isArray(index.warnings) && index.records.every(validRecord))) return cached;
    } catch { /* Missing or corrupt derived data is rebuilt. */ }
  }
  const indexes: CatalogIndex[] = [];
  const failures: CatalogSnapshot["failures"] = [];
  for (const catalog of configuration.catalogs.filter(c => c.enabled !== false)) {
    try { indexes.push((await scanCatalog(catalog, now)).index); }
    catch (error) { failures.push({ catalogId: catalog.id, message: `Catalog "${catalog.id}" could not be scanned: ${String(error)}` }); }
  }
  const projected = await projectManagedCopies(indexes, configuration.managedRoot);
  const metadata = await readClassifications(configuration.managedRoot);
  const classified = classifyIndexes(projected.indexes, metadata);
  const visible = new Set(projected.indexes.flatMap(index => index.records.map(record => record.ref)));
  const copies = classifyIndexes(indexes.map(index => ({ ...index, records: index.records.filter(record => !visible.has(record.ref)) })), metadata)
    .indexes.flatMap(index => index.records);
  if (before !== await revision(configuration.managedRoot)) {
    throw new StashError("catalog-changed", "Catalog changed during indexing. Retry the request.", 4);
  }
  const result: CatalogSnapshot = {
    version: INDEX_SCHEMA_VERSION, key,
    fingerprint: sha256(JSON.stringify({ indexes: classified.indexes.map(index => ({ catalogId: index.catalogId, records: index.records, warnings: index.warnings })), copies, warnings: classified.warnings, failures })),
    generatedAt: new Date(now()).toISOString(),
    indexes: classified.indexes,
    copies,
    warnings: classified.warnings,
    failures,
  };
  await mkdir(cacheDir, { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(result), { encoding: "utf8", flag: "wx" });
  try { await rename(temporary, file); }
  catch (error) { await recyclePath(temporary).catch(() => undefined); throw error; }
  return result;
}
