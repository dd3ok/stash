import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

interface FixtureSkill {
  group: string;
  name: string;
  description: string;
  sidecar?: string;
  body?: string;
}

export async function createCatalogFixture(
  skills: FixtureSkill[],
): Promise<{ root: string; cacheDir: string }> {
  const base = await mkdtemp(path.join(tmpdir(), "stash-test-"));
  const root = path.join(base, "catalog");
  const cacheDir = path.join(base, "cache");
  await mkdir(root, { recursive: true });
  for (const skill of skills) {
    const directory = path.join(root, skill.group, skill.name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "SKILL.md"),
      `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.body ?? `# ${skill.name}\n`}`,
      "utf8",
    );
    if (skill.sidecar) {
      await writeFile(
        path.join(directory, "stash.meta.yaml"),
        skill.sidecar,
        "utf8",
      );
    }
  }
  return { root, cacheDir };
}

export const fixtureSkills: FixtureSkill[] = [
  {
    group: "web-design",
    name: "visual-identity",
    description:
      "Create a coherent brand identity with logo, color, typography, and usage rules.",
    sidecar: `schemaVersion: 1
aliases:
  - brand kit
  - 브랜드킷
  - 브랜드 디자인
tags:
  - branding
  - identity
intents:
  - create-brand-system
examples:
  positive:
    - 브랜드 디자인 시스템을 만들어줘
compatibility:
  codex: supported
  claude-code: supported
  antigravity: supported
trust:
  state: reviewed
risk:
  level: instruction-only
  capabilities: []
`,
    body: "# Visual Identity\n\nBuild the requested brand system.\n",
  },
  {
    group: "web-design",
    name: "brand-worlds",
    description:
      "Create reference-inspired visual brand worlds and art direction.",
    sidecar: `schemaVersion: 1
aliases:
  - 브랜드 디자인 세계관
tags:
  - branding
  - art-direction
intents:
  - create-brand-world
examples:
  positive:
    - 브랜드 디자인 레퍼런스와 세계관을 만들어줘
trust:
  state: reviewed
`,
  },
  {
    group: "frontend",
    name: "design-system",
    description:
      "Implement reusable frontend UI components and design tokens.",
    sidecar: `schemaVersion: 1
tags:
  - components
  - tokens
intents:
  - implement-ui-library
trust:
  state: reviewed
`,
  },
  {
    group: "security",
    name: "security-audit",
    description: "Audit a codebase for security flaws and unsafe configuration.",
    sidecar: `schemaVersion: 1
tags:
  - security
  - audit
trust:
  state: reviewed
`,
  },
  {
    group: "quarantine",
    name: "unsafe-skill",
    description: "An intentionally quarantined fixture.",
    sidecar: `schemaVersion: 1
trust:
  state: quarantined
`,
  },
];
