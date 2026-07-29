import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(root, "dist"),
  path.join(root, "adapters", "codex"),
  path.join(root, "adapters", "claude-code"),
  path.join(root, "adapters", "antigravity"),
  path.join(root, ".stash-cache"),
  path.join(root, ".stash-cache-real"),
];

for (const target of targets) {
  const relative = path.relative(root, target);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Refusing to remove unsafe path: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
}
