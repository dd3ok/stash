import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import {
  access,
  cp,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
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
import { sha256 } from "../src/internal/util.js";
import type {
  CreateStashLifecycleOptions,
  ManagedSkillRecord,
} from "../src/types.js";
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
    revision: "a".repeat(40),
    repositoryPath: "skills/rare-skill",
    trackingRef: "refs/heads/main",
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
  assert.equal(sourceScoped.matches[0]?.source.revision, "a".repeat(40));
  const installedStatus = await lifecycle.status({ name: "rare-skill" });
  assert.equal(
    installedStatus.skills[0]?.source.repositoryPath,
    "skills/rare-skill",
  );
  assert.equal(installedStatus.skills[0]?.source.trackingRef, "refs/heads/main");

  const repeated = await lifecycle.install({ source: fixture.sourceRoot });
  assert.equal(repeated.status, "already-stored");
});

test("uninstall removes only a verified inactive managed copy", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });

  const uninstalled = await lifecycle.uninstall({ name: "rare-skill" });

  assert.equal(uninstalled.status, "uninstalled");
  assert.equal(uninstalled.skillId, installed.skillId);
  assert.equal(uninstalled.treeHash, installed.treeHash);
  await assert.rejects(access(installed.managedPath));
  await assert.rejects(
    access(
      path.join(
        fixture.managedRoot,
        ".stash",
        "records",
        "rare-skill.json",
      ),
    ),
  );
  await access(path.join(fixture.sourceRoot, "SKILL.md"));
  assert.equal(
    (await lifecycle.status({ name: "rare-skill" })).status,
    "not-found",
  );
});

test("uninstall refuses tracked deployments and managed drift without mutation", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const target = { host: "codex" as const, scope: "user" as const };
  await lifecycle.activate({ name: "rare-skill", target });

  await assert.rejects(
    lifecycle.uninstall({ name: "rare-skill" }),
    (error: unknown) =>
      error instanceof StashError && error.code === "active-deployments",
  );
  await access(installed.managedPath);

  await lifecycle.deactivate({ name: "rare-skill", target });
  await writeFile(
    path.join(installed.managedPath, "references", "guide.md"),
    "user changed managed content\n",
    "utf8",
  );
  await assert.rejects(
    lifecycle.uninstall({ name: "rare-skill" }),
    (error: unknown) =>
      error instanceof StashError && error.code === "managed-drift",
  );
  await access(installed.managedPath);
  await access(
    path.join(
      fixture.managedRoot,
      ".stash",
      "records",
      "rare-skill.json",
    ),
  );
});

test("uninstall removes stale metadata when the managed copy is already missing", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const recordPath = path.join(
    fixture.managedRoot,
    ".stash",
    "records",
    "rare-skill.json",
  );
  await rm(installed.managedPath, { recursive: true, force: false });

  const uninstalled = await lifecycle.uninstall({ name: "rare-skill" });

  assert.equal(uninstalled.status, "uninstalled");
  assert.match(uninstalled.warning ?? "", /already missing/u);
  await assert.rejects(access(recordPath));
  await access(path.join(fixture.sourceRoot, "SKILL.md"));
});

test("uninstall preserves linked and non-directory managed paths", async () => {
  for (const replacement of ["file", "link"] as const) {
    const fixture = await lifecycleFixture();
    const lifecycle = await createStashLifecycle({
      catalogs: [],
      managedRoot: fixture.managedRoot,
      lifecycleHome: path.join(fixture.base, "home"),
    });
    const installed = await lifecycle.install({ source: fixture.sourceRoot });
    const preserved = path.join(fixture.base, `preserved-${replacement}`);
    await rename(installed.managedPath, preserved);
    if (replacement === "file") {
      await writeFile(installed.managedPath, "do not delete\n", "utf8");
    } else {
      await symlink(
        preserved,
        installed.managedPath,
        process.platform === "win32" ? "junction" : "dir",
      );
    }

    await assert.rejects(
      lifecycle.uninstall({ name: "rare-skill" }),
      (error: unknown) =>
        error instanceof StashError && error.code === "managed-drift",
    );
    await access(installed.managedPath);
    await access(
      path.join(
        fixture.managedRoot,
        ".stash",
        "records",
        "rare-skill.json",
      ),
    );
  }
});

