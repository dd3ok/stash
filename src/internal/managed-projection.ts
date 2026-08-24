import {
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import type {
  CatalogIndex,
  ManagedSkillRecord,
  RelatedSkillCopy,
  SkillRecord,
} from "../types.js";
import { validStoredRemoteProvenance } from "./lifecycle-provenance.js";
import { fingerprintTree } from "./tree-fingerprint.js";
import { isPathInside, pathIdentity, sha256 } from "./util.js";

interface ProjectionTarget {
  kind: RelatedSkillCopy["kind"];
  record: ManagedSkillRecord;
  expectedTreeHash: string;
  deployment?: ManagedSkillRecord["deployments"][number];
}

function validRecord(
  value: unknown,
  expectedName: string,
): value is ManagedSkillRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as ManagedSkillRecord;
  return (
    record.schemaVersion === 1 &&
    typeof record.skillId === "string" &&
    record.skillId.length > 0 &&
    record.name === expectedName &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(record.name) &&
    /^sha256:[0-9a-f]{64}$/u.test(record.treeHash) &&
    record.source !== null &&
    typeof record.source === "object" &&
    (record.source.kind === "local-import" ||
      record.source.kind === "standalone-archive") &&
    typeof record.source.location === "string" &&
    path.isAbsolute(record.source.location) &&
    typeof record.source.importedAt === "string" &&
    validStoredRemoteProvenance(record.source) &&
    Array.isArray(record.deployments) &&
    record.deployments.every(
      (deployment) =>
        deployment !== null &&
        typeof deployment === "object" &&
        typeof deployment.deploymentId === "string" &&
        deployment.deploymentId.length > 0 &&
        deployment.skillId === record.skillId &&
        (deployment.host === "codex" ||
          deployment.host === "claude-code" ||
          deployment.host === "antigravity-ide") &&
        (deployment.scope === "user" || deployment.scope === "workspace") &&
        deployment.method === "copy" &&
        deployment.ownership === "stash" &&
        typeof deployment.root === "string" &&
        path.isAbsolute(deployment.root) &&
        typeof deployment.path === "string" &&
        path.isAbsolute(deployment.path) &&
        pathIdentity(deployment.path) ===
          pathIdentity(path.join(deployment.root, record.name)) &&
        deployment.targetId ===
          `${deployment.host}:${deployment.scope}:${pathIdentity(deployment.root)}` &&
        /^sha256:[0-9a-f]{64}$/u.test(deployment.treeHash) &&
        typeof deployment.deployedAt === "string",
    )
  );
}

async function treeHash(rootInput: string): Promise<string | undefined> {
  try {
    return (await fingerprintTree(rootInput)).treeHash;
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
  const metadataRoot = path.join(managedRoot, ".stash");
  const recordsRoot = path.join(metadataRoot, "records");
  try {
    const managedInfo = await lstat(managedRoot);
    const metadataInfo = await lstat(metadataRoot);
    if (
      managedInfo.isSymbolicLink() ||
      !managedInfo.isDirectory() ||
      metadataInfo.isSymbolicLink() ||
      !metadataInfo.isDirectory() ||
      !isPathInside(await realpath(managedRoot), await realpath(metadataRoot))
    ) {
      throw new Error("unsafe managed metadata root");
    }
    const recordsInfo = await lstat(recordsRoot);
    if (
      recordsInfo.isSymbolicLink() ||
      !recordsInfo.isDirectory() ||
      !isPathInside(await realpath(managedRoot), await realpath(recordsRoot))
    ) {
      throw new Error("unsafe managed records root");
    }
    recordFiles = (await readdir(recordsRoot))
      .filter((name) => name.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") {
      return { indexes, fingerprintPart: "" };
    }
    managedIndex.warnings.push({
      code: "invalid-managed-layout",
      message: "Ignored lifecycle projection because its records root is missing or unsafe.",
      path: ".stash/records",
    });
    return { indexes, fingerprintPart: "" };
  }

  const targets = new Map<string, ProjectionTarget>();
  const managedRecords = new Map<string, ManagedSkillRecord>();
  for (const file of recordFiles) {
    try {
      const recordPath = path.join(recordsRoot, file);
      const recordInfo = await lstat(recordPath);
      if (recordInfo.isSymbolicLink() || !recordInfo.isFile()) {
        throw new Error("record is not a real file");
      }
      const parsed = JSON.parse(
        await readFile(recordPath, "utf8"),
      ) as unknown;
      const expectedName = file.slice(0, -".json".length);
      if (!validRecord(parsed, expectedName)) {
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

  const events: string[] = [];
  const canonicalBySkillId = new Map<string, SkillRecord>();
  for (const record of managedIndex.records) {
    const managedRecord = managedRecords.get(record.name);
    if (managedRecord) {
      record.managedSkillId = managedRecord.skillId;
      record.relatedCopies = [];
      record.source = {
        ...record.source,
        ...(managedRecord.source.url
          ? { url: managedRecord.source.url }
          : {}),
        ...(managedRecord.source.revision
          ? { revision: managedRecord.source.revision }
          : {}),
      };
      events.push(
        `record:${managedRecord.skillId}:${managedRecord.source.url ?? ""}:${managedRecord.source.revision ?? ""}:${managedRecord.source.repositoryPath ?? ""}:${managedRecord.source.trackingRef ?? ""}`,
      );
      canonicalBySkillId.set(managedRecord.skillId, record);
    }
  }

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
