# Changelog

## Unreleased

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