test("uninstall recovery restores before commit and finishes after commit", async () => {
  for (const stage of ["record-tombstoned", "cleanup-authorized"] as const) {
    const fixture = await lifecycleFixture();
    const lifecycle = await createStashLifecycle({
      catalogs: [],
      managedRoot: fixture.managedRoot,
      lifecycleHome: path.join(fixture.base, "home"),
    });
    const installed = await lifecycle.install({ source: fixture.sourceRoot });
    const operationId =
      stage === "cleanup-authorized"
        ? "22222222-2222-4222-8222-222222222222"
        : "11111111-1111-4111-8111-111111111111";
    const stagingRoot = path.join(fixture.managedRoot, ".stash", "staging");
    const journalPath = path.join(
      fixture.managedRoot,
      ".stash",
      "journal",
      `${operationId}.json`,
    );
    const recordPath = path.join(
      fixture.managedRoot,
      ".stash",
      "records",
      "rare-skill.json",
    );
    const treeTombstone = path.join(
      stagingRoot,
      `uninstall-${operationId}-tree`,
    );
    const recordTombstone = path.join(
      stagingRoot,
      `uninstall-${operationId}-record.json`,
    );
    const recordSource = await readFile(recordPath, "utf8");
    await rename(installed.managedPath, treeTombstone);
    await rename(recordPath, recordTombstone);
    if (stage === "cleanup-authorized") {
      await rm(path.join(treeTombstone, "references", "guide.md"), {
        force: false,
      });
    }
    await writeFile(
      journalPath,
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "managed-uninstall",
        operationId,
        stage,
        name: "rare-skill",
        skillId: installed.skillId,
        treeHash: installed.treeHash,
        recordHash: sha256(recordSource),
        managedExisted: true,
        managedPath: installed.managedPath,
        recordPath,
        treeTombstone,
        recordTombstone,
        createdAt: "2026-08-28T00:00:00.000Z",
      })}\n`,
      "utf8",
    );
    const otherSource = await createStandaloneSkill(
      path.join(fixture.base, "other-source"),
      "other-skill",
    );

    await lifecycle.install({ source: otherSource });

    await assert.rejects(access(journalPath));
    await assert.rejects(access(treeTombstone));
    await assert.rejects(access(recordTombstone));
    if (stage === "cleanup-authorized") {
      await assert.rejects(access(installed.managedPath));
      await assert.rejects(access(recordPath));
    } else {
      await access(installed.managedPath);
      await access(recordPath);
    }
  }
});

test("uninstall recovery preserves a tombstone when the record disappears before commit", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const operationId = "33333333-3333-4333-8333-333333333333";
  const recordPath = path.join(
    fixture.managedRoot,
    ".stash",
    "records",
    "rare-skill.json",
  );
  const journalPath = path.join(
    fixture.managedRoot,
    ".stash",
    "journal",
    `${operationId}.json`,
  );
  const treeTombstone = path.join(
    fixture.managedRoot,
    ".stash",
    "staging",
    `uninstall-${operationId}-tree`,
  );
  const recordTombstone = path.join(
    fixture.managedRoot,
    ".stash",
    "staging",
    `uninstall-${operationId}-record.json`,
  );
  const recordSource = await readFile(recordPath, "utf8");
  await rename(installed.managedPath, treeTombstone);
  await unlink(recordPath);
  await writeFile(
    journalPath,
    `${JSON.stringify({
      schemaVersion: 1,
      kind: "managed-uninstall",
      operationId,
      stage: "tree-tombstoned",
      name: "rare-skill",
      skillId: installed.skillId,
      treeHash: installed.treeHash,
      recordHash: sha256(recordSource),
      managedExisted: true,
      managedPath: installed.managedPath,
      recordPath,
      treeTombstone,
      recordTombstone,
      createdAt: "2026-08-28T00:00:00.000Z",
    })}\n`,
    "utf8",
  );
  const otherSource = await createStandaloneSkill(
    path.join(fixture.base, "other-source"),
    "other-skill",
  );

  await assert.rejects(
    lifecycle.install({ source: otherSource }),
    (error: unknown) =>
      error instanceof StashError &&
      error.code === "lifecycle-recovery-conflict",
  );
  await access(journalPath);
  await access(treeTombstone);
  await assert.rejects(access(installed.managedPath));
});

test("uninstall recovery fails closed for mismatched, occupied, and malformed state", async () => {
  for (const [scenario, operationId] of [
    ["mismatched", "44444444-4444-4444-8444-444444444444"],
    ["occupied", "55555555-5555-4555-8555-555555555555"],
    ["malformed", "66666666-6666-4666-8666-666666666666"],
  ] as const) {
    const fixture = await lifecycleFixture();
    const lifecycle = await createStashLifecycle({
      catalogs: [],
      managedRoot: fixture.managedRoot,
      lifecycleHome: path.join(fixture.base, "home"),
    });
    const installed = await lifecycle.install({ source: fixture.sourceRoot });
    const recordPath = path.join(
      fixture.managedRoot,
      ".stash",
      "records",
      "rare-skill.json",
    );
    const journalPath = path.join(
      fixture.managedRoot,
      ".stash",
      "journal",
      `${operationId}.json`,
    );
    const expectedTreeTombstone = path.join(
      fixture.managedRoot,
      ".stash",
      "staging",
      `uninstall-${operationId}-tree`,
    );
    const recordTombstone = path.join(
      fixture.managedRoot,
      ".stash",
      "staging",
      `uninstall-${operationId}-record.json`,
    );
    const recordSource = await readFile(recordPath, "utf8");
    if (scenario === "mismatched") {
      await rename(installed.managedPath, expectedTreeTombstone);
      await writeFile(
        path.join(expectedTreeTombstone, "references", "guide.md"),
        "changed after tombstoning\n",
        "utf8",
      );
    } else if (scenario === "occupied") {
      await cp(installed.managedPath, expectedTreeTombstone, {
        recursive: true,
      });
    }
    const treeTombstone =
      scenario === "malformed"
        ? path.join(fixture.base, "not-operation-owned")
        : expectedTreeTombstone;
    await writeFile(
      journalPath,
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "managed-uninstall",
        operationId,
        stage: "tree-tombstoned",
        name: "rare-skill",
        skillId: installed.skillId,
        treeHash: installed.treeHash,
        recordHash: sha256(recordSource),
        managedExisted: true,
        managedPath: installed.managedPath,
        recordPath,
        treeTombstone,
        recordTombstone,
        createdAt: "2026-08-28T00:00:00.000Z",
      })}\n`,
      "utf8",
    );
    const otherSource = await createStandaloneSkill(
      path.join(fixture.base, "other-source"),
      "other-skill",
    );
    const expectedCode =
      scenario === "malformed"
        ? "invalid-lifecycle-journal"
        : "lifecycle-recovery-conflict";

    await assert.rejects(
      lifecycle.install({ source: otherSource }),
      (error: unknown) =>
        error instanceof StashError && error.code === expectedCode,
    );
    await access(journalPath);
    await access(recordPath);
    if (scenario !== "malformed") {
      await access(expectedTreeTombstone);
    }
    if (scenario !== "mismatched") {
      await access(installed.managedPath);
    }
  }
});

