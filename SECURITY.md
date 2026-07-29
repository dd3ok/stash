# Security policy

## Scope

Stash discovers and reads local Agent Skills. A skill can contain untrusted instructions, scripts, URLs, and assets. Treat adding a catalog like adding source code.

## Guarantees

- Stash never edits configured catalog files.
- Indexing does not execute scripts.
- Resource paths must stay inside the selected skill and catalog roots after `realpath`.
- Absolute paths and `..` traversal are rejected.
- Symlink/junction escapes are rejected.
- Quarantined records are excluded from resolution and blocked from read.
- Cache replacement is atomic.
- Resolve returns stable refs rather than local absolute paths.
- `expectedHash` detects content changes between resolve and read.
- Network access and telemetry are absent from the runtime.

## Non-guarantees

- Discovery is not an execution permission.
- `trusted` does not replace host sandboxing or approval.
- Stash does not sandbox scripts executed later by a host agent.
- A well-formed skill can still contain malicious or misleading instructions.
- Lexical relevance is not a security classifier.

## Catalog review

Before marking a skill `trusted`:

1. record source URL and immutable revision;
2. verify its redistribution license;
3. review `SKILL.md`, scripts, external URLs, and dependencies;
4. identify file write, deletion, network, credential, message, and git capabilities;
5. record the reviewed content hash;
6. repeat review after hash or revision changes.

Use `reviewed` when a human reviewed instructions but external execution remains. Use `unreviewed` for new sources. Use `quarantined` when a skill should not be discoverable or readable.

## Reporting

Report security issues privately to the repository owner before opening a public issue. Include:

- affected version;
- catalog shape;
- minimal reproduction;
- expected and observed containment;
- whether a catalog file, cache file, or host command was involved.
