# Catalog format

Stash scans `SKILL.md` under registered roots up to `maxDepth`, ignoring hidden
directories, `.git`, `node_modules` and `dist`. A directory can be flat or
category-shaped. Parent folders provide an initial category; local `classify`
metadata can set a functional category without moving files.

```text
catalog/
└── frontend/
    └── accessibility-review/
        ├── SKILL.md
        └── stash.meta.yaml   (optional)
```

Ref: `<catalog-id>:<relative-skill-directory>`, for example
`personal:frontend/accessibility-review`. Do not treat a name alone as unique.

## SKILL.md

Valid YAML frontmatter must include a lowercase hyphenated `name` (1–64
characters) and nonempty `description` (at most 1,024 characters). The file
must not exceed 1 MiB. Skill instructions/resources stay inside their directory.

## Optional source metadata

`stash.meta.yaml` may record upstream evidence:

```yaml
schemaVersion: 1
compatibility:
  codex: supported
  claude-code: supported
  antigravity: supported
trust:
  state: reviewed
source:
  id: example
  displayName: Example Skills
  url: https://github.com/example/skills
  license: MIT
risk:
  level: instruction-only
  capabilities: []
```

No aliases, tags, intent arrays or example queries are needed for retrieval.
Do not edit installed source trees to improve search. Use the local
`classify` command for a category and short purpose.

Trust states are `trusted`, `reviewed`, `unreviewed` and `quarantined`.
Quarantine blocks listing/reading; no trust value grants execution permission.
Attribution is not lifecycle update provenance.

## Optional catalog manifest

`stash.catalog.yaml` can set catalog-wide defaults; explicit registration wins.

```yaml
schemaVersion: 1
id: personal
skillDiscovery:
  maxDepth: 4
  ignore: [generated, vendor]
defaults:
  trust: reviewed
  compatibility: [codex, claude-code, antigravity]
```

After outside edits use `stash refresh`; use `stash doctor --json` for
malformed skills, stale classification and coverage gaps. Generated caches
are disposable and should not be committed.
