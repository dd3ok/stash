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
import { recyclePath } from "../dist/internal/recycle-bin.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundledCli = path.join(
  root,
  "skills",
  "stash",
  "scripts",
  "stash.mjs",
);

test("the CLI rejects undocumented installation aliases", async () => {
  for (const command of ["add", "import", "search", "index"]) {
    await assert.rejects(execFileAsync(process.execPath, [bundledCli, command, "unused"]),
      (error) => error.code === 2);
  }
});

test("list views preserve complete inventory and scope without detailed payloads", async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), "stash-list-views-test-"));
  t.after(() => recyclePath(temp));
  const catalog = path.join(temp, "catalog");
  for (const [group, name, owner] of [
    ["engineering", "review", "first"],
    ["frontend", "review", "second"],
    ["engineering", "diagnose", "first"],
  ]) {
    const skill = path.join(catalog, group, name);
    await mkdir(skill, { recursive: true });
    const description = name === "diagnose"
      ? "Diagnose a reproducible issue using evidence. ".repeat(10).trim()
      : "A complete fixture description.";
    await writeFile(path.join(skill, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\nPRIVATE-BODY:${group}/${name}\n`);
    await writeFile(path.join(skill, "stash.meta.yaml"), `schemaVersion: 1\nsource:\n  url: https://github.com/${owner}/skills\n`);
  }
  const args = [bundledCli, "list", "--root", catalog, "--cache-dir", path.join(temp, "cache"), "--managed-root", path.join(temp, "managed")];
  const run = async (...extra) => JSON.parse((await execFileAsync(process.execPath, [...args, ...extra, "--json"])).stdout);
  const full = await run("--view", "full");
  assert.equal(full.view, undefined);
  assert.ok(full.matches.every((match) => match.description.length <= 240));
  const overview = await run("--view", "summary");
  assert.equal(overview.view, "summary");
  assert.equal(overview.total, 3);
  assert.deepEqual(overview.summary, full.summary);
  assert.equal(overview.matches, undefined);
  assert.equal(overview.page, undefined);

  const first = await run("--view", "compact", "--page-size", "1");
  assert.equal(first.summary, undefined);
  assert.equal(first.matches[0].description, full.matches[0].description);
  assert.equal(first.matches[0].contentHash, undefined);
  assert.ok(first.matches[0].source.url);
  assert.equal(first.total, 3);
  const members = [...first.matches];
  let cursor = first.page.nextCursor;
  while (cursor) {
    const page = await run("--view", "compact", "--page-size", "1", "--cursor", cursor);
    assert.equal(page.total, 3);
    members.push(...page.matches);
    cursor = page.page.nextCursor;
  }
  assert.deepEqual(members.map((item) => item.ref), full.matches.map((item) => item.ref));
  assert.equal(new Set(members.map((item) => item.ref)).size, 3);
  assert.equal(members.filter((item) => item.name === "review").length, 2);
  assert.deepEqual(members.map((item) => item.description), full.matches.map((item) => item.description));
  assert.ok(members.find((item) => item.name === "diagnose").description.endsWith("…"));
  assert.doesNotMatch(JSON.stringify(members), /PRIVATE-BODY/u);

  // The displayed ref identifies the choice even when exact lookup is ambiguous.
  const chosen = members.find((item) => item.ref === "default:frontend/review");
  const exact = JSON.parse((await execFileAsync(process.execPath, [
    bundledCli, "exact", chosen.name, ...args.slice(2), "--json",
  ])).stdout);
  assert.equal(exact.status, "ambiguous-exact");
  const metadata = exact.matches.find((item) => item.ref === chosen.ref);
  const loaded = JSON.parse((await execFileAsync(process.execPath, [
    bundledCli, "read", metadata.ref, ...args.slice(2),
    "--expected-hash", metadata.contentHash, "--format", "json",
  ])).stdout);
  assert.equal(loaded.status, "ok");
  assert.match(loaded.content, /PRIVATE-BODY:frontend\/review/u);
  assert.doesNotMatch(loaded.content, /PRIVATE-BODY:engineering/u);
  const scoped = await run("--view", "compact", "--source", "first/skills", "--group", "engineering");
  assert.equal(scoped.total, 2);
  assert.equal(scoped.page.size, 2);
  assert.ok(scoped.matches.every((item) => item.source.url === "https://github.com/first/skills"));
  const missing = await run("--view", "compact", "--source", "missing/skills");
  assert.equal(missing.status, "no-match");
  assert.deepEqual(missing.matches, []);
  const stale = await run("--view", "compact", "--cursor", first.page.nextCursor, "--group", "frontend");
  assert.equal(stale.status, "cursor-stale");
  assert.deepEqual(stale.matches, []);

  const human = (await execFileAsync(process.execPath, [...args, "--view", "compact"])).stdout;
  assert.match(human, /default:engineering\/review/u);
  assert.match(human, /A complete fixture description\./u);
  assert.doesNotMatch(human, /PRIVATE-BODY/u);
  assert.doesNotMatch(human, /Source packages|Categories \(/u);
  const humanSummary = (await execFileAsync(process.execPath, [...args, "--view", "summary"])).stdout;
  assert.match(humanSummary, /Source packages/u);
  assert.doesNotMatch(humanSummary, /Skills on this page|next_cursor/u);
  for (const invalid of [["--view", "unknown"], ["--view", "summary", "--cursor", first.page.nextCursor], ["--page-size", "0"], ["--page-size", "1.5"], ["ignored-query"], ["--include-possible"]]) {
    await assert.rejects(execFileAsync(process.execPath, [...args, ...invalid]), (error) => error.code === 2);
  }
});

test("CLI filtered lists paginate compact cards without capping total results", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "stash-search-page-test-"));
  const catalog = path.join(temp, "catalog");
  const description = `${"Audit a focused interface component and explain its findings. ".repeat(5)}Never use for backend-only work.`;
  for (let index = 0; index < 12; index++) {
    const skill = path.join(catalog, `audit-${index}`);
    await mkdir(skill, { recursive: true });
    await writeFile(path.join(skill, "SKILL.md"), `---\nname: audit-${index}\ndescription: ${description}\n---\n`);
  }
  const args = [bundledCli, "list", "--text", "audit", "--view", "full", "--page-size", "10", "--root", catalog, "--cache-dir", path.join(temp, "cache"), "--json"];
  const first = JSON.parse((await execFileAsync(process.execPath, args)).stdout);
  assert.equal(first.total, 12);
  assert.equal(first.page.size, 10);
  assert.ok(first.matches[0].description.length <= 240);
  const second = JSON.parse((await execFileAsync(process.execPath, [...args, "--cursor", first.page.nextCursor])).stdout);
  assert.equal(second.total, 12);
  assert.equal(second.page.size, 2);
  assert.equal(second.page.nextCursor, undefined);
  assert.equal(new Set([...first.matches, ...second.matches].map((item) => item.ref)).size, 12);
  const single = JSON.parse((await execFileAsync(process.execPath, [...args, "--page-size", "1"])).stdout);
  assert.equal(single.page.size, 1);
  const help = (await execFileAsync(process.execPath, [bundledCli, "help"])).stdout;
  assert.match(help, /--page-size/u);
  assert.match(help, /--expected-hash/u);
});

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
  await writeFile(
    path.join(skill, "stash.meta.yaml"),
    `schemaVersion: 1
source:
  id: mengto
  displayName: MengTo/Skills
  url: https://github.com/MengTo/Skills
`,
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
    "--source",
    "MengTo/Skills",
    "--json",
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.status, "ok");
  assert.equal(result.matches[0].name, "sample");
  assert.equal(result.matches[0].source.id, "mengto");
});

