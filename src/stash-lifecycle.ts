import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";
import type {
  CreateStashLifecycleOptions,
  LifecycleActivateRequest,
  LifecycleArchiveRequest,
  LifecycleDeactivateRequest,
  LifecycleDeployment,
  LifecycleHost,
  LifecycleInstallRequest,
  LifecycleMutationResult,
  LifecycleScope,
  LifecycleSkillStatus,
  LifecycleStatusRequest,
  LifecycleStatusResult,
  LifecycleUninstallRequest,
  LifecycleUpdateRequest,
  ManagedSkillRecord,
  StashLifecycle,
  VendorCompatibility,
} from "./types.js";
import { StashError } from "./types.js";
import { loadConfiguration } from "./internal/configuration.js";
import {
  lifecycleRefreshObservation,
  lifecycleReloadRequired,
  resolveLifecycleTarget,
} from "./internal/lifecycle-host-policy.js";
import {
  fingerprintTree,
  TreeFingerprintError,
  type TreeFingerprintEntry,
} from "./internal/tree-fingerprint.js";
import {
  canonicalImmutableRevision,
  canonicalLifecycleSourceUrl,
  canonicalRepositoryPath,
  canonicalTrackingRef,
  validStoredRemoteProvenance,
} from "./internal/lifecycle-provenance.js";
import {
  isPathInside,
  pathIdentity,
  platformManagedPath,
  sha256,
} from "./internal/util.js";

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const STORE_SCHEMA_VERSION = 1 as const;

interface TreeSnapshot {
  root: string;
  treeHash: string;
  entries: TreeFingerprintEntry[];
  skillSource: string;
  sidecarSource?: string;
}

interface StoredSource {
  record: ManagedSkillRecord;
  managedPath: string;
  created: boolean;
}

interface ArchiveJournal {
  schemaVersion: 2;
  operationId: string;
  stage:
    | "started"
    | "managed-committed"
    | "source-tombstoned"
    | "archive-committed"
    | "cleanup-authorized";
  source: string;
  tombstone: string;
  name: string;
  treeHash: string;
  managedPath: string;
  managedExistedBefore: boolean;
  createdAt: string;
}

interface ManagedUpdateJournal {
  schemaVersion: 1;
  kind: "managed-update";
  operationId: string;
  stage:
    | "staging"
    | "stage-ready"
    | "started"
    | "old-tombstoned"
    | "new-committed"
    | "record-committed"
    | "rollback-discarded"
    | "rollback-restored"
    | "commit-discarded"
    | "cleanup-authorized";
  name: string;
  skillId: string;
  oldTreeHash: string;
  newTreeHash: string;
  managedPath: string;
  stagePath: string;
  backupPath: string;
  discardPath?: string;
  createdAt: string;
}

interface ManagedUninstallJournal {
  schemaVersion: 1;
  kind: "managed-uninstall";
  operationId: string;
  stage:
    | "started"
    | "tree-tombstoned"
    | "record-tombstoned"
    | "cleanup-authorized";
  name: string;
  skillId: string;
  treeHash: string;
  recordHash: string;
  managedExisted: boolean;
  managedPath: string;
  recordPath: string;
  treeTombstone: string;
  recordTombstone: string;
  createdAt: string;
}

type LifecycleJournal =
  | ArchiveJournal
  | ManagedUpdateJournal
  | ManagedUninstallJournal;

interface LifecycleLockOwner {
  schemaVersion: 1;
  ownerToken: string;
  pid: number;
  createdAt: string;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compatibilityState(value: unknown): VendorCompatibility["codex"] {
  return value === "supported" ||
    value === "partial" ||
    value === "unsupported" ||
    value === "unknown"
    ? value
    : "unknown";
}

function parseSkillMetadata(snapshot: TreeSnapshot): {
  name: string;
  compatibility: VendorCompatibility;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(
    snapshot.skillSource.replace(/^\uFEFF/u, ""),
  );
  if (!match?.[1]) {
    throw new StashError(
      "invalid-skill",
      "SKILL.md must contain closed YAML frontmatter.",
      3,
    );
  }
  const metadata = asObject(parse(match[1]));
  if (
    typeof metadata.name !== "string" ||
    metadata.name.length > 64 ||
    !NAME_PATTERN.test(metadata.name)
  ) {
    throw new StashError(
      "invalid-skill",
      "SKILL.md name must use 1-64 lowercase letters, digits, or hyphens.",
      3,
    );
  }
  if (
    typeof metadata.description !== "string" ||
    metadata.description.trim() === "" ||
    metadata.description.length > 1024
  ) {
    throw new StashError(
      "invalid-skill",
      "SKILL.md description must be a non-empty string up to 1024 characters.",
      3,
    );
  }
  let compatibility: Record<string, unknown> = {};
  if (snapshot.sidecarSource) {
    const sidecar = asObject(parse(snapshot.sidecarSource));
    if (sidecar.schemaVersion !== undefined && sidecar.schemaVersion !== 1) {
      throw new StashError(
        "invalid-skill",
        "stash.meta.yaml must use schemaVersion: 1.",
        3,
      );
    }
    compatibility = asObject(sidecar.compatibility);
  }
  return {
    name: metadata.name,
    compatibility: {
      codex: compatibilityState(compatibility.codex),
      "claude-code": compatibilityState(compatibility["claude-code"]),
      antigravity: compatibilityState(compatibility.antigravity),
    },
  };
}

async function snapshotTree(sourceRoot: string): Promise<TreeSnapshot> {
  let fingerprint;
  try {
    fingerprint = await fingerprintTree(
      sourceRoot,
      new Set(["SKILL.md", "stash.meta.yaml"]),
    );
  } catch (error) {
    if (!(error instanceof TreeFingerprintError)) {
      throw error;
    }
    if (error.failure === "root-unavailable") {
      throw new StashError(
        "skill-unavailable",
        `Skill directory is unavailable at "${path.resolve(sourceRoot)}": ${String(error.detail ?? error.message)}`,
        4,
      );
    }
    if (error.failure === "tree-too-large") {
      throw new StashError("skill-too-large", error.message, 3);
    }
    if (error.failure === "tree-changed") {
      throw new StashError("source-changed", error.message, 4);
    }
    throw new StashError("unsafe-skill-tree", error.message, 3);
  }
  const skillSource = fingerprint.captured.get("SKILL.md")?.toString("utf8");
  if (skillSource === undefined) {
    throw new StashError(
      "invalid-skill",
      `Skill root must contain SKILL.md: "${fingerprint.root}".`,
      3,
    );
  }
  const sidecarSource = fingerprint.captured
    .get("stash.meta.yaml")
    ?.toString("utf8");
  return {
    root: fingerprint.root,
    treeHash: fingerprint.treeHash,
    entries: fingerprint.entries,
    skillSource,
    ...(sidecarSource !== undefined ? { sidecarSource } : {}),
  };
}

async function copySnapshot(
  snapshot: TreeSnapshot,
  destination: string,
): Promise<void> {
  await mkdir(destination, { recursive: false });
  for (const entry of snapshot.entries) {
    const relative = entry.relativePath.split("/").join(path.sep);
    const target = path.join(destination, relative);
    if (entry.kind === "directory") {
      await mkdir(target, { recursive: false });
      continue;
    }
    const source = path.join(snapshot.root, relative);
    const content = await readFile(source);
    if (sha256(content) !== entry.contentHash) {
      throw new StashError(
        "source-changed",
        `Skill changed while it was being copied: "${entry.relativePath}".`,
        4,
      );
    }
    await writeFile(target, content, { flag: "wx" });
  }
}

async function pathType(
  target: string,
): Promise<"missing" | "directory" | "file" | "link" | "special"> {
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) {
      return "link";
    }
    if (info.isDirectory()) {
      return "directory";
    }
    if (info.isFile()) {
      return "file";
    }
    return "special";
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}

function samePath(left: string, right: string): boolean {
  return pathIdentity(left) === pathIdentity(right);
}

function targetIdentity(target: {
  host: LifecycleHost;
  scope: LifecycleScope;
  root: string;
}): string {
  return `${target.host}:${target.scope}:${pathIdentity(target.root)}`;
}

function validManagedSkillRecord(
  value: unknown,
  name: string,
): value is ManagedSkillRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as ManagedSkillRecord;
  return (
    record.schemaVersion === STORE_SCHEMA_VERSION &&
    typeof record.skillId === "string" &&
    record.skillId.length > 0 &&
    record.name === name &&
    /^sha256:[0-9a-f]{64}$/iu.test(record.treeHash) &&
    Boolean(record.source) &&
    (record.source.kind === "local-import" ||
      record.source.kind === "standalone-archive") &&
    typeof record.source.location === "string" &&
    path.isAbsolute(record.source.location) &&
    typeof record.source.importedAt === "string" &&
    (record.source.updatedAt === undefined ||
      typeof record.source.updatedAt === "string") &&
    validStoredRemoteProvenance(record.source) &&
    Array.isArray(record.deployments) &&
    record.deployments.every(
      (deployment) =>
        typeof deployment.deploymentId === "string" &&
        deployment.skillId === record.skillId &&
        typeof deployment.targetId === "string" &&
        deployment.targetId === targetIdentity(deployment) &&
        deployment.ownership === "stash" &&
        samePath(deployment.path, path.join(deployment.root, record.name)),
    )
  );
}

