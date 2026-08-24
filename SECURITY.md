# Security policy

## Scope

Stash discovers, reads, and explicitly stores local Agent Skills. A skill can contain untrusted instructions, scripts, URLs, and assets. Treat adding a catalog or importing a managed skill like adding source code.

## Guarantees

- Catalog search, read, refresh, doctor, and install never edit external
  configured catalog files. An explicit archive/deactivate target may share a
  root with a search registration, but only that exact standalone child or a
  verified Stash-owned deployment is writable.
- Managed imports reject symlinks, junctions, special files, non-portable path
  names, case-insensitive collisions, oversized trees, and overwrites.
- Lifecycle copies are staged and tree-hash verified before atomic rename.
- The managed metadata, records, staging, and journal roots must be real
  directories contained by the resolved managed root; record and journal files
  cannot be links.
- Destructive operations apply only to explicitly selected standalone skills
  or recorded deployments. Untracked and drifted deployments are preserved.
- Archive recovery is journaled. A rollback never overwrites an occupied source
  path, and a committed tombstone is deleted only after its tree hash matches.
- Managed update recovery rechecks record/tree state at commit time, preserves a
  drifted previous tree during rollback, and recursively removes only an exact
  operation-owned path after journal authorization.
- Remote managed provenance uses a canonical repository URL, caller-resolved
  immutable revision, and exact case-sensitive repository-relative skill path.
  Bulk update automation skips incomplete legacy provenance instead of guessing.
- Deactivation requires matching Stash ownership, skill/deployment identity,
  target, and tree hash.
- Catalog registration grants no write authority. Hash-matching related copies
  are folded only in the read projection; drifted or unrelated copies stay
  visible. Managed storage itself must not equal, contain, or sit inside an
  external catalog, including through a filesystem alias.
- Lifecycle lock ownership is atomically published. Proven-dead owners are
  reclaimed under a separate guard; malformed or live ownership fails closed.
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
- `deployed` means present in a host discovery root; it does not prove that a
  host enable/disable override is enabled.
- Plugin lifecycle and vendor setting changes are outside Stash lifecycle.
- Recovery handles interrupted processes but does not promise durability across
  power loss because Stash does not fsync journal, directory, and record writes.

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