test("update transactionally replaces a managed tree while preserving its identity", async () => {
  const fixture = await lifecycleFixture();
  const sourceUrl = "https://github.com/example/rare-skills";
  const oldRevision = "a".repeat(40);
  const newRevision = "b".repeat(40);
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({
    source: fixture.sourceRoot,
    sourceUrl,
    revision: oldRevision,
    repositoryPath: "skills/rare-skill",
    trackingRef: "refs/heads/main",
  });
  const before = await lifecycle.status({ name: "rare-skill" });
  const replacement = await createStandaloneSkill(
    path.join(fixture.base, "replacement"),
    "rare-skill",
  );
  await writeFile(
    path.join(replacement, "references", "guide.md"),
    "updated guide\n",
    "utf8",
  );

  const updated = await lifecycle.update({
    source: replacement,
    expectedTreeHash: installed.treeHash,
    expectedRevision: oldRevision,
    sourceUrl,
    revision: newRevision,
  });

  assert.equal(updated.status, "updated");
  assert.equal(updated.skillId, installed.skillId);
  assert.equal(updated.previousTreeHash, installed.treeHash);
  assert.notEqual(updated.treeHash, installed.treeHash);
  assert.equal(updated.previousRevision, oldRevision);
  assert.equal(updated.revision, newRevision);
  assert.equal(updated.outdatedDeployments, 0);
  assert.equal(
    await readFile(
      path.join(updated.managedPath, "references", "guide.md"),
      "utf8",
    ),
    "updated guide\n",
  );
  const after = await lifecycle.status({ name: "rare-skill" });
  assert.equal(after.skills[0]?.store.integrity, "verified");
  assert.equal(after.skills[0]?.source.revision, newRevision);
  assert.equal(
    after.skills[0]?.source.importedAt,
    before.skills[0]?.source.importedAt,
  );
  assert.ok(after.skills[0]?.source.updatedAt);
  assert.deepEqual(
    await readdir(path.join(fixture.managedRoot, ".stash", "journal")),
    [],
  );
});

