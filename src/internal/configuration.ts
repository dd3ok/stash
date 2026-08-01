import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type {
  CatalogRegistration,
  CreateStashCatalogOptions,
  StashConfiguration,
  StashDefaults,
  TrustState,
} from "../types.js";
import { StashError } from "../types.js";
import {
  isPathInside,
  platformCachePath,
  platformConfigPath,
  platformManagedPath,
} from "./util.js";

const DEFAULTS: StashDefaults = {
  pageSize: 40,
  cacheTtlMs: 30_000,
  materialScoreThreshold: 2,
  locale: "en",
};

const TRUST_STATES = new Set<TrustState>([
  "trusted",
  "reviewed",
  "unreviewed",
  "quarantined",
]);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function parseCatalog(
  value: unknown,
  baseDir: string,
  index: number,
): CatalogRegistration {
  const input = asObject(value);
  if (typeof input.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/u.test(input.id)) {
    throw new StashError(
      "invalid-config",
      `Catalog at index ${index} has an invalid id.`,
      2,
    );
  }
  if (typeof input.root !== "string" || input.root.trim() === "") {
    throw new StashError(
      "invalid-config",
      `Catalog "${input.id}" must define root.`,
      2,
    );
  }

  const trust =
    typeof input.trust === "string" && TRUST_STATES.has(input.trust as TrustState)
      ? (input.trust as TrustState)
      : undefined;
  const ignore = readStringArray(input.ignore);
  const compatibility = readStringArray(input.compatibility)?.filter(
    (item): item is "codex" | "claude-code" | "antigravity" =>
      item === "codex" ||
      item === "claude-code" ||
      item === "antigravity",
  );

  return {
    id: input.id,
    root: path.resolve(baseDir, input.root),
    ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
    ...(trust ? { trust } : {}),
    ...(typeof input.followSymlinks === "boolean"
      ? { followSymlinks: input.followSymlinks }
      : {}),
    ...(typeof input.maxDepth === "number" ? { maxDepth: input.maxDepth } : {}),
    ...(ignore ? { ignore } : {}),
    ...(compatibility ? { compatibility } : {}),
  };
}

function parseDefaults(
  value: unknown,
  overrides: Partial<StashDefaults> | undefined,
): StashDefaults {
  const input = asObject(value);
  return {
    pageSize:
      overrides?.pageSize ??
      (typeof input.pageSize === "number" ? input.pageSize : DEFAULTS.pageSize),
    cacheTtlMs:
      overrides?.cacheTtlMs ??
      (typeof input.cacheTtlMs === "number"
        ? input.cacheTtlMs
        : DEFAULTS.cacheTtlMs),
    materialScoreThreshold:
      overrides?.materialScoreThreshold ??
      (typeof input.materialScoreThreshold === "number"
        ? input.materialScoreThreshold
        : DEFAULTS.materialScoreThreshold),
    locale:
      overrides?.locale ??
      (typeof input.locale === "string" ? input.locale : DEFAULTS.locale),
  };
}

