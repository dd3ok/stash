# Contributing

## Development

```bash
npm install
npm run test:all
```

After changing the canonical skill:

```bash
npm run build
npm run lint:artifacts
```

Validate the Codex skill and plugin with the commands and prerequisites in
[`docs/maintenance.md`](docs/maintenance.md) before opening a pull request.

## Change rules

- Keep the `StashCatalog` read Interface and `StashLifecycle` write Interface
  small and authority-separated.
- Keep vendor packaging in generated Adapters. Centralize the narrow lifecycle
  host-path/reload policy in `src/internal/lifecycle-host-policy.ts`, and keep it
  out of catalog search and safe-read path handling.
- Add a failing golden or Interface test before changing relevance behavior.
- Preserve no-match abstention.
- Preserve all-relevant totals independently from page size.
- Never add catalog mutation to a read path. An explicit lifecycle archive may
  mutate only the exact standalone target selected by the caller; a catalog
  registration never grants that authority.
- Do not add remote calls or telemetry by default.
- Update `docs/vendor-support.md` only from current first-party documentation and live contract tests.

## Pull request evidence

Include:

- behavior changed;
- tests added;
- routing metric impact when applicable;
- Windows/macOS/Linux impact;
- generated artifact drift result;
- vendor binary versions tested;
- security impact.
