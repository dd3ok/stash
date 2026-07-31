import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import { platform } from "node:os";
import path from "node:path";
import type {
  CatalogIndex,
  ManagedSkillRecord,
  RelatedSkillCopy,
  SkillRecord,
} from "../types.js";
import { isPathInside, sha256 } from "./util.js";

const MAX_FILES = 10_000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

interface TreeEntry {
  kind: "directory" | "file";
  relativePath: string;
  size?: number;
  contentHash?: string;
}

interface ProjectionTarget {
  kind: RelatedSkillCopy["kind"];
  record: ManagedSkillRecord;
  expectedTreeHash: string;
  deployment?: ManagedSkillRecord["deployments"][number];
}

function pathIdentity(value: string): string {
  const normalized = path.resolve(value).normalize("NFKC");
  return platform() === "win32"
    ? normalized.toLocaleLowerCase("und")
    : normalized;
}

function validRecord(value: unknown): value is ManagedSkillRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as ManagedSkillRecord;
  return (
    record.schemaVersion === 1 &&
    typeof record.skillId === "string" &&
    typeof record.name === "string" &&
    typeof record.treeHash === "string" &&
    record.source !== null &&
    typeof record.source === "object" &&
    typeof record.source.location === "string" &&
    Array.isArray(record.deployments)
  );
}

async function treeHash(rootInput: string): Promise<string | undefined> {
  try {
    const rootInfo = await lstat(rootInput);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      return undefined;
    }
    const root = await realpath(rootInput);
    const entries: TreeEntry[] = [];
    let files = 0;
    let totalBytes = 0;

    async function walk(directory: string, relativeDirectory: string) {
      const children = await readdir(directory, { withFileTypes: true });
      children.sort((left, right) => left.name.localeCompare(right.name, "en"));
      for (const child of children) {
        if (relativeDirectory === "" && child.name === ".git") {
          continue;
        }
        const relativePath = relativeDirectory
          ? `${relativeDirectory}/${child.name}`
          : child.name;
        const childPath = path.join(directory, child.name);
        const before = await lstat(childPath);
        if (before.isSymbolicLink()) {
          throw new Error("linked tree");
        }
        if (before.isDirectory()) {
          const canonical = await realpath(childPath);
          if (!isPathInside(root, canonical)) {
            throw new Error("tree escape");
          }
          entries.push({ kind: "directory", relativePath });
          await walk(childPath, relativePath);
          continue;
        }
        if (!before.isFile()) {
          throw new Error("special file");
        }
        files += 1;
        totalBytes += before.size;
        if (files > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
          throw new Error("tree too large");
        }
        const content = await readFile(childPath);
        const after = await stat(childPath);
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
          throw new Error("tree changed");
        }
        entries.push({
          kind: "file",
          relativePath,
          size: content.length,
          contentHash: sha256(content),
        });
      }
    }

    await walk(root, "");
    const fingerprint = entries
      .map((entry) =>
        entry.kind === "directory"
          ? `D\0${entry.relativePath}`
          : `F\0${entry.relativePath}\0${entry.size}\0${entry.contentHash}`,
      )
      .join("\n");
    return sha256(fingerprint);
  } catch {
    return undefined;
  }
}

function relatedCopy(
  target: ProjectionTarget,
  record: SkillRecord,
): RelatedSkillCopy {
  if (target.kind === "deployment" && target.deployment) {
    return {
      kind: "deployment",
      catalogId: record.catalogId,
      ref: record.ref,
      skillId: target.record.skillId,
      targetId: target.deployment.targetId,
      host: target.deployment.host,
      scope: target.deployment.scope,
    };
  }
  return {
    kind: "source",
    catalogId: record.catalogId,
    ref: record.ref,
    skillId: target.record.skillId,
  };
}