export async function loadConfiguration(
  options: CreateStashCatalogOptions,
): Promise<{
  configuration: StashConfiguration;
  cacheDir: string;
  configPath?: string;
}> {
  const cacheDir = path.resolve(options.cacheDir ?? platformCachePath());

  if (options.catalogs) {
    let catalogs = options.catalogs.map((catalog) => ({
      ...catalog,
      root: path.resolve(catalog.root),
    }));
    const managedRoot = options.managedRoot
      ? path.resolve(options.managedRoot)
      : undefined;
    if (managedRoot) {
      catalogs = await includeManagedCatalog(catalogs, managedRoot);
    }
    validateUniqueCatalogIds(catalogs);
    return {
      configuration: {
        version: 1,
        catalogs,
        defaults: parseDefaults(undefined, options.defaults),
        ...(managedRoot ? { managedRoot } : {}),
      },
      cacheDir,
    };
  }

  const explicitConfig = options.configPath ?? process.env.STASH_CONFIG;
  const configPath = path.resolve(explicitConfig ?? platformConfigPath());

  try {
    const source = await readFile(configPath, "utf8");
    const parsed = asObject(parse(source));
    if (parsed.version !== 1) {
      throw new StashError(
        "unsupported-config",
        `Config "${configPath}" must use version: 1.`,
        5,
      );
    }
    if (parsed.catalogs !== undefined && !Array.isArray(parsed.catalogs)) {
      throw new StashError(
        "invalid-config",
        `Config "${configPath}" catalogs must be an array.`,
        2,
      );
    }
    const baseDir = path.dirname(configPath);
    let catalogs = (Array.isArray(parsed.catalogs) ? parsed.catalogs : []).map((catalog, index) =>
      parseCatalog(catalog, baseDir, index),
    );
    const configuredManagedRoot =
      typeof parsed.managedRoot === "string" && parsed.managedRoot.trim()
        ? path.resolve(baseDir, parsed.managedRoot)
        : undefined;
    const managedRoot = path.resolve(
      options.managedRoot ??
        process.env.STASH_MANAGED_HOME ??
        configuredManagedRoot ??
        platformManagedPath(),
    );
    catalogs = await includeManagedCatalog(catalogs, managedRoot);
    validateUniqueCatalogIds(catalogs);
    return {
      configuration: {
        version: 1,
        catalogs,
        defaults: parseDefaults(parsed.defaults, options.defaults),
        managedRoot,
      },
      cacheDir,
      configPath,
    };
  } catch (error) {
    if (error instanceof StashError) {
      throw error;
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code !== "ENOENT") {
      throw new StashError(
        "invalid-config",
        `Unable to read config "${configPath}": ${String(error)}`,
        2,
      );
    }
  }

  const managedRoot = path.resolve(
    options.managedRoot ??
      process.env.STASH_MANAGED_HOME ??
      platformManagedPath(),
  );

  if (process.env.STASH_HOME) {
    const catalogs = await includeManagedCatalog(
      [
        {
          id: "default",
          root: path.resolve(process.env.STASH_HOME),
          enabled: true,
          trust: "unreviewed",
          followSymlinks: false,
        },
      ],
      managedRoot,
    );
    return {
      configuration: {
        version: 1,
        catalogs,
        defaults: parseDefaults(undefined, options.defaults),
        managedRoot,
      },
      cacheDir,
    };
  }

  if (explicitConfig) {
    throw new StashError(
      "config-not-found",
      `Stash config was not found at "${configPath}".`,
      2,
    );
  }

  const catalogs = await includeManagedCatalog([], managedRoot);
  return {
    configuration: {
      version: 1,
      catalogs,
      defaults: parseDefaults(undefined, options.defaults),
      managedRoot,
    },
    cacheDir,
  };
}

async function includeManagedCatalog(
  catalogs: CatalogRegistration[],
  managedRoot: string,
): Promise<CatalogRegistration[]> {
  if (catalogs.some((catalog) => catalog.id === "managed")) {
    throw new StashError(
      "invalid-config",
      'Catalog id "managed" is reserved for the Stash-managed store.',
      2,
    );
  }
  const canonicalManagedRoot = await canonicalPotentialPath(managedRoot);
  for (const catalog of catalogs) {
    const canonicalCatalogRoot = await canonicalPotentialPath(catalog.root);
    if (
      isPathInside(canonicalCatalogRoot, canonicalManagedRoot) ||
      isPathInside(canonicalManagedRoot, canonicalCatalogRoot)
    ) {
      throw new StashError(
        "invalid-config",
        `Managed root must be separate from external catalog "${catalog.id}": "${managedRoot}" overlaps "${catalog.root}".`,
        2,
      );
    }
  }
  try {
    const info = await stat(managedRoot);
    if (!info.isDirectory()) {
      throw new StashError(
        "invalid-config",
        `Managed root is not a directory: "${managedRoot}".`,
        2,
      );
    }
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") {
      return catalogs;
    }
    throw error;
  }
  return [
    ...catalogs,
    {
      id: "managed",
      root: managedRoot,
      enabled: true,
      trust: "unreviewed",
      followSymlinks: false,
      compatibility: ["codex", "claude-code", "antigravity"],
    },
  ];
}

async function canonicalPotentialPath(input: string): Promise<string> {
  const absolute = path.resolve(input);
  const missingSegments: string[] = [];
  let candidate = absolute;
  while (true) {
    try {
      const canonical = await realpath(candidate);
      return path.resolve(canonical, ...missingSegments.reverse());
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        return absolute;
      }
      missingSegments.push(path.basename(candidate));
      candidate = parent;
    }
  }
}

function validateUniqueCatalogIds(catalogs: CatalogRegistration[]): void {
  const seen = new Set<string>();
  for (const catalog of catalogs) {
    if (seen.has(catalog.id)) {
      throw new StashError(
        "invalid-config",
        `Duplicate catalog id "${catalog.id}".`,
        2,
      );
    }
    seen.add(catalog.id);
  }
}
