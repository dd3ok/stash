#!/usr/bin/env node

import { createStashCatalog } from "./stash-catalog.js";
import { createStashLifecycle } from "./stash-lifecycle.js";
import { sourceDisplayName } from "./internal/util.js";
import {
  StashError,
  type CatalogRegistration,
  type LifecycleHost,
  type LifecycleHostTarget,
  type LifecycleMutationResult,
  type ResolveResult,
} from "./types.js";

interface ParsedArguments {
  command?: string;
  positionals: string[];
  flags: Map<string, string[]>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current) {
      continue;
    }
    if (!current.startsWith("--")) {
      positionals.push(current);
      continue;
    }
    const [rawName, inlineValue] = current.slice(2).split("=", 2);
    const name = rawName ?? "";
    let value = inlineValue;
    if (
      value === undefined &&
      rest[index + 1] !== undefined &&
      !rest[index + 1]?.startsWith("--")
    ) {
      value = rest[index + 1];
      index += 1;
    }
    const values = flags.get(name) ?? [];
    values.push(value ?? "true");
    flags.set(name, values);
  }
  return { ...(command ? { command } : {}), positionals, flags };
}

function flag(args: ParsedArguments, name: string): string | undefined {
  return args.flags.get(name)?.at(-1);
}

function flags(args: ParsedArguments, name: string): string[] | undefined {
  const values = args.flags.get(name);
  return values && values.length > 0 ? values : undefined;
}

function booleanFlag(args: ParsedArguments, name: string): boolean {
  return args.flags.has(name) && flag(args, name) !== "false";
}

function numberFlag(args: ParsedArguments, name: string): number | undefined {
  const value = flag(args, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new StashError(
      "invalid-argument",
      `--${name} must be an integer between 1 and 200.`,
      2,
    );
  }
  return parsed;
}

function rejectUnknownFlags(
  args: ParsedArguments,
  allowed: ReadonlySet<string>,
): void {
  const unknown = [...args.flags.keys()].filter((name) => !allowed.has(name));
  if (unknown.length > 0) {
    throw new StashError(
      "invalid-argument",
      `Unknown option(s) for ${args.command}: ${unknown.map((name) => `--${name}`).join(", ")}.`,
      2,
    );
  }
}

function createOptions(args: ParsedArguments) {
  const root = flag(args, "root");
  const catalogId = flag(args, "root-id") ?? "default";
  const configPath = flag(args, "config");
  const cacheDir = flag(args, "cache-dir");
  const managedRoot = flag(args, "managed-root");
  const catalogs: CatalogRegistration[] | undefined = root
    ? [
        {
          id: catalogId,
          root,
          enabled: true,
          trust: "unreviewed",
          followSymlinks: false,
          compatibility: ["codex", "claude-code", "antigravity"],
        },
      ]
    : undefined;
  return {
    ...(configPath ? { configPath } : {}),
    ...(cacheDir ? { cacheDir } : {}),
    ...(managedRoot ? { managedRoot } : {}),
    ...(catalogs ? { catalogs } : {}),
  };
}

