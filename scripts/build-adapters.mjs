import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adapters = path.join(root, "adapters");
const sourceSkill = path.join(root, "skills", "stash");
const sourceSkillFile = path.join(sourceSkill, "SKILL.md");
const packageManifest = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
if (typeof packageManifest.version !== "string") {
  throw new Error("package.json must define a string version.");
}
const packageVersion = packageManifest.version;
const sourceBody = await readFile(sourceSkillFile, "utf8");
const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/u.exec(sourceBody);

if (!frontmatterMatch) {
  throw new Error("Canonical skills/stash/SKILL.md has invalid frontmatter.");
}

const body = sourceBody.slice(frontmatterMatch[0].length);
const descriptionMatch = /^description:\s*(.+)$/mu.exec(frontmatterMatch[1]);
const description = descriptionMatch?.[1]?.trim();
if (!description) {
  throw new Error("Canonical stash skill must define description.");
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copySkill(target) {
  await mkdir(path.dirname(target), { recursive: true });
  await cp(sourceSkill, target, { recursive: true });
}

function withInvocation(value, invocation) {
  return value.replaceAll("$stash", invocation);
}

await rm(adapters, { recursive: true, force: true });
await mkdir(adapters, { recursive: true });

const codexRoot = path.join(adapters, "codex");
await copySkill(path.join(codexRoot, "skills", "stash"));
await cp(
  path.join(root, ".codex-plugin"),
  path.join(codexRoot, ".codex-plugin"),
  { recursive: true },
);

const claudeRoot = path.join(adapters, "claude-code");
const claudeSkill = path.join(claudeRoot, "skills", "stash");
await copySkill(claudeSkill);
await rm(path.join(claudeSkill, "agents"), { recursive: true, force: true });
await writeFile(
  path.join(claudeSkill, "SKILL.md"),
  `---\nname: stash\ndescription: ${withInvocation(description, "/stash:stash")}\ndisable-model-invocation: true\n---\n${withInvocation(body, "/stash:stash")}`,
  "utf8",
);
await writeJson(path.join(claudeRoot, ".claude-plugin", "plugin.json"), {
  name: "stash",
  version: packageVersion,
  description:
    "Search read-only Agent Skills catalogs and manage an explicit local inactive store.",
  author: { name: "dd3ok", url: "https://github.com/dd3ok" },
});

const antigravityRoot = path.join(adapters, "antigravity");
const ideRoot = path.join(antigravityRoot, "ide");
const antigravityIdeSkill = path.join(ideRoot, "skills", "stash");
await copySkill(antigravityIdeSkill);
await rm(path.join(antigravityIdeSkill, "agents"), {
  recursive: true,
  force: true,
});
await writeFile(
  path.join(antigravityIdeSkill, "SKILL.md"),
  `---\nname: stash\ndescription: ${withInvocation(description, "stash")}\n---\n${withInvocation(body, "stash")}`,
  "utf8",
);
await writeJson(path.join(ideRoot, "plugin.json"), {
  name: "stash",
  description:
    "Search read-only Agent Skills catalogs and manage an explicit local inactive store.",
});

const cliRoot = path.join(antigravityRoot, "cli");
await mkdir(path.join(cliRoot, "skills"), { recursive: true });
await mkdir(path.join(cliRoot, "scripts"), { recursive: true });
const cliBody = withInvocation(body, "/stash").replace(
  "Resolve `scripts/stash.mjs` relative to this `SKILL.md`",
  "Resolve `../scripts/stash.mjs` relative to this skill Markdown file",
);
await writeFile(
  path.join(cliRoot, "skills", "stash.md"),
  `---\nname: stash\ndescription: ${withInvocation(description, "/stash")}\n---\n${cliBody}`,
  "utf8",
);
await cp(
  path.join(sourceSkill, "scripts", "stash.mjs"),
  path.join(cliRoot, "scripts", "stash.mjs"),
);
await cp(
  path.join(sourceSkill, "references"),
  path.join(cliRoot, "skills", "references"),
  { recursive: true },
);
await writeJson(path.join(cliRoot, "plugin.json"), {
  $schema: "https://antigravity.google/schemas/v1/plugin.json",
  name: "stash",
  description:
    "Search read-only Agent Skills catalogs and manage an explicit local inactive store.",
});
