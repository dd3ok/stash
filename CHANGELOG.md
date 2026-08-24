# Changelog

## Unreleased

- Add a separate `StashLifecycle` Module with a local managed inactive store.
- Add explicit local `install`/`archive`/`activate`/`deactivate`/`status`
  commands with provenance, tree hashes, tracked deployments, and drift guards.
- Add guarded local `update` with tree/revision compare-and-swap, source identity
  checks, no-copy metadata advances, recoverable replacement journals, and
  explicit outdated-deployment reporting without automatic deployment mutation.
- Add stable skill/deployment identities, explicit ownership and target records,
  orthogonal status fields, archive journals, guarded dead-owner lock recovery,
  and fail-closed malformed lock handling.
- Fold hash-matching catalog sources and Stash-owned deployments into the
  managed canonical search result while preserving scoped lookup and raw reads.
- Reject workspace lifecycle and Antigravity CLI's flat standalone skill shapes.
- Restrict lifecycle deployment roots to documented vendor user directories;
  arbitrary custom roots are no longer part of the public contract.
- Reject managed-store overlap with configured catalogs, including canonical
  aliases, and fail closed when a lock owner's process state is unknown.
- Make archiving a verified tracked deployment deactivate it coherently while
  preserving the managed canonical copy.
- Harden portable path validation and managed-record projection validation.
- Keep external catalogs, plugins, and vendor settings outside lifecycle write
  authority; reject links, overwrites, detached removals, and remote sources.
- Make a fresh Stash installation useful without catalog configuration by
  auto-discovering its managed store after the first import.
- Unify the public brand, package, repository, and marketplace identifiers as Stash.
- Reject partial-word compact-name matches that promoted unrelated short queries.
- Restore material routing for dense three-term descriptions at a regression-tested threshold.
- Derive generated Adapter versions from the package manifest.
- Fail validation on stale or orphaned generated Adapter files.
- Add source provenance metadata, attribution, and explicit source-scoped routing by ID, repository display name, or URL.
- Version the source-aware index and routing profile, including cursor invalidation and executable golden cases.
- Keep valid ID-less sources in distinct list-output groups.

## 0.1.0

- Publish Stash with `stash` as the invocation ID.
- Add a read-only `StashCatalog` Module and CLI.
- Add deterministic exact lookup and evidence-gated lexical discovery.
- Add complete relevant result counts with cursor pagination.
- Add safe resource reads, hash checks, quarantine, and path containment.
- Add generated Codex, Claude Code, and Antigravity Adapters.
- Add synthetic multilingual fixtures and Interface/security tests.
