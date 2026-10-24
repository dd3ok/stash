import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { decodeCursor, encodeCursor } from "../src/internal/util.js";
import { createStashCatalog } from "../src/stash-catalog.js";
import { INDEX_SCHEMA_VERSION } from "../src/types.js";
import { createCatalogFixture, fixtureSkills } from "./helpers.js";

async function fixtureCatalog(now?: () => number) {
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
    },
    ...(now ? { now } : {}),
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
  assert.equal(resolved.total, 1);
  assert.equal(resolved.matches[0]?.ref, "fixture:web-design/visual-identity");

  const read = await catalog.read({
    ref: "fixture:web-design/visual-identity",
    expectedHash: resolved.matches[0]?.contentHash,
  });
  assert.equal(read.status, "ok");
  assert.match(read.content ?? "", /Build the requested brand system/u);
});

test("selection preserves exclusion clauses while inventory stays compact", async () => {
  const description = `${"Review a product interface and report actionable findings. ".repeat(6)}Never use for backend-only work.`;
  const fixture = await createCatalogFixture([{
    group: "frontend", name: "interface-audit", description,
  }]);
  const catalog = await createStashCatalog({
    cacheDir: fixture.cacheDir, catalogs: [{ id: "test", root: fixture.root }],
  });
  for (const request of [
    { kind: "exact", name: "interface-audit" } as const,
  ]) {
    const result = await catalog.resolve(request);
    assert.equal(result.matches[0]?.description, description);
  }
  const inventory = await catalog.resolve({ kind: "list" });
  assert.ok(inventory.matches[0]!.description.length <= 240);
});

test("one-page inventory summarizes every matching source and category", async () => {
  const fixture = await createCatalogFixture([
    { group: "frontend", name: "one", description: "First fixture.", sidecar: "schemaVersion: 1\nsource:\n  url: https://github.com/example/design\n" },
    { group: "frontend", name: "two", description: "Second fixture.", sidecar: "schemaVersion: 1\nsource:\n  url: https://github.com/example/design\n" },
    { group: "media", name: "three", description: "Third fixture." },
  ]);
  const catalog = await createStashCatalog({
    cacheDir: fixture.cacheDir, catalogs: [{ id: "test", root: fixture.root }],
  });
  const result = await catalog.resolve({ kind: "list", pageSize: 1 });
  assert.equal(result.matches.length, 1);
  assert.equal(result.total, 3);
  assert.ok(result.page.nextCursor);
  assert.deepEqual(result.summary?.groups, [{ name: "frontend", count: 2 }, { name: "media", count: 1 }]);
  assert.equal(result.summary?.sources.find((source) => source.label === "example/design")?.count, 2);
  const scoped = await catalog.resolve({ kind: "list", sources: ["example/design"], pageSize: 1 });
  assert.equal(scoped.total, 2);
  assert.equal(scoped.summary?.sources.length, 1);
  assert.deepEqual(scoped.summary?.groups, [{ name: "frontend", count: 2 }]);
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

test("concurrent refreshes publish complete snapshots", async () => {
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
