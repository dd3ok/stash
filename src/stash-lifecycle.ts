import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, platform } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import type {
  CreateStashCatalogOptions,
  LifecycleActivateRequest,
  LifecycleArchiveRequest,
  LifecycleDeactivateRequest,
  LifecycleDeployment,
  LifecycleHost,
  LifecycleHostTarget,
  LifecycleInstallRequest,
  LifecycleMutationResult,
  LifecycleScope,
  LifecycleSkillStatus,
  LifecycleStatusRequest,
  LifecycleStatusResult,
  ManagedSkillRecord,
  StashLifecycle,
  VendorCompatibility,
} from "./types.js";
import { StashError } from "./types.js";
import { loadConfiguration } from "./internal/configuration.js";
import {
  isPathInside,
  platformManagedPath,
  sha256,
} from "./internal/util.js";

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_FILES = 10_000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const STORE_SCHEMA_VERSION = 1 as const;
const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

interface TreeEntry {
  kind: "directory" | "file";
  relativePath: string;
  size?: number;
  contentHash?: string;
}

interface TreeSnapshot {
  root: string;
  treeHash: string;
  entries: TreeEntry[];
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

function portablePathKey(relativePath: string): string {
  return relativePath.normalize("NFKC").toLocaleLowerCase("und");
}

function validatePortableSegment(segment: string): void {
  if (!segment || /[. ]$/u.test(segment)) {
    throw new StashError(
      "unsafe-skill-tree",
      `Portable skill paths cannot end in a dot or space: "${segment}".`,
      3,
    );
  }
  const base = segment.split(".", 1)[0]?.toLocaleLowerCase("und") ?? "";
  if (WINDOWS_RESERVED_NAMES.has(base)) {
    throw new StashError(
      "unsafe-skill-tree",
      `Portable skill paths cannot use the reserved name "${segment}".`,
      3,
    );
  }
}

async function snapshotTree(sourceRoot: string): Promise<TreeSnapshot> {
  const rootInput = path.resolve(sourceRoot);
  const rootInfo = await lstat(rootInput).catch((error: unknown) => {
    throw new StashError(
      "skill-unavailable",
      `Skill directory is unavailable at "${rootInput}": ${String(error)}`,
      4,
    );
  });
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new StashError(
      "unsafe-skill-tree",
      `Skill root must be a real directory, not a link: "${rootInput}".`,
      3,
    );
  }
  const root = await realpath(rootInput);
  const entries: TreeEntry[] = [];
  const pathKeys = new Set<string>();
  let fileCount = 0;
  let totalBytes = 0;
  let skillSource: string | undefined;
  let sidecarSource: string | undefined;

