# Stash

English | [한국어](README.ko.md)

Stash keeps occasional [`SKILL.md`](https://agentskills.io) packages outside a
host's normal discovery path. Invoke `$stash` explicitly to browse the library,
load a skill you choose, or manage an inactive standalone copy.

```text
$stash
→ show categories; source choices are available on request

$stash list frontend
→ show a numbered page with names, short purposes, and sources

Load number 2
→ read only that choice; do not start work or change activation

$stash use design-system to build a button
→ load that named skill and perform the requested task
```

The current host agent interprets your request and judges compact metadata;
Stash retrieves it without a second model call. Candidate lists show 10 at a time;
internal retrieval defaults to 50 cards per page. Ask for more or a complete list.
Browsing never installs, activates, or executes skills.

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

Names and refs resolve exactly. Topic discovery uses category/source lists and
optional literal filtering, without relevance scores or synonym dictionaries.

## Quick start

Requires Node.js 20 or later and the
[OS trash provider](docs/installation.md#requirements) for build/test cleanup.

```bash
npm ci
npm run test:all
node skills/stash/scripts/stash.mjs help
```

Try the sample catalog:

```bash
node skills/stash/scripts/stash.mjs doctor --config examples/config.yaml
node skills/stash/scripts/stash.mjs exact design-system --config examples/config.yaml --json
node skills/stash/scripts/stash.mjs list --group frontend --config examples/config.yaml --json
```

Install your inactive skills in the managed store below. Use
[configuration](skills/stash/references/CONFIGURATION.md) and the
[catalog format](docs/catalog-format.md) only to connect an existing library
for read-only search.

## Managed inactive skills

The managed store needs no catalog configuration. Lifecycle commands accept
local skill directories and preserve external catalog sources.

```bash
stash install /path/to/rare-skill
stash status rare-skill
stash activate rare-skill --host codex
stash deactivate rare-skill --host codex
stash uninstall rare-skill
```

`archive` is the destructive variant for one explicitly selected standalone
host skill. `update` replaces only an existing managed copy and does not rewrite
deployed copies. Remote repository content must be staged and reviewed locally
before the CLI sees it. `uninstall` removes only an inactive, verified managed
copy; tracked deployments must be deactivated first.

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
- [Retrieval](docs/retrieval.md)
- [Vendor support](docs/vendor-support.md)
- [Security](SECURITY.md)
- [Maintenance](docs/maintenance.md)

## License

MIT