test("bundled skill CLI installs, resolves, deploys, and deactivates a managed skill", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "stash-lifecycle-dist-test-"));
  const source = path.join(temp, "source", "rare-skill");
  const replacement = path.join(temp, "replacement", "rare-skill");
  const managedRoot = path.join(temp, "managed");
  const sandboxHome = path.join(temp, "home");
  const hostRoot = path.join(sandboxHome, ".agents", "skills");
  const cliEnvironment = {
    ...process.env,
    HOME: sandboxHome,
    USERPROFILE: sandboxHome,
  };
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(source, "SKILL.md"),
    "---\nname: rare-skill\ndescription: A bundled lifecycle fixture.\n---\n\n# Rare\n",
    "utf8",
  );
  await mkdir(replacement, { recursive: true });
  await writeFile(
    path.join(replacement, "SKILL.md"),
    "---\nname: rare-skill\ndescription: An updated bundled lifecycle fixture.\n---\n\n# Rare updated\n",
    "utf8",
  );
  const common = ["--managed-root", managedRoot, "--json"];
  const installed = JSON.parse(
    (
      await execFileAsync(process.execPath, [
        bundledCli,
        "install",
        source,
        "--source-url",
        "https://github.com/example/skills",
        "--revision",
        "1".repeat(40),
        "--repository-path",
        "skills/rare-skill",
        "--tracking-ref",
        "refs/heads/main",
        ...common,
      ], { env: cliEnvironment })
    ).stdout,
  );
  assert.equal(installed.status, "stored");

  const updated = JSON.parse(
    (
      await execFileAsync(process.execPath, [
        bundledCli,
        "update",
        replacement,
        "--expected-tree-hash",
        installed.treeHash,
        "--expected-revision",
        "1".repeat(40),
        "--source-url",
        "https://github.com/example/skills",
        "--revision",
        "2".repeat(40),
        "--repository-path",
        "skills/rare-skill",
        "--tracking-ref",
        "refs/heads/main",
        ...common,
      ], { env: cliEnvironment })
    ).stdout,
  );
  assert.equal(updated.status, "updated");
  assert.equal(updated.skillId, installed.skillId);
  const lifecycleStatus = JSON.parse(
    (
      await execFileAsync(process.execPath, [
        bundledCli,
        "status",
        "rare-skill",
        ...common,
      ], { env: cliEnvironment })
    ).stdout,
  );
  assert.equal(
    lifecycleStatus.skills[0].source.repositoryPath,
    "skills/rare-skill",
  );
  assert.equal(lifecycleStatus.skills[0].source.trackingRef, "refs/heads/main");

  const resolved = JSON.parse(
    (
      await execFileAsync(process.execPath, [
        bundledCli,
        "exact",
        "rare-skill",
        ...common,
      ], { env: cliEnvironment })
    ).stdout,
  );
  assert.equal(resolved.status, "ok");
  assert.equal(resolved.matches[0].catalogId, "managed");

  const deployed = JSON.parse(
    (
      await execFileAsync(process.execPath, [
        bundledCli,
        "activate",
        "rare-skill",
        "--host",
        "codex",
        "--scope",
        "user",
        ...common,
      ], { env: cliEnvironment })
    ).stdout,
  );
  assert.equal(deployed.status, "deployed");
  await access(path.join(hostRoot, "rare-skill", "SKILL.md"));

  const deactivated = JSON.parse(
    (
      await execFileAsync(process.execPath, [
        bundledCli,
        "deactivate",
        "rare-skill",
        "--host",
        "codex",
        "--scope",
        "user",
        ...common,
      ], { env: cliEnvironment })
    ).stdout,
  );
  assert.equal(deactivated.status, "deactivated");
  await assert.rejects(access(path.join(hostRoot, "rare-skill")));

  const uninstalled = JSON.parse(
    (
      await execFileAsync(process.execPath, [
        bundledCli,
        "uninstall",
        "rare-skill",
        ...common,
      ], { env: cliEnvironment })
    ).stdout,
  );
  assert.equal(uninstalled.status, "uninstalled");
  await assert.rejects(access(path.join(managedRoot, "rare-skill")));

  await execFileAsync(process.execPath, [
    bundledCli,
    "install",
    source,
    ...common,
  ], { env: cliEnvironment });
  const { stdout: humanUninstall } = await execFileAsync(process.execPath, [
    bundledCli,
    "uninstall",
    "rare-skill",
    "--managed-root",
    managedRoot,
  ], { env: cliEnvironment });
  assert.match(humanUninstall, /rare-skill: uninstalled/u);

  await assert.rejects(
    execFileAsync(process.execPath, [
      bundledCli,
      "uninstall",
      "rare-skill",
      "--force",
      ...common,
    ], { env: cliEnvironment }),
    (error) => error.code === 2 && /Unknown option.*--force/u.test(error.stderr),
  );
});

