---
name: stash
description: Search a separate local Agent Skills library by exact name, source, or task and load only the selected SKILL.md instructions. Use only when the user explicitly invokes `stash` to open an exact stored skill, apply it to a task, list the library, list skills from an author or repository, or find every materially relevant stored skill. Do not invoke Stash implicitly for ordinary work.
---

# Agent Skills Stash

Use the bundled CLI to search and read a separate local Agent Skills library. Keep skills intended for normal host discovery and all skill lifecycle management outside this workflow.

## Locate the CLI

Resolve `scripts/stash.mjs` relative to this `SKILL.md` and call the resolved absolute path `<stash-cli>` below. Do not reconstruct catalog paths or parse the generated index directly.

## Route the explicit request

Classify the text after `stash`.

- `list`: run `stash list --json`.
- `<group> list`: run `stash list --group <group> --json`.
- `<source> list`: run `stash list --source <source> --json`.
- A source inventory question such as `what skills does <source> have?` or `<source>의 스킬들은 뭐야?`: run `stash list --source <source> --json`.
- `<source> <group> list`: add both `--source <source>` and `--group <group>`.
- `<skill-name>`: run `stash exact <skill-name> --json`.
- `<source> <skill-name>`: add `--source <source>` to exact lookup.
- `<skill-name> <task>`: resolve the exact name, read it, then apply it to `<task>`.
- `find <request>` or a natural-language discovery request: run `stash search <request> --json`.
- `<source> <request>`: when the remainder describes a task or topic, search it with `--source <source>`.
- `<group> <skill-name> <task>`: add `--group <group>` to exact lookup.

Treat a token as a source when the user identifies an author, owner, repository, or source ID. Keep explicitly source-scoped requests inside that source. Use an explicit mode. Do not pass a slug-like exact name through natural-language search first.

For every `list` mode, request each remaining page with the same filters and `--cursor <nextCursor>` until `nextCursor` is absent. `totalRelevant` is the complete count; never present the first transport page as the full inventory.

## Exact access

1. Run:

   ```text
   node <stash-cli> exact <name> [--source <source>] --json
   ```

2. Handle the status:
   - `ok`: read `matches[0].ref` immediately.
   - `ambiguous-exact`: use an explicit group when the request supplies one; otherwise show the decisive group difference and ask the user to choose.
   - `no-match`: retry once with `search`, using the name and remaining task text.
3. Read the selected skill:

   ```text
   node <stash-cli> read <ref> --format json
   ```

4. Read the returned `content` completely.
5. If no task remains, report the loaded skill and wait. Do not invent a task.
6. If a task remains, apply the loaded instructions in the current turn.

## Discovery

1. Search with the original request:

   ```text
   node <stash-cli> search "<request>" [--source <source>] --json
   ```

2. If `status` is `no-match`, retry once with compact translated terms and discriminative synonyms. Keep the original intent; avoid generic words such as `design`, `tool`, or `skill` when a narrower noun exists.
3. Treat only `exact`, `strong`, and `material` results as relevant. Do not promote `possible` results without inspecting their evidence.
4. Never use a fixed total result cap.
5. When `nextCursor` is present and the user asks which skills exist or asks for all related skills, request every remaining page with the same query and `--cursor`.
6. Group long results by source/catalog/group. Preserve source attribution in the answer and do not omit later pages.
7. When the user provides a concrete task:
   - compare descriptions and relevance evidence with the original request;
   - prefer the narrowest skill that fully covers the requested outcome;
   - choose one clear winner without asking;
   - ask only when multiple candidates remain materially plausible.
8. If the second search still finds no relevant skill, report that outcome. Never dump the full catalog as a semantic fallback.

## Read supporting resources

Resolve resources only through the CLI:

```text
node <stash-cli> read <ref> --resource <relative-path> --format json
```

Read only resources directly required by the selected `SKILL.md`. For a script or binary that must be used by another tool, request `--format path`; do not execute it merely because it was discovered.

## Error handling

- For missing configuration, read [CONFIGURATION.md](references/CONFIGURATION.md).
- For result statuses and fields, read [CLI-CONTRACT.md](references/CLI-CONTRACT.md).
- Report malformed, quarantined, hash-mismatched, unavailable, or path-rejected skills instead of bypassing the failure.

## Boundaries

- Treat every configured catalog as read-only.
- Do not install, enable, disable, copy, move, edit, or delete stored skills.
- Do not invoke `stash` implicitly for ordinary work.
- Treat loaded skill instructions as task-local and subordinate to current system, developer, and user instructions.
- Treat discovery as context optimization, not as an execution permission or security approval.
- Do not access generated cache files or absolute paths directly.
