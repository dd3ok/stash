# Routing and evaluation

## Exact lookup

Exact lookup normalizes Unicode, case, whitespace, hyphens, and underscores,
then checks the skill name and aliases within any explicit source, catalog, or
group filters. It does not use natural-language reranking.

## Discovery

Discovery uses a local BM25F-style lexical score across name, aliases, intents,
tags, examples, description, source, and group. A score alone does not make a
result relevant: the evidence gate also requires a phrase, multiple independent
signals, or one specific term in a high-value field. Weak generic matches stay
`possible` and are excluded by default.

Use `--source` when the user names an author or repository. Source comparison
is Unicode- and case-normalized but preserves punctuation.

## Relevant results

```text
all-relevant = exact + strong + material
```

This is neither a fixed top-k nor the whole catalog. Pagination limits one
response, not the relevant set. A cursor binds the index fingerprint, routing
profile, request, filters, and next offset; restart from page one after
`cursor-stale`.

## Evaluation authority

`tests/routing-golden.test.ts` is the executable behavior gate. It covers exact
names and aliases, Korean and English discovery, specialist and umbrella
distinctions, no-match queries, false activations, and pagination. Add a real
failing query before changing routing behavior.

`npm run bench` reports indexing and lookup timing on a synthetic catalog. Run
it for routing changes and on main; it is not a universal pull-request gate or
a portable performance claim.

## Tuning policy

1. Capture the failure in the golden test.
2. Prefer metadata corrections before algorithm complexity.
3. Tune against the entire golden set, including negative cases.
4. Compare task success before token or latency savings.
5. Add semantic reranking only after repeated measured lexical failures.
6. Version intentional routing-profile changes.
