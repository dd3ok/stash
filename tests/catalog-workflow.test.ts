import assert from "node:assert/strict";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createStashCatalog, createStashLifecycle } from "../src/index.js";
import { createCatalogFixture } from "./helpers.js";

async function fixture() {
  const data = await createCatalogFixture([
    { group: "frontend", name: "adapt", description: "Adapt responsive web layouts for different screens." },
    { group: "game-development", name: "game-test", description: "Test playable web games, including responsive layouts." },
    { group: "engineering", name: "review", description: "Review code changes." },
    { group: "frontend", name: "review", description: "Review visual interfaces." },
  ]);
  const options = { cacheDir: data.cacheDir, catalogs: [{ id: "test", root: data.root }], managedRoot: path.join(path.dirname(data.root), "managed") };
  return { ...data, options, catalog: await createStashCatalog(options) };
}

test("literal retrieval makes no semantic ranking, synonym or typo claims", async () => {
  const { catalog } = await fixture();
  const broad = await catalog.resolve({ kind: "list", text: "responsive" });
  assert.deepEqual(broad.matches.map(x => x.name), ["adapt", "game-test"]);
  assert.equal(broad.total, 2);
  assert.ok(broad.matches.every(x => !("relevance" in x)));
  for (const text of ["반응형 웹", "responisve", "responsive web games", "*"]) {
    assert.equal((await catalog.resolve({ kind: "list", text })).status, "no-match");
  }
  const scoped = await catalog.resolve({ kind: "list", groups: ["frontend"], text: "RESPONSIVE" });
  assert.deepEqual(scoped.matches.map(x => x.name), ["adapt"]);
  assert.equal((await catalog.resolve({ kind: "list", text: "  " })).status, "invalid-request");
});

test("exact refs disambiguate names without compacting punctuation or aliases", async () => {
  const { catalog } = await fixture();
  assert.equal((await catalog.resolve({ kind: "exact", name: "review" })).status, "ambiguous-exact");
  const exact = await catalog.resolve({ kind: "exact", name: "test:frontend/review" });
  assert.equal(exact.status, "ok");
  assert.equal(exact.matches[0]?.description, "Review visual interfaces.");
  for (const name of ["game test", "gametest", "frontend/review"]) {
    assert.equal((await catalog.resolve({ kind: "exact", name })).status, "no-match");
  }
});

test("multi-category browsing is complete, ordered and cursor-bound", async () => {
  const { catalog } = await fixture();
  const request = { kind: "list", groups: ["frontend", "game-development"], pageSize: 1 } as const;
  const refs: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await catalog.resolve({ ...request, groups: [...request.groups], ...(cursor ? { cursor } : {}) });
    assert.equal(result.total, 3);
    refs.push(...result.matches.map(x => x.ref));
    cursor = result.page.nextCursor;
  } while (cursor);
  assert.equal(new Set(refs).size, 3);
  const first = await catalog.resolve({ kind: "list", pageSize: 1 });
  assert.equal((await catalog.resolve({ kind: "list", text: "review", cursor: first.page.nextCursor })).status, "cursor-stale");
  assert.equal((await catalog.resolve({ kind: "list", cursor: "garbage" })).status, "cursor-stale");
  assert.equal((await catalog.resolve({ kind: "list", groups: ["missing"] })).total, 0);
  assert.equal((await catalog.resolve({ kind: "list", catalogIds: ["missing"] })).status, "catalog-unavailable");
});

test("warm snapshot stays unchanged until explicit refresh, but reads verify current content", async () => {
  const { root, options, catalog } = await fixture();
  const first = await catalog.resolve({ kind: "list", pageSize: 1 });
  const selected = await catalog.resolve({ kind: "exact", name: "adapt" });
  const source = path.join(root, "frontend", "adapt", "SKILL.md");
  await writeFile(source, (await readFile(source, "utf8")) + "Changed instructions.\n");
  const reopened = await createStashCatalog(options);
  assert.equal((await reopened.resolve({ kind: "exact", name: "adapt" })).matches[0]?.contentHash, selected.matches[0]?.contentHash);
  assert.equal((await reopened.read({ ref: selected.matches[0]!.ref, expectedHash: selected.matches[0]!.contentHash })).status, "hash-mismatch");
  await reopened.refresh();
  assert.notEqual((await reopened.resolve({ kind: "exact", name: "adapt" })).matches[0]?.contentHash, selected.matches[0]?.contentHash);
  assert.equal((await reopened.resolve({ kind: "list", cursor: first.page.nextCursor })).status, "cursor-stale");
});

