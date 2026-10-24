# Configuration

No config is required for the managed inactive store. Add one only to override
locations or register existing read-only libraries.

| Platform | Config | Managed store |
|---|---|---|
| Windows | `%APPDATA%\stash\config.yaml` | `%LOCALAPPDATA%\stash\managed` |
| macOS | `~/Library/Application Support/stash/config.yaml` | `~/Library/Application Support/stash/managed` |
| Linux | `$XDG_CONFIG_HOME/stash/config.yaml` (default `~/.config`) | `$XDG_DATA_HOME/stash/managed` (default `~/.local/share`) |

```yaml
version: 2
catalogs:
  - id: user-skills
    root: /absolute/path/to/existing/skills
    maxDepth: 1
defaults:
  pageSize: 50
```

Config contains only `version`, `catalogs`, optional `managedRoot` and
`defaults.pageSize` (1–200). Catalogs accept `id`, `root`, `enabled`,
`trust`, `followSymlinks`, `maxDepth`, `ignore` and `compatibility`.
The managed root must not overlap external roots; `managed` is a reserved ID.
Register narrow skill roots, not whole home directories, backups or plugin caches.

Overrides: `--config` / `STASH_CONFIG`, `--managed-root` /
`STASH_MANAGED_HOME`, `--cache-dir` / `STASH_CACHE_DIR`.
`--root` selects a single temporary external catalog without a config.
`STASH_HOME` supplies one external catalog when no config exists.

Classification lives only in `<managedRoot>/.stash/catalog.json`, keyed by
exact ref and inspected SKILL.md hash. Use `classify` to change category/purpose;
it works for external refs without modifying those libraries. Source attribution
is separate from update provenance; only verified attribution may be recorded.

Cache contains one disposable aggregate snapshot. Missing/invalid cache or
changed registrations rebuild it; lifecycle writes invalidate it. Outside edits
require `refresh`. `read --expected-hash` still checks current content.

After configuration changes, run `refresh --json`. Use `doctor --json` to
diagnose malformed entries, stale classifications or coverage gaps. Unknown
categories/authors are visible gaps, not installation failures.
