# Maintenance

## Source of truth

- `src/`: catalog, routing, lifecycle, cache, and path behavior.
- `skills/stash/SKILL.md`: portable agent workflow.
- `skills/stash/references/`: machine-facing CLI and configuration contracts.
- `skills/stash/agents/openai.yaml`: Codex-only invocation policy.
- `scripts/build-adapters.mjs`: generated vendor packaging.

`adapters/` and `skills/stash/scripts/stash.mjs` are generated. Change their
canonical source, run `npm run build`, and commit the result.

## Pull request checks

Run the fast, complete project check:

```bash
npm ci
npm run test:all
```

Run additional checks only when their surface changes:

| Change | Additional check |
|---|---|
| routing, scoring, or golden cases | `npm run bench` |
| package contents or release preparation | `npm run pack:check` |
| canonical skill metadata | `python <skill-creator>/scripts/quick_validate.py skills/stash` |
| Codex plugin metadata or layout | `python <plugin-creator>/scripts/validate_plugin.py .` and the generated Codex adapter |
| vendor support claim | fresh session on the named vendor binary and record its version |

The Python validators require PyYAML. On Windows, set `PYTHONUTF8=1` when the
selected Python environment uses a legacy code page.

The benchmark is diagnostic evidence for routing changes. Do not use its timing
as a portable latency claim without recording hardware and catalog shape.

## Routing changes

Update `tests/routing-golden.test.ts` with the real failing case, a nearby
negative, and a no-match case. Cover pagination when the relevant set changes.
Prefer metadata or weight changes over a new routing subsystem.

## Security changes

Review [SECURITY.md](../SECURITY.md) and run the lifecycle tests when changing
path handling, managed writes, provenance, locks, journals, or recovery. Keep
cross-platform CI for these changes because link, rename, realpath, and lock
behavior differs by operating system.

## Vendor contract review

Before changing a support claim, read current first-party documentation, change
only the relevant adapter source, build, test a fresh target session, and record
the version and invocation. File validation alone does not prove live support.

## Lifecycle lock repair

Normal dead-owner recovery is automatic. If a crash leaves
`.stash/lifecycle.reclaim`, fail closed and repair only after every step below:

1. Stop lifecycle commands and confirm no Stash process is running.
2. Inspect `.stash/lifecycle.lock/owner.json` and confirm its PID is absent.
3. Back up the entire `.stash` directory outside the managed root.
4. Move `lifecycle.reclaim` to a uniquely named external quarantine; do not
   delete it.
5. Run an idempotent lifecycle mutation so journal preflight can recover.
6. Run `stash status --json` and keep the quarantine until state is verified.

Never remove a live or malformed owner, infer liveness from age, edit a
journal, or overwrite an occupied archive source.