test("human output preserves URL-only source attribution", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "stash-url-source-test-"));
  const catalog = path.join(temp, "catalog");
  const skill = path.join(catalog, "url-sample");
  await mkdir(skill, { recursive: true });
  await writeFile(
    path.join(skill, "SKILL.md"),
    "---\nname: url-sample\ndescription: A URL-only source sample.\n---\n",
    "utf8",
  );
  await writeFile(
    path.join(skill, "stash.meta.yaml"),
    `schemaVersion: 1
source:
  url: https://example.com/owner/repository
`,
    "utf8",
  );
  const { stdout } = await execFileAsync(process.execPath, [
    bundledCli,
    "list",
    "--root",
    catalog,
    "--cache-dir",
    path.join(temp, "cache"),
  ]);
  assert.match(stdout, /https:\/\/example\.com\/owner\/repository/u);
});

test("human list output keeps ID-less sources in distinct blocks", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "stash-source-group-test-"));
  const catalog = path.join(temp, "catalog");
  const fixtures = [
    { name: "alpha", source: "Source A" },
    { name: "bravo", source: "Source B" },
    { name: "charlie", source: "Source A" },
  ];
  for (const fixture of fixtures) {
    const skill = path.join(catalog, fixture.name);
    await mkdir(skill, { recursive: true });
    await writeFile(
      path.join(skill, "SKILL.md"),
      `---\nname: ${fixture.name}\ndescription: A source grouping sample.\n---\n`,
      "utf8",
    );
    await writeFile(
      path.join(skill, "stash.meta.yaml"),
      `schemaVersion: 1\nsource:\n  displayName: ${fixture.source}\n`,
      "utf8",
    );
  }

  const { stdout } = await execFileAsync(process.execPath, [
    bundledCli,
    "list",
    "--root",
    catalog,
    "--cache-dir",
    path.join(temp, "cache"),
  ]);
  const sourceA = "Source A / default / (ungrouped)";
  const sourceB = "Source B / default / (ungrouped)";
  assert.equal(stdout.split(sourceA).length - 1, 1);
  assert.equal(stdout.split(sourceB).length - 1, 1);
  assert.ok(stdout.indexOf("- alpha") < stdout.indexOf("- charlie"));
  assert.ok(stdout.indexOf("- charlie") < stdout.indexOf(sourceB));
});