async function isPluginContained(source: string): Promise<boolean> {
  let current = path.dirname(source);
  for (let depth = 0; depth < 12; depth += 1) {
    const markers = [
      path.join(current, ".claude-plugin", "plugin.json"),
      path.join(current, ".codex-plugin", "plugin.json"),
      path.join(current, "plugin.json"),
    ];
    for (const marker of markers) {
      if ((await pathType(marker)) !== "missing") {
        return true;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return false;
}

class StashLifecycleImplementation implements StashLifecycle {
  readonly #managedRoot: string;
  readonly #now: () => number;
  readonly #lifecycleHome = path.resolve(homedir());

  constructor(managedRoot: string, now: () => number) {
    this.#managedRoot = path.resolve(managedRoot);
    this.#now = now;
  }

  #metadataRoot(): string {
    return path.join(this.#managedRoot, ".stash");
  }

  #recordPath(name: string): string {
    return path.join(this.#metadataRoot(), "records", `${name}.json`);
  }

  async #ensureRealDirectory(target: string, label: string): Promise<void> {
    let type = await pathType(target);
    if (type === "missing") {
      await mkdir(target, { recursive: false });
      type = await pathType(target);
    }
    if (type !== "directory") {
      throw new StashError(
        "unsafe-managed-layout",
        `${label} must be a real directory inside the managed root: "${target}".`,
        3,
      );
    }
  }

  async #assertManagedLayout(): Promise<void> {
    if ((await pathType(this.#managedRoot)) !== "directory") {
      throw new StashError(
        "unsafe-managed-layout",
        `Managed root must be a real directory: "${this.#managedRoot}".`,
        3,
      );
    }
    const canonicalManaged = await realpath(this.#managedRoot);
    for (const [target, label] of [
      [this.#metadataRoot(), "Managed metadata root"],
      [path.join(this.#metadataRoot(), "records"), "Managed records root"],
      [path.join(this.#metadataRoot(), "staging"), "Managed staging root"],
      [path.join(this.#metadataRoot(), "journal"), "Managed journal root"],
    ] as const) {
      if ((await pathType(target)) !== "directory") {
        throw new StashError(
          "unsafe-managed-layout",
          `${label} must be a real directory: "${target}".`,
          3,
        );
      }
      const canonicalTarget = await realpath(target);
      if (!isPathInside(canonicalManaged, canonicalTarget)) {
        throw new StashError(
          "unsafe-managed-layout",
          `${label} escapes the managed root: "${target}".`,
          3,
        );
      }
    }
  }

  async #ensureLayout(): Promise<void> {
    const managedType = await pathType(this.#managedRoot);
    if (managedType === "missing") {
      await mkdir(this.#managedRoot, { recursive: true });
    } else if (managedType !== "directory") {
      throw new StashError(
        "unsafe-managed-layout",
        `Managed root must be a real directory: "${this.#managedRoot}".`,
        3,
      );
    }
    await this.#ensureRealDirectory(this.#metadataRoot(), "Managed metadata root");
    await this.#ensureRealDirectory(
      path.join(this.#metadataRoot(), "records"),
      "Managed records root",
    );
    await this.#ensureRealDirectory(
      path.join(this.#metadataRoot(), "staging"),
      "Managed staging root",
    );
    await this.#ensureRealDirectory(
      path.join(this.#metadataRoot(), "journal"),
      "Managed journal root",
    );
    await this.#assertManagedLayout();
    const manifestPath = path.join(this.#managedRoot, "stash.catalog.yaml");
    try {
      await writeFile(
        manifestPath,
        "schemaVersion: 1\nid: managed\ndefaults:\n  trust: unreviewed\n  compatibility:\n    - codex\n    - claude-code\n    - antigravity\nskillDiscovery:\n  ignore:\n    - .stash\n",
        { encoding: "utf8", flag: "wx" },
      );
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code !== "EEXIST") {
        throw error;
      }
    }
  }

  async #hasSafeRecordsRoot(): Promise<boolean> {
    const managedType = await pathType(this.#managedRoot);
    if (managedType === "missing") {
      return false;
    }
    if (managedType !== "directory") {
      throw new StashError(
        "unsafe-managed-layout",
        `Managed root must be a real directory: "${this.#managedRoot}".`,
        3,
      );
    }
    const metadataRoot = this.#metadataRoot();
    const metadataType = await pathType(metadataRoot);
    if (metadataType === "missing") {
      return false;
    }
    const recordsRoot = path.join(metadataRoot, "records");
    if (
      metadataType !== "directory" ||
      (await pathType(recordsRoot)) !== "directory"
    ) {
      throw new StashError(
        "unsafe-managed-layout",
        `Managed records root must be a real directory: "${recordsRoot}".`,
        3,
      );
    }
    const canonicalManaged = await realpath(this.#managedRoot);
    const canonicalMetadata = await realpath(metadataRoot);
    const canonicalRecords = await realpath(recordsRoot);
    if (
      !isPathInside(canonicalManaged, canonicalMetadata) ||
      !isPathInside(canonicalManaged, canonicalRecords)
    ) {
      throw new StashError(
        "unsafe-managed-layout",
        `Managed records root escapes the managed root: "${recordsRoot}".`,
        3,
      );
    }
    return true;
  }

  #journalPath(operationId: string): string {
    return path.join(this.#metadataRoot(), "journal", `${operationId}.json`);
  }

  async #writeJournal(journal: LifecycleJournal): Promise<void> {
    const finalPath = this.#journalPath(journal.operationId);
    const finalType = await pathType(finalPath);
    if (finalType !== "missing" && finalType !== "file") {
      throw new StashError(
        "unsafe-managed-layout",
        `Lifecycle journal target is not a real file: "${finalPath}".`,
        3,
      );
    }
    const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    try {
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  async #advanceJournal<Journal extends LifecycleJournal>(
    journal: Journal,
    stage: Journal["stage"],
  ): Promise<void> {
    const next = { ...journal, stage } as Journal;
    await this.#writeJournal(next);
    journal.stage = stage;
  }

  #updateDiscardPath(journal: ManagedUpdateJournal): string {
    return (
      journal.discardPath ??
      path.join(
        this.#metadataRoot(),
        "staging",
        `update-${journal.operationId}-discard`,
      )
    );
  }

  #validateUpdateJournal(
    journal: ManagedUpdateJournal,
    journalPath: string,
  ): void {
    const stages = new Set<ManagedUpdateJournal["stage"]>([
      "staging",
      "stage-ready",
      "started",
      "old-tombstoned",
      "new-committed",
      "record-committed",
      "rollback-discarded",
      "rollback-restored",
      "commit-discarded",
      "cleanup-authorized",
    ]);
    if (
      journal.schemaVersion !== 1 ||
      journal.kind !== "managed-update" ||
      !/^[0-9a-f-]{36}$/iu.test(journal.operationId) ||
      !stages.has(journal.stage) ||
      !NAME_PATTERN.test(journal.name) ||
      typeof journal.skillId !== "string" ||
      journal.skillId.length === 0 ||
      !/^sha256:[0-9a-f]{64}$/iu.test(journal.oldTreeHash) ||
      !/^sha256:[0-9a-f]{64}$/iu.test(journal.newTreeHash) ||
      journal.oldTreeHash === journal.newTreeHash ||
      typeof journal.createdAt !== "string" ||
      typeof journal.managedPath !== "string" ||
      typeof journal.stagePath !== "string" ||
      typeof journal.backupPath !== "string" ||
      (journal.discardPath !== undefined &&
        typeof journal.discardPath !== "string") ||
      !path.isAbsolute(journal.managedPath) ||
      !path.isAbsolute(journal.stagePath) ||
      !path.isAbsolute(journal.backupPath) ||
      (journal.discardPath !== undefined &&
        !path.isAbsolute(journal.discardPath))
    ) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Invalid or unsafe managed update journal "${journalPath}".`,
        5,
      );
    }
    const stagingRoot = path.join(this.#metadataRoot(), "staging");
    if (
      !samePath(
        journal.managedPath,
        path.join(this.#managedRoot, journal.name),
      ) ||
      !samePath(
        journal.stagePath,
        path.join(stagingRoot, `update-${journal.operationId}-next`),
      ) ||
      !samePath(
        journal.backupPath,
        path.join(stagingRoot, `update-${journal.operationId}-previous`),
      ) ||
      !samePath(
        this.#updateDiscardPath(journal),
        path.join(stagingRoot, `update-${journal.operationId}-discard`),
      )
    ) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Invalid or unsafe managed update journal "${journalPath}".`,
        5,
      );
    }
  }

  async #journalTreeHash(
    target: string,
    label: string,
  ): Promise<string | undefined> {
    const type = await pathType(target);
    if (type === "missing") {
      return undefined;
    }
    if (type !== "directory") {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `${label} is not a real directory: "${target}".`,
        4,
      );
    }
    return (await snapshotTree(target)).treeHash;
  }

  async #moveVerifiedJournalTree(
    source: string,
    destination: string,
    expectedTreeHash: string,
    label: string,
  ): Promise<void> {
    if ((await pathType(destination)) !== "missing") {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `${label} destination is occupied at "${destination}".`,
        4,
      );
    }
    const sourceHash = await this.#journalTreeHash(source, label);
    if (sourceHash !== expectedTreeHash) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `${label} drifted at "${source}".`,
        4,
      );
    }
    await rename(source, destination);
    const destinationHash = await this.#journalTreeHash(destination, label);
    if (destinationHash !== expectedTreeHash) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `${label} changed while moving to "${destination}".`,
        4,
      );
    }
  }

  async #removeAuthorizedUpdateTree(
    journal: ManagedUpdateJournal,
    target: string,
    authorization: "staging" | "cleanup",
  ): Promise<void> {
    const expected =
      authorization === "staging"
        ? journal.stagePath
        : this.#updateDiscardPath(journal);
    if (!samePath(target, expected)) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Managed update ${authorization} path is not operation-owned: "${target}".`,
        5,
      );
    }
    await this.#assertManagedLayout();
    const type = await pathType(target);
    if (type === "missing") {
      return;
    }
    if (type === "directory") {
      await rm(target, { recursive: true, force: true });
      return;
    }
    await unlink(target);
  }

  async #recoverUpdateJournal(
    journal: ManagedUpdateJournal,
    journalPath: string,
  ): Promise<"committed" | "rolled-back"> {
    await this.#assertManagedLayout();
    const record = await this.#readRecord(journal.name);
    if (!record || record.skillId !== journal.skillId) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed update ownership changed for "${journal.name}".`,
        4,
      );
    }
    const discardPath = this.#updateDiscardPath(journal);
    const managedHash = await this.#journalTreeHash(
      journal.managedPath,
      "Managed update target",
    );
    const backupHash = await this.#journalTreeHash(
      journal.backupPath,
      "Managed update backup",
    );
    if (journal.stage === "staging") {
      if (
        record.treeHash !== journal.oldTreeHash ||
        managedHash === undefined ||
        backupHash !== undefined ||
        (await pathType(discardPath)) !== "missing"
      ) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update staging state cannot be reconciled for "${journal.name}".`,
          4,
        );
      }
      await this.#removeAuthorizedUpdateTree(journal, journal.stagePath, "staging");
      await unlink(journalPath);
      return "rolled-back";
    }

    if (journal.stage === "cleanup-authorized") {
      if (backupHash !== undefined || (await pathType(journal.stagePath)) !== "missing") {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Authorized managed update cleanup has unexpected live transaction paths for "${journal.name}".`,
          4,
        );
      }
      if (
        (record.treeHash === journal.newTreeHash &&
          managedHash !== journal.newTreeHash) ||
        (record.treeHash !== journal.newTreeHash &&
          record.treeHash !== journal.oldTreeHash) ||
        (record.treeHash === journal.oldTreeHash &&
          managedHash === journal.newTreeHash) ||
        managedHash === undefined
      ) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Authorized managed update cleanup lost its canonical tree for "${journal.name}".`,
          4,
        );
      }
      await this.#removeAuthorizedUpdateTree(journal, discardPath, "cleanup");
      await unlink(journalPath);
      return record.treeHash === journal.newTreeHash
        ? "committed"
        : "rolled-back";
    }

    let stageHash = await this.#journalTreeHash(
      journal.stagePath,
      "Managed update stage",
    );
    let discardHash = await this.#journalTreeHash(
      discardPath,
      "Managed update discard",
    );
    if (record.treeHash === journal.newTreeHash) {
      if (managedHash !== journal.newTreeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Committed managed update is unavailable or drifted for "${journal.name}".`,
          4,
        );
      }
      if (backupHash !== undefined && backupHash !== journal.oldTreeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update backup drifted for "${journal.name}".`,
          4,
        );
      }
      if (stageHash !== undefined) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Committed managed update still has a staging tree for "${journal.name}".`,
          4,
        );
      }
      if (backupHash !== undefined && discardHash !== undefined) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Committed managed update has both backup and discard trees for "${journal.name}".`,
          4,
        );
      }
      if (backupHash !== undefined) {
        await this.#moveVerifiedJournalTree(
          journal.backupPath,
          discardPath,
          journal.oldTreeHash,
          "Managed update backup",
        );
        await this.#advanceJournal(journal, "commit-discarded");
        discardHash = journal.oldTreeHash;
      }
      if (discardHash !== undefined && discardHash !== journal.oldTreeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update discard drifted for "${journal.name}".`,
          4,
        );
      }
      if (discardHash !== undefined) {
        await this.#advanceJournal(journal, "cleanup-authorized");
        await this.#removeAuthorizedUpdateTree(journal, discardPath, "cleanup");
      }
      await unlink(journalPath);
      return "committed";
    }
    if (record.treeHash !== journal.oldTreeHash) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed record changed during update recovery for "${journal.name}".`,
        4,
      );
    }
    let restoredHash = managedHash;
    if (managedHash === journal.oldTreeHash) {
      if (backupHash !== undefined) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update has both a live old tree and a backup for "${journal.name}".`,
          4,
        );
      }
    } else if (managedHash === journal.newTreeHash) {
      if (backupHash === undefined || discardHash !== undefined) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update cannot preserve both trees for "${journal.name}".`,
          4,
        );
      }
      await this.#moveVerifiedJournalTree(
        journal.managedPath,
        discardPath,
        journal.newTreeHash,
        "Uncommitted managed update",
      );
      await this.#advanceJournal(journal, "rollback-discarded");
      await rename(journal.backupPath, journal.managedPath);
      restoredHash = await this.#journalTreeHash(
        journal.managedPath,
        "Restored managed tree",
      );
    } else if (managedHash === undefined) {
      if (backupHash === undefined) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update cannot restore a missing canonical tree for "${journal.name}".`,
          4,
        );
      }
      await rename(journal.backupPath, journal.managedPath);
      restoredHash = await this.#journalTreeHash(
        journal.managedPath,
        "Restored managed tree",
      );
    } else {
      if (backupHash !== undefined) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update has both a drifted canonical tree and a backup for "${journal.name}".`,
          4,
        );
      }
    }

    if (stageHash !== undefined && discardHash !== undefined) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed update has both staging and discard trees for "${journal.name}".`,
        4,
      );
    }
    if (stageHash !== undefined) {
      if (stageHash !== journal.newTreeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update stage drifted for "${journal.name}".`,
          4,
        );
      }
      await this.#moveVerifiedJournalTree(
        journal.stagePath,
        discardPath,
        journal.newTreeHash,
        "Managed update stage",
      );
      discardHash = journal.newTreeHash;
      stageHash = undefined;
    }
    if (discardHash !== undefined && discardHash !== journal.newTreeHash) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed update discard drifted for "${journal.name}".`,
        4,
      );
    }
    if (restoredHash === undefined) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed update rollback lost the canonical tree for "${journal.name}".`,
        4,
      );
    }
    if (discardHash !== undefined) {
      await this.#advanceJournal(journal, "rollback-restored");
      await this.#advanceJournal(journal, "cleanup-authorized");
      await this.#removeAuthorizedUpdateTree(journal, discardPath, "cleanup");
    }
    await unlink(journalPath);
    return "rolled-back";
  }

  #validateUninstallJournal(
    journal: ManagedUninstallJournal,
    journalPath: string,
  ): void {
    const stages = new Set<ManagedUninstallJournal["stage"]>([
      "started",
      "tree-tombstoned",
      "record-tombstoned",
      "cleanup-authorized",
    ]);
    if (
      journal.schemaVersion !== 1 ||
      journal.kind !== "managed-uninstall" ||
      !/^[0-9a-f-]{36}$/iu.test(journal.operationId) ||
      !stages.has(journal.stage) ||
      !NAME_PATTERN.test(journal.name) ||
      typeof journal.skillId !== "string" ||
      journal.skillId.length === 0 ||
      !/^sha256:[0-9a-f]{64}$/iu.test(journal.treeHash) ||
      !/^sha256:[0-9a-f]{64}$/iu.test(journal.recordHash) ||
      typeof journal.managedExisted !== "boolean" ||
      typeof journal.createdAt !== "string" ||
      !path.isAbsolute(journal.managedPath) ||
      !path.isAbsolute(journal.recordPath) ||
      !path.isAbsolute(journal.treeTombstone) ||
      !path.isAbsolute(journal.recordTombstone)
    ) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Invalid or unsafe managed uninstall journal "${journalPath}".`,
        5,
      );
    }
    const stagingRoot = path.join(this.#metadataRoot(), "staging");
    if (
      !samePath(
        journal.managedPath,
        path.join(this.#managedRoot, journal.name),
      ) ||
      !samePath(journal.recordPath, this.#recordPath(journal.name)) ||
      !samePath(
        journal.treeTombstone,
        path.join(stagingRoot, `uninstall-${journal.operationId}-tree`),
      ) ||
      !samePath(
        journal.recordTombstone,
        path.join(
          stagingRoot,
          `uninstall-${journal.operationId}-record.json`,
        ),
      )
    ) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Invalid or unsafe managed uninstall journal "${journalPath}".`,
        5,
      );
    }
  }

  async #journalRecordHash(
    journal: ManagedUninstallJournal,
    target: string,
    label: string,
  ): Promise<string | undefined> {
    const type = await pathType(target);
    if (type === "missing") {
      return undefined;
    }
    if (type !== "file") {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `${label} is not a real file: "${target}".`,
        4,
      );
    }
    try {
      const source = await readFile(target, "utf8");
      const parsed = JSON.parse(source) as unknown;
      if (
        !validManagedSkillRecord(parsed, journal.name) ||
        parsed.skillId !== journal.skillId ||
        parsed.treeHash !== journal.treeHash ||
        parsed.deployments.length !== 0 ||
        sha256(source) !== journal.recordHash
      ) {
        throw new Error("record identity or content changed");
      }
      return journal.recordHash;
    } catch (error) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `${label} drifted at "${target}": ${String(error)}`,
        4,
      );
    }
  }

  async #moveVerifiedUninstallRecord(
    journal: ManagedUninstallJournal,
    source: string,
    destination: string,
    label: string,
  ): Promise<void> {
    if ((await pathType(destination)) !== "missing") {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `${label} destination is occupied at "${destination}".`,
        4,
      );
    }
    await this.#journalRecordHash(journal, source, label);
    await rename(source, destination);
    await this.#journalRecordHash(journal, destination, label);
  }

  async #removeAuthorizedUninstallPath(
    journal: ManagedUninstallJournal,
    target: string,
    kind: "tree" | "record",
  ): Promise<void> {
    const expected =
      kind === "tree" ? journal.treeTombstone : journal.recordTombstone;
    if (!samePath(target, expected)) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Managed uninstall cleanup path is not operation-owned: "${target}".`,
        5,
      );
    }
    await this.#assertManagedLayout();
    const type = await pathType(target);
    if (type === "missing") {
      return;
    }
    if (type === "directory") {
      await rm(target, { recursive: true, force: true });
      return;
    }
    await unlink(target);
  }

  async #recoverUninstallJournal(
    journal: ManagedUninstallJournal,
    journalPath: string,
  ): Promise<"committed" | "rolled-back"> {
    await this.#assertManagedLayout();
    if (journal.stage === "cleanup-authorized") {
      if (
        (await pathType(journal.managedPath)) !== "missing" ||
        (await pathType(journal.recordPath)) !== "missing"
      ) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Committed uninstall paths were repopulated for "${journal.name}".`,
          4,
        );
      }
      await this.#removeAuthorizedUninstallPath(
        journal,
        journal.treeTombstone,
        "tree",
      );
      await this.#removeAuthorizedUninstallPath(
        journal,
        journal.recordTombstone,
        "record",
      );
      await unlink(journalPath);
      return "committed";
    }

    const managedHash = await this.#journalTreeHash(
      journal.managedPath,
      "Managed uninstall target",
    );
    const treeTombstoneHash = await this.#journalTreeHash(
      journal.treeTombstone,
      "Managed uninstall tree tombstone",
    );
    const recordHash = await this.#journalRecordHash(
      journal,
      journal.recordPath,
      "Managed uninstall record",
    );
    const recordTombstoneHash = await this.#journalRecordHash(
      journal,
      journal.recordTombstone,
      "Managed uninstall record tombstone",
    );

    if (
      (managedHash !== undefined && managedHash !== journal.treeHash) ||
      (treeTombstoneHash !== undefined &&
        treeTombstoneHash !== journal.treeHash)
    ) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed uninstall tree drifted for "${journal.name}".`,
        4,
      );
    }

    if (
      managedHash !== undefined &&
      treeTombstoneHash !== undefined
    ) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed uninstall has both a canonical tree and tombstone for "${journal.name}".`,
        4,
      );
    }
    if (recordHash !== undefined && recordTombstoneHash !== undefined) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed uninstall has both a canonical record and tombstone for "${journal.name}".`,
        4,
      );
    }
    if (recordHash === undefined && recordTombstoneHash === undefined) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed uninstall lost its lifecycle record before commit for "${journal.name}".`,
        4,
      );
    }

    if (journal.managedExisted) {
      if (managedHash === undefined && treeTombstoneHash === undefined) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed uninstall lost its canonical tree for "${journal.name}".`,
          4,
        );
      }
      if (managedHash === undefined) {
        await this.#moveVerifiedJournalTree(
          journal.treeTombstone,
          journal.managedPath,
          journal.treeHash,
          "Managed uninstall tree tombstone",
        );
      }
    } else if (
      managedHash !== undefined ||
      treeTombstoneHash !== undefined
    ) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Metadata-only uninstall path changed for "${journal.name}".`,
        4,
      );
    }
    if (recordHash === undefined) {
      await this.#moveVerifiedUninstallRecord(
        journal,
        journal.recordTombstone,
        journal.recordPath,
        "Managed uninstall record tombstone",
      );
    }
    await unlink(journalPath);
    return "rolled-back";
  }

  async #removeIncompleteManaged(journal: ArchiveJournal): Promise<void> {
    if (journal.managedExistedBefore) {
      return;
    }
    const record = await this.#readRecord(journal.name);
    if (record && record.treeHash !== journal.treeHash) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed record changed during archive recovery: "${journal.name}".`,
        4,
      );
    }
    if ((await pathType(journal.managedPath)) === "directory") {
      const snapshot = await snapshotTree(journal.managedPath);
      if (snapshot.treeHash !== journal.treeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed tree changed during archive recovery: "${journal.managedPath}".`,
          4,
        );
      }
      await rm(journal.managedPath, { recursive: true, force: false });
    }
    await unlink(this.#recordPath(journal.name)).catch((error: unknown) => {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code !== "ENOENT") {
        throw error;
      }
    });
  }

  #validateArchiveJournal(journal: ArchiveJournal, journalPath: string): void {
    const stages = new Set<ArchiveJournal["stage"]>([
      "started",
      "managed-committed",
      "source-tombstoned",
      "archive-committed",
      "cleanup-authorized",
    ]);
    if (
      journal.schemaVersion !== 2 ||
      !/^[0-9a-f-]{36}$/iu.test(journal.operationId) ||
      !stages.has(journal.stage) ||
      !NAME_PATTERN.test(journal.name) ||
      !/^sha256:[0-9a-f]{64}$/iu.test(journal.treeHash) ||
      typeof journal.managedExistedBefore !== "boolean" ||
      typeof journal.createdAt !== "string" ||
      typeof journal.source !== "string" ||
      typeof journal.tombstone !== "string" ||
      typeof journal.managedPath !== "string" ||
      !path.isAbsolute(journal.source) ||
      !path.isAbsolute(journal.tombstone) ||
      !path.isAbsolute(journal.managedPath)
    ) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Invalid or unsafe lifecycle journal "${journalPath}".`,
        5,
      );
    }
    const expectedManagedPath = path.join(this.#managedRoot, journal.name);
    const expectedTombstoneParent = path.dirname(path.dirname(journal.source));
    const expectedTombstone = path.join(
      expectedTombstoneParent,
      `.stash-archive-${journal.name}-${journal.operationId}`,
    );
    if (
      !samePath(journal.managedPath, expectedManagedPath) ||
      !samePath(journal.tombstone, expectedTombstone) ||
      isPathInside(this.#managedRoot, journal.source) ||
      isPathInside(this.#managedRoot, journal.tombstone)
    ) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Invalid or unsafe lifecycle journal "${journalPath}".`,
        5,
      );
    }
  }

  async #recoverArchiveJournal(
    journal: ArchiveJournal,
    journalPath: string,
  ): Promise<void> {
    const sourceType = await pathType(journal.source);
    const tombstoneType = await pathType(journal.tombstone);
    if (journal.stage === "cleanup-authorized") {
      const currentType = await pathType(journal.tombstone);
      if (currentType === "directory") {
        await rm(journal.tombstone, { recursive: true, force: true });
      } else if (currentType !== "missing") {
        await unlink(journal.tombstone);
      }
      await unlink(journalPath);
      return;
    }
    if (journal.stage === "archive-committed") {
      if (tombstoneType !== "missing") {
        if (tombstoneType !== "directory") {
          throw new StashError(
            "lifecycle-recovery-conflict",
            `Archive tombstone is not a directory: "${journal.tombstone}".`,
            4,
          );
        }
        const snapshot = await snapshotTree(journal.tombstone);
        if (snapshot.treeHash !== journal.treeHash) {
          throw new StashError(
            "lifecycle-recovery-conflict",
            `Archive tombstone drifted: "${journal.tombstone}".`,
            4,
          );
        }
        await this.#advanceJournal(journal, "cleanup-authorized");
        await rm(journal.tombstone, { recursive: true, force: true });
      }
      await unlink(journalPath);
      return;
    }

    const sourceWasMoved =
      journal.stage === "source-tombstoned" ||
      (sourceType === "missing" && tombstoneType !== "missing");
    if (sourceWasMoved) {
      if (tombstoneType !== "directory") {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Archive source and tombstone cannot be reconciled for "${journal.name}".`,
          4,
        );
      }
      if (sourceType !== "missing") {
        throw new StashError(
          "archive-restore-conflict",
          `Archive recovery preserved "${journal.tombstone}" because "${journal.source}" is occupied.`,
          4,
        );
      }
      const snapshot = await snapshotTree(journal.tombstone);
      if (snapshot.treeHash !== journal.treeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Archive tombstone drifted: "${journal.tombstone}".`,
          4,
        );
      }
      await rename(journal.tombstone, journal.source);
    }
    await this.#removeIncompleteManaged(journal);
    await unlink(journalPath);
  }

  async #recoverJournals(): Promise<void> {
    const journalRoot = path.join(this.#metadataRoot(), "journal");
    const files = (await readdir(journalRoot))
      .filter((name) => name.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right, "en"));
    for (const file of files) {
      const journalPath = path.join(journalRoot, file);
      let journal: LifecycleJournal;
      try {
        if ((await pathType(journalPath)) !== "file") {
          throw new Error("journal is not a real file");
        }
        journal = JSON.parse(
          await readFile(journalPath, "utf8"),
        ) as LifecycleJournal;
      } catch (error) {
        throw new StashError(
          "invalid-lifecycle-journal",
          `Unable to read lifecycle journal "${journalPath}": ${String(error)}`,
          5,
        );
      }
      if ("kind" in journal && journal.kind === "managed-update") {
        this.#validateUpdateJournal(journal, journalPath);
        await this.#recoverUpdateJournal(journal, journalPath);
      } else if (
        "kind" in journal &&
        journal.kind === "managed-uninstall"
      ) {
        this.#validateUninstallJournal(journal, journalPath);
        await this.#recoverUninstallJournal(journal, journalPath);
      } else {
        const archiveJournal = journal as ArchiveJournal;
        this.#validateArchiveJournal(archiveJournal, journalPath);
        await this.#recoverArchiveJournal(archiveJournal, journalPath);
      }
    }
  }

  async #readLockOwner(lockPath: string): Promise<LifecycleLockOwner> {
    let owner: LifecycleLockOwner;
    try {
      const ownerPath = path.join(lockPath, "owner.json");
      if ((await pathType(ownerPath)) !== "file") {
        throw new Error("lock owner is not a real file");
      }
      owner = JSON.parse(
        await readFile(ownerPath, "utf8"),
      ) as LifecycleLockOwner;
    } catch (error) {
      throw new StashError(
        "lifecycle-lock-corrupt",
        `Lifecycle lock metadata is missing or malformed at "${lockPath}"; refusing automatic recovery.`,
        4,
      );
    }
    if (
      owner.schemaVersion !== 1 ||
      !/^[0-9a-f-]{36}$/iu.test(owner.ownerToken) ||
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.createdAt !== "string"
    ) {
      throw new StashError(
        "lifecycle-lock-corrupt",
        `Lifecycle lock metadata is invalid at "${lockPath}"; refusing automatic recovery.`,
        4,
      );
    }
    return owner;
  }

  #ownerState(owner: LifecycleLockOwner): "alive" | "dead" | "unknown" {
    try {
      process.kill(owner.pid, 0);
      return "alive";
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      return code === "ESRCH" ? "dead" : "unknown";
    }
  }

  async #publishLock(
    lockPath: string,
    owner: LifecycleLockOwner,
  ): Promise<boolean> {
    const temporaryPath = path.join(
      this.#metadataRoot(),
      `.lifecycle-lock-${owner.ownerToken}.tmp`,
    );
    await mkdir(temporaryPath, { recursive: false });
    try {
      await writeFile(
        path.join(temporaryPath, "owner.json"),
        `${JSON.stringify(owner)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      try {
        await rename(temporaryPath, lockPath);
        return true;
      } catch (error) {
        if ((await pathType(lockPath)) === "directory") {
          return false;
        }
        throw error;
      }
    } finally {
      await rm(temporaryPath, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  async #reclaimDeadLock(lockPath: string): Promise<void> {
    const guardPath = path.join(this.#metadataRoot(), "lifecycle.reclaim");
    try {
      await mkdir(guardPath, { recursive: false });
    } catch (error) {
      if ((await pathType(guardPath)) === "directory") {
        throw new StashError(
          "lifecycle-busy",
          `Another process is checking stale lifecycle ownership at "${lockPath}". If no Stash process is running, follow the documented reclaim-guard repair procedure.`,
          4,
        );
      }
      throw error;
    }
    try {
      if ((await pathType(lockPath)) === "missing") {
        return;
      }
      if ((await pathType(lockPath)) !== "directory") {
        throw new StashError(
          "lifecycle-lock-corrupt",
          `Lifecycle lock is not a directory at "${lockPath}".`,
          4,
        );
      }
      const owner = await this.#readLockOwner(lockPath);
      if (this.#ownerState(owner) !== "dead") {
        throw new StashError(
          "lifecycle-busy",
          `Lifecycle ownership at "${lockPath}" is live or cannot be safely probed.`,
          4,
        );
      }
      const reclaimedPath = path.join(
        this.#metadataRoot(),
        `.lifecycle-reclaimed-${owner.ownerToken}-${randomUUID()}`,
      );
      await rename(lockPath, reclaimedPath);
      const reclaimedOwner = await this.#readLockOwner(reclaimedPath);
      if (reclaimedOwner.ownerToken !== owner.ownerToken) {
        throw new StashError(
          "lifecycle-lock-corrupt",
          "Lifecycle lock ownership changed during stale recovery.",
          4,
        );
      }
      await rm(reclaimedPath, { recursive: true, force: false });
    } finally {
      await rm(guardPath, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  async #acquireLock(lockPath: string): Promise<LifecycleLockOwner> {
    const owner: LifecycleLockOwner = {
      schemaVersion: 1,
      ownerToken: randomUUID(),
      pid: process.pid,
      createdAt: new Date(this.#now()).toISOString(),
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (await this.#publishLock(lockPath, owner)) {
        return owner;
      }
      const existing = await this.#readLockOwner(lockPath);
      if (this.#ownerState(existing) !== "dead") {
        throw new StashError(
          "lifecycle-busy",
          `Lifecycle ownership at "${lockPath}" is live or cannot be safely probed.`,
          4,
        );
      }
      await this.#reclaimDeadLock(lockPath);
    }
    throw new StashError(
      "lifecycle-busy",
      `Lifecycle ownership changed while acquiring "${lockPath}".`,
      4,
    );
  }

  async #releaseLock(
    lockPath: string,
    owner: LifecycleLockOwner,
  ): Promise<void> {
    const current = await this.#readLockOwner(lockPath);
    if (current.ownerToken !== owner.ownerToken) {
      throw new StashError(
        "lifecycle-lock-lost",
        `Lifecycle lock ownership changed at "${lockPath}".`,
        4,
      );
    }
    await rm(lockPath, { recursive: true, force: false });
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.#ensureLayout();
    const lockPath = path.join(this.#metadataRoot(), "lifecycle.lock");
    const owner = await this.#acquireLock(lockPath);
    try {
      await this.#assertManagedLayout();
      await this.#recoverJournals();
      return await operation();
    } finally {
      await this.#releaseLock(lockPath, owner);
    }
  }

  async #readRecord(name: string): Promise<ManagedSkillRecord | undefined> {
    if (!NAME_PATTERN.test(name)) {
      throw new StashError(
        "invalid-argument",
        `Invalid managed skill name "${name}".`,
        2,
      );
    }
    const recordPath = this.#recordPath(name);
    try {
      const type = await pathType(recordPath);
      if (type === "missing") {
        return undefined;
      }
      if (type !== "file") {
        throw new Error("lifecycle record is not a real file");
      }
      const parsed = JSON.parse(await readFile(recordPath, "utf8")) as unknown;
      if (!validManagedSkillRecord(parsed, name)) {
        throw new Error("invalid lifecycle record shape");
      }
      return parsed;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code === "ENOENT") {
        return undefined;
      }
      throw new StashError(
        "invalid-lifecycle-record",
        `Unable to read lifecycle record "${recordPath}": ${String(error)}`,
        5,
      );
    }
  }

  async #writeRecord(record: ManagedSkillRecord): Promise<void> {
    const finalPath = this.#recordPath(record.name);
    const finalType = await pathType(finalPath);
    if (finalType !== "missing" && finalType !== "file") {
      throw new StashError(
        "unsafe-managed-layout",
        `Lifecycle record target is not a real file: "${finalPath}".`,
        3,
      );
    }
    const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    try {
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  async #assertUpdateCommitBoundary(
    record: ManagedSkillRecord,
    managedPath: string,
  ): Promise<void> {
    const commitRecord = await this.#readRecord(record.name);
    if (!commitRecord || !isDeepStrictEqual(commitRecord, record)) {
      throw new StashError(
        "managed-version-conflict",
        `Managed metadata changed before the update for "${record.name}" could commit.`,
        3,
      );
    }
    const commitSnapshot = await snapshotTree(managedPath);
    if (commitSnapshot.treeHash !== record.treeHash) {
      throw new StashError(
        "managed-drift",
        `Managed skill "${record.name}" changed before its update could commit.`,
        3,
      );
    }
  }

  async #assertSourceBoundary(source: string): Promise<void> {
    const canonicalSource = await realpath(source);
    const canonicalManaged = await realpath(this.#managedRoot);
    if (
      isPathInside(canonicalManaged, canonicalSource) ||
      isPathInside(canonicalSource, canonicalManaged)
    ) {
      throw new StashError(
        "unsafe-source",
        "A lifecycle source cannot be inside, contain, or equal the managed root.",
        3,
      );
    }
  }

  #sourceProvenance(
    sourceUrl?: string,
    revision?: string,
    repositoryPath?: string,
    trackingRef?: string,
  ): {
    sourceUrl?: string;
    revision?: string;
    repositoryPath?: string;
    trackingRef?: string;
  } {
    const requestedUrl = sourceUrl?.trim() || undefined;
    const requestedRevision = revision?.trim() || undefined;
    const requestedPath = repositoryPath || undefined;
    const requestedTrackingRef = trackingRef || undefined;
    const canonicalUrl = requestedUrl
      ? canonicalLifecycleSourceUrl(requestedUrl)
      : undefined;
    if (requestedUrl && !canonicalUrl) {
      throw new StashError(
        "invalid-argument",
        "--source-url must be an absolute HTTP(S), SSH, or Git repository URL without HTTP credentials, a password, query, or fragment.",
        2,
      );
    }
    const canonicalPath = requestedPath
      ? canonicalRepositoryPath(requestedPath)
      : undefined;
    if (requestedPath && !canonicalPath) {
      throw new StashError(
        "invalid-argument",
        "--repository-path must be an exact, portable repository-relative skill directory using forward slashes.",
        2,
      );
    }
    if (canonicalPath && (!canonicalUrl || !requestedRevision)) {
      throw new StashError(
        "invalid-argument",
        "--repository-path requires --source-url and an immutable --revision.",
        2,
      );
    }
    const canonicalRevision = requestedRevision
      ? canonicalImmutableRevision(requestedRevision)
      : undefined;
    if (requestedRevision && !canonicalRevision) {
      throw new StashError(
        "invalid-argument",
        "--revision must be a full 40- or 64-hex Git commit object ID when recording remote provenance.",
        2,
      );
    }
    const canonicalRef = requestedTrackingRef
      ? canonicalTrackingRef(requestedTrackingRef)
      : undefined;
    if (requestedTrackingRef && !canonicalRef) {
      throw new StashError(
        "invalid-argument",
        "--tracking-ref must be HEAD or a fully qualified refs/heads/... or refs/tags/... Git ref.",
        2,
      );
    }
    return {
      ...(canonicalUrl ? { sourceUrl: canonicalUrl } : {}),
      ...(canonicalRevision ? { revision: canonicalRevision } : {}),
      ...(canonicalPath ? { repositoryPath: canonicalPath } : {}),
      ...(canonicalRef ? { trackingRef: canonicalRef } : {}),
    };
  }

  async #canonicalHostRoot(
    root: string,
    create: boolean,
    allowMissing = false,
  ): Promise<string> {
    let type = await pathType(root);
    if (type === "missing" && create) {
      await mkdir(root, { recursive: true });
      type = await pathType(root);
    }
    if (type === "missing" && allowMissing) {
      return path.resolve(root);
    }
    if (type !== "directory") {
      throw new StashError(
        "unsafe-host-root",
        `Host root must be a real directory, not a link or special path: "${root}".`,
        3,
      );
    }
    return realpath(root);
  }

  async #storeSource(
    source: string,
    kind: ManagedSkillRecord["source"]["kind"],
    sourceUrl?: string,
    revision?: string,
    repositoryPath?: string,
    trackingRef?: string,
    expectedTreeHash?: string,
  ): Promise<StoredSource> {
    await this.#assertSourceBoundary(source);
    const snapshot = await snapshotTree(source);
    if (expectedTreeHash && snapshot.treeHash !== expectedTreeHash) {
      throw new StashError(
        "source-changed",
        `Skill changed before its managed copy could be committed: "${source}".`,
        4,
      );
    }
    const metadata = parseSkillMetadata(snapshot);
    const provenance = this.#sourceProvenance(
      sourceUrl,
      revision,
      repositoryPath,
      trackingRef,
    );
    if (
      (provenance.sourceUrl ||
        provenance.revision ||
        provenance.repositoryPath ||
        provenance.trackingRef) &&
      (!provenance.sourceUrl ||
        !provenance.revision ||
        !provenance.repositoryPath ||
        !provenance.trackingRef)
    ) {
      throw new StashError(
        "invalid-argument",
        "install and archive require --source-url, a full immutable --revision, --repository-path, and --tracking-ref together when recording remote provenance.",
        2,
      );
    }
    const managedPath = path.join(this.#managedRoot, metadata.name);
    const existingType = await pathType(managedPath);
    if (existingType !== "missing") {
      if (existingType !== "directory") {
        throw new StashError(
          "managed-conflict",
          `Managed target is not a directory: "${managedPath}".`,
          3,
        );
      }
      const existingRecord = await this.#readRecord(metadata.name);
      const existingSnapshot = await snapshotTree(managedPath);
      if (
        existingRecord &&
        existingRecord.treeHash === snapshot.treeHash &&
        existingSnapshot.treeHash === snapshot.treeHash
      ) {
        return {
          record: existingRecord,
          managedPath,
          created: false,
        };
      }
      throw new StashError(
        "managed-conflict",
        `Managed skill "${metadata.name}" already exists with different content or metadata.`,
        3,
      );
    }
    if (await this.#readRecord(metadata.name)) {
      throw new StashError(
        "managed-conflict",
        `Lifecycle metadata exists without its managed skill: "${metadata.name}".`,
        3,
      );
    }

    const stage = path.join(this.#metadataRoot(), "staging", randomUUID());
    let committed = false;
    try {
      await copySnapshot(snapshot, stage);
      const stagedSnapshot = await snapshotTree(stage);
      if (stagedSnapshot.treeHash !== snapshot.treeHash) {
        throw new StashError(
          "copy-verification-failed",
          `Staged tree hash differs for "${metadata.name}".`,
          4,
        );
      }
      const timestamp = new Date(this.#now()).toISOString();
      const record: ManagedSkillRecord = {
        schemaVersion: STORE_SCHEMA_VERSION,
        skillId: randomUUID(),
        name: metadata.name,
        treeHash: snapshot.treeHash,
        source: {
          kind,
          location: snapshot.root,
          importedAt: timestamp,
          ...(provenance.sourceUrl ? { url: provenance.sourceUrl } : {}),
          ...(provenance.revision ? { revision: provenance.revision } : {}),
          ...(provenance.repositoryPath
            ? { repositoryPath: provenance.repositoryPath }
            : {}),
          ...(provenance.trackingRef
            ? { trackingRef: provenance.trackingRef }
            : {}),
        },
        compatibility: metadata.compatibility,
        deployments: [],
        lastValidatedAt: timestamp,
      };
      await rename(stage, managedPath);
      committed = true;
      try {
        await this.#writeRecord(record);
      } catch (error) {
        await rm(managedPath, { recursive: true, force: false }).catch(
          () => undefined,
        );
        throw error;
      }
      return { record, managedPath, created: true };
    } finally {
      if (!committed) {
        await rm(stage, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  async install(
    request: LifecycleInstallRequest,
  ): Promise<LifecycleMutationResult> {
    return this.#withLock(async () => {
      const stored = await this.#storeSource(
        path.resolve(request.source),
        "local-import",
        request.sourceUrl,
        request.revision,
        request.repositoryPath,
        request.trackingRef,
      );
      return {
        status: stored.created ? "stored" : "already-stored",
        name: stored.record.name,
        skillId: stored.record.skillId,
        managedPath: stored.managedPath,
        treeHash: stored.record.treeHash,
      };
    });
  }

  async update(
    request: LifecycleUpdateRequest,
  ): Promise<LifecycleMutationResult> {
    return this.#withLock(async () => {
      if (!/^sha256:[0-9a-f]{64}$/iu.test(request.expectedTreeHash)) {
        throw new StashError(
          "invalid-argument",
          "update requires --expected-tree-hash from the current managed status.",
          2,
        );
      }
      const source = path.resolve(request.source);
      await this.#assertSourceBoundary(source);
      const snapshot = await snapshotTree(source);
      const metadata = parseSkillMetadata(snapshot);
      const managedPath = path.join(this.#managedRoot, metadata.name);
      const record = await this.#readRecord(metadata.name);
      if (!record) {
        throw new StashError(
          "managed-skill-not-found",
          `Managed skill "${metadata.name}" was not found; install it before updating.`,
          4,
        );
      }
      if (record.treeHash !== request.expectedTreeHash) {
        throw new StashError(
          "managed-version-conflict",
          `Managed skill "${metadata.name}" changed since it was inspected.`,
          3,
        );
      }
      const currentRevision = record.source.revision;
      if (currentRevision !== undefined) {
        if (!request.expectedRevision) {
          throw new StashError(
            "invalid-argument",
            "update requires --expected-revision when the managed source has a recorded revision.",
            2,
          );
        }
        if (request.expectedRevision !== currentRevision) {
          throw new StashError(
            "managed-version-conflict",
            `Managed source revision changed for "${metadata.name}".`,
            3,
          );
        }
      } else if (request.expectedRevision !== undefined) {
        throw new StashError(
          "managed-version-conflict",
          `Managed skill "${metadata.name}" has no recorded revision.`,
          3,
        );
      }
      const managedType = await pathType(managedPath);
      if (managedType !== "directory") {
        throw new StashError(
          "managed-drift",
          `Managed skill "${metadata.name}" is unavailable or not a real directory.`,
          3,
        );
      }
      const managedSnapshot = await snapshotTree(managedPath);
      if (managedSnapshot.treeHash !== record.treeHash) {
        throw new StashError(
          "managed-drift",
          `Managed skill "${metadata.name}" no longer matches its recorded hash.`,
          3,
        );
      }
      const requestedProvenance = this.#sourceProvenance(
        request.sourceUrl,
        request.revision,
        request.repositoryPath,
        request.trackingRef,
      );
      const currentSourceUrl = record.source.url;
      const currentRepositoryPath = record.source.repositoryPath;
      const currentTrackingRef = record.source.trackingRef;
      const requestedSourceUrl = requestedProvenance.sourceUrl;
      const requestedRevision = requestedProvenance.revision;
      const requestedRepositoryPath = requestedProvenance.repositoryPath;
      const requestedTrackingRef = requestedProvenance.trackingRef;
      if (
        !currentSourceUrl &&
        (requestedSourceUrl ||
          requestedRevision ||
          requestedRepositoryPath ||
          requestedTrackingRef) &&
        (!requestedSourceUrl ||
          !requestedRevision ||
          !requestedRepositoryPath ||
          !requestedTrackingRef)
      ) {
        throw new StashError(
          "invalid-argument",
          "Introducing remote provenance requires --source-url, a full immutable --revision, --repository-path, and --tracking-ref together.",
          2,
        );
      }
      if (
        requestedSourceUrl &&
        currentSourceUrl &&
        requestedSourceUrl !== currentSourceUrl
      ) {
        throw new StashError(
          "source-mismatch",
          `Update source URL does not match the managed provenance for "${metadata.name}".`,
          3,
        );
      }
      if (
        requestedRepositoryPath &&
        currentRepositoryPath &&
        requestedRepositoryPath !== currentRepositoryPath
      ) {
        throw new StashError(
          "source-mismatch",
          `Update repository path does not match the managed provenance for "${metadata.name}".`,
          3,
        );
      }
      if (
        requestedTrackingRef &&
        currentTrackingRef &&
        requestedTrackingRef !== currentTrackingRef
      ) {
        throw new StashError(
          "source-mismatch",
          `Update tracking ref does not match the managed provenance for "${metadata.name}".`,
          3,
        );
      }
      const provenanceWillChange =
        snapshot.treeHash !== record.treeHash ||
        (requestedRevision !== undefined &&
          requestedRevision !== currentRevision) ||
        (requestedRepositoryPath !== undefined &&
          requestedRepositoryPath !== currentRepositoryPath) ||
        (requestedTrackingRef !== undefined &&
          requestedTrackingRef !== currentTrackingRef);
      if (
        currentSourceUrl &&
        provenanceWillChange &&
        !requestedSourceUrl
      ) {
        throw new StashError(
          "invalid-argument",
          "update requires --source-url when changing content, revision, repository path, or tracking ref with recorded remote provenance.",
          2,
        );
      }
      const effectiveSourceUrl = requestedSourceUrl ?? currentSourceUrl;
      if (
        snapshot.treeHash !== record.treeHash &&
        (effectiveSourceUrl || currentRevision !== undefined) &&
        !requestedRevision
      ) {
        throw new StashError(
          "invalid-argument",
          "update requires --revision when replacing content with recorded remote provenance.",
          2,
        );
      }
      if (
        snapshot.treeHash !== record.treeHash &&
        currentRevision !== undefined &&
        requestedRevision === currentRevision
      ) {
        throw new StashError(
          "invalid-argument",
          "update requires a new immutable --revision when remote content changes.",
          2,
        );
      }
      const effectiveRevision = requestedRevision ?? currentRevision;
      const effectiveRepositoryPath =
        requestedRepositoryPath ?? currentRepositoryPath;
      const effectiveTrackingRef =
        requestedTrackingRef ?? currentTrackingRef;
      if (
        [
          effectiveSourceUrl,
          effectiveRevision,
          effectiveRepositoryPath,
          effectiveTrackingRef,
        ].some((value) => value !== undefined) &&
        (!effectiveSourceUrl ||
          !effectiveRevision ||
          !effectiveRepositoryPath ||
          !effectiveTrackingRef)
      ) {
        throw new StashError(
          "invalid-argument",
          "update requires complete remote provenance: source URL, immutable revision, repository path, and tracking ref.",
          2,
        );
      }
      const timestamp = new Date(this.#now()).toISOString();
      const updatedRecord: ManagedSkillRecord = {
        ...record,
        treeHash: snapshot.treeHash,
        source: {
          ...record.source,
          location: snapshot.root,
          ...(effectiveSourceUrl ? { url: effectiveSourceUrl } : {}),
          ...(effectiveRevision ? { revision: effectiveRevision } : {}),
          ...(effectiveRepositoryPath
            ? { repositoryPath: effectiveRepositoryPath }
            : {}),
          ...(effectiveTrackingRef ? { trackingRef: effectiveTrackingRef } : {}),
          updatedAt: timestamp,
        },
        compatibility: metadata.compatibility,
        lastValidatedAt: timestamp,
        lastUpdatedAt: timestamp,
      };
      const resultFor = (
        status: "updated" | "metadata-updated" | "already-current",
        warning?: string,
      ): LifecycleMutationResult => {
        const outdatedDeployments = updatedRecord.deployments.filter(
          (deployment) => deployment.treeHash !== updatedRecord.treeHash,
        );
        return {
          status,
          name: updatedRecord.name,
          skillId: updatedRecord.skillId,
          managedPath,
          previousTreeHash: record.treeHash,
          treeHash: updatedRecord.treeHash,
          ...(currentRevision ? { previousRevision: currentRevision } : {}),
          ...(effectiveRevision ? { revision: effectiveRevision } : {}),
          deploymentsPreserved: updatedRecord.deployments.length,
          outdatedDeployments: outdatedDeployments.length,
          ...(warning ? { warning } : {}),
        };
      };
      if (snapshot.treeHash === record.treeHash) {
        await this.#assertUpdateCommitBoundary(record, managedPath);
        const sourceUrlChanged =
          requestedSourceUrl !== undefined &&
          requestedSourceUrl !== currentSourceUrl;
        const revisionChanged =
          requestedRevision !== undefined &&
          requestedRevision !== currentRevision;
        const repositoryPathChanged =
          requestedRepositoryPath !== undefined &&
          requestedRepositoryPath !== currentRepositoryPath;
        const trackingRefChanged =
          requestedTrackingRef !== undefined &&
          requestedTrackingRef !== currentTrackingRef;
        if (
          !sourceUrlChanged &&
          !revisionChanged &&
          !repositoryPathChanged &&
          !trackingRefChanged
        ) {
          return resultFor("already-current");
        }
        await this.#writeRecord(updatedRecord);
        return resultFor("metadata-updated");
      }

      const operationId = randomUUID();
      const stagePath = path.join(
        this.#metadataRoot(),
        "staging",
        `update-${operationId}-next`,
      );
      const backupPath = path.join(
        this.#metadataRoot(),
        "staging",
        `update-${operationId}-previous`,
      );
      const discardPath = path.join(
        this.#metadataRoot(),
        "staging",
        `update-${operationId}-discard`,
      );
      const journal: ManagedUpdateJournal = {
        schemaVersion: 1,
        kind: "managed-update",
        operationId,
        stage: "staging",
        name: record.name,
        skillId: record.skillId,
        oldTreeHash: record.treeHash,
        newTreeHash: snapshot.treeHash,
        managedPath,
        stagePath,
        backupPath,
        discardPath,
        createdAt: timestamp,
      };
      await this.#writeJournal(journal);
      try {
        await copySnapshot(snapshot, stagePath);
        const stagedSnapshot = await snapshotTree(stagePath);
        if (stagedSnapshot.treeHash !== snapshot.treeHash) {
          throw new StashError(
            "copy-verification-failed",
            `Update staging verification failed for "${metadata.name}".`,
            4,
          );
        }
        await this.#advanceJournal(journal, "stage-ready");
        await this.#assertUpdateCommitBoundary(record, managedPath);
        await rename(managedPath, backupPath);
        const backupSnapshot = await snapshotTree(backupPath);
        if (backupSnapshot.treeHash !== record.treeHash) {
          throw new StashError(
            "managed-drift",
            `Managed skill "${metadata.name}" changed while it was being replaced.`,
            3,
          );
        }
        await this.#advanceJournal(journal, "old-tombstoned");
        await rename(stagePath, managedPath);
        await this.#advanceJournal(journal, "new-committed");
        const committedSnapshot = await snapshotTree(managedPath);
        if (committedSnapshot.treeHash !== snapshot.treeHash) {
          throw new StashError(
            "copy-verification-failed",
            `Committed update verification failed for "${metadata.name}".`,
            4,
          );
        }
        await this.#writeRecord(updatedRecord);
      } catch (error) {
        const recovery = await this.#recoverUpdateJournal(
          journal,
          this.#journalPath(journal.operationId),
        );
        if (recovery === "committed") {
          return resultFor(
            "updated",
            `Update committed and was recovered after a bookkeeping error: ${String(error)}`,
          );
        }
        throw error;
      }

      let warning: string | undefined;
      try {
        await this.#advanceJournal(journal, "record-committed");
      } catch (error) {
        warning = `Update committed, but its recovery journal remains for later cleanup: ${String(error)}`;
      }
      if (!warning) {
        try {
          await this.#moveVerifiedJournalTree(
            backupPath,
            discardPath,
            record.treeHash,
            "Managed update backup",
          );
          await this.#advanceJournal(journal, "commit-discarded");
          await this.#advanceJournal(journal, "cleanup-authorized");
          await this.#removeAuthorizedUpdateTree(
            journal,
            discardPath,
            "cleanup",
          );
        } catch (error) {
          warning = `Update committed, but previous-tree cleanup remains for recovery: ${String(error)}`;
        }
      }
      if (!warning) {
        try {
          await unlink(this.#journalPath(journal.operationId));
        } catch (error) {
          warning = `Update committed, but its recovery journal remains for later cleanup: ${String(error)}`;
        }
      }
      if (
        !warning &&
        updatedRecord.deployments.some(
          (deployment) => deployment.treeHash !== updatedRecord.treeHash,
        )
      ) {
        warning =
          "Managed copy updated; tracked deployments remain unchanged and must be deactivated then activated explicitly to receive the new tree.";
      }
      return resultFor("updated", warning);
    });
  }

  async archive(
    request: LifecycleArchiveRequest,
  ): Promise<LifecycleMutationResult> {
    return this.#withLock(async () => {
      const resolvedTarget = resolveLifecycleTarget(
        request.target,
        this.#lifecycleHome,
      );
      resolvedTarget.root = await this.#canonicalHostRoot(
        resolvedTarget.root,
        false,
      );
      const looksLikeName = NAME_PATTERN.test(request.source);
      const source = path.resolve(
        looksLikeName
          ? path.join(resolvedTarget.root, request.source)
          : request.source,
      );
      if (!samePath(path.dirname(source), resolvedTarget.root)) {
        throw new StashError(
          "unsafe-archive-source",
          `Archive source must be an exact standalone child of the selected host root "${resolvedTarget.root}".`,
          3,
        );
      }
      if (await isPluginContained(source)) {
        throw new StashError(
          "plugin-lifecycle-delegated",
          "Plugin-contained skills must be managed by the host plugin manager.",
          3,
        );
      }
      await this.#assertSourceBoundary(source);
      const sourceSnapshot = await snapshotTree(source);
      const metadata = parseSkillMetadata(sourceSnapshot);
      const managedPath = path.join(this.#managedRoot, metadata.name);
      const existingRecord = await this.#readRecord(metadata.name);
      const managedType = await pathType(managedPath);
      const selectedTargetId = targetIdentity(resolvedTarget);
      const trackedDeployment = existingRecord?.deployments.find(
        (deployment) =>
          samePath(deployment.path, source) &&
          deployment.targetId === selectedTargetId,
      );
      if (existingRecord && trackedDeployment) {
        if (managedType !== "directory") {
          throw new StashError(
            "managed-drift",
            `Managed skill "${metadata.name}" is unavailable; refusing to archive its tracked deployment.`,
            3,
          );
        }
        const managedSnapshot = await snapshotTree(managedPath);
        if (
          managedSnapshot.treeHash !== existingRecord.treeHash ||
          sourceSnapshot.treeHash !== trackedDeployment.treeHash
        ) {
          throw new StashError(
            "managed-drift",
            `Managed skill or tracked deployment "${metadata.name}" drifted; refusing archive.`,
            3,
          );
        }
        return this.#deactivateDeployment(
          existingRecord,
          managedPath,
          resolvedTarget,
        );
      }
      const managedExistedBefore =
        managedType !== "missing" || existingRecord !== undefined;
      const tombstoneParent = path.dirname(resolvedTarget.root);
      await mkdir(tombstoneParent, { recursive: true });
      const operationId = randomUUID();
      const tombstone = path.join(
        tombstoneParent,
        `.stash-archive-${metadata.name}-${operationId}`,
      );
      const journal: ArchiveJournal = {
        schemaVersion: 2,
        operationId,
        stage: "started",
        source,
        tombstone,
        name: metadata.name,
        treeHash: sourceSnapshot.treeHash,
        managedPath,
        managedExistedBefore,
        createdAt: new Date(this.#now()).toISOString(),
      };
      await this.#writeJournal(journal);
      try {
        const stored = await this.#storeSource(
          source,
          "standalone-archive",
          request.sourceUrl,
          request.revision,
          request.repositoryPath,
          request.trackingRef,
          journal.treeHash,
        );
        if (
          stored.record.name !== journal.name ||
          stored.record.treeHash !== journal.treeHash ||
          !samePath(stored.managedPath, journal.managedPath)
        ) {
          throw new StashError(
            "source-changed",
            `Archive source changed while the managed copy was being committed: "${source}".`,
            4,
          );
        }
        await this.#advanceJournal(journal, "managed-committed");
        await rename(source, tombstone);
        await this.#advanceJournal(journal, "source-tombstoned");
        const movedSnapshot = await snapshotTree(tombstone);
        if (movedSnapshot.treeHash !== stored.record.treeHash) {
          throw new StashError(
            "source-changed",
            `Archived source changed before removal; recovery will preserve or restore it safely.`,
            4,
          );
        }
        await this.#advanceJournal(journal, "archive-committed");
        let warning: string | undefined;
        try {
          await this.#advanceJournal(journal, "cleanup-authorized");
          await rm(tombstone, { recursive: true, force: true });
        } catch (error) {
          warning = `The skill is outside host discovery, but cleanup remains at "${tombstone}": ${String(error)}`;
        }
        if (!warning) {
          try {
            await unlink(this.#journalPath(journal.operationId));
          } catch (error) {
            warning = `Archive committed, but its recovery journal remains for later cleanup: ${String(error)}`;
          }
        }
        return {
          status: stored.created ? "stored" : "already-stored",
          name: stored.record.name,
          skillId: stored.record.skillId,
          managedPath: stored.managedPath,
          treeHash: stored.record.treeHash,
          ...(warning ? { warning } : {}),
        };
      } catch (error) {
        await this.#recoverArchiveJournal(
          journal,
          this.#journalPath(journal.operationId),
        );
        throw error;
      }
    });
  }

  async activate(
    request: LifecycleActivateRequest,
  ): Promise<LifecycleMutationResult> {
    return this.#withLock(async () => {
      if (!NAME_PATTERN.test(request.name)) {
        throw new StashError("invalid-argument", "Invalid skill name.", 2);
      }
      const record = await this.#readRecord(request.name);
      if (!record) {
        throw new StashError(
          "managed-skill-not-found",
          `Managed skill "${request.name}" was not found.`,
          4,
        );
      }
      const managedPath = path.join(this.#managedRoot, request.name);
      const managedSnapshot = await snapshotTree(managedPath);
      if (managedSnapshot.treeHash !== record.treeHash) {
        throw new StashError(
          "managed-drift",
          `Managed skill "${request.name}" no longer matches its recorded hash.`,
          3,
        );
      }
      const target = resolveLifecycleTarget(request.target, this.#lifecycleHome);
      target.root = await this.#canonicalHostRoot(target.root, true);
      const deploymentPath = path.join(target.root, request.name);
      const targetId = targetIdentity(target);
      const existing = await pathType(deploymentPath);
      const tracked = record.deployments.find(
        (deployment) =>
          samePath(deployment.path, deploymentPath) &&
          deployment.targetId === targetId,
      );
      if (existing !== "missing") {
        if (existing === "directory" && tracked) {
          const existingSnapshot = await snapshotTree(deploymentPath);
          if (existingSnapshot.treeHash === record.treeHash) {
            return {
              status: "already-deployed",
              name: record.name,
              skillId: record.skillId,
              managedPath,
              treeHash: record.treeHash,
              deployment: tracked,
              reloadRequired: lifecycleReloadRequired(target.host),
              warning:
                "DEPLOYED means present in a discovery root; host enable/disable overrides were not changed.",
            };
          }
        }
        throw new StashError(
          "deployment-conflict",
          `Target already exists and will not be overwritten: "${deploymentPath}".`,
          3,
        );
      }

      const stage = path.join(
        path.dirname(target.root),
        `.stash-deploy-${record.name}-${randomUUID()}`,
      );
      let committed = false;
      try {
        await copySnapshot(managedSnapshot, stage);
        const stagedSnapshot = await snapshotTree(stage);
        if (stagedSnapshot.treeHash !== record.treeHash) {
          throw new StashError(
            "copy-verification-failed",
            `Deployment verification failed for "${record.name}".`,
            4,
          );
        }
        await rename(stage, deploymentPath);
        committed = true;
        const deployment: LifecycleDeployment = {
          deploymentId: randomUUID(),
          skillId: record.skillId,
          targetId,
          host: target.host,
          scope: target.scope,
          root: target.root,
          path: deploymentPath,
          method: "copy",
          ownership: "stash",
          treeHash: record.treeHash,
          deployedAt: new Date(this.#now()).toISOString(),
        };
        record.deployments = [
          ...record.deployments.filter(
            (candidate) => !samePath(candidate.path, deploymentPath),
          ),
          deployment,
        ];
        record.lastValidatedAt = new Date(this.#now()).toISOString();
        try {
          await this.#writeRecord(record);
        } catch (error) {
          await rm(deploymentPath, { recursive: true, force: false }).catch(
            () => undefined,
          );
          throw error;
        }
        return {
          status: "deployed",
          name: record.name,
          skillId: record.skillId,
          managedPath,
          treeHash: record.treeHash,
          deployment,
          reloadRequired: lifecycleReloadRequired(target.host),
          warning:
            "DEPLOYED means present in a discovery root; host enable/disable overrides were not changed.",
        };
      } finally {
        if (!committed) {
          await rm(stage, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    });
  }

  async #deactivateDeployment(
    record: ManagedSkillRecord,
    managedPath: string,
    target: { host: LifecycleHost; scope: LifecycleScope; root: string },
  ): Promise<LifecycleMutationResult> {
    const deploymentPath = path.join(target.root, record.name);
    const targetId = targetIdentity(target);
    const deployment = record.deployments.find(
      (candidate) =>
        samePath(candidate.path, deploymentPath) &&
        candidate.targetId === targetId,
    );
    if (
      !deployment ||
      deployment.ownership !== "stash" ||
      deployment.skillId !== record.skillId
    ) {
      throw new StashError(
        "detached-deployment",
        `Stash did not create deployment "${deploymentPath}"; refusing to remove it.`,
        3,
      );
    }
    const existing = await pathType(deploymentPath);
    if (existing === "missing") {
      record.deployments = record.deployments.filter(
        (candidate) => !samePath(candidate.path, deploymentPath),
      );
      record.lastValidatedAt = new Date(this.#now()).toISOString();
      await this.#writeRecord(record);
      return {
        status: "deactivated",
        name: record.name,
        skillId: record.skillId,
        managedPath,
        treeHash: record.treeHash,
        warning: "The tracked deployment was already missing.",
      };
    }
    if (existing !== "directory") {
      throw new StashError(
        "deployment-drift",
        `Tracked deployment is no longer a real directory: "${deploymentPath}".`,
        3,
      );
    }
    const deployedSnapshot = await snapshotTree(deploymentPath);
    if (deployedSnapshot.treeHash !== deployment.treeHash) {
      throw new StashError(
        "deployment-drift",
        `Tracked deployment changed and will not be removed: "${deploymentPath}".`,
        3,
      );
    }
    const tombstone = path.join(
      path.dirname(target.root),
      `.stash-deactivate-${record.name}-${randomUUID()}`,
    );
    await rename(deploymentPath, tombstone);
    try {
      const movedSnapshot = await snapshotTree(tombstone);
      if (movedSnapshot.treeHash !== deployment.treeHash) {
        await rename(tombstone, deploymentPath);
        throw new StashError(
          "deployment-drift",
          `Deployment changed during deactivation and was restored: "${deploymentPath}".`,
          3,
        );
      }
      const previousDeployments = record.deployments;
      record.deployments = previousDeployments.filter(
        (candidate) => !samePath(candidate.path, deploymentPath),
      );
      record.lastValidatedAt = new Date(this.#now()).toISOString();
      try {
        await this.#writeRecord(record);
      } catch (error) {
        record.deployments = previousDeployments;
        await rename(tombstone, deploymentPath).catch(() => undefined);
        throw error;
      }
      let warning: string | undefined;
      try {
        await rm(tombstone, { recursive: true, force: false });
      } catch (error) {
        warning = `Deployment left discovery, but cleanup remains at "${tombstone}": ${String(error)}`;
      }
      return {
        status: "deactivated",
        name: record.name,
        skillId: record.skillId,
        managedPath,
        treeHash: record.treeHash,
        reloadRequired: lifecycleReloadRequired(target.host),
        ...(warning ? { warning } : {}),
      };
    } catch (error) {
      if ((await pathType(tombstone)) !== "missing") {
        await rename(tombstone, deploymentPath).catch(() => undefined);
      }
      throw error;
    }
  }

  async deactivate(
    request: LifecycleDeactivateRequest,
  ): Promise<LifecycleMutationResult> {
    return this.#withLock(async () => {
      const record = await this.#readRecord(request.name);
      if (!record) {
        throw new StashError(
          "managed-skill-not-found",
          `Managed skill "${request.name}" was not found.`,
          4,
        );
      }
      const managedPath = path.join(this.#managedRoot, request.name);
      const target = resolveLifecycleTarget(request.target, this.#lifecycleHome);
      target.root = await this.#canonicalHostRoot(target.root, false, true);
      return this.#deactivateDeployment(record, managedPath, target);
    });
  }

  async uninstall(
    request: LifecycleUninstallRequest,
  ): Promise<LifecycleMutationResult> {
    return this.#withLock(async () => {
      const record = await this.#readRecord(request.name);
      if (!record) {
        throw new StashError(
          "managed-skill-not-found",
          `Managed skill "${request.name}" was not found.`,
          4,
        );
      }
      if (record.deployments.length > 0) {
        throw new StashError(
          "active-deployments",
          `Managed skill "${record.name}" still has ${record.deployments.length} tracked deployment(s); deactivate each host target first. If deactivation reports drift, reconcile that host copy before retrying deactivation.`,
          3,
        );
      }
      const managedPath = path.join(this.#managedRoot, record.name);
      const managedType = await pathType(managedPath);
      if (managedType !== "missing" && managedType !== "directory") {
        throw new StashError(
          "managed-drift",
          `Managed skill "${record.name}" is not a real directory; refusing to uninstall it.`,
          3,
        );
      }
      const managedExisted = managedType === "directory";
      if (managedExisted) {
        const managedSnapshot = await snapshotTree(managedPath);
        if (managedSnapshot.treeHash !== record.treeHash) {
          throw new StashError(
            "managed-drift",
            `Managed skill "${record.name}" no longer matches its recorded hash.`,
            3,
          );
        }
      }

      const operationId = randomUUID();
      const recordPath = this.#recordPath(record.name);
      const recordSource = await readFile(recordPath, "utf8");
      const stagingRoot = path.join(this.#metadataRoot(), "staging");
      const journal: ManagedUninstallJournal = {
        schemaVersion: 1,
        kind: "managed-uninstall",
        operationId,
        stage: "started",
        name: record.name,
        skillId: record.skillId,
        treeHash: record.treeHash,
        recordHash: sha256(recordSource),
        managedExisted,
        managedPath,
        recordPath,
        treeTombstone: path.join(
          stagingRoot,
          `uninstall-${operationId}-tree`,
        ),
        recordTombstone: path.join(
          stagingRoot,
          `uninstall-${operationId}-record.json`,
        ),
        createdAt: new Date(this.#now()).toISOString(),
      };
      const journalPath = this.#journalPath(operationId);
      await this.#writeJournal(journal);
      let committed = false;
      try {
        const commitRecord = await this.#readRecord(record.name);
        if (
          !commitRecord ||
          !isDeepStrictEqual(commitRecord, record) ||
          sha256(await readFile(recordPath, "utf8")) !== journal.recordHash
        ) {
          throw new StashError(
            "managed-version-conflict",
            `Managed skill "${record.name}" changed before uninstall could commit.`,
            3,
          );
        }
        const commitManagedType = await pathType(managedPath);
        if (managedExisted) {
          if (commitManagedType !== "directory") {
            throw new StashError(
              "managed-version-conflict",
              `Managed skill "${record.name}" changed before uninstall could commit.`,
              3,
            );
          }
          const commitSnapshot = await snapshotTree(managedPath);
          if (commitSnapshot.treeHash !== record.treeHash) {
            throw new StashError(
              "managed-version-conflict",
              `Managed skill "${record.name}" changed before uninstall could commit.`,
              3,
            );
          }
          await rename(managedPath, journal.treeTombstone);
          await this.#advanceJournal(journal, "tree-tombstoned");
          const movedTreeHash = await this.#journalTreeHash(
            journal.treeTombstone,
            "Managed uninstall tree tombstone",
          );
          if (movedTreeHash !== journal.treeHash) {
            throw new StashError(
              "managed-drift",
              `Managed skill "${record.name}" changed during uninstall; its tombstone and recovery journal were preserved.`,
              3,
            );
          }
        } else if (commitManagedType !== "missing") {
          throw new StashError(
            "managed-version-conflict",
            `Managed path for "${record.name}" appeared before uninstall could commit.`,
            3,
          );
        }

        const finalRecord = await this.#readRecord(record.name);
        if (
          !finalRecord ||
          !isDeepStrictEqual(finalRecord, record) ||
          sha256(await readFile(recordPath, "utf8")) !== journal.recordHash
        ) {
          throw new StashError(
            "managed-version-conflict",
            `Managed metadata for "${record.name}" changed during uninstall.`,
            3,
          );
        }
        if ((await pathType(managedPath)) !== "missing") {
          throw new StashError(
            "managed-version-conflict",
            `Managed path for "${record.name}" was repopulated during uninstall.`,
            3,
          );
        }
        await rename(recordPath, journal.recordTombstone);
        await this.#advanceJournal(journal, "record-tombstoned");
        await this.#journalRecordHash(
          journal,
          journal.recordTombstone,
          "Managed uninstall record tombstone",
        );
        if ((await pathType(recordPath)) !== "missing") {
          throw new StashError(
            "managed-version-conflict",
            `Managed record for "${record.name}" was repopulated during uninstall.`,
            3,
          );
        }
        await this.#advanceJournal(journal, "cleanup-authorized");
        committed = true;
      } catch (error) {
        if (!committed) {
          await this.#recoverUninstallJournal(journal, journalPath);
        }
        throw error;
      }

      let warning = managedExisted
        ? undefined
        : "The managed copy was already missing; its lifecycle record was removed.";
      try {
        await this.#recoverUninstallJournal(journal, journalPath);
      } catch (error) {
        const cleanupWarning = `Uninstall committed, but verified cleanup remains for recovery: ${String(error)}`;
        warning = warning ? `${warning} ${cleanupWarning}` : cleanupWarning;
      }
      return {
        status: "uninstalled",
        name: record.name,
        skillId: record.skillId,
        managedPath,
        treeHash: record.treeHash,
        ...(warning ? { warning } : {}),
      };
    });
  }

  async status(
    request: LifecycleStatusRequest = {},
  ): Promise<LifecycleStatusResult> {
    const recordsRoot = path.join(this.#metadataRoot(), "records");
    let names: string[];
    const hasRecordsRoot = await this.#hasSafeRecordsRoot();
    if (request.name) {
      names = hasRecordsRoot ? [request.name] : [];
    } else if (!hasRecordsRoot) {
      names = [];
    } else {
      try {
        names = (await readdir(recordsRoot))
          .filter((name) => name.endsWith(".json"))
          .map((name) => name.slice(0, -".json".length))
          .sort((left, right) => left.localeCompare(right, "en"));
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "";
        if (code === "ENOENT") {
          names = [];
        } else {
          throw error;
        }
      }
    }
    const skills: LifecycleSkillStatus[] = [];
    for (const name of names) {
      const record = await this.#readRecord(name);
      if (!record) {
        continue;
      }
      const managedPath = path.join(this.#managedRoot, name);
      const managedType = await pathType(managedPath);
      let storeState: LifecycleSkillStatus["store"]["state"] =
        managedType === "missing" ? "missing" : "stored";
      let storeIntegrity: LifecycleSkillStatus["store"]["integrity"] =
        managedType === "directory" ? "unknown" :
          managedType === "missing" ? "unknown" : "drifted";
      let actualTreeHash: string | undefined;
      if (managedType === "directory") {
        try {
          actualTreeHash = (await snapshotTree(managedPath)).treeHash;
          storeIntegrity =
            actualTreeHash === record.treeHash ? "verified" : "drifted";
        } catch {
          storeIntegrity = "drifted";
        }
      }
      const deployments: LifecycleSkillStatus["deployments"] = [];
      for (const deployment of record.deployments) {
        const current = deployment.treeHash === record.treeHash;
        const type = await pathType(deployment.path);
        if (type === "missing") {
          deployments.push({
            ...deployment,
            state: "missing",
            integrity: "unknown",
            current,
            hostObservation: {
              override: "unknown",
              discovery: "absent",
              refresh: lifecycleRefreshObservation(deployment.host),
            },
          });
          continue;
        }
        if (type !== "directory") {
          deployments.push({
            ...deployment,
            state: "drifted",
            integrity: "drifted",
            current,
            hostObservation: {
              override: "unknown",
              discovery: "unknown",
              refresh: lifecycleRefreshObservation(deployment.host),
            },
          });
          continue;
        }
        try {
          const deployedHash = (await snapshotTree(deployment.path)).treeHash;
          deployments.push({
            ...deployment,
            state:
              deployedHash === deployment.treeHash ? "deployed" : "drifted",
            integrity:
              deployedHash === deployment.treeHash ? "verified" : "drifted",
            current,
            actualTreeHash: deployedHash,
            hostObservation: {
              override: "unknown",
              discovery: "present",
              refresh: lifecycleRefreshObservation(deployment.host),
            },
          });
        } catch {
          deployments.push({
            ...deployment,
            state: "drifted",
            integrity: "unknown",
            current,
            hostObservation: {
              override: "unknown",
              discovery: "unknown",
              refresh: lifecycleRefreshObservation(deployment.host),
            },
          });
        }
      }
      skills.push({
        skillId: record.skillId,
        name,
        managedPath,
        store: {
          state: storeState,
          integrity: storeIntegrity,
          expectedTreeHash: record.treeHash,
          ...(actualTreeHash ? { actualTreeHash } : {}),
        },
        source: record.source,
        outdatedDeployments: deployments.filter(
          (deployment) => !deployment.current,
        ).length,
        deployments,
      });
    }
    return {
      status: skills.length > 0 ? "ok" : "not-found",
      managedRoot: this.#managedRoot,
      skills,
    };
  }
}

export async function createStashLifecycle(
  options: CreateStashLifecycleOptions = {},
): Promise<StashLifecycle> {
  const effectiveOptions =
    options.catalogs && !options.managedRoot
      ? {
          ...options,
          managedRoot: path.resolve(
            process.env.STASH_MANAGED_HOME ?? platformManagedPath(),
          ),
        }
      : options;
  const loaded = await loadConfiguration(effectiveOptions);
  const managedRoot = path.resolve(
    loaded.configuration.managedRoot ??
      options.managedRoot ??
      platformManagedPath(),
  );
  return new StashLifecycleImplementation(
    managedRoot,
    options.now ?? Date.now,
  );
}
