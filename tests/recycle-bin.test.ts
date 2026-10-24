import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { recyclePath } from "../src/internal/recycle-bin.js";

test("OS recycling handles literal names and is idempotent", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "stash-recycle-test-"));
  const target = path.join(base, "한글 ' $value [literal]");
  await mkdir(target);
  await writeFile(path.join(target, "preserved.txt"), "recycle fixture");
  await recyclePath(target);
  await assert.rejects(access(target), { code: "ENOENT" });
  await recyclePath(target);
});

test("a trash provider failure preserves the path without a delete fallback", async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), "stash-recycle-failure-"));
  const target = path.join(base, "preserved.txt");
  await writeFile(target, "keep this");
  const command = t.mock.method(childProcess, "execFile", (...args: unknown[]) => {
    const callback = args.at(-1) as (error: Error) => void;
    callback(new Error("trash provider unavailable"));
  });
  await assert.rejects(recyclePath(target), { code: "recycle-failed" });
  assert.equal(command.mock.callCount(), 1);
  assert.equal(await readFile(target, "utf8"), "keep this");
});

test("recycling rejects roots and relative paths", async () => {
  await assert.rejects(recyclePath(path.parse(process.cwd()).root), { code: "unsafe-recycle-path" });
  await assert.rejects(recyclePath("relative"), { code: "unsafe-recycle-path" });
});
