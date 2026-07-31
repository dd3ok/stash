# Catalog format

## Contents

- [Directory discovery](#directory-discovery)
- [Catalog manifest](#catalog-manifest)
- [Skill file](#skill-file)
- [Routing sidecar](#routing-sidecar)
- [Trust and source](#trust-and-source)
- [Validation](#validation)

## Directory discovery

Stash recursively discovers `SKILL.md` up to `maxDepth`. It ignores hidden directories, `.git`, `node_modules`, and `dist` by default.

Both layouts work:

```text
catalog/
└── accessibility-review/
    └── SKILL.md
```

```text
catalog/
└── web-design/
    └── accessibility-review/
        ├── SKILL.md
        └── stash.meta.yaml
```

The stable ref is:

```text
<catalog-id>:<relative-skill-directory>
```

Example:

```text
personal:web-design/accessibility-review
```

## Catalog manifest

`stash.catalog.yaml` is optional:

```yaml
schemaVersion: 1
id: personal
displayName: Personal Skills
description: A read-only private catalog
skillDiscovery:
  maxDepth: 4
  ignore:
    - generated
    - vendor
defaults:
  trust: reviewed
  compatibility:
    - codex
    - claude-code
    - antigravity
```

The configured catalog ID remains authoritative. A different manifest ID produces a warning.

## Skill file

Use the portable Agent Skills fields:

```yaml
---
name: accessibility-review
description: Review a product interface for accessibility issues and recommend concrete fixes.
license: MIT
---
```

Requirements enforced by Stash:

- name is 1–64 lowercase letters, digits, or hyphens;
- description is non-empty and at most 1,024 characters;
- `SKILL.md` is at most 1 MiB;
- frontmatter is valid YAML.

## Routing sidecar

`stash.meta.yaml` is optional and does not pollute vendor frontmatter:

```yaml
schemaVersion: 1
aliases:
  - a11y review
  - accessibility audit
  - 접근성 검토
tags:
  - accessibility
  - audit
intents:
  - review-interface-accessibility
examples:
  positive:
    - 이 화면의 접근성 문제를 검토해줘
  negative:
    - 데이터베이스 쿼리를 최적화해줘
compatibility:
  codex: supported
  claude-code: supported
  antigravity: supported
trust:
  state: reviewed
source:
  id: example
  displayName: Example Skills
  url: https://github.com/example/skill
  revision: 0123456789abcdef
  license: MIT
risk:
  level: instruction-only
  capabilities: []
```

Arrays stay in the sidecar because portable Agent Skills metadata does not guarantee arbitrary vendor-specific nested arrays in `SKILL.md`.

Use a stable lowercase `source.id` to identify the author or upstream collection independently from storage and taxonomy:

- `catalogId` identifies the configured local library;
- `group` identifies the skill's functional category;
- `source.id` identifies where the skill originated.

This allows `personal:game-development/design-encounters` to remain in a personal catalog while `--source example`, `--source "Example Skills"`, or the recorded source URL selects it by provenance.

## Trust and source

Trust states:

- `trusted`: source, revision, license, and review policy are recorded.
- `reviewed`: instructions were reviewed but dependencies may remain.
- `unreviewed`: searchable and readable with an explicit warning state.
- `quarantined`: excluded from resolve and blocked from read.

Trust never grants execution permission.

Record source ID, URL, immutable revision, license, and content hash before redistributing third-party skills.

## Validation

Run:

```bash
stash doctor --json
stash index --json
```

Fix warnings rather than silently excluding malformed skills. A generated index is disposable and should not be committed with the catalog.
