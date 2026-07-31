import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanBranding } from "../scripts/lib/branding.mjs";

const brandParts = ["agent", "skills", "stash"] as const;

async function withTemporaryRoot(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "stash-branding-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("branding scan detects forbidden content and descendant paths", async () => {
  await withTemporaryRoot(async (root) => {
    const contentVariants = [
      brandParts.join(" "),
      brandParts.join("\t"),
      brandParts.join("\n"),
      brandParts.join("-"),
      brandParts.join("_"),
    ];
    for (const [index, content] of contentVariants.entries()) {
      await writeFile(path.join(root, `content-${index}.txt`), content);
    }

    const forbiddenFile = `${brandParts.join("_")}.txt`;
    await writeFile(path.join(root, forbiddenFile), "safe");
    const nestedDirectory = path.join(root, ...brandParts);
    await mkdir(nestedDirectory, { recursive: true });
    await writeFile(path.join(nestedDirectory, "safe.txt"), "safe");
    const forbiddenBackslashFile =
      process.platform === "win32" ? undefined : brandParts.join("\\");
    if (forbiddenBackslashFile) {
      await writeFile(path.join(root, forbiddenBackslashFile), "safe");
    }

    const result = await scanBranding(root);

    for (const index of contentVariants.keys()) {
      assert.ok(result.violations.includes(`content-${index}.txt`));
    }
    assert.ok(result.violations.includes(`${forbiddenFile} (path)`));
    assert.ok(
      result.violations.includes(`${brandParts.join("/")} (path)`),
    );
    if (forbiddenBackslashFile) {
      assert.ok(
        result.violations.includes(`${forbiddenBackslashFile} (path)`),
      );
    }
  });
});

test("branding scan honors ignored, archive, binary, git, and root boundaries", async () => {
  await withTemporaryRoot(async (parent) => {
    const forbidden = brandParts.join("-");
    const root = path.join(parent, forbidden);
    await mkdir(root);
    await writeFile(path.join(root, "safe.txt"), "safe");

    for (const ignored of [
      "coverage",
      "dist",
      "node_modules",
      ".stash-cache-test",
    ]) {
      const ignoredRoot = path.join(root, ignored);
      await mkdir(ignoredRoot);
      await writeFile(path.join(ignoredRoot, "ignored.txt"), forbidden);
    }

    await writeFile(path.join(root, `${forbidden}.tgz`), forbidden);
    await writeFile(
      path.join(root, "binary.bin"),
      Buffer.concat([Buffer.from([0]), Buffer.from(forbidden)]),
    );

    const gitDirectory = path.join(root, ".git");
    await mkdir(gitDirectory);
    await writeFile(path.join(gitDirectory, "config"), forbidden);

    const gitfileRoot = path.join(root, "worktree");
    await mkdir(gitfileRoot);
    await writeFile(
      path.join(gitfileRoot, ".git"),
      `gitdir: C:/work/${forbidden}/.git/worktrees/example`,
    );

    assert.deepEqual(await scanBranding(root), { violations: [] });
  });
});

test("branding scan checks symlink paths without following targets", async (t) => {
  await withTemporaryRoot(async (root) => {
    const forbidden = brandParts.join("-");
    const target = path.join(path.dirname(root), `${path.basename(root)}-target`);
    await mkdir(target);
    await writeFile(path.join(target, "outside.txt"), forbidden);
    try {
      try {
        const linkType = process.platform === "win32" ? "junction" : "dir";
        await symlink(target, path.join(root, "safe-link"), linkType);
        await symlink(target, path.join(root, forbidden), linkType);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM") {
          t.skip("symlinks are unavailable in this environment");
          return;
        }
        throw error;
      }

      assert.deepEqual(await scanBranding(root), {
        violations: [`${forbidden} (path)`],
      });
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});
