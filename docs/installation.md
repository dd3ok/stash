# Installation and local testing

Build once from the repository root:

```bash
npm ci
npm run build
```

Configure a catalog as described in the README before invoking Stash. Installing
the router does not move, enable, disable, or modify any catalog skill.

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

Use each host's own plugin or skill lifecycle controls. Removing Stash affects
only the router. Catalogs and their skill contents remain untouched.
