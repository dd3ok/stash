# Contributing

## Development

```bash
npm ci
npm run test:all
```

`test:all` checks the committed generated artifacts, source behavior, types,
the production build, and the bundled distribution. Change canonical sources,
run `npm run build`, and commit the regenerated outputs; never hand-edit
`adapters/` or `skills/stash/scripts/stash.mjs`.

## Change rules

- Keep `StashCatalog` read-only and keep explicit writes behind
  `StashLifecycle`.
- Preserve deterministic exact lookup, no-match abstention, and all-relevant
  totals independent of page size.
- A catalog registration never grants lifecycle write authority.
- Keep vendor packaging in generated adapters and lifecycle host policy in
  `src/internal/lifecycle-host-policy.ts`.
- Add or update behavior tests when a public result or security boundary
  changes. Do not test documentation wording.
- Do not add remote calls, telemetry, or routing complexity without evidence
  from a real failing workload.

## Pull request evidence

Always state the behavior changed and the tests run. Add only the evidence that
matches the change:

- routing results and `npm run bench` for routing changes;
- security impact for path, lifecycle, provenance, lock, or recovery changes;
- vendor validator and live version for metadata, packaging, or support claims;
- platform impact when filesystem behavior changes.

See [maintenance](docs/maintenance.md) for the matching commands.
