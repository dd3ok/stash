# Stash

English | [한국어](README.ko.md)

Stash keeps occasional [`SKILL.md`](https://agentskills.io) packages outside a
host's normal discovery path. Invoke `$stash` explicitly to open an exact skill,
search a local library by task, or manage an inactive standalone copy.

```text
$stash design-system
→ load that exact stored skill

$stash find every skill for reviewing API documentation
→ return every materially relevant stored skill
```

Search is local and read-only. It never downloads, installs, updates, or
executes a skill.

## When to use it

Use the host's normal skill directory for a small, distinct everyday set. Use
Stash when you want a larger local library without placing every skill's name
and description in normal discovery metadata.

```text
host discovery
├── everyday skills
└── Stash
     └── explicit request → local library → selected SKILL.md
```

Stash performs deterministic exact lookup first and uses local lexical search
for task discovery. Pagination never truncates the total relevant set.

## Quick start

Requires Node.js 20 or later.

```bash
npm ci
npm run test:all
node skills/stash/scripts/stash.mjs help
```

Try the sample catalog:

```bash
node skills/stash/scripts/stash.mjs doctor --config examples/config.yaml
node skills/stash/scripts/stash.mjs exact design-system --config examples/config.yaml --json
node skills/stash/scripts/stash.mjs search "frontend component tokens" --config examples/config.yaml --json
```

See [configuration](skills/stash/references/CONFIGURATION.md) and the
[catalog format](docs/catalog-format.md) to add your own read-only library.

## Managed inactive skills

The managed store needs no catalog configuration. Lifecycle commands accept
local skill directories and preserve external catalog sources.

```bash
stash install /path/to/rare-skill
stash status rare-skill
stash activate rare-skill --host codex
stash deactivate rare-skill --host codex
```

`archive` is the destructive variant for one explicitly selected standalone
host skill. `update` replaces only an existing managed copy and does not rewrite
deployed copies. Remote repository content must be staged and reviewed locally
before the CLI sees it.

The [CLI contract](skills/stash/references/CLI-CONTRACT.md) is the authority for
mutation preconditions, provenance, result states, bulk updates, and supported
targets. `stash help` is the authority for command syntax.

## Host support

| Host | Explicit use | Automatic selection |
|---|---|---|
| Codex | `$stash ...` | Disabled by `allow_implicit_invocation: false` |
| Claude Code | `/stash:stash ...` | Disabled by `disable-model-invocation: true` |
| Antigravity IDE | Mention `stash` by name | No documented skill-level manual-only field |
| Antigravity CLI | `/stash ...` | No documented skill-level manual-only field |

Generated Antigravity adapters require a live check against the target `agy`
version before support is claimed.

## Boundaries

- External catalogs remain read-only; catalog registration grants no write
  authority.
- Writes are limited to the Stash-managed root and exact supported standalone
  targets selected by an explicit lifecycle request.
- Search uses no network, embedding model, vector database, telemetry, or
  second LLM router.
- Reading a skill does not execute its scripts.
- Stash is not a marketplace, autonomous remote updater, sandbox, permission
  system, security scanner, plugin manager, or host settings manager.

## Documentation

- [Installation](docs/installation.md)
- [CLI contract](skills/stash/references/CLI-CONTRACT.md)
- [Configuration](skills/stash/references/CONFIGURATION.md)
- [Architecture](docs/architecture.md)
- [Library format](docs/catalog-format.md)
- [Routing](docs/routing.md)
- [Vendor support](docs/vendor-support.md)
- [Security](SECURITY.md)
- [Maintenance](docs/maintenance.md)

## License

MIT
