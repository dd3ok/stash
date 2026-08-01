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
import {
  lifecycleRefreshObservation,
  lifecycleReloadRequired,
  resolveLifecycleTarget,
} from "../src/internal/lifecycle-host-policy.js";
import {
  createStashLifecycle as createStashLifecycleForCurrentHome,
} from "../src/stash-lifecycle.js";
import type { CreateStashLifecycleOptions } from "../src/types.js";
import { StashError } from "../src/types.js";

async function createStashLifecycle(
  options: CreateStashLifecycleOptions & { lifecycleHome: string },
) {
  const { lifecycleHome, ...publicOptions } = options;
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = lifecycleHome;
  process.env.USERPROFILE = lifecycleHome;
  try {
    return await createStashLifecycleForCurrentHome(publicOptions);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
}

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
  const sourceUrl = "https://github.com/example/rare-skills";
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({
    source: fixture.sourceRoot,
    sourceUrl,
    revision: "abc123",
  });
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
  const sourceScoped = await catalog.resolve({
    kind: "exact",
    name: "rare-skill",
    sources: [sourceUrl],
  });
  assert.equal(sourceScoped.status, "ok");
  assert.equal(sourceScoped.matches[0]?.source.url, sourceUrl);
  assert.equal(sourceScoped.matches[0]?.source.revision, "abc123");

  const repeated = await lifecycle.install({ source: fixture.sourceRoot });
  assert.equal(repeated.status, "already-stored");
});

test("host policy pins documented user roots and refresh behavior", () => {
  const home = path.resolve("fixture-home");
  assert.deepEqual(resolveLifecycleTarget({ host: "codex" }, home), {
    host: "codex",
    scope: "user",
    root: path.join(home, ".agents", "skills"),
  });
  assert.deepEqual(resolveLifecycleTarget({ host: "claude-code" }, home), {
    host: "claude-code",
    scope: "user",
    root: path.join(home, ".claude", "skills"),
  });
  assert.deepEqual(resolveLifecycleTarget({ host: "antigravity-ide" }, home), {
    host: "antigravity-ide",
    scope: "user",
    root: path.join(home, ".gemini", "config", "skills"),
  });
  assert.equal(lifecycleReloadRequired("codex"), true);
  assert.equal(lifecycleReloadRequired("claude-code"), false);
  assert.equal(lifecycleReloadRequired("antigravity-ide"), true);
  assert.equal(lifecycleRefreshObservation("codex"), "restart-required");
  assert.equal(lifecycleRefreshObservation("claude-code"), "live");
});

test("default managed storage cannot overlap explicit catalogs", async () => {
  const fixture = await lifecycleFixture();
  const catalogRoot = path.dirname(fixture.sourceRoot);
  const previousManagedHome = process.env.STASH_MANAGED_HOME;
  process.env.STASH_MANAGED_HOME = catalogRoot;
  try {
    await assert.rejects(
      createStashLifecycle({
        catalogs: [
          {
            id: "external",
            root: catalogRoot,
            enabled: true,
            trust: "unreviewed",
            followSymlinks: false,
          },
        ],
        lifecycleHome: path.join(fixture.base, "home"),
      }),
      (error: unknown) =>
        error instanceof StashError && error.code === "invalid-config",
    );
  } finally {
    if (previousManagedHome === undefined) {
      delete process.env.STASH_MANAGED_HOME;
    } else {
      process.env.STASH_MANAGED_HOME = previousManagedHome;
    }
  }
});

