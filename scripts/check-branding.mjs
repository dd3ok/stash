import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandSeparator = String.raw`(?:[-_]|\s)+`;
const forbiddenBrand = new RegExp(
  ["agent", "skills", "stash"].join(brandSeparator),
  "iu",
);
const ignoredDirectories = new Set([
  "coverage",
  "dist",
  "node_modules",
]);
const files = [];
const violations = new Set();

function shouldIgnoreDirectory(name) {
  return ignoredDirectories.has(name) || name.startsWith(".stash-cache");
}

function relativePath(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
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
    if (forbiddenBrand.test(relative)) {
      violations.add(`${relative} (path)`);
    }
    if (entry.isDirectory()) {
      await walk(entryPath);
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
}

await walk(root);

for (const file of files) {
  const content = await readFile(file);
  if (content.includes(0)) {
    continue;
  }
  if (forbiddenBrand.test(content.toString("utf8"))) {
    violations.add(relativePath(file));
  }
}

if (violations.size > 0) {
  const sortedViolations = [...violations].sort();
  throw new Error(
    `Legacy three-part brand remains in: ${sortedViolations.join(", ")}`,
  );
}
