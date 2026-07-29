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

- catalogs are read-only;
- reads use refs and relative resources;
- `realpath` containment is checked after symlink resolution;
- content reads are bounded;
- scripts are never executed by Stash;
- cache files are regenerable and atomically replaced;
- trust labels do not grant host permissions.

Review changes to catalog traversal, path handling, archives, or remote sources
as security-sensitive.