test("activate and deactivate only mutate a tracked verified deployment", async () => {
  const fixture = await lifecycleFixture();
  const hostRoot = path.join(fixture.base, "home", ".agents", "skills");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  const target = {
    host: "codex" as const,
    scope: "user" as const,
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
  const hostRoot = path.join(fixture.base, "home", ".agents", "skills");
  const active = await createStandaloneSkill(hostRoot, "archive-me");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const archived = await lifecycle.archive({
    source: "archive-me",
    target: { host: "codex", scope: "user" },
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
  const hostRoot = path.join(fixture.base, "home", ".agents", "skills");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  await createStandaloneSkill(hostRoot, "rare-skill");
  await assert.rejects(
    lifecycle.deactivate({
      name: "rare-skill",
      target: { host: "codex", scope: "user" },
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
    lifecycleHome: path.join(fixture.base, "home"),
  });
  await assert.rejects(
    lifecycle.install({ source: fixture.sourceRoot }),
    (error: unknown) =>
      error instanceof StashError && error.code === "unsafe-skill-tree",
  );
});

test("status reports stored and deployed state without claiming host activation", async () => {
  const fixture = await lifecycleFixture();
  const hostRoot = path.join(fixture.base, "home", ".claude", "skills");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  await lifecycle.activate({
    name: "rare-skill",
    target: { host: "claude-code", scope: "user" },
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
    lifecycleHome: path.join(fixture.base, "home"),
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
  const hostRoot = path.join(fixture.base, "home", ".agents", "skills");
  await mkdir(hostRoot, { recursive: true });
  const elsewhere = await createStandaloneSkill(
    path.join(fixture.base, "elsewhere"),
    "outside-skill",
  );
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  await assert.rejects(
    lifecycle.archive({
      source: elsewhere,
      target: { host: "codex", scope: "user" },
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
    lifecycleHome: path.join(fixture.base, "home"),
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
  const hostRoot = path.join(fixture.base, "home", ".agents", "skills");
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
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const target = {
    host: "codex" as const,
    scope: "user" as const,
  };
  await lifecycle.archive({ source: "round-trip-skill", target });
  await lifecycle.activate({ name: "round-trip-skill", target });
  const trackedArchive = await lifecycle.archive({
    source: "round-trip-skill",
    target,
  });
  assert.equal(trackedArchive.status, "deactivated");
  await assert.rejects(access(path.join(hostRoot, "round-trip-skill")));
  const inactive = await lifecycle.status({ name: "round-trip-skill" });
  assert.equal(inactive.skills[0]?.deployments.length, 0);
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

test("managed projection rejects a malformed record before folding any copy", async () => {
  const fixture = await lifecycleFixture();
  const catalogRoot = path.dirname(fixture.sourceRoot);
  const registration = {
    id: "external",
    root: catalogRoot,
    enabled: true,
    trust: "unreviewed" as const,
    followSymlinks: false,
  };
  const lifecycle = await createStashLifecycle({
    catalogs: [registration],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  const recordPath = path.join(
    fixture.managedRoot,
    ".stash",
    "records",
    "rare-skill.json",
  );
  const record = JSON.parse(await readFile(recordPath, "utf8")) as Record<
    string,
    unknown
  >;
  record.deployments = [null];
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  const catalog = await createStashCatalog({
    catalogs: [registration],
    managedRoot: fixture.managedRoot,
    cacheDir: path.join(fixture.base, "malformed-projection-cache"),
  });
  const result = await catalog.resolve({ kind: "exact", name: "rare-skill" });
  assert.equal(result.status, "ambiguous-exact");
  assert.equal(result.matches.length, 2);
  assert.ok(
    result.diagnostics.warnings?.some(
      (warning) => warning.code === "invalid-lifecycle-record",
    ),
  );
});

test("the next mutation deterministically restores an interrupted archive", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
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
    lifecycleHome: path.join(fixture.base, "home"),
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
      lifecycleHome: path.join(fixture.base, "home"),
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

test("unknown PID probe errors fail closed without reclaiming ownership", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  await lifecycle.install({ source: fixture.sourceRoot });
  const lockPath = path.join(fixture.managedRoot, ".stash", "lifecycle.lock");
  await mkdir(lockPath, { recursive: false });
  await writeFile(
    path.join(lockPath, "owner.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      ownerToken: "00000000-0000-4000-8000-000000000005",
      pid: 2_147_483_646,
      createdAt: new Date(0).toISOString(),
    })}\n`,
    "utf8",
  );
  const originalKill = process.kill;
  Object.defineProperty(process, "kill", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: (() => {
      throw Object.assign(new Error("probe denied"), { code: "EPERM" });
    }) as typeof process.kill,
  });
  try {
    await assert.rejects(
      lifecycle.install({ source: fixture.sourceRoot }),
      (error: unknown) =>
        error instanceof StashError && error.code === "lifecycle-busy",
    );
    await access(path.join(lockPath, "owner.json"));
  } finally {
    Object.defineProperty(process, "kill", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: originalKill,
    });
  }
});

test("managed storage rejects equality, nesting, and canonical catalog aliases", async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), "stash-overlap-test-"));
  const catalogRoot = path.join(base, "catalog");
  await mkdir(catalogRoot, { recursive: true });
  const registration = {
    id: "external",
    root: catalogRoot,
    enabled: true,
    trust: "unreviewed" as const,
    followSymlinks: false,
  };
  for (const managedRoot of [
    catalogRoot,
    path.join(catalogRoot, "managed"),
  ]) {
    await assert.rejects(
      createStashCatalog({ catalogs: [registration], managedRoot }),
      (error: unknown) =>
        error instanceof StashError && error.code === "invalid-config",
    );
  }

  const managedParent = path.join(base, "managed-parent");
  const nestedCatalog = path.join(managedParent, "external");
  await mkdir(nestedCatalog, { recursive: true });
  await assert.rejects(
    createStashCatalog({
      catalogs: [{ ...registration, root: nestedCatalog }],
      managedRoot: managedParent,
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-config",
  );

  const alias = path.join(base, "catalog-alias");
  try {
    await symlink(
      catalogRoot,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    t.diagnostic(`Canonical alias check skipped: ${String(error)}`);
    return;
  }
  await assert.rejects(
    createStashCatalog({ catalogs: [registration], managedRoot: alias }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-config",
  );
});

test("install rejects filenames that are invalid on supported hosts", async (t) => {
  if (process.platform === "win32") {
    t.skip("Windows refuses to create the non-portable fixture name.");
    return;
  }
  const fixture = await lifecycleFixture();
  await writeFile(path.join(fixture.sourceRoot, "bad:name.txt"), "bad\n", "utf8");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  await assert.rejects(
    lifecycle.install({ source: fixture.sourceRoot }),
    (error: unknown) =>
      error instanceof StashError && error.code === "unsafe-skill-tree",
  );
});
