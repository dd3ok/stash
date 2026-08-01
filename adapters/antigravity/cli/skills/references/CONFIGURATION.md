# Configuration

Read this reference only when Stash reports missing or invalid configuration.

Create the platform user config:

- Windows: `%APPDATA%\stash\config.yaml`
- macOS: `~/Library/Application Support/stash/config.yaml`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/stash/config.yaml`

Example:

```yaml
version: 1
managedRoot: "D:/skills/stash-managed"
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

No configuration file is required when only the managed inactive store is
used. Its default locations are:

- Windows: `%LOCALAPPDATA%\stash\managed`
- macOS: `~/Library/Application Support/stash/managed`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/stash/managed`

Override it with `managedRoot`, `STASH_MANAGED_HOME`, or `--managed-root`.
The managed store is automatically included as catalog id `managed` after it
exists. The router never edits any external configured catalog. Cache data is
stored in the platform cache directory or `STASH_CACHE_DIR`.

Catalog registration never grants lifecycle write authority. `install` may
read a selected skill inside a configured catalog and preserves its source.
When the managed store is part of the same resolve operation, hash-matching
source and Stash-owned deployment records are folded into the managed result's
`relatedCopies`. Drifted or unrelated records remain separate. A catalog-only
resolve still returns that catalog's own records, and their refs remain
readable.