test("unchanged refresh preserves cursors; corrupt snapshots rebuild", async () => {
  const { cacheDir, catalog } = await fixture();
  const first = await catalog.resolve({ kind: "list", pageSize: 1 });
  await catalog.refresh();
  assert.equal((await catalog.resolve({ kind: "list", cursor: first.page.nextCursor })).status, "ok");
  await writeFile(path.join(cacheDir, "catalog.json"), "broken json");
  assert.equal((await catalog.resolve({ kind: "list" })).total, 4);
  const snapshot = JSON.parse(await readFile(path.join(cacheDir, "catalog.json"), "utf8"));
  snapshot.version = -1;
  await writeFile(path.join(cacheDir, "catalog.json"), JSON.stringify(snapshot));
  assert.equal((await catalog.resolve({ kind: "list" })).total, 4);
});

test("registration changes invalidate snapshot policy and pagination", async () => {
  const { options, catalog } = await fixture();
  const first = await catalog.resolve({ kind: "list", pageSize: 1 });
  const changed = await createStashCatalog({ ...options, catalogs: [{ ...options.catalogs[0]!, trust: "quarantined" }] });
  assert.equal((await changed.resolve({ kind: "list" })).total, 0);
  assert.equal((await changed.read({ ref: first.matches[0]!.ref })).status, "quarantined");
});

test("classify binds a compact purpose to current content without editing or activating skills", async () => {
  const { root, options, catalog } = await fixture();
  const exact = (await catalog.resolve({ kind: "exact", name: "adapt" })).matches[0]!;
  const source = path.join(root, "frontend", "adapt", "SKILL.md");
  const before = await readFile(source);
  const lifecycle = await createStashLifecycle(options);
  await lifecycle.classify({ ref: exact.ref, contentHash: exact.contentHash, group: "web-design", purpose: "반응형 웹 화면 조정" });
  const result = await (await createStashCatalog(options)).resolve({ kind: "list", groups: ["web-design"] });
  assert.equal(result.total, 1);
  assert.equal(result.matches[0]?.description, "반응형 웹 화면 조정");
  assert.deepEqual(await readFile(source), before);
  assert.equal((await lifecycle.status()).skills.length, 0);
  await assert.rejects(lifecycle.classify({ ref: exact.ref, contentHash: "sha256:" + "0".repeat(64), group: "frontend", purpose: "Wrong hash" }), { code: "hash-mismatch" });
  await writeFile(source, before.toString() + "Changed.\n");
  const reopened = await createStashCatalog(options);
  await reopened.refresh();
  const changed = await reopened.resolve({ kind: "list", text: "adapt" });
  assert.notEqual(changed.matches[0]?.description, "반응형 웹 화면 조정");
  assert.ok(changed.diagnostics.warnings?.some(w => w.code === "classification-stale"));
});

test("classification refuses unsafe input and preserves recorded provenance", async () => {
  const { root, options, catalog } = await fixture();
  const source = path.join(root, "frontend", "adapt");
  await writeFile(path.join(source, "stash.meta.yaml"), "schemaVersion: 1\nsource:\n  url: https://github.com/original/skills\n");
  await catalog.refresh();
  const exact = (await catalog.resolve({ kind: "exact", name: "adapt" })).matches[0]!;
  const lifecycle = await createStashLifecycle(options);
  for (const group of ["../outside", "", "Upper Case"] ) {
    await assert.rejects(lifecycle.classify({ ref: exact.ref, contentHash: exact.contentHash, group, purpose: "Fixture" }), { code: "invalid-classification" });
  }
  await lifecycle.classify({ ref: exact.ref, contentHash: exact.contentHash, group: "frontend", purpose: "Fixture", source: { url: "https://github.com/wrong/skills" } });
  const fresh = await createStashCatalog(options);
  assert.equal((await fresh.resolve({ kind: "exact", name: "adapt" })).matches[0]?.source?.url, "https://github.com/original/skills");
});

