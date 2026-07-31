# Stash

English | [한국어](README.ko.md)

Stash, invoked as `$stash`, keeps infrequently used
[`SKILL.md`](https://agentskills.io) packages outside the host's normal
discovery path. Invoke it explicitly to open a skill by exact name or search
the local library by task.

```text
$stash design-system
→ open the exact stored skill

$stash find every skill for reviewing API documentation
→ return every materially relevant stored skill
```

Stash searches locally, treats source libraries as read-only, and loads only
the selected instructions. It does not download, install, update, or execute
skills while searching.

## Why

An active skill's full instructions are normally loaded only after selection,
but its name and description still participate in discovery. A large active set
can therefore:

- consume more of the host's skill-list metadata budget;
- make overlapping descriptions harder to route correctly;
- increase unintended automatic selection;
- require more trigger and description maintenance.

There is no fixed number at which skills become a problem. If you have a small,
distinct set and remember each name, the host's native manual-only option is
usually enough.

Use Stash when you want a larger local library that can be searched by name,
alias, category, or task without registering every stored skill individually.

```text
host discovery
├── everyday skills
└── Stash
     └── explicit request → local library → selected SKILL.md
```

## How it works

1. Keep everyday skills in the host's standard skill directory.
2. Keep occasional skills in a separate folder configured in Stash.
3. Invoke Stash explicitly.
4. Stash resolves an exact name or runs local lexical search.
5. It reads the selected `SKILL.md` and only the required resources.

Exact names always use the deterministic path first. When the user asks for all
related skills, Stash follows every result page instead of applying a fixed
top-five limit.

## Quick start

Requires Node.js 20 or later.

```bash
npm install
npm run test:all
```

Try the sample library:

```bash
node skills/stash/scripts/stash.mjs doctor --config examples/config.yaml
node skills/stash/scripts/stash.mjs exact design-system --config examples/config.yaml --json
node skills/stash/scripts/stash.mjs search "frontend component tokens" --config examples/config.yaml --json
node skills/stash/scripts/stash.mjs list --source example --config examples/config.yaml --json
```

Add a stable `source.id` and optional repository display name or URL to a skill's `stash.meta.yaml`. `--source` then accepts any of those exact identities without changing the skill's catalog or group.

Configure your library:

```yaml
version: 1
catalogs:
  - id: personal
    root: "D:/skills/stash"
    enabled: true
    trust: reviewed
    followSymlinks: false
defaults:
  pageSize: 40
  materialScoreThreshold: 2
```

Set `STASH_CONFIG` to the configuration file. You can also use
`--root <library-path>` for a one-off call.

## Vendor support

| Vendor | Explicit use | Automatic selection |
|---|---|---|
| Codex | `$stash ...` | Disabled with `allow_implicit_invocation: false` |
| Claude Code | `/stash:stash ...` | Disabled with `disable-model-invocation: true` |
| Antigravity IDE | Mention `stash` by name | No documented skill-level manual-only field |
| Antigravity CLI | `/stash ...` | No documented skill-level manual-only field |

Antigravity adapters are generated, but should be tested against the target
`agy` version before claiming live support.

## Boundaries

- Source libraries remain read-only.
- Search uses no network, embedding model, vector database, or second LLM
  router.
- Reading a skill does not execute its scripts.
- Stash is not an installer, updater, marketplace, permission system, sandbox,
  or security scanner.

## Documentation

- [Installation](docs/installation.md)
- [Architecture](docs/architecture.md)
- [Library format](docs/catalog-format.md)
- [Routing](docs/routing.md)
- [Vendor support](docs/vendor-support.md)
- [Security](SECURITY.md)
- [Maintenance](docs/maintenance.md)
- [Related projects](docs/alternatives.md)

## License

MIT
