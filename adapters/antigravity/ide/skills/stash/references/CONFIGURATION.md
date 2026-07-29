# Configuration

Read this reference only when Stash reports missing or invalid configuration.

Create the platform user config:

- Windows: `%APPDATA%\stash\config.yaml`
- macOS: `~/Library/Application Support/stash/config.yaml`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/stash/config.yaml`

Example:

```yaml
version: 1
catalogs:
  - id: personal
    root: "D:/skills/stash"
    enabled: true
    trust: reviewed
    followSymlinks: false
    compatibility:
      - codex
      - claude-code
      - antigravity
defaults:
  pageSize: 40
  cacheTtlMs: 30000
  materialScoreThreshold: 2
  locale: ko-KR
```

Alternatives:

- Set `STASH_CONFIG` to an explicit config file.
- Set `STASH_HOME` for a single temporary default catalog.
- Pass `--root <path>` to one CLI call.

Run `stash doctor --json`, then `stash index --json` after configuring a catalog.

The router never edits the configured root. Cache data is stored in the platform cache directory or `STASH_CACHE_DIR`.
