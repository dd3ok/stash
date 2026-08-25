import { isPortablePathSegment } from "./tree-fingerprint.js";

interface StoredRemoteProvenanceCandidate {
  url?: unknown;
  revision?: unknown;
  repositoryPath?: unknown;
  trackingRef?: unknown;
}

const SUPPORTED_REPOSITORY_PROTOCOLS = new Set([
  "https:",
  "http:",
  "ssh:",
  "git:",
  "git+https:",
  "git+ssh:",
]);

export function canonicalLifecycleSourceUrl(
  value: string,
): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value.normalize("NFKC").trim());
  } catch {
    return undefined;
  }
  if (
    !SUPPORTED_REPOSITORY_PROTOCOLS.has(parsed.protocol) ||
    (parsed.username &&
      parsed.protocol !== "ssh:" &&
      parsed.protocol !== "git+ssh:") ||
    !parsed.hostname ||
    parsed.hash ||
    parsed.search ||
    parsed.password
  ) {
    return undefined;
  }
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  }
  if (parsed.pathname === "/" || parsed.pathname.length === 0) {
    return undefined;
  }
  return parsed.href;
}

export function canonicalRepositoryPath(value: string): string | undefined {
  const candidate = value;
  if (candidate === ".") {
    return ".";
  }
  if (
    candidate.length === 0 ||
    candidate.startsWith("/") ||
    /^[a-z]:\//iu.test(candidate)
  ) {
    return undefined;
  }
  const segments = candidate.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !isPortablePathSegment(segment),
    )
  ) {
    return undefined;
  }
  return segments.join("/");
}

export function canonicalImmutableRevision(value: string): string | undefined {
  const normalized = value.normalize("NFKC").trim();
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(normalized)
    ? normalized.toLocaleLowerCase("und")
    : undefined;
}

export function canonicalTrackingRef(value: string): string | undefined {
  const candidate = value;
  if (candidate === "HEAD") {
    return candidate;
  }
  if (
    candidate.length > 1024 ||
    !/^refs\/(?:heads|tags)\/.+$/u.test(candidate) ||
    [...candidate].some(
      (character) =>
        character.charCodeAt(0) <= 0x20 ||
        character.charCodeAt(0) === 0x7f ||
        "~^:?*[\\".includes(character),
    ) ||
    candidate.includes("..") ||
    candidate.includes("@{") ||
    candidate.endsWith(".")
  ) {
    return undefined;
  }
  const segments = candidate.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment.startsWith(".") ||
        segment.endsWith(".lock"),
    )
  ) {
    return undefined;
  }
  return candidate;
}

export function validStoredRemoteProvenance(
  source: StoredRemoteProvenanceCandidate,
): boolean {
  const values = [
    source.url,
    source.revision,
    source.repositoryPath,
    source.trackingRef,
  ];
  if (values.every((value) => value === undefined)) {
    return true;
  }
  if (!values.every((value) => typeof value === "string")) {
    return false;
  }
  const [url, revision, repositoryPath, trackingRef] = values as [
    string,
    string,
    string,
    string,
  ];
  return (
    canonicalLifecycleSourceUrl(url) === url &&
    canonicalImmutableRevision(revision) === revision &&
    canonicalRepositoryPath(repositoryPath) === repositoryPath &&
    canonicalTrackingRef(trackingRef) === trackingRef
  );
}
