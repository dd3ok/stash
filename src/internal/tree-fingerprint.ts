import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { isPathInside, sha256 } from "./util.js";

const MAX_FILES = 10_000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
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

export type TreeFingerprintFailure =
  | "root-unavailable"
  | "unsafe-root"
  | "unsafe-path"
  | "path-collision"
  | "linked-tree"
  | "tree-escape"
  | "special-file"
  | "tree-too-large"
  | "tree-changed";

export class TreeFingerprintError extends Error {
  readonly failure: TreeFingerprintFailure;
  readonly relativePath: string | undefined;
  readonly detail: unknown;

  constructor(
    failure: TreeFingerprintFailure,
    message: string,
    relativePath?: string,
    detail?: unknown,
  ) {
    super(message);
    this.name = "TreeFingerprintError";
    this.failure = failure;
    this.relativePath = relativePath;
    this.detail = detail;
  }
}

export interface TreeFingerprintEntry {
  kind: "directory" | "file";
  relativePath: string;
  size?: number;
  contentHash?: string;
}

export interface TreeFingerprint {
  root: string;
  treeHash: string;
  entries: TreeFingerprintEntry[];
  captured: ReadonlyMap<string, Buffer>;
}

function validatePortableSegment(segment: string): void {
  if (
    !segment ||
    /[. ]$/u.test(segment) ||
    /[<>:"/\\|?*\u0000-\u001F\u007F]/u.test(segment)
  ) {
    throw new TreeFingerprintError(
      "unsafe-path",
      `Skill path segment is not portable: "${segment}".`,
      segment,
    );
  }
  const base = segment.split(".", 1)[0]?.toLocaleLowerCase("und") ?? "";
  if (WINDOWS_RESERVED_NAMES.has(base)) {
    throw new TreeFingerprintError(
      "unsafe-path",
      `Skill path segment is reserved on Windows: "${segment}".`,
      segment,
    );
  }
}

function portablePathKey(relativePath: string): string {
  return relativePath.normalize("NFKC").toLocaleLowerCase("und");
}

export async function fingerprintTree(
  sourceRoot: string,
  capturePaths: ReadonlySet<string> = new Set(),
): Promise<TreeFingerprint> {
  const rootInput = path.resolve(sourceRoot);
  let rootInfo;
  try {
    rootInfo = await lstat(rootInput);
  } catch (error) {
    throw new TreeFingerprintError(
      "root-unavailable",
      `Tree root is unavailable: "${rootInput}".`,
      undefined,
      error,
    );
  }
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new TreeFingerprintError(
      "unsafe-root",
      `Tree root must be a real directory: "${rootInput}".`,
    );
  }
  const root = await realpath(rootInput);
  const entries: TreeFingerprintEntry[] = [];
  const captured = new Map<string, Buffer>();
  const pathKeys = new Set<string>();
  let fileCount = 0;
  let totalBytes = 0;

  async function walk(
    directory: string,
    relativeDirectory: string,
  ): Promise<void> {
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
        throw new TreeFingerprintError(
          "path-collision",
          `Case-insensitive path collision at "${relativePath}".`,
          relativePath,
        );
      }
      pathKeys.add(key);
      const childPath = path.join(directory, child.name);
      const before = await lstat(childPath);
      if (before.isSymbolicLink()) {
        throw new TreeFingerprintError(
          "linked-tree",
          `Links are not allowed in a skill tree: "${relativePath}".`,
          relativePath,
        );
      }
      if (before.isDirectory()) {
        const canonical = await realpath(childPath);
        if (!isPathInside(root, canonical)) {
          throw new TreeFingerprintError(
            "tree-escape",
            `Directory escapes the skill root: "${relativePath}".`,
            relativePath,
          );
        }
        entries.push({ kind: "directory", relativePath });
        await walk(childPath, relativePath);
        continue;
      }
      if (!before.isFile()) {
        throw new TreeFingerprintError(
          "special-file",
          `Only regular files and directories are allowed: "${relativePath}".`,
          relativePath,
        );
      }
      fileCount += 1;
      totalBytes += before.size;
      if (fileCount > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
        throw new TreeFingerprintError(
          "tree-too-large",
          `Skill exceeds ${MAX_FILES} files or ${MAX_TOTAL_BYTES} bytes.`,
          relativePath,
        );
      }
      const content = await readFile(childPath);
      const after = await stat(childPath);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
        throw new TreeFingerprintError(
          "tree-changed",
          `Skill changed while it was being read: "${relativePath}".`,
          relativePath,
        );
      }
      entries.push({
        kind: "file",
        relativePath,
        size: content.length,
        contentHash: sha256(content),
      });
      if (capturePaths.has(relativePath)) {
        captured.set(relativePath, content);
      }
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
  return {
    root,
    treeHash: sha256(fingerprint),
    entries,
    captured,
  };
}