test("license-only metadata does not invent a source identity", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "stash-license-source-test-"));
  const catalog = path.join(temp, "catalog");
  const skill = path.join(catalog, "license-only-sample");
  await mkdir(skill, { recursive: true });
  await writeFile(
    path.join(skill, "SKILL.md"),
    "---\nname: license-only-sample\ndescription: A license-only source sample.\n---\n",
    "utf8",
  );
  await writeFile(
    path.join(skill, "stash.meta.yaml"),
    "schemaVersion: 1\nsource:\n  license: MIT\n",
    "utf8",
  );
  const { stdout } = await execFileAsync(process.execPath, [
    bundledCli,
    "list",
    "--root",
    catalog,
    "--cache-dir",
    path.join(temp, "cache"),
  ]);
  assert.match(stdout, /default \/ \(ungrouped\)/u);
  assert.doesNotMatch(stdout, /default \/ default \//u);
});

test("npm package entrypoints match the compiled layout", async () => {
  const entrypoint = path.join(root, "dist", "index.js");
  const cli = path.join(root, "dist", "cli.js");
  const library = await import(pathToFileURL(entrypoint).href);
  assert.equal(typeof library.createStashCatalog, "function");
  assert.equal(typeof library.createStashLifecycle, "function");

  const { stdout } = await execFileAsync(process.execPath, [cli, "help"]);
  assert.match(stdout, /stash exact <name\|ref>/u);
  assert.match(stdout, /stash install <local-skill-dir>/u);
  assert.match(stdout, /stash update <local-skill-dir>/u);
  assert.match(stdout, /stash uninstall <name>/u);
  assert.match(stdout, /--source <id\|owner\/repo\|url>/u);

  const { stdout: flagHelp } = await execFileAsync(process.execPath, [
    cli,
    "--help",
  ]);
  assert.equal(flagHelp, stdout);
});

test("distribution metadata uses one Stash identity and version", async () => {
  const packageManifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(packageManifest.name, "@dd3ok/stash");
  assert.equal(
    packageManifest.repository.url,
    "git+https://github.com/dd3ok/stash.git",
  );

  const codexManifest = JSON.parse(
    await readFile(path.join(root, ".codex-plugin", "plugin.json"), "utf8"),
  );
  assert.equal(codexManifest.name, "stash");
  assert.equal(codexManifest.interface.displayName, "Stash");
  assert.equal(codexManifest.version, packageManifest.version);

  const openaiMetadata = YAML.parse(
    await readFile(
      path.join(root, "skills", "stash", "agents", "openai.yaml"),
      "utf8",
    ),
  );
  assert.equal(openaiMetadata.interface.display_name, "Stash");
  assert.equal(openaiMetadata.policy.allow_implicit_invocation, false);

  const claudeMarketplace = JSON.parse(
    await readFile(
      path.join(root, ".claude-plugin", "marketplace.json"),
      "utf8",
    ),
  );
  assert.equal(claudeMarketplace.name, "dd3ok-stash");
  assert.equal(claudeMarketplace.plugins.length, 1);
  const claudePlugin = claudeMarketplace.plugins[0];
  assert.equal(claudePlugin.name, "stash");
  assert.equal(claudePlugin.version, packageManifest.version);

  const claudeManifest = JSON.parse(
    await readFile(
      path.join(
        root,
        "adapters",
        "claude-code",
        ".claude-plugin",
        "plugin.json",
      ),
      "utf8",
    ),
  );
  assert.equal(claudeManifest.name, "stash");
  assert.equal(claudeManifest.version, packageManifest.version);
});

test("vendor adapters contain only their documented invocation policy", async () => {
  const claudeMarketplace = JSON.parse(
    await readFile(
      path.join(root, ".claude-plugin", "marketplace.json"),
      "utf8",
    ),
  );
  assert.equal(claudeMarketplace.name, "dd3ok-stash");
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
  assert.match(claudeFrontmatter.description, /\/stash:stash/u);
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
  assert.match(antigravityCliSkill, /\/stash/u);
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
