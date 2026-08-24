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

Stash searches locally, treats every external source library as read-only, and
loads only the selected instructions. Its separate managed store can also keep
an explicitly imported standalone skill inactive until you deploy it to a host.
Search never downloads, installs, updates, or executes a skill.

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
2. Import occasional skills into Stash's managed store, or configure an
   existing read-only library.
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

### Managed inactive skills

No catalog configuration is required for the managed store. Import accepts a
local skill directory and leaves the source untouched:

```bash
stash install D:/downloads/rare-skill
stash update D:/staging/rare-skill-v2 \
  --expected-tree-hash <current-hash> \
  --expected-revision <current-revision> \
  --source-url https://github.com/example/skills \
  --revision <new-commit-oid> \
  --repository-path skills/rare-skill \
  --tracking-ref refs/heads/main
stash archive old-skill --host codex
stash status rare-skill
stash activate rare-skill --host codex
stash deactivate rare-skill --host codex
```

`install`, `import`, and `add` are aliases. `archive` is the destructive form:
it verifies and stores an explicitly selected standalone skill before removing
that source directory from host discovery. It never manages a plugin-contained
skill. If the selected path is already a verified Stash-owned deployment,
`archive` performs the same tracked withdrawal as `deactivate` and preserves
the canonical copy. `activate` records a `deployed` copy; it does not claim that
a host-level enable/disable override is enabled.

The CLI imports local directories only. When a user explicitly asks the Stash
skill to import a repository skill, the agent may stage the pinned revision
outside host discovery, inspect it, and pass that local directory to `install`.
The same rule applies to `update`: it replaces only an existing managed copy,
requires the caller's current tree hash (and current revision when recorded),
and requires the matching source URL for remote-provenance changes. Agents
record the full 40- or 64-hex commit object ID, exact repository-relative skill
path (`.` for a repository-root skill), and explicit `HEAD` or fully qualified
branch/tag tracking ref. Bulk updates never guess or substitute a default ref.
A same-tree revision advance updates metadata without copying content.
Changed content is staged, re-hashed, checked again against the current record
and tree, and transactionally swapped under a recovery journal. Existing
deployments remain untouched and are reported as outdated until explicitly
deactivated and activated again. Interrupted-process recovery is idempotent;
Stash does not claim fsync-backed power-loss durability.
Install may read a selected skill inside a configured catalog but never mutates
that source. When a hash-matching source or Stash-owned deployment also appears
in an indexed catalog, search folds it into the managed canonical result as a
related copy. A drifted or unrelated copy remains separate and visible.

Lifecycle commands are intentionally local-input-only: no remote URL input,
symlink deployment, unguarded overwrite, plugin mutation, vendor setting
mutation, or workspace lifecycle target. Antigravity CLI lifecycle is rejected
because its documented standalone skill layouts are flat Markdown rather than
directories.

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

- Catalog operations keep external source libraries read-only. Writes are
  restricted to the non-overlapping Stash-managed root and exact standalone
  lifecycle targets explicitly selected by the caller.
- Search uses no network, embedding model, vector database, or second LLM
  router.
- Reading a skill does not execute its scripts.
- Stash is not a marketplace, autonomous remote updater, permission system,
  sandbox, or security scanner. Plugin lifecycle remains owned by each host.

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
