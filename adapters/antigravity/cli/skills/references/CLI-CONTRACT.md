# CLI contract

Read this reference only when interpreting CLI JSON or diagnosing a routing failure.

## Resolve statuses

| Status | Meaning | Agent action |
|---|---|---|
| `ok` | Relevant results exist | Continue |
| `no-match` | No result passed the relevance gate | Retry once with better terms or report none |
| `ambiguous-exact` | The same exact name exists in multiple locations | Add catalog/group or ask |
| `catalog-unavailable` | A configured catalog is missing or disabled | Report the configuration problem |
| `invalid-request` | Query or name is empty/invalid | Correct the call |
| `cursor-stale` | Index or query changed between pages | Restart the same search from page one |

`totalRelevant` counts every relevant result before pagination. `page.size` counts only the current transport page. `totalPossible` is diagnostic and does not belong in the default related list.

Resolve commands return records in `matches[]`; use `matches[0].ref` after a successful unambiguous exact lookup. A `nextCursor` appears at `page.nextCursor`. For inventory or all-related requests, repeat the same command and filters with `--cursor <nextCursor>` until that field is absent.

Each match may include `source.id`, `source.displayName`, `source.url`, `source.revision`, and `source.license`. Preserve these fields when attributing a skill. `--source <id|name|url>` is an exact provenance filter and may be repeated; it is independent of `--catalog` and `--group`. Repository forms such as `Owner/Repository` work when recorded as `source.displayName`. Comparison ignores Unicode and case differences but preserves punctuation; `foo-bar` does not match `foobar`.

## Relevance tiers

- `exact`: complete name or alias match.
- `strong`: phrase or multiple high-quality metadata signals.
- `material`: calibrated lexical score plus independent evidence.
- `possible`: weak or generic evidence; excluded by default.

Source IDs and display names are searchable evidence. Prefer `--source` when the user explicitly names an author or repository so unrelated skills cannot enter the result set.

## Read statuses

| Status | Meaning |
|---|---|
| `ok` | Content or a verified local path is available |
| `not-found` | Ref or resource does not exist |
| `hash-mismatch` | The file changed after resolution |
| `resource-outside-skill` | The requested path escaped the skill/catalog root |
| `quarantined` | Catalog policy blocks reading the skill |
| `unsupported-resource` | Content mode cannot safely return the resource |

Use `--expected-hash` when a workflow must guarantee that the skill selected during resolve is the skill read later.

## Lifecycle contract

Lifecycle commands use a Stash-owned managed root. They never write to an
external catalog.

- `install`/`import`/`add`: copy a local skill snapshot into the inactive
  managed store and preserve the source.
- `update`: compare the caller's expected current tree and revision, then
  transactionally replace an existing managed snapshot or advance provenance
  when its tree is unchanged. The stable `skillId` and deployment records remain.
- `archive`: store and verify an explicitly selected standalone skill, then
  remove that source from its discovery path.
- `activate`: copy a managed skill to a host discovery root and record
  `status: deployed`.
- `deactivate`: remove only a recorded deployment whose tree hash still
  matches.
- `status`: report orthogonal store, integrity, deployment, ownership, and host
  observation fields without claiming a host override is enabled.

`deployed` means present at a documented or explicit discovery root. Check
`reloadRequired` and `warning`. Plugin skills, untracked paths, drifted trees,
symlinks/junctions, overwrites, workspace targets, and all Antigravity CLI
flat-Markdown deployment are rejected. Every managed record has a stable
`skillId`; each deployment has its own ID plus the same `skillId`, Stash
ownership, target ID, and expected tree hash.

`update` returns `updated`, `metadata-updated`, or `already-current`. It requires
`--expected-tree-hash`; when the current source has a revision, it also requires
the matching `--expected-revision`. Remote provenance consists of a canonical
repository `--source-url`, a caller-resolved full 40- or 64-hex commit object ID
as `--revision`, and an exact
case-sensitive `--repository-path` (`.` means repository root). A content,
revision, or path change against recorded remote provenance requires the
recorded source URL. Changed remote content must use a new revision. A
mismatched tree or revision is a compare-and-swap conflict; a different URL or
recorded repository path is a provenance conflict. Legacy records without a
repository path remain usable for explicit single-skill operations but must be
skipped by all-managed automation rather than guessed.
Introducing a remote URL on a record that had none requires URL, full commit
object ID, and repository path together.
Update never mutates deployments. `outdatedDeployments` counts tracked copies
whose tree differs from the new managed tree, and `status` reports their
orthogonal presence/integrity plus `current: false`.

Content replacement uses a verified next tree, a verified previous-tree backup,
commit-time metadata/tree checks, and a lifecycle journal under a real-directory
managed metadata root. Recovery rolls back while the record names the old hash
and finalizes when the record names the new hash. Recursive cleanup is retried
only after the journal authorizes the exact operation-owned discard path. Any
other missing, linked, unexpected, or hash-mismatched path fails closed. This
handles interrupted processes; the CLI does not promise fsync-backed power-loss
durability.

When default resolution includes the managed catalog, `relatedCopies` lists
hash-matching preserved sources and Stash-owned deployments that were folded
into the managed canonical result. Catalog-scoped resolution still returns its
own record, raw refs remain readable, and drifted copies remain separate with a
warning.

Lifecycle lock metadata is atomically published. A proven-dead owner may be
reclaimed under a single-reclaimer guard; live or malformed ownership fails
closed. If a crashed reclaimer leaves the guard behind, follow
the repository maintenance procedure: stop lifecycle commands, verify both the
recorded PID and all Stash processes are absent, back up `.stash`, move the
guard to an external quarantine, trigger journal preflight with an idempotent
mutation, and verify `status`. Never delete a live/malformed main lock or edit a
journal.

## Exit codes

- `0`: command completed, including a normal `no-match`.
- `2`: invalid CLI input or configuration.
- `3`: security rejection.
- `4`: catalog or file I/O failure.
- `5`: unsupported schema/index version.
- `10`: unexpected internal error.
