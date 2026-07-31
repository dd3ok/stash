import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createStashCatalog } from "../src/stash-catalog.js";
import { createStashLifecycle } from "../src/stash-lifecycle.js";
import { StashError } from "../src/types.js";

async function createStandaloneSkill(
  parent: string,
  name: string,
): Promise<string> {
  const root = path.join(parent, name);
  await mkdir(path.join(root, "references"), { recursive: true });
  await writeFile(
    path.join(root, "SKILL.md"),
    `---\nname: ${name}\ndescription: A managed lifecycle fixture.\n---\n\n# ${name}\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "references", "guide.md"),
    "fixture guide\n",
    "utf8",
  );
  return root;
}

async function lifecycleFixture(): Promise<{
  base: string;
  managedRoot: string;
  sourceRoot: string;
}> {
  const base = await mkdtemp(path.join(tmpdir(), "stash-lifecycle-test-"));
  const managedRoot = path.join(base, "managed");
  const sourceRoot = await createStandaloneSkill(
    path.join(base, "sources"),
    "rare-skill",
  );
  return { base, managedRoot, sourceRoot };
}

test("install creates a searchable inactive canonical copy without changing source", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  assert.equal(installed.status, "stored");
  assert.match(installed.skillId, /^[0-9a-f-]{36}$/u);
  await access(path.join(fixture.sourceRoot, "SKILL.md"));
  assert.equal(
    await readFile(path.join(installed.managedPath, "references", "guide.md"), "utf8"),
    "fixture guide\n",
  );

  const catalog = await createStashCatalog({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    cacheDir: path.join(fixture.base, "cache"),
  });
  const resolved = await catalog.resolve({ kind: "exact", name: "rare-skill" });
  assert.equal(resolved.status, "ok");
  assert.equal(resolved.matches[0]?.catalogId, "managed");

  const repeated = await lifecycle.install({ source: fixture.sourceRoot });
  assert.equal(repeated.status, "already-stored");
});

test("activate and deactivate only mutate a tracked verified deployment", async () => {
  const fixture = await lifecycleFixture();
  const hostRoot = path.join(fixture.base, "host-skills");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  const target = {
    host: "codex" as const,
    scope: "custom" as const,
    root: hostRoot,
  };
  const activated = await lifecycle.activate({ name: "rare-skill", target });
  assert.equal(activated.status, "deployed");
  assert.match(activated.warning ?? "", /DEPLOYED means present/u);
  const deployedGuide = path.join(hostRoot, "rare-skill", "references", "guide.md");
  await writeFile(deployedGuide, "drifted\n", "utf8");
  await assert.rejects(
    lifecycle.deactivate({ name: "rare-skill", target }),
    (error: unknown) =>
      error instanceof StashError && error.code === "deployment-drift",
  );
  await access(path.join(hostRoot, "rare-skill", "SKILL.md"));

  await writeFile(deployedGuide, "fixture guide\n", "utf8");
  const deactivated = await lifecycle.deactivate({
    name: "rare-skill",
    target,
  });
  assert.equal(deactivated.status, "deactivated");
  await assert.rejects(access(path.join(hostRoot, "rare-skill")));
  await access(path.join(fixture.managedRoot, "rare-skill", "SKILL.md"));
});

test("archive verifies a standalone skill before removing it from host discovery", async () => {
  const fixture = await lifecycleFixture();
  const hostRoot = path.join(fixture.base, "active-skills");
  const active = await createStandaloneSkill(hostRoot, "archive-me");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  const archived = await lifecycle.archive({
    source: "archive-me",
    target: { host: "codex", scope: "custom", root: hostRoot },
  });
  assert.equal(archived.status, "stored");
  await assert.rejects(access(active));
  await access(path.join(fixture.managedRoot, "archive-me", "SKILL.md"));
  assert.deepEqual(
    await readdir(path.join(fixture.managedRoot, ".stash", "journal")),
    [],
  );
});

test("deactivate refuses to remove an untracked detached directory", async () => {
  const fixture = await lifecycleFixture();
  const hostRoot = path.join(fixture.base, "detached-host");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  await createStandaloneSkill(hostRoot, "rare-skill");
  await assert.rejects(
    lifecycle.deactivate({
      name: "rare-skill",
      target: { host: "codex", scope: "custom", root: hostRoot },
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "detached-deployment",
  );
  await access(path.join(hostRoot, "rare-skill", "SKILL.md"));
});

test("install rejects symlinks or junctions anywhere in the skill tree", async (t) => {
  const fixture = await lifecycleFixture();
  const target = path.join(fixture.base, "linked-target");
  await mkdir(target, { recursive: true });
  try {
    await symlink(
      target,
      path.join(fixture.sourceRoot, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    t.skip(`This platform cannot create a test link: ${String(error)}`);
    return;
  }
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  await assert.rejects(
    lifecycle.install({ source: fixture.sourceRoot }),
    (error: unknown) =>
      error instanceof StashError && error.code === "unsafe-skill-tree",
  );
});

test("status reports stored and deployed state without claiming host activation", async () => {
  const fixture = await lifecycleFixture();
  const hostRoot = path.join(fixture.base, "status-host");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  await lifecycle.activate({
    name: "rare-skill",
    target: { host: "claude-code", scope: "custom", root: hostRoot },
  });
  const status = await lifecycle.status({ name: "rare-skill" });
  assert.equal(status.status, "ok");
  assert.equal(status.skills[0]?.store.state, "stored");
  assert.equal(status.skills[0]?.store.integrity, "verified");
  assert.equal(status.skills[0]?.deployments[0]?.state, "deployed");
  assert.equal(status.skills[0]?.deployments[0]?.integrity, "verified");
  assert.equal(
    status.skills[0]?.deployments[0]?.hostObservation.override,
    "unknown",
  );
  assert.equal(
    status.skills[0]?.deployments[0]?.skillId,
    status.skills[0]?.skillId,
  );
});

test("lifecycle rejects Antigravity CLI flat-file scopes", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  for (const scope of ["user", "workspace"] as const) {
    await assert.rejects(
      lifecycle.activate({
        name: "rare-skill",
        target: { host: "antigravity-cli", scope },
      }),
      (error: unknown) =>
        error instanceof StashError && error.code === "unsupported-host-layout",
    );
  }
});

test("archive requires an exact child of the selected standalone host root", async () => {
  const fixture = await lifecycleFixture();
  const hostRoot = path.join(fixture.base, "selected-host");
  await mkdir(hostRoot, { recursive: true });
  const elsewhere = await createStandaloneSkill(
    path.join(fixture.base, "elsewhere"),
    "outside-skill",
  );
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  await assert.rejects(
    lifecycle.archive({
      source: elsewhere,
      target: { host: "codex", scope: "custom", root: hostRoot },
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "unsafe-archive-source",
  );
  await access(path.join(elsewhere, "SKILL.md"));
});

test("managed projection folds a preserved catalog source without hiding scoped reads", async () => {
  const fixture = await lifecycleFixture();
  const catalogRoot = path.dirname(fixture.sourceRoot);
  const lifecycle = await createStashLifecycle({
    catalogs: [
      {
        id: "active",
        root: catalogRoot,
        enabled: true,
        trust: "unreviewed",
        followSymlinks: false,
      },
    ],
    managedRoot: fixture.managedRoot,
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  const catalog = await createStashCatalog({
    catalogs: [
      {
        id: "active",
        root: catalogRoot,
        enabled: true,
        trust: "unreviewed",
        followSymlinks: false,
      },
    ],
    managedRoot: fixture.managedRoot,
    cacheDir: path.join(fixture.base, "projection-cache"),
  });
  const projected = await catalog.resolve({ kind: "exact", name: "rare-skill" });
  assert.equal(projected.status, "ok");
  assert.equal(projected.matches.length, 1);
  assert.equal(projected.matches[0]?.catalogId, "managed");
  assert.equal(projected.matches[0]?.relatedCopies?.[0]?.kind, "source");
  assert.equal(projected.matches[0]?.relatedCopies?.[0]?.catalogId, "active");

  const scoped = await catalog.resolve({
    kind: "exact",
    name: "rare-skill",
    catalogIds: ["active"],
  });
  assert.equal(scoped.status, "ok");
  assert.equal(scoped.matches[0]?.catalogId, "active");
  const read = await catalog.read({ ref: scoped.matches[0]?.ref ?? "" });
  assert.equal(read.status, "ok");

  await writeFile(
    path.join(fixture.sourceRoot, "references", "guide.md"),
    "source drift\n",
    "utf8",
  );
  const drifted = await catalog.resolve({ kind: "exact", name: "rare-skill" });
  assert.equal(drifted.status, "ambiguous-exact");
  assert.equal(drifted.matches.length, 2);
  assert.ok(
    drifted.diagnostics.warnings?.some(
      (warning) => warning.code === "managed-copy-drift",
    ),
  );
});

test("a configured host catalog supports archive to activate round trips", async () => {
  const fixture = await lifecycleFixture();
  const hostRoot = path.join(fixture.base, "configured-host");
  await createStandaloneSkill(hostRoot, "round-trip-skill");
  const registration = {
    id: "host",
    root: hostRoot,
    enabled: true,
    trust: "unreviewed" as const,
    followSymlinks: false,
  };
  const lifecycle = await createStashLifecycle({
    catalogs: [registration],
    managedRoot: fixture.managedRoot,
  });
  const target = {
    host: "codex" as const,
    scope: "custom" as const,
    root: hostRoot,
  };
  await lifecycle.archive({ source: "round-trip-skill", target });
  await lifecycle.activate({ name: "round-trip-skill", target });

  const catalog = await createStashCatalog({
    catalogs: [registration],
    managedRoot: fixture.managedRoot,
    cacheDir: path.join(fixture.base, "round-trip-cache"),
  });
  const projected = await catalog.resolve({
    kind: "exact",
    name: "round-trip-skill",
  });
  assert.equal(projected.status, "ok");
  assert.equal(projected.matches.length, 1);
  assert.equal(projected.matches[0]?.catalogId, "managed");
  assert.equal(projected.matches[0]?.relatedCopies?.[0]?.kind, "deployment");

  const scoped = await catalog.resolve({
    kind: "exact",
    name: "round-trip-skill",
    catalogIds: ["host"],
  });
  assert.equal(scoped.status, "ok");
  assert.equal(scoped.matches[0]?.catalogId, "host");
});

test("the next mutation deterministically restores an interrupted archive", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const tombstone = path.join(
    fixture.base,
    ".stash-archive-rare-skill-00000000-0000-4000-8000-000000000002",
  );
  await rename(fixture.sourceRoot, tombstone);
  const operationId = "00000000-0000-4000-8000-000000000001";
  const journalPath = path.join(
    fixture.managedRoot,
    ".stash",
    "journal",
    `${operationId}.json`,
  );
  await writeFile(
    journalPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        operationId,
        stage: "source-tombstoned",
        source: fixture.sourceRoot,
        tombstone,
        name: "rare-skill",
        treeHash: installed.treeHash,
        managedPath: installed.managedPath,
        managedExistedBefore: true,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const secondSource = await createStandaloneSkill(
    path.join(fixture.base, "second-source"),
    "second-skill",
  );
  await lifecycle.install({ source: secondSource });
  await access(path.join(fixture.sourceRoot, "SKILL.md"));
  await assert.rejects(access(tombstone));
  await assert.rejects(access(journalPath));
});

test("a dead-process lifecycle lock is recovered before the next mutation", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  const lockPath = path.join(
    fixture.managedRoot,
    ".stash",
    "lifecycle.lock",
  );
  await mkdir(lockPath, { recursive: false });
  await writeFile(
    path.join(lockPath, "owner.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      ownerToken: "00000000-0000-4000-8000-000000000003",
      pid: 2_147_483_647,
      createdAt: new Date(0).toISOString(),
    })}\n`,
    "utf8",
  );
  const repeated = await lifecycle.install({ source: fixture.sourceRoot });
  assert.equal(repeated.status, "already-stored");
  await assert.rejects(access(lockPath));
});

test("malformed or live lifecycle ownership fails closed", async () => {
  for (const owner of [
    "not-json",
    JSON.stringify({
      schemaVersion: 1,
      ownerToken: "00000000-0000-4000-8000-000000000004",
      pid: process.pid,
      createdAt: new Date(0).toISOString(),
    }),
  ]) {
    const fixture = await lifecycleFixture();
    const lifecycle = await createStashLifecycle({
      catalogs: [],
      managedRoot: fixture.managedRoot,
    });
    await lifecycle.install({ source: fixture.sourceRoot });
    const lockPath = path.join(
      fixture.managedRoot,
      ".stash",
      "lifecycle.lock",
    );
    await mkdir(lockPath, { recursive: false });
    await writeFile(path.join(lockPath, "owner.json"), `${owner}\n`, "utf8");
    await assert.rejects(
      lifecycle.install({ source: fixture.sourceRoot }),
      (error: unknown) =>
        error instanceof StashError &&
        (error.code === "lifecycle-lock-corrupt" ||
          error.code === "lifecycle-busy"),
    );
    await access(path.join(fixture.sourceRoot, "SKILL.md"));
  }
});
