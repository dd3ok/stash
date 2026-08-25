# Installation and local testing

Build from the repository root:

```bash
npm ci
npm run build
node skills/stash/scripts/stash.mjs help
```

Configure an external catalog with
[`CONFIGURATION.md`](../skills/stash/references/CONFIGURATION.md), or use the
managed store without configuration. Installing the router never moves or
changes an external catalog skill.

## Managed store smoke test

The first explicit lifecycle command creates the platform managed root. Override
it with `STASH_MANAGED_HOME`, `--managed-root`, or config `managedRoot`.

```bash
stash install /path/to/rare-skill
stash status rare-skill --json
stash activate rare-skill --host codex --json
stash deactivate rare-skill --host codex --json
```

Use `stash help` for syntax and the
[`CLI-CONTRACT.md`](../skills/stash/references/CLI-CONTRACT.md) for mutation
preconditions and result meanings. Remote repository content must be staged and
reviewed locally before install or update.

## OpenAI Codex

Copy `adapters/codex/skills/stash` to:

```text
$HOME/.agents/skills/stash
```

Start a new session and invoke `$stash design-system`.
`agents/openai.yaml` keeps implicit invocation off. Setting the Codex skill
override to `enabled=false` also disables explicit invocation, so do not use it
as a manual-only switch.

The repository root is also a Codex plugin package. Publishing it is a separate
distribution action.

## Anthropic Claude Code

Run a development session:

```bash
claude --plugin-dir ./adapters/claude-code
```

Invoke `/stash:stash design-system`. Generated frontmatter sets
`disable-model-invocation: true`.

The repository also provides a local Claude marketplace:

```text
/plugin marketplace add .
/plugin install stash@dd3ok-stash
/reload-plugins
```

## Google Antigravity IDE

Place `adapters/antigravity/ide` in the custom plugin location documented for
the target version, start a fresh session, and mention `stash` by name. The
current public format has no skill-level manual-only field.

## Google Antigravity CLI

With a target `agy` binary:

```bash
agy plugin install ./adapters/antigravity/cli
```

Check `/skills`, then invoke `/stash design-system`. Record the tested binary
version before claiming support. Standalone lifecycle deployment is unsupported
because the documented CLI layout is flat Markdown rather than a skill folder.

## Uninstall and rollback

Use each host's plugin controls. Before uninstalling Stash, run
`stash status --json` and deactivate recorded standalone deployments you no
longer want. Removing the router does not remove catalogs, managed storage, or
deployments automatically.
