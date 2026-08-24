# Installation and local testing

Build once from the repository root:

```bash
npm ci
npm run build
```

Configure an external catalog as described in the README, or use the managed
store without a config file. Installing the router does not move, enable,
disable, or modify any external catalog skill.

## Managed store

The first explicit lifecycle command creates the platform managed root. Override
it with `STASH_MANAGED_HOME`, `--managed-root`, or config `managedRoot`.

```bash
stash install /path/to/rare-skill
stash status rare-skill
stash update /path/to/staged-update \
  --expected-tree-hash <current-hash> \
  --expected-revision <current-revision> \
  --source-url https://github.com/example/skills \
  --revision <new-commit-oid> \
  --repository-path skills/rare-skill \
  --tracking-ref refs/heads/main
```

Remote URLs are not accepted by the CLI. Stage a requested repository revision
outside every host discovery path, review it, and import the local skill root.
Record the canonical repository URL, caller-resolved full 40- or 64-hex Git
commit object ID, and
exact repository-relative skill path; use `.` for a skill at repository root.
Also record `HEAD` or the fully qualified `refs/heads/...` or `refs/tags/...`
lineage. Bulk updates resolve only that exact ref. Records with no remote
provenance are local-only and skipped; partial remote provenance is invalid and
stops lifecycle processing instead of guessing the remote default branch.
Changed-tree updates follow the same staging rule. Every update requires
compare-and-swap values from `stash status --json` and rechecks the record and
tree at its commit boundary. It changes only the managed canonical copy; tracked
host deployments remain untouched and report whether they still match that copy.
All-managed automation never searches by skill name to reconstruct provenance.
Lifecycle deployment is standalone-only: plugins and vendor enable/disable
settings stay under their host's controls.

## OpenAI Codex

For standalone local use, copy `adapters/codex/skills/stash` to:

```text
$HOME/.agents/skills/stash
```

Start a new Codex session, then invoke:

```text
$stash design-system
$stash API 문서 검토에 필요한 스킬을 찾아줘
```

`agents/openai.yaml` keeps implicit invocation off. Do not set the skill's
Codex `enabled` override to `false`; that disables explicit invocation too.

The repository root is also a validated skills-only Codex plugin. Publication
to the universal plugin directory or addition to a local Codex marketplace is a
separate distribution step and is intentionally not performed by this project.

## Anthropic Claude Code

For a one-session development test:

```bash
claude --plugin-dir ./adapters/claude-code
```

Invoke the namespaced skill:

```text
/stash:stash design-system
```

The generated frontmatter sets `disable-model-invocation: true`.

The repository also contains `.claude-plugin/marketplace.json`. After cloning,
Claude Code can add it as a local marketplace:

```text
/plugin marketplace add .
/plugin install stash@dd3ok-stash
/reload-plugins
```

After the repository is published, replace `.` with its supported GitHub
marketplace source. Installed plugin files are cached, so all runtime files stay
inside `adapters/claude-code`.

## Google Antigravity IDE

Copy `adapters/antigravity/ide` into a custom plugin location documented for the
target surface, for example:

```text
<workspace>/.agents/plugins/stash
```

Start a fresh session and explicitly mention `stash` by name. Current official
IDE documentation does not define a skill-level manual-only field, so this
Adapter does not claim that automatic selection is technically disabled.

## Google Antigravity CLI

With a target `agy` binary:

```bash
agy plugin install ./adapters/antigravity/cli
```

Check `/skills`, then invoke:

```text
/stash design-system
```

The Adapter follows the current CLI page's flat `skills/stash.md` form. Google
also publishes a directory-based CLI codelab, so record the tested `agy` version
before declaring that version supported.

## Uninstall and rollback

Use each host's own plugin controls. Before uninstalling Stash, run
`stash status --json` and deactivate any recorded standalone deployments you
no longer want. Removing the router does not remove external catalogs, the
managed store, or host deployments automatically.
