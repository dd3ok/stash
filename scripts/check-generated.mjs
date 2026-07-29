import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = [
  path.join(root, "skills", "stash", "scripts", "stash.mjs"),
  path.join(root, "adapters"),
];

async function fingerprint(targets) {
  const files = [];
  async function walk(target) {
    const entries = await readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  for (const target of targets) {
    try {
      const info = await import("node:fs/promises").then(({ stat }) => stat(target));
      if (info.isDirectory()) {
        await walk(target);
      } else if (info.isFile()) {
        files.push(target);
      }
    } catch {
      return "missing";
    }
  }
  files.sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file));
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

const before = await fingerprint(generated);
await run("node", ["scripts/bundle-skill.mjs"]);
await run("node", ["scripts/build-adapters.mjs"]);
const after = await fingerprint(generated);

if (before !== after) {
  throw new Error(
    "Generated artifacts were stale. Re-run npm run build and commit the result.",
  );
}
