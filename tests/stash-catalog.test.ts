import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createStashCatalog } from "../src/stash-catalog.js";
import { createCatalogFixture, fixtureSkills } from "./helpers.js";

async function fixtureCatalog() {
  const fixture = await createCatalogFixture(fixtureSkills);
  const catalog = await createStashCatalog({
    cacheDir: fixture.cacheDir,
    catalogs: [
      {
        id: "fixture",
        root: fixture.root,
        enabled: true,
        trust: "unreviewed",
        followSymlinks: false,
        compatibility: ["codex", "claude-code", "antigravity"],
      },
    ],
    defaults: {
      pageSize: 40,
      cacheTtlMs: 0,
      materialScoreThreshold: 2,
      locale: "ko-KR",
    },
  });
  return { ...fixture, catalog };
}

test("exact lookup is deterministic and read returns the selected skill", async () => {
  const { catalog } = await fixtureCatalog();
  const resolved = await catalog.resolve({
    kind: "exact",
    name: "visual-identity",
  });
  assert.equal(resolved.status, "ok");
  assert.equal(resolved.totalRelevant, 1);
  assert.equal(resolved.matches[0]?.ref, "fixture:web-design/visual-identity");
  assert.equal(resolved.matches[0]?.relevance?.tier, "exact");

  const read = await catalog.read({
    ref: "fixture:web-design/visual-identity",
    expectedHash: resolved.matches[0]?.contentHash,
  });
  assert.equal(read.status, "ok");
  assert.match(read.content ?? "", /Build the requested brand system/u);
});

