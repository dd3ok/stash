import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const brandParts = ["agent", "skills", "stash"];
const contentSeparator = String.raw`(?:[-_]|\s)+`;
const pathSeparator = String.raw`(?:[-_/\\]|\s)+`;
const forbiddenContentBrand = new RegExp(
  brandParts.join(contentSeparator),
  "iu",
);
const forbiddenPathBrand = new RegExp(
  brandParts.join(pathSeparator),
  "iu",
);
const ignoredDirectories = new Set([
  "coverage",
  "dist",
  "node_modules",
]);

function shouldIgnoreDirectory(name) {
  return ignoredDirectories.has(name) || name.startsWith(".stash-cache");
}

export async function scanBranding(root) {
  // The checkout root belongs to the environment, so scan descendants only.
  const resolvedRoot = path.resolve(root);
  const files = [];
  const violations = new Set();

  function relativePath(filePath) {
    return path.relative(resolvedRoot, filePath).split(path.sep).join("/");
  }

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        entry.name === ".git" ||
        (entry.isDirectory() && shouldIgnoreDirectory(entry.name))
      ) {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith(".tgz")) {
        continue;
      }
      const relative = relativePath(entryPath);
      if (forbiddenPathBrand.test(relative)) {
        violations.add(`${relative} (path)`);
      }
      // Check the link path above without traversing or reading its target.
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  await walk(resolvedRoot);

  for (const file of files) {
    const content = await readFile(file);
    if (content.includes(0)) {
      continue;
    }
    if (forbiddenContentBrand.test(content.toString("utf8"))) {
      violations.add(relativePath(file));
    }
  }

  return { violations: [...violations].sort() };
}
