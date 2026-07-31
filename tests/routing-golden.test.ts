import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStashCatalog } from "../src/stash-catalog.js";
import type { ResolvedSkill } from "../src/types.js";
import { createCatalogFixture, fixtureSkills } from "./helpers.js";

interface GoldenCase {
  id: string;
  kind: "exact" | "search" | "list";
  query?: string;
  sources?: string[];
  expectedRelevant: string[];
  expectedFirst?: string;
  expectedPossible?: string[];
}

const goldenPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "benchmarks",
  "routing-golden.jsonl",
);

test("routing profile satisfies the executable golden set", async (t) => {
  const fixture = await createCatalogFixture([
    ...fixtureSkills,
    {
      group: "game-development",
      name: "design-game-encounters",
      description: "Design enemy waves, arenas, objectives, and boss phases.",
      sidecar: `schemaVersion: 1
source:
  id: mengto
  displayName: MengTo/Skills
  url: https://github.com/MengTo/Skills
`,
    },
    {
      group: "frontend",
      name: "frontend-workbench",
      description: "Handle general frontend implementation across web projects.",
    },
    {
      group: "frontend",
      name: "ui-craft",
      description: "Design and implement polished user interfaces.",
    },
    {
      group: "tooling",
      name: "build-audio-tools",
      description: "Build audio processing tools.",
    },
    {
      group: "web-design",
      name: "company-logos",
      description: "Collect and present company logos.",
      sidecar: `schemaVersion: 1
aliases:
  - logo gallery
`,
    },
    {
      group: "web-design",
      name: "create-brand-world",
      description: "Create a visual brand world and art direction.",
      sidecar: `schemaVersion: 1
source:
  id: mengto
  displayName: MengTo/Skills
  url: https://github.com/MengTo/Skills
`,
    },
    {
      group: "media-production",
      name: "elevenlabs-tts",
      description:
        "Generate realistic voice audio from text with ElevenLabs speech and expressive multilingual studio delivery controls.",
    },
    {
      group: "media-production",
      name: "waveform-previews",
      description: "Generate audio previews and waveforms for media projects.",
    },
    {
      group: "media-production",
      name: "recording-cleanup",
      description: "Edit voice and audio recordings with cleanup and mixing.",
    },
    {
      group: "media-production",
      name: "narration-workflows",
      description: "Compare voice narration workflows for video production.",
    },
    {
      group: "documentation",
      name: "media-options-guide",
      description:
        "Generate reference documentation that compares available voice and audio options for production teams and workflows.",
      sidecar: `schemaVersion: 1
examples:
  negative:
    - generate voice audio
`,
    },
    {
      group: "cadence-tools",
      name: "timbre-synthesizer",
      description: "Synthesize timbre cadence.",
    },
    {
      group: "studio",
      name: "cadence-synthesizer",
      description: "Synthesize timbre cadence.",
    },
    {
      group: "cadence-tools",
      name: "synthesis-previews",
      description: "Synthesize timbre previews.",
    },
    {
      group: "cadence-tools",
      name: "discouraged-synthesizer",
      description: "Synthesize timbre cadence.",
      sidecar: `schemaVersion: 1
examples:
  negative:
    - synthesize timbre cadence
`,
    },
    {
      group: "review",
      name: "database-migration-review",
      description: "Review database migrations for correctness and safety.",
      sidecar: `schemaVersion: 1
tags:
  - database
  - migration
  - review
`,
    },
    {
      group: "review",
      name: "api-contract-review",
      description: "Review API contracts for correctness and safety.",
      sidecar: `schemaVersion: 1
tags:
  - database
  - migration
  - review
examples:
  negative:
    - database migration review
`,
    },
    {
      group: "collision",
      name: "hyphenated-source",
      description: "A source identity collision fixture.",
      sidecar: `schemaVersion: 1
source:
  id: foo-bar
`,
    },
    {
      group: "collision",
      name: "plain-source",
      description: "A source identity collision fixture.",
      sidecar: `schemaVersion: 1
source:
  id: foobar
`,
    },
    {
      group: "collision",
      name: "hyphenated-url-source",
      description: "A source URL collision fixture.",
      sidecar: `schemaVersion: 1
source:
  url: https://a-b.example
`,
    },
    {
      group: "collision",
      name: "plain-url-source",
      description: "A source URL collision fixture.",
      sidecar: `schemaVersion: 1
source:
  url: https://ab.example
`,
    },
  ]);
  const catalog = await createStashCatalog({
    cacheDir: fixture.cacheDir,
    catalogs: [{ id: "golden", root: fixture.root }],
  });
  const cases = (await readFile(goldenPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GoldenCase);

  for (const golden of cases) {
    await t.test(golden.id, async () => {
      const matches: ResolvedSkill[] = [];
      let cursor: string | undefined;
      let totalRelevant: number | undefined;
      do {
        const result =
          golden.kind === "exact"
            ? await catalog.resolve({
                kind: "exact",
                name: golden.query ?? "",
                ...(golden.sources ? { sources: golden.sources } : {}),
              })
            : golden.kind === "list"
              ? await catalog.resolve({
                  kind: "list",
                  ...(golden.sources ? { sources: golden.sources } : {}),
                  pageSize: 1,
                  ...(cursor ? { cursor } : {}),
                })
              : await catalog.resolve({
                  kind: "search",
                  query: golden.query ?? "",
                  ...(golden.sources ? { sources: golden.sources } : {}),
                  pageSize: 1,
                  ...(cursor ? { cursor } : {}),
                });
        totalRelevant ??= result.totalRelevant;
        assert.equal(result.totalRelevant, totalRelevant);
        matches.push(...result.matches);
        cursor = result.page.nextCursor;
      } while (golden.kind !== "exact" && cursor);

      assert.equal(new Set(matches.map((match) => match.ref)).size, matches.length);
      assert.equal(totalRelevant, golden.expectedRelevant.length);
      if (golden.expectedFirst) {
        assert.equal(matches[0]?.name, golden.expectedFirst);
      }
      assert.deepEqual(
        matches.map((match) => match.name).sort(),
        [...golden.expectedRelevant].sort(),
      );
      if (golden.expectedPossible) {
        const withPossible = await catalog.resolve({
          kind: "search",
          query: golden.query ?? "",
          ...(golden.sources ? { sources: golden.sources } : {}),
          includePossible: true,
          pageSize: 200,
        });
        const possibleNames = withPossible.matches
          .filter((match) => match.relevance?.tier === "possible")
          .map((match) => match.name);
        for (const expected of golden.expectedPossible) {
          assert.ok(possibleNames.includes(expected));
        }
      }
    });
  }
});