function lifecycleTarget(args: ParsedArguments): LifecycleHostTarget {
  const host = flag(args, "host");
  const supported = new Set<LifecycleHost>([
    "codex",
    "claude-code",
    "antigravity-ide",
    "antigravity-cli",
  ]);
  if (!host || !supported.has(host as LifecycleHost)) {
    throw new StashError(
      "invalid-argument",
      "--host must be codex, claude-code, antigravity-ide, or antigravity-cli.",
      2,
    );
  }
  const scope = flag(args, "scope");
  if (
    scope !== undefined &&
    scope !== "user" &&
    scope !== "workspace"
  ) {
    throw new StashError(
      "invalid-argument",
      "--scope must be user or workspace.",
      2,
    );
  }
  const root = flag(args, "host-root");
  if (root) {
    throw new StashError(
      "unsupported-host-root",
      "Custom host roots are not supported; lifecycle targets use documented user skill directories.",
      2,
    );
  }
  const workspace = flag(args, "workspace");
  return {
    host: host as LifecycleHost,
    ...(scope ? { scope } : {}),
    ...(workspace ? { workspace } : {}),
  };
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function printResolve(result: ResolveResult): void {
  if (result.status === "no-match") {
    process.stdout.write("No matching skills.\n");
    return;
  }
  if (result.status !== "ok" && result.status !== "ambiguous-exact") {
    process.stdout.write(`Stash: ${result.status}\n`);
    return;
  }
  process.stdout.write(`${result.total} skill(s)\n`);
  let currentScope = "";
  for (const match of result.matches) {
    const group = match.group ?? "(ungrouped)";
    const source =
      match.source?.displayName && match.source.id
        ? `${match.source.displayName} [${match.source.id}]`
        : match.source?.displayName ??
          match.source?.id ??
          match.source?.url;
    const scope = source
      ? `${source} / ${match.catalogId} / ${group}`
      : `${match.catalogId} / ${group}`;
    if (scope !== currentScope) {
      currentScope = scope;
      process.stdout.write(`\n${scope}\n`);
    }
    process.stdout.write(`- ${match.name} — ${match.description}\n`);
    process.stdout.write(`  ref: ${match.ref}\n`);
  }
  if (result.page.nextCursor) {
    process.stdout.write(`\nnext_cursor: ${result.page.nextCursor}\n`);
  }
}

type ListView = "full" | "compact" | "summary";

// Presentation only: all lookup, filtering and pagination stays in StashCatalog.
function listJson(result: ResolveResult, view: ListView): unknown {
  if (view === "full") return result;
  return {
    schemaVersion: result.schemaVersion,
    view,
    status: result.status,
    mode: result.mode,
    total: result.total,
    ...(view === "summary"
      ? { summary: result.summary }
      : {
          page: result.page,
          matches: result.matches.map((match) => ({
            name: match.name,
            ref: match.ref,
            description: match.description,
            ...(match.group ? { group: match.group } : {}),
            source: {
              label: sourceDisplayName(match.source),
              ...(match.source?.url ? { url: match.source.url } : {}),
            },
          })),
        }),
    diagnostics: result.diagnostics,
  };
}

function printList(result: ResolveResult, view: ListView): void {
  if (result.status !== "ok") {
    printResolve(result);
    return;
  }
  process.stdout.write(`Stash catalog: ${result.total} skill(s)\n`);
  if (view !== "compact") {
    const summary = result.summary!;
    process.stdout.write(`Catalogs: ${summary.catalogs.map((item) => `${item.name} ${item.count}`).join(" | ")}\n`);
    process.stdout.write(`\nSource packages (${summary.sources.length})\n`);
    for (const source of summary.sources) {
      process.stdout.write(`- ${source.label} — ${source.count} [${source.catalogs.join(", ")}]\n`);
      if (source.url) process.stdout.write(`  ${source.url}\n`);
    }
    process.stdout.write(`\nCategories (${summary.groups.length})\n`);
    for (const group of summary.groups) process.stdout.write(`- ${group.name} — ${group.count}\n`);
  }
  if (view === "summary") return;
  process.stdout.write(`\nSkills on this page (${result.page.size}/${result.total})\n`);
  let currentScope = "";
  for (const match of result.matches) {
    const scope = `${sourceDisplayName(match.source)} / ${match.catalogId} / ${match.group ?? "(ungrouped)"}`;
    if (scope !== currentScope) {
      currentScope = scope;
      process.stdout.write(`\n${scope}\n`);
    }
    process.stdout.write(`- ${match.name}${view === "compact" ? ` [${match.ref}] — ${match.description}` : ""}\n`);
  }
  if (result.page.nextCursor) process.stdout.write(`\nnext_cursor: ${result.page.nextCursor}\n`);
  process.stdout.write("\nTip: filter with --source <owner/repo> or --group <category>; use exact/read for full details.\n");
}

function printLifecycle(result: LifecycleMutationResult): void {
  process.stdout.write(
    `${result.name}: ${result.status} (${result.treeHash})\nskill_id: ${result.skillId}\n${result.managedPath}\n`,
  );
  if (result.deployment) {
    process.stdout.write(`deployment: ${result.deployment.path}\n`);
  }
  if (
    result.previousTreeHash &&
    result.previousTreeHash !== result.treeHash
  ) {
    process.stdout.write(`previous_tree_hash: ${result.previousTreeHash}\n`);
  }
  if (
    typeof result.outdatedDeployments === "number" &&
    result.outdatedDeployments > 0
  ) {
    process.stdout.write(
      `outdated_deployments: ${result.outdatedDeployments}\n`,
    );
  }
  if (result.reloadRequired) {
    process.stdout.write("Reload or restart the host before relying on discovery changes.\n");
  }
  if (result.warning) {
    process.stdout.write(`warning: ${result.warning}\n`);
  }
}

function usage(): string {
  return `Stash — an on-demand skill shelf. The host agent judges relevance.

Read:
  stash list [--group <category>] [--source <id|owner/repo|url>] [--text <literal>] [--view compact|full|summary] [--page-size <n>] [--cursor <token>] [--json]
  stash exact <name|ref> [--catalog <id>] [--json]
  stash read <ref> [--resource <path>] [--expected-hash <sha256:...>] [--format content|path|json]
  stash refresh [--json]
  stash doctor [--catalog <id>] [--json]

Manage:
  stash install <local-skill-dir> [--source-url <url>] [--revision <sha>] [--repository-path <path>] [--tracking-ref <ref>] [--json]
  stash classify <ref> --expected-hash <sha256:...> --group <category> --purpose <one-line purpose> [--json]
  stash update <local-skill-dir> --expected-tree-hash <sha256:...> [--expected-revision <sha>] [--source-url <url>] [--revision <sha>] [--repository-path <path>] [--tracking-ref <ref>] [--json]
  stash archive <standalone-skill-dir|name> --host <host> [--scope user] [--source-url <url>] [--revision <sha>] [--repository-path <path>] [--tracking-ref <ref>] [--json]
  stash activate <name> --host <host> [--scope user] [--json]
  stash deactivate <name> --host <host> [--scope user] [--json]
  stash uninstall <name> [--json]
  stash status [name] [--json]

Options:
  --config <path> --root <path> --root-id <id> --cache-dir <path> --managed-root <path>
  --catalog and --group may be repeated (OR within each filter).
  Hosts: codex, claude-code, antigravity-ide, antigravity-cli; user scope only.

List defaults to compact cards, 50 per page; pagination never caps the total.
--text is a case-insensitive literal substring, not semantic search.
Summary gives complete category/source counts without loading skill instructions.
Refresh after editing registered folders outside Stash; lifecycle writes invalidate the cache.
Classification changes only Stash metadata, never skill content or activation.
No network, secondary LLM, relevance scoring or automatic activation.
`;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (
    !args.command ||
    args.command === "help" ||
    args.command === "--help" ||
    args.command === "-h" ||
    booleanFlag(args, "help")
  ) {
    process.stdout.write(usage());
    return;
  }

  const catalog = await createStashCatalog(createOptions(args));
  const catalogIds = flags(args, "catalog");
  const sources = flags(args, "source");
  const groups = flags(args, "group");
  const json = booleanFlag(args, "json");

  const common = ["config", "root", "root-id", "cache-dir", "managed-root", "json"];
  const readFlags: Record<string, string[]> = {
    exact: ["catalog", "source", "group"],
    list: ["catalog", "source", "group", "text", "view", "page-size", "cursor"],
    read: ["resource", "expected-hash", "format"],
    refresh: [], doctor: ["catalog"],
    classify: ["expected-hash", "group", "purpose"],
  };
  if (readFlags[args.command]) rejectUnknownFlags(args, new Set([...common, ...readFlags[args.command]!]));
  if (["list", "refresh", "doctor"].includes(args.command) && args.positionals.length) {
    throw new StashError("invalid-argument", `${args.command} does not accept positional arguments; use explicit filters.`, 2);
  }

  switch (args.command) {
    case "exact": {
      const name = args.positionals.join(" ").trim();
      if (!name) {
        throw new StashError(
          "invalid-argument",
          "exact requires a skill name.",
          2,
        );
      }
      const result = await catalog.resolve({
        kind: "exact",
        name,
        ...(catalogIds ? { catalogIds } : {}),
        ...(sources ? { sources } : {}),
        ...(groups ? { groups } : {}),
      });
      json ? printJson(result) : printResolve(result);
      return;
    }
    case "list": {
      const view = flag(args, "view") ?? "compact";
      if (view !== "full" && view !== "compact" && view !== "summary") {
        throw new StashError("invalid-argument", "--view must be full, compact, or summary.", 2);
      }
      const cursor = flag(args, "cursor");
      if (view === "summary" && cursor) {
        throw new StashError("invalid-argument", "--view summary does not accept --cursor.", 2);
      }
      const pageSize = view === "summary" ? 1
        : numberFlag(args, "page-size") ?? undefined;
      const result = await catalog.resolve({
        kind: "list",
        ...(flag(args, "text") !== undefined ? { text: flag(args, "text")! } : {}),
        ...(catalogIds ? { catalogIds } : {}),
        ...(sources ? { sources } : {}),
        ...(groups ? { groups } : {}),
        ...(cursor ? { cursor } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
      });
      json ? printJson(listJson(result, view)) : printList(result, view);
      return;
    }
    case "read": {
      const ref = args.positionals.join(" ").trim();
      if (!ref) {
        throw new StashError("invalid-argument", "read requires a ref.", 2);
      }
      const format = flag(args, "format") ?? "content";
      if (format !== "content" && format !== "path" && format !== "json") {
        throw new StashError(
          "invalid-argument",
          "--format must be content, path, or json.",
          2,
        );
      }
      const resource = flag(args, "resource");
      const expectedHash = flag(args, "expected-hash");
      const result = await catalog.read({
        ref,
        ...(resource ? { resource } : {}),
        ...(expectedHash ? { expectedHash } : {}),
        ...(format === "path" ? { representation: "local-path" } : {}),
      });
      if (format === "json" || result.status !== "ok") {
        printJson(result);
      } else if (format === "path") {
        process.stdout.write(`${result.localPath ?? ""}\n`);
      } else {
        process.stdout.write(result.content ?? "");
        if (result.content && !result.content.endsWith("\n")) {
          process.stdout.write("\n");
        }
      }
      return;
    }
    case "refresh": {
      const result = await catalog.refresh({
        ...(catalogIds ? { catalogIds } : {}),
      });
      if (json) {
        printJson(result);
      } else {
        for (const item of result.catalogs) {
          process.stdout.write(
            `${item.catalogId}: ${item.indexed} indexed, ${item.skipped} skipped, ${item.warnings.length} warning(s)\n`,
          );
        }
      }
      if (result.status === "failed") {
        process.exitCode = 4;
      }
      return;
    }
    case "doctor": {
      const result = await catalog.doctor({
        ...(catalogIds ? { catalogIds } : {}),
      });
      if (json) {
        printJson(result);
      } else {
        for (const item of result.catalogs) {
          process.stdout.write(
            `${item.catalogId}: ${item.records} record(s), ${item.warnings.length} warning(s)\n`,
          );
          for (const warning of item.warnings) {
            process.stdout.write(`  - ${warning.code}: ${warning.message}\n`);
          }
        }
        for (const warning of result.warnings ?? []) {
          process.stdout.write(`  - ${warning.code}: ${warning.message}\n`);
        }
        if (result.coverage) {
          process.stdout.write(`Coverage: ${result.coverage.total} searchable, ${result.coverage.uncategorized.length} uncategorized, ${result.coverage.unattributed.length} unattributed (refs in --json)\n`);
        }
      }
      if (result.status === "failed") {
        process.exitCode = 4;
      }
      return;
    }
    case "classify": {
      const ref = args.positionals.join(" ").trim();
      const contentHash = flag(args, "expected-hash") ?? "";
      const group = flag(args, "group") ?? "";
      const purpose = flag(args, "purpose") ?? "";
      const lifecycle = await createStashLifecycle(createOptions(args));
      const result = await lifecycle.classify({ ref, contentHash, group, purpose });
      json ? printJson(result) : process.stdout.write(`${ref}: classified\n`);
      return;
    }
    case "install": {
      const source = args.positionals.join(" ").trim();
      if (!source) {
        throw new StashError(
          "invalid-argument",
          `${args.command} requires a local skill directory.`,
          2,
        );
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(source)) {
        throw new StashError(
          "remote-install-unsupported",
          "Remote installation is not supported in this release. Stage the skill locally, then install that directory.",
          2,
        );
      }
      const lifecycle = await createStashLifecycle(createOptions(args));
      const sourceUrl = flag(args, "source-url");
      const revision = flag(args, "revision");
      const repositoryPath = flag(args, "repository-path");
      const trackingRef = flag(args, "tracking-ref");
      const result = await lifecycle.install({
        source,
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(revision ? { revision } : {}),
        ...(repositoryPath ? { repositoryPath } : {}),
        ...(trackingRef ? { trackingRef } : {}),
      });
      json ? printJson(result) : printLifecycle(result);
      return;
    }
    case "update": {
      const source = args.positionals.join(" ").trim();
      if (!source) {
        throw new StashError(
          "invalid-argument",
          "update requires a local skill directory.",
          2,
        );
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(source)) {
        throw new StashError(
          "remote-install-unsupported",
          "Remote updates must be staged locally before updating the managed copy.",
          2,
        );
      }
      const expectedTreeHash = flag(args, "expected-tree-hash");
      if (!expectedTreeHash) {
        throw new StashError(
          "invalid-argument",
          "update requires --expected-tree-hash from the current managed status.",
          2,
        );
      }
      const lifecycle = await createStashLifecycle(createOptions(args));
      const sourceUrl = flag(args, "source-url");
      const revision = flag(args, "revision");
      const expectedRevision = flag(args, "expected-revision");
      const repositoryPath = flag(args, "repository-path");
      const trackingRef = flag(args, "tracking-ref");
      const result = await lifecycle.update({
        source,
        expectedTreeHash,
        ...(expectedRevision ? { expectedRevision } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(revision ? { revision } : {}),
        ...(repositoryPath ? { repositoryPath } : {}),
        ...(trackingRef ? { trackingRef } : {}),
      });
      json ? printJson(result) : printLifecycle(result);
      return;
    }
    case "archive": {
      const source = args.positionals.join(" ").trim();
      if (!source) {
        throw new StashError(
          "invalid-argument",
          "archive requires a standalone skill directory or a name with --host.",
          2,
        );
      }
      const lifecycle = await createStashLifecycle(createOptions(args));
      const target = lifecycleTarget(args);
      const sourceUrl = flag(args, "source-url");
      const revision = flag(args, "revision");
      const repositoryPath = flag(args, "repository-path");
      const trackingRef = flag(args, "tracking-ref");
      const result = await lifecycle.archive({
        source,
        target,
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(revision ? { revision } : {}),
        ...(repositoryPath ? { repositoryPath } : {}),
        ...(trackingRef ? { trackingRef } : {}),
      });
      json ? printJson(result) : printLifecycle(result);
      return;
    }
    case "activate":
    case "deactivate": {
      const name = args.positionals.join(" ").trim();
      if (!name) {
        throw new StashError(
          "invalid-argument",
          `${args.command} requires a managed skill name.`,
          2,
        );
      }
      const lifecycle = await createStashLifecycle(createOptions(args));
      const target = lifecycleTarget(args);
      const result =
        args.command === "activate"
          ? await lifecycle.activate({ name, target })
          : await lifecycle.deactivate({ name, target });
      json ? printJson(result) : printLifecycle(result);
      return;
    }
    case "uninstall": {
      rejectUnknownFlags(
        args,
        new Set(["config", "managed-root", "json", "help"]),
      );
      const name = args.positionals.join(" ").trim();
      if (!name) {
        throw new StashError(
          "invalid-argument",
          "uninstall requires a managed skill name.",
          2,
        );
      }
      const lifecycle = await createStashLifecycle(createOptions(args));
      const result = await lifecycle.uninstall({ name });
      json ? printJson(result) : printLifecycle(result);
      return;
    }
    case "status": {
      const name = args.positionals.join(" ").trim();
      const lifecycle = await createStashLifecycle(createOptions(args));
      const result = await lifecycle.status(name ? { name } : {});
      if (json) {
        printJson(result);
      } else if (result.status === "not-found") {
        process.stdout.write(`No managed skills at ${result.managedRoot}.\n`);
      } else {
        for (const skill of result.skills) {
          process.stdout.write(
            `${skill.name}: store=${skill.store.state}/${skill.store.integrity}, deployments=${skill.deployments.length}\n`,
          );
          for (const deployment of skill.deployments) {
            process.stdout.write(
              `  - ${deployment.host}/${deployment.scope}: ${deployment.state}, current=${deployment.current} (${deployment.path})\n`,
            );
          }
        }
      }
      return;
    }
    default:
      throw new StashError(
        "invalid-argument",
        `Unknown command "${args.command}".\n\n${usage()}`,
        2,
      );
  }
}

main().catch((error: unknown) => {
  if (error instanceof StashError) {
    process.stderr.write(`stash: ${error.message}\n`);
    process.exitCode = error.exitCode;
    return;
  }
  process.stderr.write(
    `stash: unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 10;
});
