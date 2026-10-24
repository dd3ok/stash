# Retrieval and selection

Stash provides data; the current host agent judges relevance. There is no
standalone natural-language search engine or extra model service.

1. Read the category/source overview.
2. Retrieve likely categories or sources, with optional literal filtering.
3. Judge compact purposes; inspect full descriptions when a boundary is unclear.
4. Show up to 10 candidates and let the user choose.
5. Resolve the chosen ref and read only its verified instructions.

The agent may translate user intent into existing category IDs or metadata
terms. No translation rules are stored in code. If initial categories do not
fit, inspect adjacent categories and unclassified entries; do not claim an
exhaustive search without inspecting the whole relevant scope.

For example, both responsive-layout and game-testing skills may contain
"responsive". `list --text responsive` returns literal matches, not a promise
that both fit a responsive-web task. The agent compares their actual purposes.
For "game testing", the game category may supply the appropriate cards even
when the original description uses different wording.

At installation/update time, the current agent writes one category and a short
purpose with `classify`. Reuse suitable categories; add one only when needed.
Description changes invalidate hash-bound classification. Source attribution,
trust and ownership are not LLM guesses.

The deterministic test suite verifies retrieval and file safety, not model
judgment. Human acceptance checks should cover multilingual requests, ambiguous
terms, missing metadata, cross-category tasks, duplicate names and no-fit cases.
Correct a misleading purpose/category before adding infrastructure.

See the [skill workflow](../skills/stash/SKILL.md) for exact interaction rules
and the [CLI contract](../skills/stash/references/CLI-CONTRACT.md) for data fields.
