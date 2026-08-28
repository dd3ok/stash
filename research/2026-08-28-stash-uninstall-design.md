# Stash managed skill uninstall design

Date: 2026-08-28

## Decision

Add one command and no destructive aliases or convenience flags:

```text
stash uninstall <name> [--json]
```

It removes only the Stash-managed tree and its lifecycle record. It never
touches external catalogs or host discovery roots. If any deployment record
remains, or if a present managed tree no longer matches its recorded hash, it
makes no change and fails with a useful error. If the tree is already missing,
it removes the valid zero-deployment record and reports a warning.

This matches the established package-manager shape: npm uses
`npm uninstall <pkg>` to remove what npm installed and update its own recorded
state, while Cargo describes `cargo uninstall <name>` as removing a package
previously installed by Cargo. Neither requires a second `purge` command for
the normal case. ([npm uninstall](https://docs.npmjs.com/cli/v11/commands/npm-uninstall/),
[Cargo uninstall](https://doc.rust-lang.org/nightly/cargo/commands/cargo-uninstall.html))

## Why this fits Stash

The existing [`StashLifecycle`](../src/types.ts) is the only write interface,
and [`stash-lifecycle.ts`](../src/stash-lifecycle.ts) already owns the managed
root, lifecycle lock, tree hashing, atomic record replacement, tombstones, and
crash-recovery journals. `uninstall` should be one more method on that interface,
not a new subsystem.

A valid managed record is the ownership proof for the canonical managed path;
no new `ownership` boolean is needed. A directory without its valid Stash
record is untracked and must not be adopted or deleted. A record with a
non-directory, linked, or hash-mismatched tree is drifted and must be preserved
for diagnosis. A missing tree has no remaining user content to protect, so
uninstall may safely reconcile the record; this mirrors the existing
missing-deployment behavior in `deactivate`.

Git provides the useful safety model: verify the current value against the
expected value before changing it, acquire exclusive locks before commit, and
abort a transaction that cannot prepare all updates. Its lockfile API uses
exclusive creation followed by rename for mutual exclusion and atomic file
replacement. ([git-update-ref](https://git-scm.com/docs/git-update-ref),
[Git lockfile API](https://git-scm.com/docs/api-lockfile.html))

## Minimal contract

Add:

```ts
interface LifecycleUninstallRequest {
  name: string;
}

interface StashLifecycle {
  uninstall(request: LifecycleUninstallRequest): Promise<LifecycleMutationResult>;
}
```

Reuse `LifecycleMutationResult`, adding only `"uninstalled"` to its `status`
union. Successful JSON therefore keeps the existing lifecycle result shape:
`status`, `name`, `skillId`, `managedPath`, and `treeHash`. Human output can
continue through the existing lifecycle printer.

Preconditions, checked under the existing lifecycle lock:

1. A valid record exists for exactly `<name>`.
2. `record.deployments.length === 0`. Even a recorded-but-missing deployment
   must first go through `deactivate`, which already reconciles that state.
3. The canonical managed path is missing or a real directory inside the managed
   root; links, files, and special paths are rejected.
4. When present, a fresh snapshot hash equals `record.treeHash`.
5. The record and present tree still match immediately before mutation.

Recommended stable failures are `managed-skill-not-found`,
`active-deployments`, and the existing managed-layout/drift errors. A missing
record is still an error; a valid record with an already-missing tree is a
metadata-only uninstall success with a warning. ([Cargo exit status](https://doc.rust-lang.org/nightly/cargo/commands/cargo-uninstall.html#exit-status))

## Transaction and recovery

Use one new uninstall journal kind inside the existing journal directory. Keep
both tombstones inside the managed root so their renames stay on one filesystem.

```text
lock + recover old journals
  -> validate record, zero deployments, path, and tree hash
  -> write prepared journal
  -> rename managed tree to journal-owned tree tombstone; re-hash
  -> rename the still-verified record to its journal-owned tombstone
  -> mark cleanup authorized                       # point of no return
  -> remove both authorized tombstones
  -> remove journal and unlock
```

Before cleanup authorization, recovery restores the verified record and tree
tombstones to their original unoccupied paths. After authorization, recovery
removes only the exact operation-owned tombstone paths without requiring their
original hashes, so partially completed recursive cleanup can resume. If an
original path is occupied or a pre-commit tombstone does not match its recorded
identity, recovery fails closed. A missing managed tree skips the tree rename
and commits by tombstoning only the verified record.

Node documents `rename` as the filesystem move primitive and `rm` as recursive
removal. It also warns that promise/callback filesystem calls have no guaranteed
ordering unless each operation is awaited, so every phase must be sequential.
([Node.js filesystem API](https://nodejs.org/api/fs.html#fspromisesrenameoldpath-newpath),
[filesystem operation ordering](https://nodejs.org/api/fs.html#ordering-of-callback-and-promise-based-operations))

Describe this as **serialized and crash-recoverable**, not fully atomic or
power-loss durable. Git's lock documentation makes atomic visibility conditional
on filesystem rename behavior, and Stash already documents that it has no fsync
protocol. ([Git lockfile assumptions](https://git-scm.com/docs/api-lockfile.html),
[`docs/architecture.md`](../docs/architecture.md#lifecycle-data-flow))

The repository has no operating-system Recycle Bin abstraction; its current
verified tombstones are transaction mechanics and are permanently cleaned with
Node `rm`. Do not add an app-specific `.trash` store or Windows-only shell
integration for this command. That would create a second retention lifecycle
without improving correctness. After a successful uninstall there is no
Stash-provided restore; recoverability applies only to interrupted work.
([Node.js `rm`](https://nodejs.org/api/fs.html#fspromisesrmpath-options),
[`stash-lifecycle.ts`](../src/stash-lifecycle.ts))

## Intentionally excluded

- `--force`: must never bypass ownership, deployment, or drift checks.
- `--deactivate-all`: deployment removal stays explicit per host and scope.
- `--expected-tree-hash`: uninstall verifies the record and tree itself while
  holding the lifecycle lock; unlike update, it does not consume an externally
  staged replacement.
- `--purge` or `--trash`: there is only one managed-copy removal meaning.
- confirmation prompts: the command itself is explicit and must remain usable
  with `--json` in automation.
- uninstall aliases: one documented verb is sufficient.

## Implementation and test checklist

Implementation should touch only the existing lifecycle seam, CLI dispatch and
help, public types/exports, canonical skill contract, and generated adapters.
The focused behavior tests should prove:

- success removes the managed tree and record and leaves external sources alone;
- every recorded deployment blocks uninstall without mutation;
- a missing managed tree removes only its valid record with a warning;
- linked, non-directory, and drifted managed trees are preserved;
- mutation between the first hash and tombstone verification is rejected while
  preserving the tombstone and journal for diagnosis;
- interruption before commit restores the verified record and tree;
- interruption after commit finishes only authorized cleanup;
- partial committed cleanup is idempotently resumed without a full-tree hash;
- an externally missing record before commit preserves the tree tombstone and
  fails closed;
- occupied paths, malformed journals, and mismatched tombstones fail closed;
- plain and `--json` CLI output use the existing lifecycle result contract.

After implementation, run `npm run test:all` and the skill validator required
by [`docs/maintenance.md`](../docs/maintenance.md).