  async function walk(directory: string, relativeDirectory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const child of children) {
      if (relativeDirectory === "" && child.name === ".git") {
        continue;
      }
      validatePortableSegment(child.name);
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${child.name}`
        : child.name;
      const key = portablePathKey(relativePath);
      if (pathKeys.has(key)) {
        throw new StashError(
          "unsafe-skill-tree",
          `Case-insensitive path collision at "${relativePath}".`,
          3,
        );
      }
      pathKeys.add(key);
      const childPath = path.join(directory, child.name);
      const before = await lstat(childPath);
      if (before.isSymbolicLink()) {
        throw new StashError(
          "unsafe-skill-tree",
          `Symlinks and junctions are not allowed: "${relativePath}".`,
          3,
        );
      }
      if (before.isDirectory()) {
        const canonical = await realpath(childPath);
        if (!isPathInside(root, canonical)) {
          throw new StashError(
            "unsafe-skill-tree",
            `Directory escapes the skill root: "${relativePath}".`,
            3,
          );
        }
        entries.push({ kind: "directory", relativePath });
        await walk(childPath, relativePath);
        continue;
      }
      if (!before.isFile()) {
        throw new StashError(
          "unsafe-skill-tree",
          `Only regular files and directories are allowed: "${relativePath}".`,
          3,
        );
      }
      fileCount += 1;
      totalBytes += before.size;
      if (fileCount > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
        throw new StashError(
          "skill-too-large",
          `Skill exceeds ${MAX_FILES} files or ${MAX_TOTAL_BYTES} bytes.`,
          3,
        );
      }
      const content = await readFile(childPath);
      const after = await stat(childPath);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
        throw new StashError(
          "source-changed",
          `Skill changed while it was being read: "${relativePath}".`,
          4,
        );
      }
      const contentHash = sha256(content);
      entries.push({
        kind: "file",
        relativePath,
        size: content.length,
        contentHash,
      });
      if (relativePath === "SKILL.md") {
        skillSource = content.toString("utf8");
      } else if (relativePath === "stash.meta.yaml") {
        sidecarSource = content.toString("utf8");
      }
    }
  }

  await walk(root, "");
  if (skillSource === undefined) {
    throw new StashError(
      "invalid-skill",
      `Skill root must contain SKILL.md: "${root}".`,
      3,
    );
  }
  const fingerprint = entries
    .map((entry) =>
      entry.kind === "directory"
        ? `D\0${entry.relativePath}`
        : `F\0${entry.relativePath}\0${entry.size}\0${entry.contentHash}`,
    )
    .join("\n");
  return {
    root,
    treeHash: sha256(fingerprint),
    entries,
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
  const normalizedLeft = path.resolve(left).normalize("NFKC");
  const normalizedRight = path.resolve(right).normalize("NFKC");
  return platform() === "win32"
    ? normalizedLeft.toLocaleLowerCase("und") ===
        normalizedRight.toLocaleLowerCase("und")
    : normalizedLeft === normalizedRight;
}

function pathIdentity(value: string): string {
  const normalized = path.resolve(value).normalize("NFKC");
  return platform() === "win32"
    ? normalized.toLocaleLowerCase("und")
    : normalized;
}

function targetIdentity(target: {
  host: LifecycleHost;
  scope: LifecycleScope;
  root: string;
}): string {
  return `${target.host}:${target.scope}:${pathIdentity(target.root)}`;
}

function resolveHostRoot(target: LifecycleHostTarget): {
  host: LifecycleHost;
  scope: LifecycleScope;
  root: string;
} {
  if (target.host === "antigravity-cli") {
    throw new StashError(
      "unsupported-host-layout",
      "Antigravity CLI standalone skills use flat Markdown in both user and workspace scopes; folder lifecycle is unsupported.",
      2,
    );
  }
  if (target.scope === "workspace") {
    throw new StashError(
      "unsupported-host-scope",
      "Workspace lifecycle targets are not supported in this release.",
      2,
    );
  }
  if (target.root) {
    return {
      host: target.host,
      scope: target.scope ?? "custom",
      root: path.resolve(target.root),
    };
  }
  const scope = target.scope ?? "user";
  if (scope === "custom") {
    throw new StashError(
      "invalid-argument",
      "A custom lifecycle target requires root.",
      2,
    );
  }
  switch (target.host) {
    case "codex":
      return {
        host: target.host,
        scope,
        root: path.join(homedir(), ".agents", "skills"),
      };
    case "claude-code":
      return {
        host: target.host,
        scope,
        root: path.join(homedir(), ".claude", "skills"),
      };
    case "antigravity-ide":
      return {
        host: target.host,
        scope,
        root: path.join(homedir(), ".gemini", "config", "skills"),
      };
  }
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

  async #writeJournal(journal: ArchiveJournal): Promise<void> {
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
      let journal: ArchiveJournal;
      try {
        journal = JSON.parse(await readFile(journalPath, "utf8")) as ArchiveJournal;
      } catch (error) {
        throw new StashError(
          "invalid-lifecycle-journal",
          `Unable to read lifecycle journal "${journalPath}": ${String(error)}`,
          5,
        );
      }
      this.#validateArchiveJournal(journal, journalPath);
      await this.#recoverArchiveJournal(journal, journalPath);
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

  #ownerIsAlive(owner: LifecycleLockOwner): boolean {
    try {
      process.kill(owner.pid, 0);
      return true;
    } catch {
      return false;
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
      if (this.#ownerIsAlive(owner)) {
        throw new StashError(
          "lifecycle-busy",
          `Another lifecycle operation holds "${lockPath}".`,
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
      if (this.#ownerIsAlive(existing)) {
        throw new StashError(
          "lifecycle-busy",
          `Another lifecycle operation holds "${lockPath}".`,
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

  async archive(
    request: LifecycleArchiveRequest,
  ): Promise<LifecycleMutationResult> {
    return this.#withLock(async () => {
      const resolvedTarget = resolveHostRoot(request.target);
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
      const managedExistedBefore =
        (await pathType(managedPath)) !== "missing" ||
        (await this.#readRecord(metadata.name)) !== undefined;
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
      const target = resolveHostRoot(request.target);
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
              reloadRequired: target.host !== "claude-code",
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
          reloadRequired: target.host !== "claude-code",
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
      const target = resolveHostRoot(request.target);
      target.root = await this.#canonicalHostRoot(target.root, false, true);
      const deploymentPath = path.join(target.root, request.name);
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
          reloadRequired: target.host !== "claude-code",
          ...(warning ? { warning } : {}),
        };
      } catch (error) {
        if ((await pathType(tombstone)) !== "missing") {
          await rename(tombstone, deploymentPath).catch(() => undefined);
        }
        throw error;
      }
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
            hostObservation: {
              override: "unknown",
              discovery: "absent",
              refresh:
                deployment.host === "claude-code"
                  ? "live"
                  : "restart-required",
            },
          });
          continue;
        }
        if (type !== "directory") {
          deployments.push({
            ...deployment,
            state: "drifted",
            integrity: "drifted",
            hostObservation: {
              override: "unknown",
              discovery: "unknown",
              refresh:
                deployment.host === "claude-code"
                  ? "live"
                  : "restart-required",
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
            actualTreeHash: deployedHash,
            hostObservation: {
              override: "unknown",
              discovery: "present",
              refresh:
                deployment.host === "claude-code"
                  ? "live"
                  : "restart-required",
            },
          });
        } catch {
          deployments.push({
            ...deployment,
            state: "drifted",
            integrity: "unknown",
            hostObservation: {
              override: "unknown",
              discovery: "unknown",
              refresh:
                deployment.host === "claude-code"
                  ? "live"
                  : "restart-required",
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
  options: CreateStashCatalogOptions = {},
): Promise<StashLifecycle> {
  const loaded = await loadConfiguration(options);
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
