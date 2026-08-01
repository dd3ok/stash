# Vendor support

Verified against official documentation on 2026-08-01. Product behavior can change; run the contract tests against the target binary before release.

## OpenAI Codex

Generated artifact:

```text
adapters/codex/
├── .codex-plugin/plugin.json
└── skills/stash/
    ├── SKILL.md
    ├── agents/openai.yaml
    ├── references/
    └── scripts/stash.mjs
```

Contract:

- explicit invocation: `$stash ...`;
- implicit invocation disabled by `policy.allow_implicit_invocation: false`;
- `enabled=false` is full disablement and is not used as manual-only;
- standalone user skills live at `~/.agents/skills`, repository skills live in
  ancestor `.agents/skills` directories, and symlinked skill folders are
  supported;
- `[[skills.config]]` can fully disable an installed skill, but changes require
  a restart;
- `.codex-plugin/plugin.json` is required for plugin packaging.

Stash lifecycle deploys standalone copies to the documented discovery root but
does not edit `config.toml`. A `deployed` result is therefore not proof that an
existing `enabled=false` override was cleared.

Sources: [Build skills](https://learn.chatgpt.com/docs/build-skills), [Build plugins](https://learn.chatgpt.com/docs/build-plugins), [OpenAI plugin builder documentation](https://developers.openai.com/plugins).

## Anthropic Claude Code

Generated artifact:

```text
adapters/claude-code/
├── .claude-plugin/plugin.json
└── skills/stash/
    ├── SKILL.md
    ├── references/
    └── scripts/stash.mjs
```

Contract:

- plugin skill invocation is namespaced, typically `/stash:stash`;
- generated frontmatter sets `disable-model-invocation: true`;
- `skillOverrides` does not control plugin skills;
- plugin files must remain inside the plugin root because installed plugins are cached.
- standalone personal skills live at `~/.claude/skills`; project skills live
  in `.claude/skills` and support live change detection;
- standalone skills can be hidden with `skillOverrides`, while plugin skills
  must be managed through `/plugin`.

Stash lifecycle never edits plugin cache content or `skillOverrides`. It only
deploys or withdraws a recorded standalone copy.

Sources: [Claude Code Skills](https://code.claude.com/docs/en/skills), [Claude Code Plugins](https://code.claude.com/docs/en/plugins), [Plugins reference](https://code.claude.com/docs/en/plugins-reference).

## Google Antigravity IDE

Generated artifact:

```text
adapters/antigravity/ide/
├── plugin.json
└── skills/stash/
    ├── SKILL.md
    ├── references/
    └── scripts/stash.mjs
```

Contract:

- directory-based `skills/<name>/SKILL.md`;
- plugin root `plugin.json`;
- name and description participate in model discovery;
- no public skill-level manual-only field is documented.

Because the last point cannot be enforced by metadata, the Adapter documentation requests explicit use but does not claim automatic invocation is technically disabled.

Sources: [Antigravity Agent Skills](https://antigravity.google/docs/skills), [Antigravity IDE Plugins](https://antigravity.google/docs/ide/plugins).

The current global standalone path is `~/.gemini/config/skills`; workspace
skills use `.agents/skills` (with legacy `.agent/skills` support). Stash 0.2
supports only the documented global user path; workspace, legacy, and arbitrary
custom roots are rejected. Antigravity documents no skill-level manual-only
override.

## Google Antigravity CLI

Generated artifact:

```text
adapters/antigravity/cli/
├── plugin.json
├── skills/stash.md
└── scripts/stash.mjs
```

The current CLI documentation uses flat Markdown files for both standalone
scopes: `~/.gemini/antigravity-cli/skills/<name>.md` globally and
`.agents/skills/<name>.md` in a workspace. A folder-shaped managed skill cannot
be deployed losslessly to either CLI path.

The generated Adapter follows the flat CLI plugin page. Before claiming a supported CLI version:

1. install the local plugin with the target `agy` binary;
2. check `/skills`;
3. invoke `/stash`;
4. verify natural-language behavior separately;
5. record the tested binary version.

Lifecycle commands reject Antigravity CLI in every scope. The plugin adapter is
separate from standalone lifecycle deployment.

Sources: [Antigravity CLI Plugins & Skills](https://antigravity.google/docs/cli/plugins), [Google Antigravity Skills Codelab](https://codelabs.developers.google.com/getting-started-with-antigravity-skills).

## Support matrix

| Surface | Artifact generated | Explicit invocation configured | Manual-only documented | Live binary tested in this repository |
|---|---:|---:|---:|---:|
| Codex plugin | yes | yes | yes | pending |
| Claude Code plugin | yes | yes | yes | pending |
| Antigravity IDE plugin | yes | by name | no | pending |
| Antigravity CLI plugin | yes | slash command format | no | pending |

Do not upgrade a `pending` live-binary cell to supported from file validation alone.
