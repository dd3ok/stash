# CLI contract

Read this reference before a lifecycle mutation or when interpreting CLI JSON,
pagination, or a failure.

## Resolve and read

### Resolve statuses

| Status | Meaning | Action |
|---|---|---|
| `ok` | Relevant results exist | Continue |
| `no-match` | Nothing passed the relevance gate | Retry once with better terms or report none |
| `ambiguous-exact` | One exact name exists in multiple locations | Add a supplied filter or ask |
| `catalog-unavailable` | A catalog is missing or disabled | Report the configuration problem |
| `invalid-request` | Input is empty or invalid | Correct the call |
| `cursor-stale` | The query or index changed between pages | Restart from page one |

`totalRelevant` is the full relevant count. `page.size` is the current page and
`page.nextCursor` continues the same request. Resolve records are in
`matches[]`; after an unambiguous exact lookup use `matches[0].ref`.

Relevant tiers are `exact`, `strong`, and `material`. `possible` is weak
diagnostic evidence and is excluded by default. Preserve source attribution
from `source.id`, `source.displayName`, `source.url`, `source.revision`, and
`source.license`. `--source <id|name|url>` is an exact provenance filter.

### Read statuses

| Status | Meaning |
|---|---|
| `ok` | Verified content or a local path is available |
| `not-found` | The ref or resource does not exist |
| `hash-mismatch` | Content changed after resolution |
| `resource-outside-skill` | The resource escaped its skill or catalog root |
| `quarantined` | Catalog policy blocks access |
| `unsupported-resource` | The requested representation is unsafe or unsupported |

Use `--expected-hash` when the selected content must not change between resolve
and read.

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

### Install

`install`/`import`/`add` copy a verified local snapshot into the inactive
managed store and preserve the source. When importing staged repository
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
