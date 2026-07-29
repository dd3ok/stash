# Vendor support

Verified against official documentation on 2026-07-29. Product behavior can change; run the contract tests against the target binary before release.

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
- `.codex-plugin/plugin.json` is required for plugin packaging.

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

Sources: [Antigravity Agent Skills](https://antigravity.google/docs/skills), [Antigravity Plugins](https://antigravity.google/docs/plugins).

## Google Antigravity CLI

Generated artifact:

```text
adapters/antigravity/cli/
├── plugin.json
├── skills/stash.md
└── scripts/stash.mjs
```

The current CLI plugin page documents flat Markdown skills that compile to slash commands. A Google Codelab also documents directory-based `SKILL.md` discovery. Their precedence and long-term support are not documented.

The generated Adapter follows the flat CLI plugin page. Before claiming a supported CLI version:

1. install the local plugin with the target `agy` binary;
2. check `/skills`;
3. invoke `/stash`;
4. verify natural-language behavior separately;
5. record the tested binary version.

Sources: [Antigravity CLI Plugins & Skills](https://antigravity.google/docs/cli/plugins), [Google Antigravity CLI skills Codelab](https://codelabs.developers.google.com/antigravity/how-to-create-agent-skills-for-antigravity-cli).

## Support matrix

| Surface | Artifact generated | Explicit invocation configured | Manual-only documented | Live binary tested in this repository |
|---|---:|---:|---:|---:|
| Codex plugin | yes | yes | yes | pending |
| Claude Code plugin | yes | yes | yes | pending |
| Antigravity IDE plugin | yes | by name | no | pending |
| Antigravity CLI plugin | yes | slash command format | no | pending |

Do not upgrade a `pending` live-binary cell to supported from file validation alone.
