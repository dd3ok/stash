#!/usr/bin/env node

import { createStashCatalog } from "./stash-catalog.js";
import { createStashLifecycle } from "./stash-lifecycle.js";
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
  if (!Number.isFinite(parsed)) {
    throw new StashError(
      "invalid-argument",
      `--${name} must be a number.`,
      2,
    );
  }
  return parsed;
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
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printResolve(result: ResolveResult): void {
  if (result.status === "no-match") {
    process.stdout.write(
      result.totalPossible > 0
        ? `No materially relevant skills. ${result.totalPossible} possible match(es) were excluded.\n`
        : "No matching skills.\n",
    );
    return;
  }
  if (result.status !== "ok" && result.status !== "ambiguous-exact") {
    process.stdout.write(`Stash: ${result.status}\n`);
    return;
  }
  process.stdout.write(
    `${result.totalRelevant} relevant skill(s)` +
      (result.totalPossible > 0
        ? `, ${result.totalPossible} possible match(es)`
        : "") +
      "\n",
  );
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
    const tier = match.relevance ? ` [${match.relevance.tier}]` : "";
    process.stdout.write(`- ${match.name}${tier} — ${match.description}\n`);
    process.stdout.write(`  ref: ${match.ref}\n`);
  }
  if (result.page.nextCursor) {
    process.stdout.write(`\nnext_cursor: ${result.page.nextCursor}\n`);
  }
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
  return `Stash — on-demand search for local Agent Skills

Usage:
  stash exact <name> [--source <id|name|url>] [--group <group>] [--catalog <id>] [--json]
  stash search <query> [--source <id|name|url>] [--group <group>] [--catalog <id>] [--cursor <token>] [--include-possible] [--json]
  stash list [--source <id|name|url>] [--group <group>] [--catalog <id>] [--cursor <token>] [--json]
  stash read <ref> [--resource <path>] [--format content|path|json]
  stash index [--catalog <id>] [--json]
  stash doctor [--catalog <id>] [--json]
  stash install <local-skill-dir> [--source-url <url>] [--revision <revision>] [--json]
  stash update <local-skill-dir> --expected-tree-hash <sha256:...> [--expected-revision <revision>] [--source-url <url>] [--revision <revision>] [--json]
  stash archive <standalone-skill-dir|name> --host <host> [--scope user] [--json]
  stash activate <name> --host <host> [--scope user] [--json]
  stash deactivate <name> --host <host> [--scope user] [--json]
  stash status [name] [--json]

Configuration:
  --config <path>       Override STASH_CONFIG/platform config.
  --root <path>         Use one catalog without a config file.
  --root-id <id>        Catalog id used with --root (default: default).
  --cache-dir <path>    Override STASH_CACHE_DIR/platform cache.
  --managed-root <path> Override STASH_MANAGED_HOME/platform managed store.

Lifecycle targeting:
  --host <host>         codex, claude-code, antigravity-ide, or antigravity-cli.
  --scope <scope>       user (default); workspace is rejected in this release.

Result pagination never caps the total relevant result set.
Lifecycle commands manage only the Stash-owned store and explicitly selected
standalone skills. They never mutate external catalogs, plugins, or host settings.
`;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (
    !args.command ||
    args.command === "help" ||
    booleanFlag(args, "help")
  ) {
    process.stdout.write(usage());
    return;
  }

  const catalog = await createStashCatalog(createOptions(args));
  const catalogIds = flags(args, "catalog");
  const sources = flags(args, "source");
  const group = flag(args, "group");
  const json = booleanFlag(args, "json");

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
        ...(group ? { group } : {}),
      });
      json ? printJson(result) : printResolve(result);
      return;
    }
    case "search": {
      const query = args.positionals.join(" ").trim();
      if (!query) {
        throw new StashError(
          "invalid-argument",
          "search requires a query.",
          2,
        );
      }
      const cursor = flag(args, "cursor");
      const pageSize = numberFlag(args, "page-size");
      const result = await catalog.resolve({
        kind: "search",
        query,
        ...(catalogIds ? { catalogIds } : {}),
        ...(sources ? { sources } : {}),
        ...(group ? { group } : {}),
        ...(cursor ? { cursor } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
        ...(booleanFlag(args, "include-possible")
          ? { includePossible: true }
          : {}),
      });
      json ? printJson(result) : printResolve(result);
      return;
    }
    case "list": {
      const cursor = flag(args, "cursor");
      const pageSize = numberFlag(args, "page-size");
      const result = await catalog.resolve({
        kind: "list",
        ...(catalogIds ? { catalogIds } : {}),
        ...(sources ? { sources } : {}),
        ...(group ? { group } : {}),
        ...(cursor ? { cursor } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
      });
      json ? printJson(result) : printResolve(result);
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
    case "index": {
      const result = await catalog.refresh({
        ...(catalogIds ? { catalogIds } : {}),
        force: booleanFlag(args, "force"),
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
        verifyHashes: booleanFlag(args, "verify-hashes"),
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
      }
      if (result.status === "failed") {
        process.exitCode = 4;
      }
      return;
    }
    case "install":
    case "import":
    case "add": {
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
      const result = await lifecycle.install({
        source,
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(revision ? { revision } : {}),
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
      const result = await lifecycle.update({
        source,
        expectedTreeHash,
        ...(expectedRevision ? { expectedRevision } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(revision ? { revision } : {}),
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
      const result = await lifecycle.archive({
        source,
        target,
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(revision ? { revision } : {}),
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
