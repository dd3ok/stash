# Maintenance and release gates

## Source of truth

- `src/` owns catalog, routing, cache, and path-security behavior.
- `skills/stash/SKILL.md` is the canonical portable workflow.
- `skills/stash/agents/openai.yaml` is Codex-only policy.
- `scripts/build-adapters.mjs` owns every generated vendor artifact.
- `adapters/` and `skills/stash/scripts/stash.mjs` are generated outputs.

Never hand-edit a generated Adapter. Change the canonical source or generator,
run `npm run build`, and verify `npm run lint:artifacts`.

## Pull request gates

Run:

```bash
npm ci
npm run test:all
npm run bench
npm run pack:check
```

The routing benchmark uses generous regression budgets rather than advertising a
portable latency guarantee. Record exact hardware and catalog shape for any
performance claim.

When the Codex authoring tools are available, also run:

```text
python <skill-creator>/scripts/quick_validate.py skills/stash
python <plugin-creator>/scripts/validate_plugin.py .
python <plugin-creator>/scripts/validate_plugin.py adapters/codex
```

These external Python validators require PyYAML in the selected environment.
On Windows, set `PYTHONUTF8=1` if the validator inherits a legacy code page.

## Vendor contract review

Before changing a support claim:

1. read the current first-party skill and plugin documentation;
2. update only the relevant Adapter;
3. build in a clean checkout;
4. test against a fresh session of the target binary;
5. record the binary version and invocation used;
6. update `docs/vendor-support.md`.

Do not infer support from unknown frontmatter being ignored. Codex and Claude
have documented manual-only controls; Antigravity currently does not.

## Lifecycle lock repair

Normal dead-owner recovery is automatic. A crash while holding the short-lived
`.stash/lifecycle.reclaim` guard intentionally fails closed rather than guessing
that no reclaimer is alive. Repair it only after all of these checks:

1. stop Stash lifecycle commands and confirm no Stash process is running;
2. inspect `.stash/lifecycle.lock/owner.json` and confirm its PID is absent;
3. copy the entire `.stash` metadata directory to a backup outside the managed
   root;
4. move `lifecycle.reclaim` to a uniquely named quarantine outside `.stash`
   instead of deleting it;
5. run one non-destructive lifecycle mutation such as an idempotent `install`,
   allowing the lock preflight to recover any archive or update journal;
6. run `stash status --json` and retain the quarantine until state is verified.

Never remove a live owner, treat PID age as proof, edit a journal, or overwrite
an occupied archive source. A malformed main `lifecycle.lock` also requires
manual inspection and remains fail-closed.

## Routing changes

Every scoring change needs:

- a positive fixture;
- a nearby negative fixture;
- a no-match fixture;
- pagination coverage when the relevant set changes;
- a run against a representative real catalog;
- before/after benchmark results.

Prefer sidecar aliases, intents, and examples over adding language-specific
runtime dependencies. Add embeddings or a second model only after a measured
lexical failure set justifies their operational cost.

## Security changes

Preserve these invariants:

- catalog operations are read-only; explicit archive/deactivate authority is
  limited to the exact standalone target or verified Stash-owned deployment;
- managed storage never overlaps an external catalog by equality, nesting, or
  filesystem alias;
- lifecycle writes are limited to the managed root and explicit standalone
  targets;
- lifecycle never overwrites, follows links, or deletes untracked/drifted paths;
- staged copies, update backups, and destructive tombstones are hash-verified;
- archives and changed-tree managed updates are journaled and recover
  deterministically without overwriting an occupied source or managed path;
- updates compare the caller's expected tree/revision, preserve source identity,
  and never rewrite deployment copies implicitly;
- stable skill/deployment IDs, ownership, targets, and hashes must agree before
  withdrawal;
- hash-matching catalog sources and Stash-owned deployments fold into the
  managed search projection; drifted or unrelated copies remain visible;
- lock ownership is atomically published, dead owners are reclaimed under a
  separate guard, and malformed/live owners fail closed;
- reads use refs and relative resources;
- `realpath` containment is checked after symlink resolution;
- content reads are bounded;
- scripts are never executed by Stash;
- cache files are regenerable and atomically replaced;
- trust labels do not grant host permissions.

Review changes to catalog traversal, path handling, archives, or remote sources
as security-sensitive.