test("Korean discovery returns every relevant brand skill without a fixed cap", async () => {
  const { catalog } = await fixtureCatalog();
  const result = await catalog.resolve({
    kind: "search",
    query: "브랜드 디자인 스킬들 알려줘",
    pageSize: 200,
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(
    result.matches.map((match) => match.name).sort(),
    ["brand-worlds", "visual-identity"],
  );
  assert.equal(result.totalRelevant, 2);
  assert.equal(result.page.nextCursor, undefined);
});

test("multi-field evidence remains relevant in a small catalog with lower IDF", async () => {
  const fixture = await createCatalogFixture(fixtureSkills.slice(0, 3));
  const catalog = await createStashCatalog({
    cacheDir: fixture.cacheDir,
    catalogs: [{ id: "small", root: fixture.root }],
    defaults: { materialScoreThreshold: 2 },
  });
  const result = await catalog.resolve({
    kind: "search",
    query: "브랜드 디자인 스킬들 알려줘",
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(
    result.matches.map((match) => match.name).sort(),
    ["brand-worlds", "visual-identity"],
  );
});

test("a broad generic term does not promote description-only matches", async () => {
  const { catalog } = await fixtureCatalog();
  const result = await catalog.resolve({
    kind: "search",
    query: "design",
    includePossible: true,
  });
  assert.equal(result.status, "ok");
  const relevant = result.matches.filter(
    (match) => match.relevance?.tier !== "possible",
  );
  assert.deepEqual(relevant.map((match) => match.name), ["design-system"]);
  assert.ok(result.totalPossible >= 1);
});

test("dense multi-term description evidence supports standard skills without sidecars", async () => {
  const fixture = await createCatalogFixture([
    {
      group: "design",
      name: "dense-brand",
      description:
        "Create a brand identity with logo systems, art direction, and branding guidance.",
    },
    {
      group: "design",
      name: "generic-art",
      description: "Provide general art direction for visual projects.",
    },
    {
      group: "other",
      name: "unrelated",
      description: "Analyze database query performance.",
    },
  ]);
  const catalog = await createStashCatalog({
    cacheDir: fixture.cacheDir,
    catalogs: [{ id: "standard", root: fixture.root }],
  });
  const result = await catalog.resolve({
    kind: "search",
    query: "brand branding identity logo art direction",
  });
  assert.deepEqual(result.matches.map((match) => match.name), ["dense-brand"]);
});

test("pagination preserves the complete relevant count", async () => {
  const { catalog } = await fixtureCatalog();
  const first = await catalog.resolve({
    kind: "search",
    query: "브랜드 디자인",
    pageSize: 1,
  });
  assert.equal(first.totalRelevant, 2);
  assert.equal(first.matches.length, 1);
  assert.ok(first.page.nextCursor);

  const second = await catalog.resolve({
    kind: "search",
    query: "브랜드 디자인",
    pageSize: 1,
    cursor: first.page.nextCursor,
  });
  assert.equal(second.totalRelevant, 2);
  assert.equal(second.matches.length, 1);
  assert.equal(second.page.nextCursor, undefined);
  assert.notEqual(first.matches[0]?.ref, second.matches[0]?.ref);
});

test("cursor is bound to the query and index", async () => {
  const { catalog } = await fixtureCatalog();
  const first = await catalog.resolve({
    kind: "list",
    pageSize: 1,
  });
  assert.ok(first.page.nextCursor);
  const stale = await catalog.resolve({
    kind: "search",
    query: "security",
    cursor: first.page.nextCursor,
  });
  assert.equal(stale.status, "cursor-stale");
});

test("no-skill query abstains", async () => {
  const { catalog } = await fixtureCatalog();
  const result = await catalog.resolve({
    kind: "search",
    query: "quantum chemistry spectroscopy",
  });
  assert.equal(result.status, "no-match");
  assert.equal(result.totalRelevant, 0);
  assert.deepEqual(result.matches, []);
});

test("quarantined skills are not resolved or read", async () => {
  const { catalog } = await fixtureCatalog();
  const resolved = await catalog.resolve({
    kind: "exact",
    name: "unsafe-skill",
  });
  assert.equal(resolved.status, "no-match");
  const read = await catalog.read({ ref: "fixture:quarantine/unsafe-skill" });
  assert.equal(read.status, "quarantined");
});

test("read rejects traversal and stale hashes", async () => {
  const { catalog } = await fixtureCatalog();
  const traversal = await catalog.read({
    ref: "fixture:web-design/visual-identity",
    resource: "../brand-worlds/SKILL.md",
  });
  assert.equal(traversal.status, "resource-outside-skill");

  const mismatch = await catalog.read({
    ref: "fixture:web-design/visual-identity",
    expectedHash: "sha256:not-the-selected-content",
  });
  assert.equal(mismatch.status, "hash-mismatch");
});

test("content reads reject oversized and binary resources", async () => {
  const { catalog, root } = await fixtureCatalog();
  const skillRoot = path.join(root, "web-design", "visual-identity");
  await writeFile(path.join(skillRoot, "oversized.txt"), Buffer.alloc(2_097_153));
  await writeFile(path.join(skillRoot, "binary.bin"), Buffer.from([1, 0, 2]));

  const oversized = await catalog.read({
    ref: "fixture:web-design/visual-identity",
    resource: "oversized.txt",
  });
  assert.equal(oversized.status, "unsupported-resource");
  assert.equal(oversized.bytes, 2_097_153);

  const binary = await catalog.read({
    ref: "fixture:web-design/visual-identity",
    resource: "binary.bin",
  });
  assert.equal(binary.status, "unsupported-resource");
  assert.equal(binary.bytes, 3);
});

test("refresh detects new catalog content without mutating source skills", async () => {
  const { catalog, root } = await fixtureCatalog();
  const before = await catalog.resolve({ kind: "exact", name: "new-skill" });
  assert.equal(before.status, "no-match");

  const newDirectory = path.join(root, "new-skill");
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(newDirectory, { recursive: true }),
  );
  await writeFile(
    path.join(newDirectory, "SKILL.md"),
    "---\nname: new-skill\ndescription: A newly indexed skill.\n---\n\n# New\n",
    "utf8",
  );
  const refreshed = await catalog.refresh();
  assert.equal(refreshed.status, "ok");
  const after = await catalog.resolve({ kind: "exact", name: "new-skill" });
  assert.equal(after.status, "ok");
});

test("sidecar changes invalidate the index fingerprint", async () => {
  const { catalog, root } = await fixtureCatalog();
  await catalog.resolve({ kind: "exact", name: "visual-identity" });
  await writeFile(
    path.join(root, "web-design", "visual-identity", "stash.meta.yaml"),
    `schemaVersion: 1
aliases:
  - completely-new-alias
trust:
  state: reviewed
`,
    "utf8",
  );
  const result = await catalog.resolve({
    kind: "exact",
    name: "completely-new-alias",
  });
  assert.equal(result.status, "ok");
  assert.equal(result.matches[0]?.name, "visual-identity");
});

test("catalog manifest defaults apply when config does not override them", async () => {
  const fixture = await createCatalogFixture([
    {
      group: "portable",
      name: "portable-skill",
      description: "A portable skill using catalog defaults.",
    },
  ]);
  await writeFile(
    path.join(fixture.root, "stash.catalog.yaml"),
    `schemaVersion: 1
id: manifest
defaults:
  trust: reviewed
  compatibility:
    - codex
    - claude-code
    - antigravity
`,
    "utf8",
  );
  const catalog = await createStashCatalog({
    cacheDir: fixture.cacheDir,
    catalogs: [{ id: "manifest", root: fixture.root }],
  });
  const result = await catalog.resolve({
    kind: "exact",
    name: "portable-skill",
  });
  assert.equal(result.matches[0]?.trust, "reviewed");
  assert.equal(result.matches[0]?.compatibility.codex, "supported");
  assert.equal(
    result.matches[0]?.compatibility["claude-code"],
    "supported",
  );
  assert.equal(result.matches[0]?.compatibility.antigravity, "supported");
});

test("concurrent refreshes serialize cache replacement", async () => {
  const { catalog } = await fixtureCatalog();
  const results = await Promise.all([
    catalog.refresh(),
    catalog.refresh(),
    catalog.refresh(),
  ]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["ok", "ok", "ok"],
  );
});

test("doctor reports malformed skills instead of silently accepting them", async () => {
  const fixture = await createCatalogFixture([
    {
      group: "broken",
      name: "invalid_name",
      description: "Invalid folder and name fixture.",
    },
  ]);
  const catalog = await createStashCatalog({
    cacheDir: fixture.cacheDir,
    catalogs: [{ id: "broken", root: fixture.root }],
  });
  const result = await catalog.doctor();
  assert.equal(result.status, "warning");
  assert.equal(result.catalogs[0]?.records, 0);
  assert.ok(
    result.catalogs[0]?.warnings.some(
      (warning) => warning.code === "invalid-skill",
    ),
  );
});
