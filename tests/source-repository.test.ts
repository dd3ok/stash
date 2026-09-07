import assert from "node:assert/strict";
import test from "node:test";
import { createStashCatalog } from "../src/stash-catalog.js";
import { createCatalogFixture } from "./helpers.js";

test("URL-only repository bundles resolve by unique short name across list, exact and search", async () => {
  const names = ["cohesion", "coupling", "predictability", "readability"];
  const fixture = await createCatalogFixture(names.map((name) => ({
    group: "frontend", name, description: `Review ${name}.`,
    sidecar: "schemaVersion: 1\nsource:\n  url: https://github.com/toss/frontend-fundamentals\n",
  })));
  const catalog = await createStashCatalog({ cacheDir: fixture.cacheDir, catalogs: [{ id: "test", root: fixture.root }] });
  for (const source of ["frontend-fundamentals", "toss/frontend-fundamentals", "https://github.com/toss/frontend-fundamentals"]) {
    let page = await catalog.resolve({ kind: "list", sources: [source], pageSize: 2 });
    assert.equal(page.totalRelevant, 4, source);
    const listed = page.matches.map((match) => match.name);
    assert.ok(page.page.nextCursor);
    page = await catalog.resolve({ kind: "list", sources: [source], pageSize: 2, cursor: page.page.nextCursor });
    listed.push(...page.matches.map((match) => match.name));
    assert.deepEqual(listed.sort(), names);
    for (const kind of ["exact", "search"] as const) {
      const result = await catalog.resolve(kind === "exact"
        ? { kind, name: "readability", sources: [source] }
        : { kind, query: "readability", sources: [source] });
      assert.deepEqual(result.matches.map((match) => match.name), ["readability"]);
    }
  }
});

test("repository shortcuts preserve punctuation, reject ambiguity, and respect explicit identities", async () => {
  const fixture = await createCatalogFixture([
    { group: "one", name: "first", description: "First review.", sidecar: "schemaVersion: 1\nsource:\n  url: https://github.com/toss/frontend-fundamentals\n" },
    { group: "two", name: "second", description: "Second review.", sidecar: "schemaVersion: 1\nsource:\n  url: https://github.com/other/frontend-fundamentals\n" },
    { group: "one", name: "explicit", description: "Explicit identity.", sidecar: "schemaVersion: 1\nsource:\n  id: taste-skill\n" },
    { group: "one", name: "derived", description: "Derived identity.", sidecar: "schemaVersion: 1\nsource:\n  url: https://github.com/other/taste-skill\n" },
  ]);
  const catalog = await createStashCatalog({ cacheDir: fixture.cacheDir, catalogs: [{ id: "test", root: fixture.root }] });
  for (const source of ["frontend-fundamentals", "frontendfundamentals", "toss", "fundamentals"]) {
    const result = await catalog.resolve({ kind: "list", sources: [source], group: "one" });
    assert.equal(result.status, "no-match", source);
  }
  for (const [source, expected] of [["toss/frontend-fundamentals", "first"], ["other/frontend-fundamentals", "second"], ["taste-skill", "explicit"]]) {
    const result = await catalog.resolve({ kind: "list", sources: [source] });
    assert.deepEqual(result.matches.map((match) => match.name), [expected]);
  }
});

test("equivalent GitHub URL spellings form one complete repository bundle", async () => {
  const urls = [
    "https://github.com/toss/frontend-fundamentals",
    "https://github.com/toss/frontend-fundamentals.git",
    "https://github.com/Toss/Frontend-Fundamentals/",
    "https://github.com/toss/frontend-fundamentals.git/",
  ];
  const fixture = await createCatalogFixture(urls.map((url, i) => ({
    group: "frontend", name: `variant-${i}`, description: "Review code quality.",
    sidecar: `schemaVersion: 1\nsource:\n  url: ${url}\n`,
  })));
  const catalog = await createStashCatalog({ cacheDir: fixture.cacheDir, catalogs: [{ id: "test", root: fixture.root }] });
  for (const source of ["frontend-fundamentals", "TOSS/FRONTEND-FUNDAMENTALS"]) {
    const first = await catalog.resolve({ kind: "list", sources: [source], pageSize: 2 });
    assert.equal(first.totalRelevant, 4);
    assert.ok(first.page.nextCursor);
    const second = await catalog.resolve({ kind: "list", sources: [source], pageSize: 2, cursor: first.page.nextCursor });
    const matches = [...first.matches, ...second.matches];
    assert.deepEqual(matches.map((match) => match.name).sort(), ["variant-0", "variant-1", "variant-2", "variant-3"]);
    assert.deepEqual(matches.map((match) => match.source?.url).sort(), [...urls].sort());
    const exact = await catalog.resolve({ kind: "exact", name: "variant-2", sources: [source] });
    assert.equal(exact.status, "ok");
    const content = await catalog.read({ ref: exact.matches[0]!.ref });
    assert.equal(content.status, "ok");
  }
  // Explicit URLs remain exact provenance filters rather than shortcut expansion.
  const explicit = await catalog.resolve({ kind: "list", sources: [urls[0]!] });
  assert.deepEqual(explicit.matches.map((match) => match.name), ["variant-0"]);
});

test("repository shorthand excludes other origins and non-repository URL paths", async () => {
  const urls = [
    "https://github.com:8443/toss/frontend-fundamentals",
    "https://example.com/toss/frontend-fundamentals",
    "https://github.com/toss/frontend-fundamentals/tree/main",
    "https://github.com/toss/frontend-fundamentals?tab=readme-ov-file",
    "https://github.com/toss/frontend-fundamentals#readme",
    "https://user@github.com/toss/frontend-fundamentals",
  ];
  const fixture = await createCatalogFixture(urls.map((url, i) => ({
    group: "frontend", name: `excluded-${i}`, description: "Review code quality.",
    sidecar: `schemaVersion: 1\nsource:\n  url: ${url}\n`,
  })));
  const catalog = await createStashCatalog({ cacheDir: fixture.cacheDir, catalogs: [{ id: "test", root: fixture.root }] });
  const result = await catalog.resolve({ kind: "list", sources: ["frontend-fundamentals"] });
  assert.equal(result.status, "no-match");
});
