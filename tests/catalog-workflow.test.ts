import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
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
  const valid = await readFile(path.join(cacheDir, "catalog.json"), "utf8");
  for (const failures of [undefined, [null], [{ catalogId: 42, message: "invalid" }]]) {
    await writeFile(path.join(cacheDir, "catalog.json"), JSON.stringify({ ...JSON.parse(valid), failures }));
    assert.equal((await catalog.resolve({ kind: "list" })).total, 4);
  }
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

test("scoped retrieval isolates missing and non-directory catalogs without hiding incomplete results", async t => {
  for (const kind of ["missing", "file"] as const) await t.test(kind, async () => {
    const { options } = await fixture();
    const unavailable = { id: "offline", root: path.join(path.dirname(options.managedRoot), kind) };
    if (kind === "file") await writeFile(unavailable.root, "Not a directory.");
    const configured = { ...options, catalogs: [...options.catalogs, unavailable] };
    const catalog = await createStashCatalog(configured);
    const first = await catalog.resolve({ kind: "list", catalogIds: ["test"], pageSize: 1 });
    assert.equal(first.status, "ok");
    assert.equal(first.total, 4);
    const reopened = await createStashCatalog(configured);
    const next = await reopened.resolve({ kind: "list", catalogIds: ["test"], cursor: first.page.nextCursor });
    assert.equal(next.status, "ok");
    assert.equal(next.matches.length, 3);
    for (const name of ["TEST:frontend/adapt", "ＴＥＳＴ：frontend/adapt"]) {
      assert.equal((await reopened.resolve({ kind: "exact", name })).status, "ok");
    }
    assert.equal((await reopened.read({ ref: "test:frontend/adapt" })).status, "ok");
    for (const catalogIds of [undefined, ["offline"], ["test", "offline"]]) {
      const result = await reopened.resolve({ kind: "list", ...(catalogIds ? { catalogIds } : {}) });
      assert.equal(result.status, "catalog-unavailable");
      assert.equal(result.matches.length, 0);
      assert.ok(result.diagnostics.warnings?.some(w => w.code === "catalog-unavailable" && w.message.includes("offline")));
    }
    assert.equal((await reopened.resolve({ kind: "exact", name: "adapt" })).status, "catalog-unavailable");
    assert.equal((await reopened.refresh({ catalogIds: ["test"] })).status, "ok");
    assert.equal((await reopened.refresh({ catalogIds: ["offline"] })).status, "failed");
    const refresh = await reopened.refresh();
    assert.equal(refresh.status, "partial");
    assert.ok(refresh.catalogs.find(c => c.catalogId === "offline")?.warnings.some(w => w.code === "catalog-unavailable"));
    const disabled = await createStashCatalog({ ...options, catalogs: [...options.catalogs, { ...unavailable, enabled: false }] });
    assert.equal((await disabled.resolve({ kind: "list" })).total, 4);
  });
});

test("refresh recovers failed catalogs and invalidates cursors", async () => {
  const { options } = await fixture();
  const recoveredRoot = path.join(path.dirname(options.managedRoot), "recovering");
  const catalog = await createStashCatalog({ ...options, catalogs: [...options.catalogs, { id: "recovering", root: recoveredRoot }] });
  const first = await catalog.resolve({ kind: "list", catalogIds: ["test"], pageSize: 1 });
  await mkdir(path.join(recoveredRoot, "restored"), { recursive: true });
  await writeFile(path.join(recoveredRoot, "restored", "SKILL.md"), "---\nname: restored\ndescription: A recovered skill.\n---\n");
  assert.equal((await catalog.resolve({ kind: "list" })).status, "catalog-unavailable");
  assert.equal((await catalog.refresh()).status, "ok");
  assert.equal((await catalog.resolve({ kind: "list" })).total, 5);
  assert.equal((await catalog.resolve({ kind: "list", catalogIds: ["test"], cursor: first.page.nextCursor })).status, "cursor-stale");
  await rename(recoveredRoot, `${recoveredRoot}-offline`);
  assert.equal((await catalog.refresh()).status, "partial");
  assert.equal((await catalog.resolve({ kind: "list", catalogIds: ["test"] })).total, 4);
  assert.equal((await catalog.resolve({ kind: "exact", name: "recovering:restored" })).status, "catalog-unavailable");
});

test("reclassification preserves omitted attribution only for the same inspected hash", async () => {
  const { root, options, catalog } = await fixture();
  const exact = (await catalog.resolve({ kind: "exact", name: "adapt" })).matches[0]!;
  const lifecycle = await createStashLifecycle(options);
  const request = { ref: exact.ref, contentHash: exact.contentHash, group: "frontend", purpose: "Original purpose." };
  const source = { id: "verified-author", displayName: "Verified Author", url: "https://github.com/example/skills" };
  await lifecycle.classify({ ...request, source });
  await lifecycle.classify({ ...request, group: "web-design", purpose: "Changed purpose." });
  let selected = (await catalog.resolve({ kind: "list", groups: ["web-design"] })).matches[0]!;
  assert.deepEqual(selected.source, source);
  assert.equal(selected.description, "Changed purpose.");
  const skillPath = path.join(root, "frontend", "adapt", "SKILL.md");
  await writeFile(skillPath, (await readFile(skillPath, "utf8")) + "Changed content.\n");
  await assert.rejects(lifecycle.classify(request), { code: "hash-mismatch" });
  const metadataPath = path.join(options.managedRoot, ".stash", "catalog.json");
  assert.deepEqual(JSON.parse(await readFile(metadataPath, "utf8")).skills[exact.ref].source, source);
  await catalog.refresh();
  selected = (await catalog.resolve({ kind: "exact", name: exact.ref })).matches[0]!;
  await lifecycle.classify({ ...request, contentHash: selected.contentHash });
  assert.deepEqual((await catalog.resolve({ kind: "exact", name: exact.ref })).matches[0]!.source, {});
  assert.equal((await lifecycle.status()).skills.length, 0);
});

