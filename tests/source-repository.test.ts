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
