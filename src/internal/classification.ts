import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogIndex, CatalogWarning, SkillClassification } from "../types.js";
import { StashError } from "../types.js";
import { recyclePath } from "./recycle-bin.js";

export interface ClassificationFile {
  version: 1;
  skills: Record<string, SkillClassification>;
}

export function classificationPath(root: string): string {
  return path.join(root, ".stash", "catalog.json");
}

export function validateClassification(value: SkillClassification): void {
  if (!value || !/^sha256:[a-f0-9]{64}$/u.test(value.contentHash) ||
      typeof value.group !== "string" || !/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/u.test(value.group) || value.group.length > 80 ||
      typeof value.purpose !== "string" || !value.purpose.trim() || value.purpose.length > 240 || /[\r\n\t]/u.test(value.purpose)) {
    throw new StashError("invalid-classification", "Classification requires a content hash, category slug and one-line purpose (1–240 characters).", 2);
  }
  if (value.source !== undefined) {
    if (!value.source || typeof value.source !== "object" ||
        Object.entries(value.source).some(([key, item]) => !["id", "displayName", "url"].includes(key) || typeof item !== "string" || !item.trim() || item.length > 2048)) {
      throw new StashError("invalid-classification", "Source attribution accepts only id, displayName and url.", 2);
    }
    if (value.source.url) {
      let url: URL;
      try { url = new URL(value.source.url); } catch { throw new StashError("invalid-classification", "Invalid source URL.", 2); }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
        throw new StashError("invalid-classification", "Source URL must be HTTP(S) without credentials.", 2);
      }
    }
  }
}

export async function readClassifications(root?: string): Promise<ClassificationFile> {
  if (!root) return { version: 1, skills: {} };
  try {
    const parent = await lstat(path.join(root, ".stash"));
    const file = classificationPath(root);
    const info = await lstat(file);
    if (!parent.isDirectory() || parent.isSymbolicLink() || !info.isFile() || info.isSymbolicLink() || info.size > 16_777_216) {
      throw new Error("Classification metadata must be a regular local file (at most 16 MiB).");
    }
    const data = JSON.parse(await readFile(file, "utf8")) as ClassificationFile;
    if (data.version !== 1 || !data.skills || typeof data.skills !== "object" || Array.isArray(data.skills)) throw new Error("Invalid classification file.");
    for (const [ref, entry] of Object.entries(data.skills)) {
      if (!/^[a-z0-9][a-z0-9._-]*:.+$/u.test(ref)) throw new Error("Invalid classification ref.");
      validateClassification(entry);
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, skills: {} };
    throw new StashError("invalid-classification", `Cannot read classification metadata: ${String(error)}`, 5);
  }
}

/** Caller holds the lifecycle lock and has validated the managed layout. */
export async function writeClassifications(root: string, data: ClassificationFile): Promise<void> {
  const file = classificationPath(root);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try { await rename(temporary, file); }
  catch (error) { await recyclePath(temporary).catch(() => undefined); throw error; }
}

export function classifyIndexes(indexes: CatalogIndex[], data: ClassificationFile): { indexes: CatalogIndex[]; warnings: CatalogWarning[] } {
  const warnings: CatalogWarning[] = [];
  return {
    indexes: indexes.map(index => ({ ...index, records: index.records.map(record => {
      const entry = data.skills[record.ref];
      if (!entry) return record;
      if (entry.contentHash !== record.contentHash) {
        warnings.push({ code: "classification-stale", ref: record.ref, message: "SKILL.md changed; review its category and purpose with classify." });
        return record;
      }
      // Provenance from the installed tree or lifecycle record always wins.
      if (entry.source && Object.entries(entry.source).some(([key, value]) => record.source[key as keyof typeof record.source] && record.source[key as keyof typeof record.source] !== value)) {
        warnings.push({ code: "classification-source-conflict", ref: record.ref, message: "Preserved recorded source over conflicting local attribution." });
      }
      return { ...record, group: entry.group, purpose: entry.purpose, source: { ...entry.source, ...record.source } };
    }) })),
    warnings,
  };
}
