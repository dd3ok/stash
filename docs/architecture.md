# Architecture

Two public modules keep read and mutation authority separate:

- `StashCatalog`: list/filter, exact lookup, safe read, refresh and diagnostics.
- `StashLifecycle`: install/update/archive/activate/deactivate/uninstall, classify
  and status. Catalog registration never grants lifecycle write authority.

## Data ownership

```text
config.yaml                   external roots + optional locations/page size
managed/<name>/               canonical inactive skill files
managed/.stash/records/       provenance, tree hashes, deployment ownership
managed/.stash/catalog.json   hash-bound local category/purpose/attribution
managed/.stash/revision       mutation generation
cache/catalog.json            disposable aggregate view
```

Each field has one local owner: classification is not in config or copied into
skill frontmatter. Upstream sidecars may supply trust, compatibility and source
evidence; recorded provenance wins over local display attribution.
Unknown classification stays visible. A changed SKILL.md invalidates its saved
purpose/category, without changing the skill's activation state.

A ref is `catalog-id:relative-directory`; it changes when a directory moves.
A managed `skillId` remains the stable lifecycle identity across updates.
Storage catalog, functional category and source package are independent.

## Retrieval

```text
explicit request → summary → category/source cards → host-agent judgment
                 → user choice → exact ref + current hash → safe read
```

Exact lookup matches name/ref after Unicode/case normalization, preserving
punctuation. List applies exact category/source filters and optional literal
substring filtering. No weights, synonym dictionary, typo rules or relevance
tiers exist. The current host agent interprets language and judges fit.

Cards contain no skill body. Full descriptions are available through exact
lookup before selection. Pagination never caps the total matching inventory.
Semantic quality still depends on metadata and the host model; retrieval tests
do not certify semantic judgment.

## Cache

One aggregate JSON snapshot includes scan results, verified copy projection and
local classification. Warm reads load this file and check configuration plus a
small lifecycle revision; they do not reopen every skill or lifecycle record.

Missing/corrupt cache and configuration changes rebuild it. Lifecycle writes
invalidate it; reads refuse an active lifecycle lock. Builders compare revision
before/after scanning and atomically publish only a consistent snapshot.
Concurrent readers can duplicate a rebuild; no daemon or extra locking service
is needed. Cursors bind filters and snapshot content, not refresh timestamps.
The same snapshot records per-catalog scan failures. A scoped lookup or exact
ref can use healthy catalogs; requests needing an unavailable catalog report
`catalog-unavailable`, never a misleading complete count. `refresh` reports
`partial`/`failed` for its selected roots and retries recovered folders.

Outside edits require explicit `refresh`; there is no TTL polling.
Safe reads rescan the selected catalog, enforce current quarantine/path guards,
and verify the selected file hash. They do not trust cached bodies or paths.

Projection folds only recorded source/deployment paths with matching tree
hashes. Drifted/unrelated copies remain separate. This integrity work happens
on rebuild, not every list. `doctor` performs a fresh read-only scan.

## Lifecycle safety

Existing lifecycle transactions retain ownership checks, portable-tree
validation, compare-and-swap updates, contained staging, recovery journals,
tracked copy deployments and drift-preserving refusal. Classification uses the
same mutation lock but never changes skill files or host settings.
Uninstall removes its local classification as well as the owned tree/record.

Discarded skill trees use OS recycling with no permanent-delete fallback;
transient lock/journal metadata has ordinary atomic cleanup. Interrupted-process
recovery is supported; fsync/power-loss durability is not promised.
Deployment presence does not prove that a host enable/disable override is on.

The full mutation contract lives in
[CLI-CONTRACT.md](../skills/stash/references/CLI-CONTRACT.md).
Vendor packaging is generated; audited host paths live only in
`internal/lifecycle-host-policy.ts`.

## Deliberately absent

No second model API, embeddings, database, background watcher, semantic scoring,
autonomous network updater or compatibility layer. Add infrastructure only when
a measured workload requires it.
