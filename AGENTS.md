# Repository guidance

- Keep `StashCatalog` as the only public core Module Interface.
- Keep vendor behavior inside `adapters/` generation and contract tests.
- Treat configured catalogs as read-only; write only regenerable cache data.
- Preserve exact lookup as a deterministic path before discovery search.
- Never impose a fixed cap on total relevant results; pagination is transport only.
- Do not add vector search, an LLM router, a daemon, telemetry, or catalog mutation without measured evidence and an explicit scope decision.
- Run `npm run test:all` after behavior changes.
- Run both skill and plugin validators after changing generated plugin artifacts.
- Update golden routing fixtures whenever relevance behavior intentionally changes.
