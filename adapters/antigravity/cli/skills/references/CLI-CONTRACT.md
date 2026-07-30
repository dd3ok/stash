# CLI contract

Read this reference only when interpreting CLI JSON or diagnosing a routing failure.

## Resolve statuses

| Status | Meaning | Agent action |
|---|---|---|
| `ok` | Relevant results exist | Continue |
| `no-match` | No result passed the relevance gate | Retry once with better terms or report none |
| `ambiguous-exact` | The same exact name exists in multiple locations | Add catalog/group or ask |
| `catalog-unavailable` | A configured catalog is missing or disabled | Report the configuration problem |
| `invalid-request` | Query or name is empty/invalid | Correct the call |
| `cursor-stale` | Index or query changed between pages | Restart the same search from page one |

`totalRelevant` counts every relevant result before pagination. `page.size` counts only the current transport page. `totalPossible` is diagnostic and does not belong in the default related list.

Resolve commands return records in `matches[]`; use `matches[0].ref` after a successful unambiguous exact lookup. A `nextCursor` appears at `page.nextCursor`. For inventory or all-related requests, repeat the same command and filters with `--cursor <nextCursor>` until that field is absent.

Each match may include `source.id`, `source.displayName`, `source.url`, `source.revision`, and `source.license`. Preserve these fields when attributing a skill. `--source <id|name|url>` is an exact provenance filter and may be repeated; it is independent of `--catalog` and `--group`. Repository forms such as `Owner/Repository` work when recorded as `source.displayName`. Comparison ignores Unicode and case differences but preserves punctuation; `foo-bar` does not match `foobar`.

## Relevance tiers

- `exact`: complete name or alias match.
- `strong`: phrase or multiple high-quality metadata signals.
- `material`: calibrated lexical score plus independent evidence.
- `possible`: weak or generic evidence; excluded by default.

Source IDs and display names are searchable evidence. Prefer `--source` when the user explicitly names an author or repository so unrelated skills cannot enter the result set.

## Read statuses

| Status | Meaning |
|---|---|
| `ok` | Content or a verified local path is available |
| `not-found` | Ref or resource does not exist |
| `hash-mismatch` | The file changed after resolution |
| `resource-outside-skill` | The requested path escaped the skill/catalog root |
| `quarantined` | Catalog policy blocks reading the skill |
| `unsupported-resource` | Content mode cannot safely return the resource |

Use `--expected-hash` when a workflow must guarantee that the skill selected during resolve is the skill read later.

## Exit codes

- `0`: command completed, including a normal `no-match`.
- `2`: invalid CLI input or configuration.
- `3`: security rejection.
- `4`: catalog or file I/O failure.
- `5`: unsupported schema/index version.
- `10`: unexpected internal error.
