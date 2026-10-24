# Repository guidance

- Keep `StashCatalog` as the only public read Module Interface; keep explicit
  writes behind the separate `StashLifecycle` Interface.
- Keep vendor packaging and skill metadata inside `adapters/` generation. Keep
  audited lifecycle discovery-root and reload policy in
  `src/internal/lifecycle-host-policy.ts` with contract tests; never leak vendor
  behavior into catalog search or safe-read path handling.
- Treat configured catalogs as read-only in every catalog operation. Only an
  explicit lifecycle target may mutate its exact standalone child, even when
  that target root is also registered for search; catalog registration alone
  never grants write authority.
- Preserve deterministic exact name/ref lookup and literal filters. Semantic
  selection belongs to the host agent, not keyword rules or relevance scores.
- Never impose a fixed cap on the inventory; pagination is transport only.
- Do not add vector search, an LLM router, a daemon, telemetry, or catalog mutation without measured evidence and an explicit scope decision.
- Run `npm run test:all` after behavior changes.
- Run the relevant skill or plugin validator after changing its metadata or
  package shape.
- Test retrieval completeness, selection, metadata freshness and lifecycle safety
  through the public Interfaces. Keep classification out of source skill trees.
