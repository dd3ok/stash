import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "about",
  "for",
  "find",
  "list",
  "me",
  "of",
  "or",
  "show",
  "skill",
  "skills",
  "tell",
  "the",
  "to",
  "with",
  "관련",
  "목록",
  "보여줘",
  "스킬",
  "스킬들",
  "알려줘",
  "찾아줘",
]);

export function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[_/\\]+/gu, " ")
    .replace(/[-‐‑‒–—]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/gu, "");
}

export function normalizeSourceIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeSourceUrl(value: string): string | undefined {
  try {
    return new URL(value.normalize("NFKC").trim()).href;
  } catch {
    return undefined;
  }
}

export function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }
  return [
    ...new Set(
      normalized
        .split(/\s+/u)
        .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
    ),
  ];
}

export function trigrams(value: string): Set<string> {
  const compact = compactText(value);
  if (compact.length <= 3) {
    return compact ? new Set([compact]) : new Set();
  }
  const result = new Set<string>();
  for (let index = 0; index <= compact.length - 3; index += 1) {
    result.add(compact.slice(index, index + 3));
  }
  return result;
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export function pathIdentity(value: string): string {
  const normalized = path.resolve(value).normalize("NFKC");
  return platform() === "win32"
    ? normalized.toLocaleLowerCase("und")
    : normalized;
}

export function normalizeRelativePath(value: string): string | undefined {
  if (!value || path.isAbsolute(value)) {
    return undefined;
  }
  const normalized = path.normalize(value);
  if (
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    path.isAbsolute(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

export function platformConfigPath(): string {
  const currentPlatform = platform();
  if (currentPlatform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      "stash",
      "config.yaml",
    );
  }
  if (currentPlatform === "darwin") {
    return path.join(
      homedir(),
      "Library",
      "Application Support",
      "stash",
      "config.yaml",
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    "stash",
    "config.yaml",
  );
}

export function platformCachePath(): string {
  if (process.env.STASH_CACHE_DIR) {
    return path.resolve(process.env.STASH_CACHE_DIR);
  }
  const currentPlatform = platform();
  if (currentPlatform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"),
      "stash",
      "cache",
    );
  }
  if (currentPlatform === "darwin") {
    return path.join(homedir(), "Library", "Caches", "stash");
  }
  return path.join(
    process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache"),
    "stash",
  );
}

export function platformManagedPath(): string {
  if (process.env.STASH_MANAGED_HOME) {
    return path.resolve(process.env.STASH_MANAGED_HOME);
  }
  const currentPlatform = platform();
  if (currentPlatform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"),
      "stash",
      "managed",
    );
  }
  if (currentPlatform === "darwin") {
    return path.join(
      homedir(),
      "Library",
      "Application Support",
      "stash",
      "managed",
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share"),
    "stash",
    "managed",
  );
}

export function safeCatalogSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_");
}

export function clampPageSize(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(200, Math.trunc(value)));
}

export function compactDescription(value: string, limit = 240): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function mediaTypeFor(filePath: string): string | undefined {
  switch (path.extname(filePath).toLowerCase()) {
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "text/javascript";
    case ".ts":
      return "text/typescript";
    case ".py":
      return "text/x-python";
    case ".ps1":
      return "text/x-powershell";
    case ".sh":
      return "text/x-shellscript";
    default:
      return undefined;
  }
}

export function encodeCursor(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const checksum = createHash("sha256").update(body).digest("base64url").slice(0, 16);
  return `${body}.${checksum}`;
}

export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string,
): T | undefined {
  const [body, checksum, ...rest] = cursor.split(".");
  if (!body || !checksum || rest.length > 0) {
    return undefined;
  }
  const expected = createHash("sha256")
    .update(body)
    .digest("base64url")
    .slice(0, 16);
  if (checksum !== expected) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}
