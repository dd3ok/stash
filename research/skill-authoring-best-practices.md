# Lightweight skill authoring and the Stash direction

Research date: 2026-08-25. This note uses first-party documentation and the
open Agent Skills specification. Stash-specific conclusions are marked
**Inference**.

## Primary-source findings

### Progressive disclosure is the main performance tool

OpenAI and the Agent Skills specification define three levels: discovery loads
name and description, activation loads `SKILL.md`, and supporting files load on
demand. OpenAI also limits the initial Codex skill list, so descriptions should
be concise, scoped, and front-loaded with the decisive trigger.

- [OpenAI: Build skills](https://developers.openai.com/codex/build-skills)
- [Agent Skills specification](https://agentskills.io/specification)
- [Anthropic: Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

The specification's 500-line/5,000-token guidance is a ceiling, not a target.
Anthropic adds a practical distinction: referenced Markdown enters context,
whereas a deterministic script can run with only its output entering context.

### Instructions should change decisions

The official authoring guidance recommends one coherent job, useful defaults,
moderate detail, and specificity proportional to risk. It advises omitting
knowledge the agent already has and attaching every reference to a concrete
condition.

- [Agent Skills: authoring best practices](https://agentskills.io/skill-creation/best-practices)
- [OpenAI: Build skills](https://developers.openai.com/codex/build-skills)

### Validation should prove outcomes

The official evaluation guide starts with a few realistic prompts, a boundary
case, and observable assertions. It warns against exact-wording tests and
checks that pass equally without the skill. Timing and token counts are useful
comparison data, not substitutes for task success.

- [Agent Skills: evaluating skill quality](https://agentskills.io/skill-creation/evaluating-skills)

## Stash diagnosis

Before this refactor, canonical `SKILL.md` was 262 lines and mixed frequent
search/read decisions with rare update, provenance, deployment, journal, and
lock detail. The same lifecycle rules appeared across the skill, CLI contract,
READMEs, installation, architecture, maintenance, and security documents.

The repository already had the right disclosure primitives: explicit-only
metadata, conditional references, one bundled CLI, generated adapters, and
behavior tests. **Inference:** it needed clearer ownership, not another
documentation framework or eval subsystem.

## Final information ownership

| Surface | Owns |
|---|---|
| `SKILL.md` | Request routing, shortest successful workflows, always-applicable safety decisions, conditional reference pointers |
| CLI `help` | Command syntax, flags, required arguments, and defaults |
| `CLI-CONTRACT.md` | JSON/status semantics and lifecycle preconditions visible to the caller |
| `CONFIGURATION.md` | Configuration resolution, keys, locations, and example |
| README | Product promise, selection guidance, one quick start, boundaries, links |
| installation | Human host setup and smoke tests |
| architecture | Internal modules, state transitions, journals, locks, and rationale |
| security | Threat boundary, guarantees, and non-guarantees |
| maintenance | Executable checks, conditional validation, and exceptional repair runbooks |

**Inference:** journal and lock implementation belongs in architecture; manual
repair belongs in maintenance. The CLI contract should state only the failure
boundary: stop and never bypass metadata, ownership, containment, or hash
errors.

## Validation direction

Universal pull-request checks should prove source behavior, types/build,
generated-artifact consistency, and distribution smoke behavior. Keep
cross-platform coverage because lifecycle behavior depends on realpath, links,
rename, and locks.

Run checks only for the failures they uniquely detect:

- routing benchmark for routing changes and on main, not every PR;
- skill/plugin validators for matching metadata or packaging changes;
- vendor live tests for support claims;
- package inspection for release/package-content changes;
- security-focused tests for path, lifecycle, provenance, lock, or recovery
  changes.

Remove completed migration gates such as a permanent legacy-brand scanner.
Avoid documentation wording tests; test parsing, invocation policy, CLI
behavior, and security outcomes.

## Acceptance criteria

- Search-only use does not load lifecycle detail.
- Every lifecycle mutation loads caller-visible preconditions first.
- Each repeated rule has one authoritative home.
- `stash help` and `stash --help` both succeed.
- Generated adapters match canonical sources.
- The PR suite excludes unrelated benchmarks and vendor/manual gates.
- No document or check exists without a named consumer and a unique failure it
  detects.
