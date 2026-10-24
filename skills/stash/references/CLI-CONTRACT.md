# CLI contract

## Retrieval

`exact` resolves an actual name or catalog ref. Name collisions are
`ambiguous-exact`; never choose the first automatically.
`list` returns deterministic cards, not ranked recommendations.
`--text` is a literal substring; category filters are exact, case-insensitive
IDs. Multiple categories or sources are OR filters; different dimensions are AND.

`--source` matches an ID, display name or URL; a unique GitHub repository or
owner/repository shortcut is also accepted. Ambiguous shortcuts do not broaden
the scope. Repository identity ignores GitHub case and terminal .git, but
explicit URLs preserve exact provenance matching.

Result schema 2: `total` is the complete filtered count; `matches` holds this
page, `page.nextCursor` continues it. Pagination is not a total-result limit.
List defaults to compact cards (50/page, descriptions up to 240 characters).
`--view full` includes hashes, compatibility and complete category/source counts.
`--view summary` omits members/cursor. `exact` includes the full description.
No relevance tiers, score thresholds or query expansion exist.

Statuses: `ok`, `no-match`, `ambiguous-exact`, `catalog-unavailable`,
`invalid-request`, `cursor-stale`. No-match means no literal/filter match,
not absence of a semantically suitable skill. A cursor is bound to its filters
and snapshot contents. `diagnostics.snapshotAt` reports when the view was built;
it is not a guarantee that outside files have not changed since then.

## Read and freshness

`read --expected-hash` checks the current file, not cached content.
Read statuses: `ok`, `not-found`, `hash-mismatch`,
`resource-outside-skill`, `quarantined`, `unsupported-resource`.
Traversal, escaping links, oversized text and binary content are rejected.
A verified `--format path` does not authorize execution.

`refresh` rebuilds the aggregate snapshot. Use it after outside edits or a hash
mismatch, not before every list. `doctor` is an on-demand, read-only scan.

## Classify

`classify <ref> --expected-hash <hash> --group <slug> --purpose "<one line>"`
records local metadata through StashLifecycle. Purpose is 1–240 characters.
Category uses lowercase words separated by hyphens or slashes.
The ref must exist and the current file hash must match. Classification never
changes skill files, trust, source revisions, ownership or activation.
A changed SKILL.md invalidates its classification until reviewed.
Attribution cannot overwrite provenance already recorded in the source.

## Lifecycle contract

Lifecycle commands write only to Stash-owned managed storage or an explicitly
selected supported standalone host target. Catalog registration never grants
write authority. Use `node <stash-cli> help` for the exact syntax.

### Common preconditions

- `install` and `update` accept a local directory containing `SKILL.md`
  directly. The CLI does not fetch remote URLs.
- A remote identity is either absent or supplied as one complete set:
  canonical `source-url`, caller-resolved immutable 40- or 64-hex `revision`,
  exact case-sensitive `repository-path` (`.` for the repository root), and
  exact `tracking-ref` (`HEAD`, `refs/heads/...`, or `refs/tags/...`).
- Partial remote provenance is invalid. A record with no remote provenance is
  local-only; never guess or enrich its lineage during a bulk update.
- Stage remote content in a new temporary directory outside every host skill
  discovery path. Resolve only the requested or recorded tracking ref, inspect
  the exact skill root, require matching frontmatter name, and do not execute
  repository content.
- Preserve a failed external staging directory for diagnosis. Remove it only
  after a successful lifecycle result.
- Stop on lock, journal, ownership, containment, link, or hash errors. Do not
  delete or edit lifecycle metadata to bypass a failure.
- Discarded skill trees go to the operating system's Recycle Bin or Trash.
  Recycling failures preserve the remaining path and are reported through the
  existing error or cleanup warning. There is no permanent-delete fallback.

### Install

`install` copies a verified local snapshot into the inactive
managed store and preserves the source. When importing staged repository
content, pass the complete remote identity. If a safe tracking ref is unknown,
install without remote provenance and report that bulk update cannot infer it.

### Update

1. Run `status <name> --json`.
2. Stage and inspect the replacement outside host discovery.
3. Pass `--expected-tree-hash` from current status and
   `--expected-revision` when a current revision exists.
4. For remote content, pass the recorded source URL, exact repository path and
   tracking ref, plus the newly resolved immutable revision. Changed remote
   content requires a different revision.

URL syntax is canonicalized; repository path and tracking ref spelling and
case are exact identities. Update returns:

| Status | Meaning |
|---|---|
| `updated` | The managed tree was replaced |
| `metadata-updated` | The tree stayed equal and provenance advanced |
| `already-current` | Tree and requested provenance were unchanged |

Update preserves `skillId` and never rewrites deployments. Report
`outdatedDeployments`; refresh a stale deployment only through an explicit
`deactivate` followed by `activate`.

For an all-managed update, get unfiltered `status` and select only records with
all four remote fields. Group by canonical repository URL and exact tracking
ref, stage each pair once, and resolve only that recorded ref. For each record,
use only its exact repository path and require its `SKILL.md` name to match.
Run `update` for changed trees and for equal trees whose immutable revision
advanced. Skip no-provenance records as `local-only`; stop on a partial record.
Each record commits independently, so report successes, skips, and failures.

### Archive, activate, and deactivate

- `archive` verifies and stores one exact standalone skill before removing its
  source from a documented user discovery root. It never archives a
  plugin-contained skill. A verified Stash deployment uses tracked
  deactivation semantics and keeps the canonical copy.
- `activate` copies a managed skill to a supported user discovery root and
  records a deployment.
- `deactivate` removes only a recorded deployment whose Stash ownership,
  `skillId`, deployment ID, target, and tree hash all match. Preserve untracked
  or drifted content.
- Workspace targets, custom host roots, and Antigravity CLI's flat-file
  standalone layout are unsupported. Plugin lifecycle and host settings remain
  owned by the host.
- Honor `reloadRequired` and `warning` after a discovery-path change.

### Uninstall

`uninstall <name>` removes only the verified Stash-managed canonical copy and
its lifecycle record. It never removes an external catalog source, host
deployment, plugin, or host setting. Every recorded deployment must first be
removed explicitly with `deactivate`, including a deployment already reported
missing. If the managed directory is already missing, a valid zero-deployment
record is removed with a warning. Hash drift, links, files, special paths, and
invalid metadata fail closed and are preserved for diagnosis. There is no
`--force`, automatic deactivation, Stash-specific trash store, or restore
command. The operating system owns recycling; restoring files does not
automatically restore Stash ownership or deployment records.

### Status

`status [name] --json` reports store presence, tree integrity, deployment
presence, Stash ownership, whether a deployment is current, and host
observation as separate fields. Host override state can remain `unknown`.

When managed and catalog records represent the same verified tree,
`relatedCopies` folds the preserved source or Stash deployment into the managed
canonical result. Drifted or unrelated copies remain separate with a warning.

## Exit codes

- `0`: completed, including normal `no-match`.
- `2`: invalid input or configuration.
- `3`: security rejection.
- `4`: catalog or filesystem failure.
- `5`: unsupported schema or index version.
- `10`: unexpected internal error.
