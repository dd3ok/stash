import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundledCli = path.join(
  root,
  "skills",
  "stash",
  "scripts",
  "stash.mjs",
);

test("bundled skill CLI performs exact lookup without node_modules at runtime", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "stash-dist-test-"));
  const catalog = path.join(temp, "catalog");
  const skill = path.join(catalog, "sample");
  await mkdir(skill, { recursive: true });
  await writeFile(
    path.join(skill, "SKILL.md"),
    "---\nname: sample\ndescription: A sample bundled CLI skill.\n---\n\n# Sample\n",
    "utf8",
  );
  const { stdout } = await execFileAsync(process.execPath, [
    bundledCli,
    "exact",
    "sample",
    "--root",
    catalog,
    "--cache-dir",
    path.join(temp, "cache"),
    "--json",
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.status, "ok");
  assert.equal(result.matches[0].name, "sample");
});

test("npm package entrypoints match the compiled layout", async () => {
  const entrypoint = path.join(root, "dist", "index.js");
  const cli = path.join(root, "dist", "cli.js");
  const library = await import(pathToFileURL(entrypoint).href);
  assert.equal(typeof library.createStashCatalog, "function");

  const { stdout } = await execFileAsync(process.execPath, [cli, "help"]);
  assert.match(stdout, /stash exact <name>/u);
});

test("vendor adapters contain only their documented invocation policy", async () => {
  const claudeMarketplace = JSON.parse(
    await readFile(
      path.join(root, ".claude-plugin", "marketplace.json"),
      "utf8",
    ),
  );
  assert.equal(claudeMarketplace.name, "dd3ok-agent-skills-stash");
  assert.equal(claudeMarketplace.owner.name, "dd3ok");
  assert.equal(
    claudeMarketplace.plugins[0].source,
    "./adapters/claude-code",
  );
  assert.equal(claudeMarketplace.plugins[0].strict, true);

  const claudeSkillPath = path.join(
    root,
    "adapters",
    "claude-code",
    "skills",
    "stash",
    "SKILL.md",
  );
  const claudeSkill = await readFile(claudeSkillPath, "utf8");
  const claudeFrontmatter = YAML.parse(
    /^---\r?\n([\s\S]*?)\r?\n---/u.exec(claudeSkill)?.[1] ?? "",
  );
  assert.equal(claudeFrontmatter["disable-model-invocation"], true);
  assert.match(claudeSkill, /explicitly invokes `\/stash:stash`/u);
  assert.doesNotMatch(claudeSkill, /\$stash/u);
  await assert.rejects(
    access(
      path.join(
        root,
        "adapters",
        "claude-code",
        "skills",
        "stash",
        "agents",
        "openai.yaml",
      ),
    ),
  );

  const antigravityCliRoot = path.join(
    root,
    "adapters",
    "antigravity",
    "cli",
  );
  const antigravityCliSkill = await readFile(
    path.join(antigravityCliRoot, "skills", "stash.md"),
    "utf8",
  );
  assert.match(antigravityCliSkill, /explicitly invokes `\/stash`/u);
  assert.match(antigravityCliSkill, /\.\.\/scripts\/stash\.mjs/u);
  assert.doesNotMatch(antigravityCliSkill, /\$stash/u);
  await access(
    path.join(
      antigravityCliRoot,
      "skills",
      "references",
      "CLI-CONTRACT.md",
    ),
  );

  const manifest = JSON.parse(
    await readFile(path.join(antigravityCliRoot, "plugin.json"), "utf8"),
  );
  assert.equal(manifest.name, "stash");
  assert.equal(
    manifest.$schema,
    "https://antigravity.google/schemas/v1/plugin.json",
  );
});
