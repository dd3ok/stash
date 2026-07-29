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

Validate the Codex skill and plugin with the repository's documented validator commands before opening a pull request.

## Change rules

- Keep the `StashCatalog` Interface small.
- Keep vendor logic out of core search and path handling.
- Add a failing golden or Interface test before changing relevance behavior.
- Preserve no-match abstention.
- Preserve all-relevant totals independently from page size.
- Never add catalog mutation to a read path.
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
