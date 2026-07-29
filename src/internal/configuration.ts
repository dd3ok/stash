import { readFile } from "node:fs/promises";
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
import { platformCachePath, platformConfigPath } from "./util.js";

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
    const catalogs = options.catalogs.map((catalog) => ({
      ...catalog,
      root: path.resolve(catalog.root),
    }));
    validateUniqueCatalogIds(catalogs);
    return {
      configuration: {
        version: 1,
        catalogs,
        defaults: parseDefaults(undefined, options.defaults),
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
    if (!Array.isArray(parsed.catalogs)) {
      throw new StashError(
        "invalid-config",
        `Config "${configPath}" must define a catalogs array.`,
        2,
      );
    }
    const baseDir = path.dirname(configPath);
    const catalogs = parsed.catalogs.map((catalog, index) =>
      parseCatalog(catalog, baseDir, index),
    );
    validateUniqueCatalogIds(catalogs);
    return {
      configuration: {
        version: 1,
        catalogs,
        defaults: parseDefaults(parsed.defaults, options.defaults),
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

  if (process.env.STASH_HOME) {
    return {
      configuration: {
        version: 1,
        catalogs: [
          {
            id: "default",
            root: path.resolve(process.env.STASH_HOME),
            enabled: true,
            trust: "unreviewed",
            followSymlinks: false,
          },
        ],
        defaults: parseDefaults(undefined, options.defaults),
      },
      cacheDir,
    };
  }

  throw new StashError(
    "config-not-found",
    `Stash config was not found at "${configPath}". Set STASH_CONFIG, STASH_HOME, or pass --config.`,
    2,
  );
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
