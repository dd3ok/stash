import { homedir } from "node:os";
import path from "node:path";
import type {
  LifecycleHost,
  LifecycleHostTarget,
  LifecycleScope,
} from "../types.js";
import { StashError } from "../types.js";

export interface ResolvedLifecycleTarget {
  host: LifecycleHost;
  scope: LifecycleScope;
  root: string;
}

export function resolveLifecycleTarget(
  target: LifecycleHostTarget,
  homeDirectory = homedir(),
): ResolvedLifecycleTarget {
  if (target.host === "antigravity-cli") {
    throw new StashError(
      "unsupported-host-layout",
      "Antigravity CLI standalone skills use flat Markdown in both user and workspace scopes; folder lifecycle is unsupported.",
      2,
    );
  }
  if (target.scope === "workspace" || target.workspace) {
    throw new StashError(
      "unsupported-host-scope",
      "Workspace lifecycle targets are not supported in this release.",
      2,
    );
  }
  const scope = target.scope ?? "user";
  switch (target.host) {
    case "codex":
      return {
        host: target.host,
        scope,
        root: path.join(homeDirectory, ".agents", "skills"),
      };
    case "claude-code":
      return {
        host: target.host,
        scope,
        root: path.join(homeDirectory, ".claude", "skills"),
      };
    case "antigravity-ide":
      return {
        host: target.host,
        scope,
        root: path.join(homeDirectory, ".gemini", "config", "skills"),
      };
  }
}

export function lifecycleReloadRequired(host: LifecycleHost): boolean {
  return host !== "claude-code";
}

export function lifecycleRefreshObservation(
  host: LifecycleHost,
): "live" | "restart-required" {
  return lifecycleReloadRequired(host) ? "restart-required" : "live";
}