export async function projectManagedCopies(
  sourceIndexes: CatalogIndex[],
  managedRoot: string | undefined,
): Promise<{ indexes: CatalogIndex[]; fingerprintPart: string }> {
  if (!managedRoot || !sourceIndexes.some((index) => index.catalogId === "managed")) {
    return { indexes: sourceIndexes, fingerprintPart: "" };
  }
  const indexes = sourceIndexes.map((index) => ({
    ...index,
    records: index.records.map((record) => ({ ...record })),
    warnings: [...index.warnings],
  }));
  const managedIndex = indexes.find((index) => index.catalogId === "managed");
  if (!managedIndex) {
    return { indexes, fingerprintPart: "" };
  }

  let recordFiles: string[];
  const recordsRoot = path.join(managedRoot, ".stash", "records");
  try {
    recordFiles = (await readdir(recordsRoot))
      .filter((name) => name.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch {
    return { indexes, fingerprintPart: "" };
  }

  const targets = new Map<string, ProjectionTarget>();
  const managedRecords = new Map<string, ManagedSkillRecord>();
  for (const file of recordFiles) {
    try {
      const parsed = JSON.parse(
        await readFile(path.join(recordsRoot, file), "utf8"),
      ) as unknown;
      if (!validRecord(parsed)) {
        throw new Error("invalid record");
      }
      managedRecords.set(parsed.name, parsed);
      targets.set(pathIdentity(parsed.source.location), {
        kind: "source",
        record: parsed,
        expectedTreeHash: parsed.treeHash,
      });
      for (const deployment of parsed.deployments) {
        if (
          deployment.ownership === "stash" &&
          deployment.skillId === parsed.skillId
        ) {
          targets.set(pathIdentity(deployment.path), {
            kind: "deployment",
            record: parsed,
            expectedTreeHash: deployment.treeHash,
            deployment,
          });
        }
      }
    } catch {
      managedIndex.warnings.push({
        code: "invalid-lifecycle-record",
        message: `Ignored invalid lifecycle projection record "${file}".`,
        path: `.stash/records/${file}`,
      });
    }
  }

  const canonicalBySkillId = new Map<string, SkillRecord>();
  for (const record of managedIndex.records) {
    const managedRecord = managedRecords.get(record.name);
    if (managedRecord) {
      record.managedSkillId = managedRecord.skillId;
      record.relatedCopies = [];
      canonicalBySkillId.set(managedRecord.skillId, record);
    }
  }

  const events: string[] = [];
  for (const index of indexes) {
    if (index.catalogId === "managed") {
      continue;
    }
    const visible: SkillRecord[] = [];
    for (const record of index.records) {
      const skillRoot = path.dirname(
        path.resolve(index.root, record.relativeSkillFile),
      );
      const target = targets.get(pathIdentity(skillRoot));
      const canonical = target
        ? canonicalBySkillId.get(target.record.skillId)
        : undefined;
      if (!target || !canonical) {
        visible.push(record);
        continue;
      }
      const actualTreeHash = await treeHash(skillRoot);
      if (actualTreeHash !== target.expectedTreeHash) {
        visible.push(record);
        index.warnings.push({
          code: "managed-copy-drift",
          message: `Managed-related ${target.kind} "${record.ref}" drifted and remains a separate result.`,
          ref: record.ref,
          path: record.relativeSkillFile,
        });
        events.push(`drift:${record.ref}:${actualTreeHash ?? "unavailable"}`);
        continue;
      }
      const related = relatedCopy(target, record);
      canonical.relatedCopies = [...(canonical.relatedCopies ?? []), related];
      events.push(
        `fold:${record.ref}:${target.record.skillId}:${target.kind}:${actualTreeHash}`,
      );
    }
    index.records = visible;
  }

  for (const record of managedIndex.records) {
    if (record.relatedCopies) {
      record.relatedCopies.sort((left, right) =>
        `${left.kind}:${left.catalogId}:${left.ref}`.localeCompare(
          `${right.kind}:${right.catalogId}:${right.ref}`,
          "en",
        ),
      );
    }
  }
  return {
    indexes,
    fingerprintPart: sha256(events.sort().join("\n")),
  };
}