test("managed lifecycle invalidates existing snapshots without TTLs", async () => {
  const { root, options } = await fixture();
  const lifecycle = await createStashLifecycle(options);
  await lifecycle.install({ source: path.join(root, "frontend", "adapt") });
  const catalog = await createStashCatalog(options);
  const initial = await catalog.resolve({ kind: "list" });
  assert.equal(initial.matches.filter(x => x.catalogId === "managed").length, 1);
  await lifecycle.install({ source: path.join(root, "game-development", "game-test") });
  const changed = await catalog.resolve({ kind: "list" });
  assert.equal(changed.matches.filter(x => x.catalogId === "managed").length, 2);
  assert.equal(changed.total, initial.total); // Verified source copies are folded, not duplicated.
});

test("configuration accepts only the current schema and minimal options", async () => {
  const { root, cacheDir } = await fixture();
  const configPath = path.join(path.dirname(root), "config.yaml");
  for (const source of ["version: 1\ncatalogs: []\n", "version: 2\ndiscovery: {}\n", "version: 2\ndefaults:\n  cacheTtlMs: 10\n"]) {
    await writeFile(configPath, source);
    await assert.rejects(createStashCatalog({ configPath, cacheDir }));
  }
  await writeFile(configPath, "version: 2\ncatalogs: []\ndefaults:\n  pageSize: 50\n");
  await createStashCatalog({ configPath, cacheDir });
});

test("first install updates an already-open empty catalog and uninstall clears classification", async () => {
  const { root, options } = await fixture();
  const catalog = await createStashCatalog(options);
  await catalog.resolve({ kind: "list" });
  const lifecycle = await createStashLifecycle(options);
  await lifecycle.install({ source: path.join(root, "frontend", "adapt") });
  const selected = (await catalog.resolve({ kind: "exact", name: "managed:adapt" })).matches[0]!;
  assert.ok(selected);
  await lifecycle.classify({ ref: selected.ref, contentHash: selected.contentHash, group: "frontend", purpose: "Adapt layouts." });
  await lifecycle.uninstall({ name: "adapt" });
  const metadata = JSON.parse(await readFile(path.join(options.managedRoot, ".stash", "catalog.json"), "utf8"));
  assert.equal(metadata.skills["managed:adapt"], undefined);
  assert.equal((await catalog.resolve({ kind: "exact", name: "managed:adapt" })).status, "no-match");
});

test("selected reads reject escaping links and outside quarantine changes without refreshing", async () => {
  const { root, options, catalog } = await fixture();
  const selected = (await catalog.resolve({ kind: "exact", name: "adapt" })).matches[0]!;
  const outside = path.join(path.dirname(root), "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "private.txt"), "Not a skill resource.");
  const skill = path.join(root, "frontend", "adapt");
  await symlink(outside, path.join(skill, "escape"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await catalog.read({ ref: selected.ref, resource: "escape/private.txt" })).status, "resource-outside-skill");
  await writeFile(path.join(skill, "stash.meta.yaml"), "schemaVersion: 1\ntrust:\n  state: quarantined\n");
  assert.equal((await (await createStashCatalog(options)).read({ ref: selected.ref })).status, "quarantined");
});

test("default 50-card pages cover large result sets without dropping records", async () => {
  const data = await createCatalogFixture(Array.from({ length: 123 }, (_, i) => ({ group: "engineering", name: `skill-${i}`, description: "Inspect code." })));
  const catalog = await createStashCatalog({ cacheDir: data.cacheDir, catalogs: [{ id: "test", root: data.root }] });
  const seen = new Set<string>();
  let result = await catalog.resolve({ kind: "list" });
  assert.equal(result.page.size, 50);
  while (true) {
    assert.equal(result.total, 123);
    result.matches.forEach(match => seen.add(match.ref));
    if (!result.page.nextCursor) break;
    result = await catalog.resolve({ kind: "list", cursor: result.page.nextCursor });
  }
  assert.equal(seen.size, 123);
});
