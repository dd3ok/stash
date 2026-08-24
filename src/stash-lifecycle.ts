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
  isPathInside,
  normalizeSourceIdentity,
  normalizeSourceUrl,
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
  schemaVersion: 1;
  operationId: string;
  stage:
    | "started"
    | "managed-committed"
    | "source-tombstoned"
    | "archive-committed";
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
    | "started"
    | "old-tombstoned"
    | "new-committed"
    | "record-committed";
  name: string;
  skillId: string;
  oldTreeHash: string;
  newTreeHash: string;
  managedPath: string;
  stagePath: string;
  backupPath: string;
  createdAt: string;
}

type LifecycleJournal = ArchiveJournal | ManagedUpdateJournal;

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

async function pathType(target: string): Promise<"missing" | "directory" | "link" | "other"> {
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) {
      return "link";
    }
    if (info.isDirectory()) {
      return "directory";
    }
    return "other";
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

  async #ensureLayout(): Promise<void> {
    await mkdir(path.join(this.#metadataRoot(), "records"), { recursive: true });
    await mkdir(path.join(this.#metadataRoot(), "staging"), { recursive: true });
    await mkdir(path.join(this.#metadataRoot(), "journal"), { recursive: true });
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

  #journalPath(operationId: string): string {
    return path.join(this.#metadataRoot(), "journal", `${operationId}.json`);
  }

  async #writeJournal(journal: LifecycleJournal): Promise<void> {
    const finalPath = this.#journalPath(journal.operationId);
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

  async #advanceArchiveJournal(
    journal: ArchiveJournal,
    stage: ArchiveJournal["stage"],
  ): Promise<void> {
    const next = { ...journal, stage };
    await this.#writeJournal(next);
    journal.stage = stage;
  }

  async #advanceUpdateJournal(
    journal: ManagedUpdateJournal,
    stage: ManagedUpdateJournal["stage"],
  ): Promise<void> {
    const next = { ...journal, stage };
    await this.#writeJournal(next);
    journal.stage = stage;
  }

  #validateUpdateJournal(
    journal: ManagedUpdateJournal,
    journalPath: string,
  ): void {
    const stages = new Set<ManagedUpdateJournal["stage"]>([
      "started",
      "old-tombstoned",
      "new-committed",
      "record-committed",
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
      !path.isAbsolute(journal.managedPath) ||
      !path.isAbsolute(journal.stagePath) ||
      !path.isAbsolute(journal.backupPath)
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

  async #removeJournalTree(
    target: string,
    expectedTreeHash: string,
    label: string,
  ): Promise<boolean> {
    const actualTreeHash = await this.#journalTreeHash(target, label);
    if (actualTreeHash === undefined) {
      return false;
    }
    if (actualTreeHash !== expectedTreeHash) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `${label} drifted at "${target}".`,
        4,
      );
    }
    await rm(target, { recursive: true, force: false });
    return true;
  }

  async #recoverUpdateJournal(
    journal: ManagedUpdateJournal,
    journalPath: string,
  ): Promise<"committed" | "rolled-back"> {
    const record = await this.#readRecord(journal.name);
    if (!record || record.skillId !== journal.skillId) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed update ownership changed for "${journal.name}".`,
        4,
      );
    }
    const managedHash = await this.#journalTreeHash(
      journal.managedPath,
      "Managed update target",
    );
    const backupHash = await this.#journalTreeHash(
      journal.backupPath,
      "Managed update backup",
    );
    const stageHash = await this.#journalTreeHash(
      journal.stagePath,
      "Managed update stage",
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
      if (stageHash !== undefined && stageHash !== journal.newTreeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update stage drifted for "${journal.name}".`,
          4,
        );
      }
      await this.#removeJournalTree(
        journal.backupPath,
        journal.oldTreeHash,
        "Managed update backup",
      );
      await this.#removeJournalTree(
        journal.stagePath,
        journal.newTreeHash,
        "Managed update stage",
      );
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
    if (managedHash === journal.oldTreeHash) {
      if (backupHash !== undefined) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update has both a live old tree and a backup for "${journal.name}".`,
          4,
        );
      }
    } else if (managedHash === journal.newTreeHash || managedHash === undefined) {
      if (backupHash !== journal.oldTreeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed update cannot restore the previous tree for "${journal.name}".`,
          4,
        );
      }
      if (managedHash === journal.newTreeHash) {
        await this.#removeJournalTree(
          journal.managedPath,
          journal.newTreeHash,
          "Uncommitted managed update",
        );
      }
      await rename(journal.backupPath, journal.managedPath);
    } else {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed update target drifted for "${journal.name}".`,
        4,
      );
    }
    if (stageHash !== undefined && stageHash !== journal.newTreeHash) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed update stage drifted for "${journal.name}".`,
        4,
      );
    }
    await this.#removeJournalTree(
      journal.stagePath,
      journal.newTreeHash,
      "Managed update stage",
    );
    const restoredHash = await this.#journalTreeHash(
      journal.managedPath,
      "Restored managed tree",
    );
    if (restoredHash !== journal.oldTreeHash) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed update rollback verification failed for "${journal.name}".`,
        4,
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
    ]);
    if (
      journal.schemaVersion !== 1 ||
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
    if (
      !samePath(journal.managedPath, expectedManagedPath) ||
      !samePath(path.dirname(journal.tombstone), expectedTombstoneParent) ||
      !path.basename(journal.tombstone).startsWith(
        `.stash-archive-${journal.name}-`,
      ) ||
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
        await rm(journal.tombstone, { recursive: true, force: false });
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
      owner = JSON.parse(
        await readFile(path.join(lockPath, "owner.json"), "utf8"),
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
      await this.#recoverJournals();
      return await operation();
    } finally {
      await this.#releaseLock(lockPath, owner);
    }
  }

  async #readRecord(name: string): Promise<ManagedSkillRecord | undefined> {
    const recordPath = this.#recordPath(name);
    try {
      const parsed = JSON.parse(await readFile(recordPath, "utf8")) as ManagedSkillRecord;
      if (
        parsed.schemaVersion !== STORE_SCHEMA_VERSION ||
        typeof parsed.skillId !== "string" ||
        parsed.skillId.length === 0 ||
        parsed.name !== name ||
        typeof parsed.treeHash !== "string" ||
        !Array.isArray(parsed.deployments) ||
        parsed.deployments.some(
          (deployment) =>
            typeof deployment.deploymentId !== "string" ||
            deployment.skillId !== parsed.skillId ||
            typeof deployment.targetId !== "string" ||
            deployment.targetId !==
              targetIdentity(deployment) ||
            deployment.ownership !== "stash" ||
            !samePath(deployment.path, path.join(deployment.root, parsed.name)),
        )
      ) {
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
          ...(sourceUrl ? { url: sourceUrl } : {}),
          ...(revision ? { revision } : {}),
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
      const currentSourceUrl = record.source.url;
      const requestedSourceUrl = request.sourceUrl?.trim() || undefined;
      if (requestedSourceUrl && currentSourceUrl) {
        const currentIdentity =
          normalizeSourceUrl(currentSourceUrl) ??
          normalizeSourceIdentity(currentSourceUrl);
        const requestedIdentity =
          normalizeSourceUrl(requestedSourceUrl) ??
          normalizeSourceIdentity(requestedSourceUrl);
        if (currentIdentity !== requestedIdentity) {
          throw new StashError(
            "source-mismatch",
            `Update source URL does not match the managed provenance for "${metadata.name}".`,
            3,
          );
        }
      }
      const effectiveSourceUrl = requestedSourceUrl ?? currentSourceUrl;
      const requestedRevision = request.revision?.trim() || undefined;
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
      const effectiveRevision = requestedRevision ?? currentRevision;
      const timestamp = new Date(this.#now()).toISOString();
      const updatedRecord: ManagedSkillRecord = {
        ...record,
        treeHash: snapshot.treeHash,
        source: {
          ...record.source,
          location: snapshot.root,
          ...(effectiveSourceUrl ? { url: effectiveSourceUrl } : {}),
          ...(effectiveRevision ? { revision: effectiveRevision } : {}),
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
        const sourceUrlChanged =
          requestedSourceUrl !== undefined &&
          requestedSourceUrl !== currentSourceUrl;
        const revisionChanged =
          requestedRevision !== undefined &&
          requestedRevision !== currentRevision;
        if (!sourceUrlChanged && !revisionChanged) {
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
      const journal: ManagedUpdateJournal = {
        schemaVersion: 1,
        kind: "managed-update",
        operationId,
        stage: "started",
        name: record.name,
        skillId: record.skillId,
        oldTreeHash: record.treeHash,
        newTreeHash: snapshot.treeHash,
        managedPath,
        stagePath,
        backupPath,
        createdAt: timestamp,
      };
      let journalWritten = false;
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
        await this.#writeJournal(journal);
        journalWritten = true;
        await rename(managedPath, backupPath);
        await this.#advanceUpdateJournal(journal, "old-tombstoned");
        await rename(stagePath, managedPath);
        await this.#advanceUpdateJournal(journal, "new-committed");
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
        if (!journalWritten) {
          await rm(stagePath, { recursive: true, force: true }).catch(
            () => undefined,
          );
          throw error;
        }
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
        await this.#advanceUpdateJournal(journal, "record-committed");
      } catch (error) {
        warning = `Update committed, but its recovery journal remains for later cleanup: ${String(error)}`;
      }
      if (!warning) {
        try {
          await this.#removeJournalTree(
            backupPath,
            record.treeHash,
            "Managed update backup",
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
          sourceSnapshot.treeHash !== existingRecord.treeHash ||
          trackedDeployment.treeHash !== existingRecord.treeHash
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
      const tombstone = path.join(
        tombstoneParent,
        `.stash-archive-${metadata.name}-${randomUUID()}`,
      );
      const journal: ArchiveJournal = {
        schemaVersion: 1,
        operationId: randomUUID(),
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
        await this.#advanceArchiveJournal(journal, "managed-committed");
        await rename(source, tombstone);
        await this.#advanceArchiveJournal(journal, "source-tombstoned");
        const movedSnapshot = await snapshotTree(tombstone);
        if (movedSnapshot.treeHash !== stored.record.treeHash) {
          throw new StashError(
            "source-changed",
            `Archived source changed before removal; recovery will preserve or restore it safely.`,
            4,
          );
        }
        await this.#advanceArchiveJournal(journal, "archive-committed");
        let warning: string | undefined;
        try {
          await rm(tombstone, { recursive: true, force: false });
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

  async status(
    request: LifecycleStatusRequest = {},
  ): Promise<LifecycleStatusResult> {
    const recordsRoot = path.join(this.#metadataRoot(), "records");
    let names: string[];
    if (request.name) {
      names = [request.name];
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
        const type = await pathType(deployment.path);
        if (type === "missing") {
          deployments.push({
            ...deployment,
            state: "missing",
            integrity: "unknown",
            current: deployment.treeHash === record.treeHash,
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
            current: deployment.treeHash === record.treeHash,
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
            current: deployment.treeHash === record.treeHash,
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
            current: deployment.treeHash === record.treeHash,
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
