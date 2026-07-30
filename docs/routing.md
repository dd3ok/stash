# Routing and evaluation

## Contents

- [Exact lookup](#exact-lookup)
- [Discovery](#discovery)
- [All relevant](#all-relevant)
- [Pagination](#pagination)
- [Evaluation](#evaluation)
- [Tuning policy](#tuning-policy)

## Exact lookup

Exact lookup normalizes Unicode, case, whitespace, hyphens, and underscores, then checks:

1. skill name;
2. explicit aliases;
3. optional source/catalog/group filters.

It never invokes natural-language reranking.

## Discovery

Current routing profile: `2`.

Discovery uses BM25F-style scoring with initial weights:

| Field | Weight |
|---|---:|
| name | 6.0 |
| aliases | 6.0 |
| intents | 3.0 |
| tags | 3.0 |
| positive examples | 2.0 |
| description | 1.5 |
| source | 6.0 |
| group | 0.5 |

A score alone cannot make a result relevant. The evidence gate also requires:

- phrase evidence in name/alias; or
- multiple query terms across multiple fields with a high-priority field; or
- a single specific term in name, alias, intent, or tag.

Description-only and group-only generic matches remain `possible`. An exact source ID or display name is strong provenance evidence. Use an explicit source filter when the request names an author or repository; the filter accepts an exact source ID, display name, or URL. Source comparison is Unicode- and case-normalized but preserves punctuation, so `foo-bar` and `foobar` remain different sources.

Negative examples reduce the score. Character trigram similarity is a fallback only when no normal result is relevant.

## All relevant

```text
all-relevant = exact + strong + material
```

It is not:

- every substring match;
- a fixed top five;
- a fixed top-k;
- the full catalog.

The router returns every record that passes the evidence gate. This makes recall and precision separately measurable.

## Pagination

Pagination limits one response, not the result set.

Cursor contents bind:

- index fingerprint;
- routing profile version;
- normalized request;
- filters;
- `includePossible`;
- next offset.

A changed query or index returns `cursor-stale`. Restart from page one instead of mixing result generations.

## Evaluation

Maintain a golden JSONL set with:

- exact names and aliases;
- Korean, English, and mixed-language discovery;
- single and multiple relevant skills;
- umbrella versus specialist distinctions;
- broad generic queries;
- no-skill queries;
- typos;
- negative examples.

Track:

- exact accuracy;
- all-required recall;
- relevant precision;
- no-skill precision;
- false activation;
- p50/p95 core and CLI latency;
- output bytes;
- final task success in fresh vendor sessions.

Suggested pre-release gates:

- exact accuracy: 100%;
- all-required recall: at least 95%;
- relevant precision: at least 85%;
- no-skill precision: at least 95%;
- path escape rejection: 100%;
- deterministic output: 100%.

These are project gates, not achieved benchmark claims.

## Tuning policy

1. Add failing real queries to the golden set.
2. Prefer metadata corrections before algorithm complexity.
3. Tune weights and threshold against the whole set.
4. Compare task success before comparing token or latency savings.
5. Add semantic reranking only if lexical recall repeatedly fails at the target catalog scale.
6. Version every intentional routing profile change.