test("explicit attribution replacement or clearing stays explicit and upstream provenance wins", async () => {
  const { root, options, catalog } = await fixture();
  const exact = (await catalog.resolve({ kind: "exact", name: "adapt" })).matches[0]!;
  const lifecycle = await createStashLifecycle(options);
  const request = { ref: exact.ref, contentHash: exact.contentHash, group: "frontend", purpose: "Fixture." };
  await lifecycle.classify({ ...request, source: { id: "first-author" } });
  const replacement = { url: "https://github.com/verified/replacement" };
  await lifecycle.classify({ ...request, source: replacement });
  assert.deepEqual((await catalog.resolve({ kind: "exact", name: exact.ref })).matches[0]!.source, replacement);
  await lifecycle.classify({ ...request, source: {} });
  await lifecycle.classify(request);
  assert.deepEqual((await catalog.resolve({ kind: "exact", name: exact.ref })).matches[0]!.source, {});
  await writeFile(path.join(root, "frontend", "adapt", "stash.meta.yaml"), "schemaVersion: 1\nsource:\n  url: https://github.com/upstream/skills\n");
  await lifecycle.classify({ ...request, source: replacement });
  await lifecycle.classify(request);
  const preserved = await catalog.resolve({ kind: "exact", name: exact.ref });
  assert.equal(preserved.matches[0]!.source?.url, "https://github.com/upstream/skills");
  assert.ok(preserved.diagnostics.warnings?.some(w => w.code === "classification-source-conflict"));
});

test("malformed cached sources rebuild for visible records and folded copies", async t => {
  const { root, options, cacheDir, catalog } = await fixture();
  const source = { id: "fixture-source", displayName: "Fixture Source", url: "https://github.com/example/skills" };
  await writeFile(path.join(root, "frontend", "adapt", "stash.meta.yaml"), `schemaVersion: 1\nsource:\n  id: ${source.id}\n  displayName: ${source.displayName}\n  url: ${source.url}\n`);
  await (await createStashLifecycle(options)).install({ source: path.join(root, "frontend", "adapt") });
  await catalog.refresh();
  const file = path.join(cacheDir, "catalog.json");
  const original = await readFile(file, "utf8");
  const invalidSources = [null, [], "source", { id: 42 }, { displayName: [] }, { url: 42 }, { id: null }, { displayName: null }, { url: null }];
  for (const folded of [false, true]) for (const invalid of invalidSources) {
    await t.test(`${folded ? "folded" : "visible"}: ${JSON.stringify(invalid)}`, async () => {
      const snapshot = JSON.parse(original);
      const records = folded ? snapshot.copies : snapshot.indexes.flatMap((index: { records: unknown[] }) => index.records);
      const record = records.find((item: { name: string }) => item.name === "adapt");
      assert.ok(record);
      record.source = invalid;
      await writeFile(file, JSON.stringify(snapshot));
      const result = await catalog.resolve({ kind: "list", sources: [source.id], ...(folded ? { catalogIds: ["test"] } : {}) });
      assert.equal(result.status, "ok");
      assert.equal(result.total, 1);
      assert.deepEqual(result.matches[0]!.source, source);
    });
  }
});

test("cache publication retries only bounded Windows rename contention", async t => {
  for (const [code, failures] of [["EPERM", 2], ["EPERM", Infinity], ["EIO", Infinity]] as const) {
    await t.test(`${code}: ${failures}`, async context => {
      const { root, cacheDir, catalog } = await fixture();
      await catalog.refresh();
      const file = path.join(cacheDir, "catalog.json");
      const before = await readFile(file, "utf8");
      const skill = path.join(root, "frontend", "adapt", "SKILL.md");
      await writeFile(skill, (await readFile(skill, "utf8")) + "Changed before publication.\n");
      const originalRename = fs.promises.rename;
      let attempts = 0;
      const mocked = context.mock.method(fs.promises, "rename", async (source, destination) => {
        if (destination === file && ++attempts <= failures) {
          throw Object.assign(new Error("Injected publication failure."), { code });
        }
        return originalRename(source, destination);
      });
      syncBuiltinESMExports();
      context.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
      if (process.platform === "win32" && failures === 2) {
        assert.equal((await catalog.refresh()).status, "ok");
        assert.equal(attempts, 3);
        assert.notEqual(JSON.parse(await readFile(file, "utf8")).fingerprint, JSON.parse(before).fingerprint);
      } else {
        await assert.rejects(catalog.refresh(), { code });
        assert.equal(attempts, process.platform === "win32" && code === "EPERM" ? 5 : 1);
        assert.equal(await readFile(file, "utf8"), before);
      }
      assert.equal((await catalog.resolve({ kind: "list" })).total, 4);
    });
  }
});