test("update enforces provenance CAS and avoids copying an unchanged tree", async () => {
  const fixture = await lifecycleFixture();
  const sourceUrl = "https://github.com/example/rare-skills";
  const oldRevision = "a".repeat(40);
  const newRevision = "b".repeat(40);
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({
    source: fixture.sourceRoot,
    sourceUrl,
    revision: oldRevision,
    repositoryPath: "skills/rare-skill",
    trackingRef: "refs/heads/main",
  });
  await assert.rejects(
    lifecycle.update({
      source: fixture.sourceRoot,
      expectedTreeHash: `sha256:${"0".repeat(64)}`,
      expectedRevision: oldRevision,
      revision: newRevision,
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "managed-version-conflict",
  );
  await assert.rejects(
    lifecycle.update({
      source: fixture.sourceRoot,
      expectedTreeHash: installed.treeHash,
      expectedRevision: oldRevision,
      sourceUrl: "https://github.com/example/different-skills",
      revision: newRevision,
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "source-mismatch",
  );
  const replacement = await createStandaloneSkill(
    path.join(fixture.base, "replacement"),
    "rare-skill",
  );
  await writeFile(
    path.join(replacement, "references", "guide.md"),
    "updated guide\n",
    "utf8",
  );
  await assert.rejects(
    lifecycle.update({
      source: replacement,
      expectedTreeHash: installed.treeHash,
      expectedRevision: oldRevision,
      revision: newRevision,
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );
  await assert.rejects(
    lifecycle.update({
      source: replacement,
      expectedTreeHash: installed.treeHash,
      expectedRevision: oldRevision,
      sourceUrl,
      revision: oldRevision,
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );

  const metadataUpdated = await lifecycle.update({
    source: fixture.sourceRoot,
    expectedTreeHash: installed.treeHash,
    expectedRevision: oldRevision,
    sourceUrl,
    revision: newRevision,
  });
  assert.equal(metadataUpdated.status, "metadata-updated");
  assert.equal(metadataUpdated.treeHash, installed.treeHash);
  const alreadyCurrent = await lifecycle.update({
    source: fixture.sourceRoot,
    expectedTreeHash: installed.treeHash,
    expectedRevision: newRevision,
    revision: newRevision,
  });
  assert.equal(alreadyCurrent.status, "already-current");
});

test("repository provenance is canonical, immutable, and path-exact", async () => {
  const fixture = await lifecycleFixture();
  const sourceUrl = "https://github.com/Example/rare-skills/";
  const previousRevision = "a".repeat(40);
  const immutableRevision = "b".repeat(40);
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({
    source: fixture.sourceRoot,
    sourceUrl,
    revision: previousRevision,
    repositoryPath: "skills/rare-skill",
    trackingRef: "refs/tags/v1.0.0",
  });
  const updated = await lifecycle.update({
    source: fixture.sourceRoot,
    expectedTreeHash: installed.treeHash,
    expectedRevision: previousRevision,
    sourceUrl: "https://github.com/Example/rare-skills",
    revision: immutableRevision,
  });
  assert.equal(updated.status, "metadata-updated");
  const status = await lifecycle.status({ name: "rare-skill" });
  assert.equal(
    status.skills[0]?.source.url,
    "https://github.com/Example/rare-skills",
  );
  assert.equal(
    status.skills[0]?.source.repositoryPath,
    "skills/rare-skill",
  );
  assert.equal(status.skills[0]?.source.trackingRef, "refs/tags/v1.0.0");

  await assert.rejects(
    lifecycle.update({
      source: fixture.sourceRoot,
      expectedTreeHash: installed.treeHash,
      expectedRevision: immutableRevision,
      sourceUrl: "https://github.com/Example/rare-skills",
      revision: "main",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );

  await assert.rejects(
    lifecycle.update({
      source: fixture.sourceRoot,
      expectedTreeHash: installed.treeHash,
      expectedRevision: immutableRevision,
      sourceUrl: "https://github.com/Example/rare-skills",
      revision: immutableRevision,
      repositoryPath: "Skills/rare-skill",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "source-mismatch",
  );
  await assert.rejects(
    lifecycle.update({
      source: fixture.sourceRoot,
      expectedTreeHash: installed.treeHash,
      expectedRevision: immutableRevision,
      sourceUrl: "https://github.com/Example/rare-skills",
      revision: immutableRevision,
      repositoryPath: "skills/rare-skill",
      trackingRef: "refs/heads/main",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "source-mismatch",
  );
  await assert.rejects(
    lifecycle.install({
      source: fixture.sourceRoot,
      sourceUrl: "https://example.com/repository",
      revision: "main",
      repositoryPath: ".",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );
  await assert.rejects(
    lifecycle.install({
      source: fixture.sourceRoot,
      sourceUrl: "https://user:secret@example.com/repository",
      revision: "commit-1",
      repositoryPath: ".",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );
  await assert.rejects(
    lifecycle.install({
      source: fixture.sourceRoot,
      sourceUrl: "https://ghp_token@example.com/repository",
      revision: immutableRevision,
      repositoryPath: ".",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );
  await assert.rejects(
    lifecycle.install({
      source: fixture.sourceRoot,
      sourceUrl: "git:repository",
      revision: "commit-1",
      repositoryPath: ".",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );
  await assert.rejects(
    lifecycle.install({
      source: fixture.sourceRoot,
      sourceUrl: "https://example.com//",
      revision: immutableRevision,
      repositoryPath: ".",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );
  await assert.rejects(
    lifecycle.install({
      source: fixture.sourceRoot,
      sourceUrl: "https://example.com/repository",
      revision: "commit-1",
      repositoryPath: "skills/con",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );
  await assert.rejects(
    lifecycle.install({
      source: fixture.sourceRoot,
      sourceUrl: "https://example.com/repository",
      revision: immutableRevision,
      repositoryPath: "skills\\rare-skill",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );
  for (const partial of [
    { sourceUrl: "https://example.com/repository" },
    {
      sourceUrl: "https://example.com/repository",
      revision: immutableRevision,
    },
    {
      sourceUrl: "https://example.com/repository",
      revision: immutableRevision,
      repositoryPath: ".",
    },
    { revision: immutableRevision },
  ]) {
    await assert.rejects(
      lifecycle.install({ source: fixture.sourceRoot, ...partial }),
      (error: unknown) =>
        error instanceof StashError && error.code === "invalid-argument",
    );
  }
  for (const trackingRef of [
    "main",
    "refs/remotes/origin/main",
    "refs/heads/../main",
    "refs/heads/feature lock",
    "refs/heads/main ",
  ]) {
    await assert.rejects(
      lifecycle.install({
        source: fixture.sourceRoot,
        sourceUrl: "https://example.com/repository",
        revision: immutableRevision,
        repositoryPath: ".",
        trackingRef,
      }),
      (error: unknown) =>
        error instanceof StashError && error.code === "invalid-argument",
    );
  }

  const localSource = await createStandaloneSkill(
    path.join(fixture.base, "local-source"),
    "local-skill",
  );
  const localInstalled = await lifecycle.install({ source: localSource });
  for (const partial of [
    { sourceUrl: "https://example.com/repository" },
    {
      sourceUrl: "https://example.com/repository",
      revision: immutableRevision,
    },
    {
      sourceUrl: "https://example.com/repository",
      revision: immutableRevision,
      repositoryPath: "skills/local-skill",
    },
  ]) {
    await assert.rejects(
      lifecycle.update({
        source: localSource,
        expectedTreeHash: localInstalled.treeHash,
        ...partial,
      }),
      (error: unknown) =>
        error instanceof StashError && error.code === "invalid-argument",
    );
  }
  const introduced = await lifecycle.update({
    source: localSource,
    expectedTreeHash: localInstalled.treeHash,
    sourceUrl: "https://example.com/repository",
    revision: immutableRevision,
    repositoryPath: "skills/local-skill",
    trackingRef: "HEAD",
  });
  assert.equal(introduced.status, "metadata-updated");

  const unicodeSource = await createStandaloneSkill(
    path.join(fixture.base, "unicode-ref-source"),
    "unicode-ref-skill",
  );
  await lifecycle.install({
    source: unicodeSource,
    sourceUrl: "https://example.com/unicode-repository",
    revision: "c".repeat(40),
    repositoryPath: "skills/unicode-ref-skill",
    trackingRef: "refs/heads/K",
  });
  const unicodeStatus = await lifecycle.status({ name: "unicode-ref-skill" });
  assert.equal(unicodeStatus.skills[0]?.source.trackingRef, "refs/heads/K");
});

test("metadata-only updates recheck record and tree state at the commit boundary", async () => {
  for (const race of ["record", "tree"] as const) {
    const fixture = await lifecycleFixture();
    const sourceUrl = "https://example.com/repository";
    const previousRevision = "a".repeat(40);
    const requestedRevision = "b".repeat(40);
    const externalRevision = "c".repeat(40);
    let armed = false;
    let callsAfterArming = 0;
    let recordPath = "";
    let managedPath = "";
    const lifecycle = await createStashLifecycle({
      catalogs: [],
      managedRoot: fixture.managedRoot,
      lifecycleHome: path.join(fixture.base, "home"),
      now: () => {
        if (armed && ++callsAfterArming === 2) {
          if (race === "record") {
            const record = JSON.parse(readFileSync(recordPath, "utf8"));
            record.source.revision = externalRevision;
            writeFileSync(
              recordPath,
              `${JSON.stringify(record, null, 2)}\n`,
              "utf8",
            );
          } else {
            writeFileSync(
              path.join(managedPath, "references", "guide.md"),
              "external tree change\n",
              "utf8",
            );
          }
        }
        return Date.now();
      },
    });
    const installed = await lifecycle.install({
      source: fixture.sourceRoot,
      sourceUrl,
      revision: previousRevision,
      repositoryPath: "skills/rare-skill",
      trackingRef: "refs/heads/main",
    });
    recordPath = path.join(
      fixture.managedRoot,
      ".stash",
      "records",
      "rare-skill.json",
    );
    managedPath = installed.managedPath;
    armed = true;

    await assert.rejects(
      lifecycle.update({
        source: fixture.sourceRoot,
        expectedTreeHash: installed.treeHash,
        expectedRevision: previousRevision,
        sourceUrl,
        revision: requestedRevision,
      }),
      (error: unknown) =>
        error instanceof StashError &&
        error.code ===
          (race === "record" ? "managed-version-conflict" : "managed-drift"),
    );

    if (race === "record") {
      const persisted = JSON.parse(await readFile(recordPath, "utf8"));
      assert.equal(persisted.source.revision, externalRevision);
    }
  }
});

test("update preserves tracked deployments and reports them as outdated", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const target = { host: "codex" as const, scope: "user" as const };
  await lifecycle.activate({ name: "rare-skill", target });
  const replacement = await createStandaloneSkill(
    path.join(fixture.base, "replacement"),
    "rare-skill",
  );
  await writeFile(
    path.join(replacement, "references", "guide.md"),
    "updated guide\n",
    "utf8",
  );

  const updated = await lifecycle.update({
    source: replacement,
    expectedTreeHash: installed.treeHash,
  });
  assert.equal(updated.status, "updated");
  assert.equal(updated.deploymentsPreserved, 1);
  assert.equal(updated.outdatedDeployments, 1);
  assert.match(updated.warning ?? "", /tracked deployments remain unchanged/u);
  const stale = await lifecycle.status({ name: "rare-skill" });
  assert.equal(stale.skills[0]?.outdatedDeployments, 1);
  assert.equal(stale.skills[0]?.deployments[0]?.state, "deployed");
  assert.equal(stale.skills[0]?.deployments[0]?.integrity, "verified");
  assert.equal(stale.skills[0]?.deployments[0]?.current, false);

  const archived = await lifecycle.archive({ source: "rare-skill", target });
  assert.equal(archived.status, "deactivated");
  const deactivated = await lifecycle.status({ name: "rare-skill" });
  assert.equal(deactivated.skills[0]?.deployments.length, 0);
  await lifecycle.activate({ name: "rare-skill", target });
  const refreshed = await lifecycle.status({ name: "rare-skill" });
  assert.equal(refreshed.skills[0]?.deployments[0]?.current, true);
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

test("archive rejects partial remote provenance without removing the source", async () => {
  const fixture = await lifecycleFixture();
  const hostRoot = path.join(fixture.base, "home", ".agents", "skills");
  const active = await createStandaloneSkill(hostRoot, "archive-partial");
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });

  await assert.rejects(
    lifecycle.archive({
      source: "archive-partial",
      target: { host: "codex", scope: "user" },
      sourceUrl: "https://example.com/repository",
    }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-argument",
  );

  await access(path.join(active, "SKILL.md"));
  await assert.rejects(
    access(path.join(fixture.managedRoot, "archive-partial")),
  );
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

test("managed metadata links cannot redirect lifecycle reads or writes", async (t) => {
  for (const relativeTarget of [
    [".stash"],
    [".stash", "records"],
    [".stash", "staging"],
    [".stash", "journal"],
  ]) {
    const fixture = await lifecycleFixture();
    const lifecycle = await createStashLifecycle({
      catalogs: [],
      managedRoot: fixture.managedRoot,
      lifecycleHome: path.join(fixture.base, "home"),
    });
    await lifecycle.install({ source: fixture.sourceRoot });
    const target = path.join(fixture.managedRoot, ...relativeTarget);
    const preserved = `${target}-preserved`;
    const outside = path.join(
      fixture.base,
      `outside-${relativeTarget.join("-")}`,
    );
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, "sentinel.txt"), "unchanged", "utf8");
    await rename(target, preserved);
    try {
      await symlink(
        outside,
        target,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      t.diagnostic(`Managed metadata link check skipped: ${String(error)}`);
      return;
    }

    await assert.rejects(
      lifecycle.install({ source: fixture.sourceRoot }),
      (error: unknown) =>
        error instanceof StashError && error.code === "unsafe-managed-layout",
    );
    assert.deepEqual(await readdir(outside), ["sentinel.txt"]);
    assert.equal(
      await readFile(path.join(outside, "sentinel.txt"), "utf8"),
      "unchanged",
    );
    if (
      relativeTarget.join("/") === ".stash" ||
      relativeTarget.join("/") === ".stash/records"
    ) {
      const catalog = await createStashCatalog({
        catalogs: [],
        managedRoot: fixture.managedRoot,
        cacheDir: path.join(fixture.base, "unsafe-projection-cache"),
      });
      const result = await catalog.resolve({
        kind: "exact",
        name: "rare-skill",
      });
      assert.ok(
        result.diagnostics.warnings?.some(
          (warning) => warning.code === "invalid-managed-layout",
        ),
      );
    }
  }
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
  assert.equal(status.skills[0]?.deployments[0]?.current, true);
  assert.equal(status.skills[0]?.outdatedDeployments, 0);
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

test("incomplete remote provenance invalidates lifecycle and managed projection records", async () => {
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
  const record = JSON.parse(
    await readFile(recordPath, "utf8"),
  ) as ManagedSkillRecord;
  record.source.url = "https://example.com/repository";
  record.source.revision = "a".repeat(40);
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  await assert.rejects(
    lifecycle.status({ name: "rare-skill" }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-lifecycle-record",
  );

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

test("archive recovery rejects unsupported journal schemas", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const operationId = "00000000-0000-4000-8000-000000000018";
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
        stage: "started",
        source: fixture.sourceRoot,
        tombstone: path.join(
          fixture.base,
          `.stash-archive-rare-skill-${operationId}`,
        ),
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

  await assert.rejects(
    lifecycle.install({ source: fixture.sourceRoot }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-lifecycle-journal",
  );
  await access(journalPath);
  await access(path.join(fixture.sourceRoot, "SKILL.md"));
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
    ".stash-archive-rare-skill-00000000-0000-4000-8000-000000000001",
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
        schemaVersion: 2,
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

test("archive recovery preserves a tombstone not bound to its operation", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const operationId = "00000000-0000-4000-8000-000000000016";
  const unrelatedTombstone = path.join(
    fixture.base,
    ".stash-archive-rare-skill-00000000-0000-4000-8000-000000000017",
  );
  await mkdir(unrelatedTombstone, { recursive: false });
  await writeFile(
    path.join(unrelatedTombstone, "preserve.txt"),
    "unrelated",
    "utf8",
  );
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
        schemaVersion: 2,
        operationId,
        stage: "cleanup-authorized",
        source: fixture.sourceRoot,
        tombstone: unrelatedTombstone,
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

  await assert.rejects(
    lifecycle.install({ source: fixture.sourceRoot }),
    (error: unknown) =>
      error instanceof StashError && error.code === "invalid-lifecycle-journal",
  );
  assert.equal(
    await readFile(path.join(unrelatedTombstone, "preserve.txt"), "utf8"),
    "unrelated",
  );
  await access(journalPath);
});

test("the next mutation rolls back an update interrupted before record commit", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const replacement = await createStandaloneSkill(
    path.join(fixture.base, "replacement"),
    "rare-skill",
  );
  await writeFile(
    path.join(replacement, "references", "guide.md"),
    "updated guide\n",
    "utf8",
  );
  const alternateLifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: path.join(fixture.base, "alternate-managed"),
    lifecycleHome: path.join(fixture.base, "alternate-home"),
  });
  const alternate = await alternateLifecycle.install({ source: replacement });
  const operationId = "00000000-0000-4000-8000-000000000010";
  const stagingRoot = path.join(fixture.managedRoot, ".stash", "staging");
  const stagePath = path.join(stagingRoot, `update-${operationId}-next`);
  const backupPath = path.join(
    stagingRoot,
    `update-${operationId}-previous`,
  );
  await rename(installed.managedPath, backupPath);
  const interruptedManaged = await createStandaloneSkill(
    fixture.managedRoot,
    "rare-skill",
  );
  await writeFile(
    path.join(interruptedManaged, "references", "guide.md"),
    "updated guide\n",
    "utf8",
  );
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
        kind: "managed-update",
        operationId,
        stage: "new-committed",
        name: "rare-skill",
        skillId: installed.skillId,
        oldTreeHash: installed.treeHash,
        newTreeHash: alternate.treeHash,
        managedPath: installed.managedPath,
        stagePath,
        backupPath,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const recovered = await lifecycle.install({ source: fixture.sourceRoot });
  assert.equal(recovered.status, "already-stored");
  assert.equal(
    await readFile(
      path.join(installed.managedPath, "references", "guide.md"),
      "utf8",
    ),
    "fixture guide\n",
  );
  await assert.rejects(access(backupPath));
  await assert.rejects(access(journalPath));
});

test("the next mutation finalizes an update interrupted after record commit", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const replacement = await createStandaloneSkill(
    path.join(fixture.base, "replacement"),
    "rare-skill",
  );
  await writeFile(
    path.join(replacement, "references", "guide.md"),
    "updated guide\n",
    "utf8",
  );
  const alternateLifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: path.join(fixture.base, "alternate-managed"),
    lifecycleHome: path.join(fixture.base, "alternate-home"),
  });
  const alternate = await alternateLifecycle.install({ source: replacement });
  const operationId = "00000000-0000-4000-8000-000000000011";
  const stagingRoot = path.join(fixture.managedRoot, ".stash", "staging");
  const stagePath = path.join(stagingRoot, `update-${operationId}-next`);
  const backupPath = path.join(
    stagingRoot,
    `update-${operationId}-previous`,
  );
  await rename(installed.managedPath, backupPath);
  const committedManaged = await createStandaloneSkill(
    fixture.managedRoot,
    "rare-skill",
  );
  await writeFile(
    path.join(committedManaged, "references", "guide.md"),
    "updated guide\n",
    "utf8",
  );
  const recordPath = path.join(
    fixture.managedRoot,
    ".stash",
    "records",
    "rare-skill.json",
  );
  const record = JSON.parse(
    await readFile(recordPath, "utf8"),
  ) as ManagedSkillRecord;
  record.treeHash = alternate.treeHash;
  record.source.location = replacement;
  record.lastValidatedAt = new Date().toISOString();
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
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
        kind: "managed-update",
        operationId,
        stage: "record-committed",
        name: "rare-skill",
        skillId: installed.skillId,
        oldTreeHash: installed.treeHash,
        newTreeHash: alternate.treeHash,
        managedPath: installed.managedPath,
        stagePath,
        backupPath,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const recovered = await lifecycle.install({ source: replacement });
  assert.equal(recovered.status, "already-stored");
  assert.equal(recovered.treeHash, alternate.treeHash);
  assert.equal(
    await readFile(
      path.join(installed.managedPath, "references", "guide.md"),
      "utf8",
    ),
    "updated guide\n",
  );
  await assert.rejects(access(backupPath));
  await assert.rejects(access(journalPath));
});

test("recovery removes an operation-owned partial stage without inspecting it", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const operationId = "00000000-0000-4000-8000-000000000012";
  const stagingRoot = path.join(fixture.managedRoot, ".stash", "staging");
  const stagePath = path.join(stagingRoot, `update-${operationId}-next`);
  const backupPath = path.join(
    stagingRoot,
    `update-${operationId}-previous`,
  );
  await mkdir(stagePath, { recursive: false });
  await writeFile(path.join(stagePath, "partial.tmp"), "incomplete", "utf8");
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
        kind: "managed-update",
        operationId,
        stage: "staging",
        name: "rare-skill",
        skillId: installed.skillId,
        oldTreeHash: installed.treeHash,
        newTreeHash: `sha256:${"1".repeat(64)}`,
        managedPath: installed.managedPath,
        stagePath,
        backupPath,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const repeated = await lifecycle.install({ source: fixture.sourceRoot });
  assert.equal(repeated.status, "already-stored");
  await assert.rejects(access(stagePath));
  await assert.rejects(access(journalPath));
  assert.equal(
    await readFile(
      path.join(installed.managedPath, "references", "guide.md"),
      "utf8",
    ),
    "fixture guide\n",
  );
});

test("authorized update cleanup is idempotent after a partial recursive delete", async () => {
  for (const committed of [false, true]) {
    const fixture = await lifecycleFixture();
    const lifecycle = await createStashLifecycle({
      catalogs: [],
      managedRoot: fixture.managedRoot,
      lifecycleHome: path.join(fixture.base, "home"),
    });
    const installed = await lifecycle.install({ source: fixture.sourceRoot });
    const replacement = await createStandaloneSkill(
      path.join(fixture.base, "replacement"),
      "rare-skill",
    );
    await writeFile(
      path.join(replacement, "references", "guide.md"),
      "updated guide\n",
      "utf8",
    );
    const alternateLifecycle = await createStashLifecycle({
      catalogs: [],
      managedRoot: path.join(fixture.base, "alternate-managed"),
      lifecycleHome: path.join(fixture.base, "alternate-home"),
    });
    const alternate = await alternateLifecycle.install({ source: replacement });
    const operationId = committed
      ? "00000000-0000-4000-8000-000000000013"
      : "00000000-0000-4000-8000-000000000014";
    const stagingRoot = path.join(fixture.managedRoot, ".stash", "staging");
    const stagePath = path.join(stagingRoot, `update-${operationId}-next`);
    const backupPath = path.join(
      stagingRoot,
      `update-${operationId}-previous`,
    );
    const discardPath = path.join(
      stagingRoot,
      `update-${operationId}-discard`,
    );
    await mkdir(path.join(discardPath, "partially-removed"), {
      recursive: true,
    });
    await writeFile(
      path.join(discardPath, "partially-removed", "remainder.tmp"),
      "remainder",
      "utf8",
    );
    if (committed) {
      await rm(installed.managedPath, { recursive: true, force: false });
      await rename(alternate.managedPath, installed.managedPath);
      const recordPath = path.join(
        fixture.managedRoot,
        ".stash",
        "records",
        "rare-skill.json",
      );
      const record = JSON.parse(
        await readFile(recordPath, "utf8"),
      ) as ManagedSkillRecord;
      record.treeHash = alternate.treeHash;
      record.source.location = replacement;
      await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    }
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
          kind: "managed-update",
          operationId,
          stage: "cleanup-authorized",
          name: "rare-skill",
          skillId: installed.skillId,
          oldTreeHash: installed.treeHash,
          newTreeHash: alternate.treeHash,
          managedPath: installed.managedPath,
          stagePath,
          backupPath,
          discardPath,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const repeated = await lifecycle.install({
      source: committed ? replacement : fixture.sourceRoot,
    });
    assert.equal(repeated.status, "already-stored");
    assert.equal(
      repeated.treeHash,
      committed ? alternate.treeHash : installed.treeHash,
    );
    await assert.rejects(access(discardPath));
    await assert.rejects(access(journalPath));
  }
});

test("rollback restores a drifted backup and never deletes user changes", async () => {
  const fixture = await lifecycleFixture();
  const lifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: fixture.managedRoot,
    lifecycleHome: path.join(fixture.base, "home"),
  });
  const installed = await lifecycle.install({ source: fixture.sourceRoot });
  const replacement = await createStandaloneSkill(
    path.join(fixture.base, "replacement"),
    "rare-skill",
  );
  await writeFile(
    path.join(replacement, "references", "guide.md"),
    "updated guide\n",
    "utf8",
  );
  const alternateLifecycle = await createStashLifecycle({
    catalogs: [],
    managedRoot: path.join(fixture.base, "alternate-managed"),
    lifecycleHome: path.join(fixture.base, "alternate-home"),
  });
  const alternate = await alternateLifecycle.install({ source: replacement });
  const operationId = "00000000-0000-4000-8000-000000000015";
  const stagingRoot = path.join(fixture.managedRoot, ".stash", "staging");
  const stagePath = path.join(stagingRoot, `update-${operationId}-next`);
  const backupPath = path.join(
    stagingRoot,
    `update-${operationId}-previous`,
  );
  await rename(installed.managedPath, backupPath);
  await writeFile(
    path.join(backupPath, "references", "guide.md"),
    "user changed this during recovery\n",
    "utf8",
  );
  await rename(alternate.managedPath, stagePath);
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
        kind: "managed-update",
        operationId,
        stage: "old-tombstoned",
        name: "rare-skill",
        skillId: installed.skillId,
        oldTreeHash: installed.treeHash,
        newTreeHash: alternate.treeHash,
        managedPath: installed.managedPath,
        stagePath,
        backupPath,
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
  assert.equal(
    await readFile(
      path.join(installed.managedPath, "references", "guide.md"),
      "utf8",
    ),
    "user changed this during recovery\n",
  );
  const status = await lifecycle.status({ name: "rare-skill" });
  assert.equal(status.skills[0]?.store.integrity, "drifted");
  await assert.rejects(access(stagePath));
  await assert.rejects(access(backupPath));
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
