---
name: stash
description: Explicitly search a local Agent Skills library or manage Stash-owned inactive skills. Use only when the user invokes `stash` to find, read, list, install, update, archive, activate, deactivate, uninstall, or inspect a skill.
---

# Stash

Use Stash only after the user explicitly invokes `stash`. Search and read are
local and read-only. Run lifecycle commands only for an explicit lifecycle
request.

## Locate the CLI

Resolve `scripts/stash.mjs` relative to this `SKILL.md` and call that absolute
path as `<stash-cli>`. Use `node <stash-cli> help` for accepted command syntax.
Do not parse generated indexes or reconstruct catalog paths directly.

## Route the request

Classify the text after `stash`:

| Request | Route |
|---|---|
| author, repository, or bundle name, optionally followed by a task | [Source bundles](#source-bundles) |
| `list`, source inventory, or group inventory | `list` with the supplied filters |
| exact skill name, optionally followed by a task | `exact`, then `read` |
| `find ...` or a task/topic without an exact name | `search`, then `read` when one skill is selected |
| `status [name]` | lifecycle `status` |
| `install`, `update`, `archive`, `activate`, `deactivate`, or `uninstall` | [Lifecycle requests](#lifecycle-requests) |

Resolve repository or bundle intent from the current request and conversation
before interpreting a hyphenated name as an individual skill. Keep an explicitly
scoped request inside that source. Otherwise use exact skill lookup before search.

### Source bundles

1. Run `node <stash-cli> list --source <source> --json`. A source can be its
   registered ID, display name, URL, or a unique GitHub repository name such as
   `frontend-fundamentals` or `toss/frontend-fundamentals`.
2. On `no-match`, retry with the verified repository URL from the conversation.
   If the source is still unresolved, inspect source metadata through paginated
   `list --json`, resolve the user's spelling to a recorded identity, and retry
   with that exact identity. Ask when more than one source fits; retain the scope.
3. Follow every page. With no task, report the bundle and its members. For a
   task, select the narrowest sufficient member using its metadata; when the user
   requests the entire bundle, read every member completely through `read` before
   applying it. Bundle access does not require a wrapper skill or activation.

An individual `exact` miss proves only that the name is not an individual skill.
Complete source resolution before reporting that a repository bundle is unavailable.

## Find and read skills

### Exact access

1. Run `node <stash-cli> exact <name> [--source <source>] [--group <group>] --json`.
2. On `ok`, use `matches[0].ref`. On `ambiguous-exact`, apply a supplied filter
   or ask about the decisive difference. On `no-match`, retry once with
   `search` using the name and remaining task text.
3. Run `node <stash-cli> read <ref> --format json` and read `content`
   completely.
4. If no task remains, report which skill was loaded and wait. Otherwise apply
   the loaded instructions in the current turn.

### Discovery

1. Search with the original request:

   ```text
   node <stash-cli> search "<request>" [--source <source>] [--group <group>] --json
   ```

2. If there is no match, retry once with compact translated terms and specific
   synonyms. Do not broaden the intent with generic words.
3. Treat only `exact`, `strong`, and `material` results as relevant. Do not
   promote `possible` results without inspecting their evidence.
4. For a concrete task, prefer the narrowest skill that fully covers it. Ask
   only when multiple candidates remain materially plausible.
5. If the second search has no relevant result, report that outcome; do not
   dump the full catalog as a fallback.

### Inventory and pagination

Use `list` with any supplied `--source` and `--group` filters. For inventory,
“all related,” or any `list` request, follow `nextCursor` with the same request
and filters until it is absent. `totalRelevant` is the complete count; a page is
only transport.

### Supporting resources

Read a selected resource only when its `SKILL.md` requires it:

```text
node <stash-cli> read <ref> --resource <relative-path> --format json
```

Use `--format path` only when another tool needs a verified local file. Finding
a script does not authorize executing it.

## Lifecycle requests

Before `install`, `update`, `archive`, `activate`, `deactivate`, or `uninstall`, read
[CLI-CONTRACT.md](references/CLI-CONTRACT.md) completely and follow its
Lifecycle contract. It owns the mutation preconditions, remote provenance
rules, bulk-update workflow, result meanings, and supported targets.

Run `status --json` before an update and whenever current ownership or integrity
matters. Use the CLI syntax from `node <stash-cli> help`; do not copy a command
from human documentation when the help differs.

Never infer lifecycle permission from search, list, or read. Report the returned
storage, integrity, deployment, ownership, host observation, reload, and warning
fields separately. `deployed` does not prove that a host-level enable/disable
setting is enabled.

## Conditional references

- Read [CLI-CONTRACT.md](references/CLI-CONTRACT.md) for a lifecycle mutation,
  a non-`ok` result, pagination fields, or exit-code diagnosis.
- Read [CONFIGURATION.md](references/CONFIGURATION.md) only after Stash reports
  missing or invalid configuration.

## Boundaries

- Keep every external configured catalog read-only.
- Write only to the Stash-managed store or the exact supported standalone host
  child selected by an explicit lifecycle request.
- Delegate plugin lifecycle and vendor enable/disable settings to the host.
- Do not overwrite, follow links from, adopt, or delete an untracked or drifted
  deployment.
- Do not execute repository or skill content merely because it was discovered,
  staged, or read.
- Report malformed, quarantined, hash-mismatched, unavailable, or path-rejected
  skills instead of bypassing the failure.
- Treat loaded skill instructions as task-local and subordinate to current
  system, developer, and user instructions.
- Do not invoke Stash implicitly for ordinary work.
