export const RESULT_SCHEMA_VERSION = 1 as const;
export const INDEX_SCHEMA_VERSION = 2 as const;

export type Vendor = "codex" | "claude-code" | "antigravity";
export type LifecycleHost =
  | "codex"
  | "claude-code"
  | "antigravity-ide"
  | "antigravity-cli";
export type LifecycleScope = "user" | "workspace";
export type CompatibilityState = "supported" | "partial" | "unsupported" | "unknown";
export type TrustState = "trusted" | "reviewed" | "unreviewed" | "quarantined";
export type RelevanceTier = "exact" | "strong" | "material" | "possible";

export interface VendorCompatibility {
  codex: CompatibilityState;
  "claude-code": CompatibilityState;
  antigravity: CompatibilityState;
}

export interface CatalogSource {
  id?: string;
  displayName?: string;
  url?: string;
  revision?: string;
  license?: string;
}

export interface CatalogRisk {
  level?: string;
  capabilities: string[];
}

export interface RelatedSkillCopy {
  kind: "source" | "deployment";
  catalogId: string;
  ref: string;
  skillId: string;
  targetId?: string;
  host?: LifecycleHost;
  scope?: LifecycleScope;
}

export interface SkillRecord {
  ref: string;
  catalogId: string;
  group?: string;
  name: string;
  description: string;
  relativeSkillFile: string;
  aliases: string[];
  tags: string[];
  intents: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  compatibility: VendorCompatibility;
  trust: TrustState;
  source: CatalogSource;
  risk: CatalogRisk;
  contentHash: string;
  modifiedMs: number;
  size: number;
  managedSkillId?: string;
  relatedCopies?: RelatedSkillCopy[];
}

export interface CatalogWarning {
  code: string;
  message: string;
  ref?: string;
  path?: string;
}

export interface CatalogIndex {
  schemaVersion: typeof INDEX_SCHEMA_VERSION;
  catalogId: string;
  root: string;
  generatedAt: string;
  fingerprint: string;
  records: SkillRecord[];
  warnings: CatalogWarning[];
}

export interface CatalogRegistration {
  id: string;
  root: string;
  enabled?: boolean;
  trust?: TrustState;
  followSymlinks?: boolean;
  maxDepth?: number;
  ignore?: string[];
  compatibility?: Vendor[];
}

export interface StashDefaults {
  pageSize: number;
  cacheTtlMs: number;
  materialScoreThreshold: number;
  locale: string;
}

export interface StashConfiguration {
  version: 1;
  catalogs: CatalogRegistration[];
  defaults: StashDefaults;
  managedRoot?: string;
}

export interface CreateStashCatalogOptions {
  configPath?: string;
  cacheDir?: string;
  managedRoot?: string;
  catalogs?: CatalogRegistration[];
  defaults?: Partial<StashDefaults>;
  now?: () => number;
}

export type CreateStashLifecycleOptions = CreateStashCatalogOptions;

export interface ResolveFilters {
  catalogIds?: string[];
  sources?: string[];
  group?: string;
}

export type ResolveRequest =
  | (ResolveFilters & {
      kind: "exact";
      name: string;
    })
  | (ResolveFilters & {
      kind: "search";
      query: string;
      cursor?: string;
      pageSize?: number;
      includePossible?: boolean;
    })
  | (ResolveFilters & {
      kind: "list";
      cursor?: string;
      pageSize?: number;
    });

export interface RelevanceReason {
  kind:
    | "name"
    | "alias"
    | "intent"
    | "tag"
    | "description"
    | "example"
    | "source"
    | "typo";
  value: string;
}

export interface ResolvedSkill {
  ref: string;
  catalogId: string;
  group?: string;
  name: string;
  description: string;
  compatibility: VendorCompatibility;
  trust: TrustState;
  source?: CatalogSource;
  contentHash: string;
  managedSkillId?: string;
  relatedCopies?: RelatedSkillCopy[];
  relevance?: {
    tier: RelevanceTier;
    score: number;
    reasons: RelevanceReason[];
  };
}

export interface ResolveResult {
  schemaVersion: typeof RESULT_SCHEMA_VERSION;
  status:
    | "ok"
    | "no-match"
    | "ambiguous-exact"
    | "catalog-unavailable"
    | "invalid-request"
    | "cursor-stale";
  mode: "exact" | "search" | "list";
  totalRelevant: number;
  totalPossible: number;
  page: {
    size: number;
    nextCursor?: string;
  };
  matches: ResolvedSkill[];
  diagnostics: {
    indexVersion: typeof INDEX_SCHEMA_VERSION;
    stale: boolean;
    elapsedMs: number;
    expandedTerms?: string[];
    warnings?: CatalogWarning[];
  };
}

export interface ReadRequest {
  ref: string;
  resource?: string;
  expectedHash?: string;
  representation?: "content" | "local-path";
}

export interface ReadResult {
  schemaVersion: typeof RESULT_SCHEMA_VERSION;
  status:
    | "ok"
    | "not-found"
    | "hash-mismatch"
    | "resource-outside-skill"
    | "quarantined"
    | "unsupported-resource";
  ref: string;
  resource: string;
  mediaType?: string;
  contentHash?: string;
  content?: string;
  localPath?: string;
  bytes?: number;
}

export interface RefreshRequest {
  catalogIds?: string[];
  force?: boolean;
}

export interface RefreshResult {
  status: "ok" | "partial" | "failed";
  catalogs: Array<{
    catalogId: string;
    indexed: number;
    skipped: number;
    warnings: CatalogWarning[];
  }>;
}

export interface DoctorRequest {
  catalogIds?: string[];
  verifyHashes?: boolean;
}

export interface DoctorResult {
  status: "ok" | "warning" | "failed";
  catalogs: Array<{
    catalogId: string;
    root: string;
    records: number;
    warnings: CatalogWarning[];
    fingerprint: string;
  }>;
}

export interface StashCatalog {
  resolve(request: ResolveRequest): Promise<ResolveResult>;
  read(request: ReadRequest): Promise<ReadResult>;
  refresh(request?: RefreshRequest): Promise<RefreshResult>;
  doctor(request?: DoctorRequest): Promise<DoctorResult>;
}

export interface LifecycleSource {
  kind: "local-import" | "standalone-archive";
  location: string;
  importedAt: string;
  updatedAt?: string;
  url?: string;
  revision?: string;
}

export interface LifecycleDeployment {
  deploymentId: string;
  skillId: string;
  targetId: string;
  host: LifecycleHost;
  scope: LifecycleScope;
  root: string;
  path: string;
  method: "copy";
  ownership: "stash";
  treeHash: string;
  deployedAt: string;
}

export interface ManagedSkillRecord {
  schemaVersion: 1;
  skillId: string;
  name: string;
  treeHash: string;
  source: LifecycleSource;
  compatibility: VendorCompatibility;
  deployments: LifecycleDeployment[];
  lastValidatedAt: string;
  lastUpdatedAt?: string;
}

export interface LifecycleHostTarget {
  host: LifecycleHost;
  scope?: LifecycleScope;
  workspace?: string;
}

export interface LifecycleInstallRequest {
  source: string;
  sourceUrl?: string;
  revision?: string;
}

export interface LifecycleUpdateRequest {
  source: string;
  expectedTreeHash: string;
  expectedRevision?: string;
  sourceUrl?: string;
  revision?: string;
}

export interface LifecycleArchiveRequest {
  source: string;
  target: LifecycleHostTarget;
  sourceUrl?: string;
  revision?: string;
}

export interface LifecycleActivateRequest {
  name: string;
  target: LifecycleHostTarget;
}

export interface LifecycleDeactivateRequest {
  name: string;
  target: LifecycleHostTarget;
}

export interface LifecycleStatusRequest {
  name?: string;
}

export interface LifecycleMutationResult {
  status:
    | "stored"
    | "deployed"
    | "deactivated"
    | "already-stored"
    | "already-deployed"
    | "updated"
    | "metadata-updated"
    | "already-current";
  name: string;
  skillId: string;
  managedPath: string;
  treeHash: string;
  previousTreeHash?: string;
  previousRevision?: string;
  revision?: string;
  deploymentsPreserved?: number;
  outdatedDeployments?: number;
  deployment?: LifecycleDeployment;
  reloadRequired?: boolean;
  warning?: string;
}

export interface LifecycleSkillStatus {
  skillId: string;
  name: string;
  managedPath: string;
  store: {
    state: "stored" | "missing";
    integrity: "verified" | "drifted" | "unknown";
    expectedTreeHash: string;
    actualTreeHash?: string;
  };
  source: LifecycleSource;
  outdatedDeployments: number;
  deployments: Array<
    LifecycleDeployment & {
      state: "deployed" | "missing" | "drifted";
      integrity: "verified" | "drifted" | "unknown";
      current: boolean;
      actualTreeHash?: string;
      hostObservation: {
        override: "unknown";
        discovery: "present" | "absent" | "unknown";
        refresh: "live" | "restart-required" | "unknown";
      };
    }
  >;
}

export interface LifecycleStatusResult {
  status: "ok" | "not-found";
  managedRoot: string;
  skills: LifecycleSkillStatus[];
}

export interface StashLifecycle {
  install(request: LifecycleInstallRequest): Promise<LifecycleMutationResult>;
  update(request: LifecycleUpdateRequest): Promise<LifecycleMutationResult>;
  archive(request: LifecycleArchiveRequest): Promise<LifecycleMutationResult>;
  activate(request: LifecycleActivateRequest): Promise<LifecycleMutationResult>;
  deactivate(
    request: LifecycleDeactivateRequest,
  ): Promise<LifecycleMutationResult>;
  status(request?: LifecycleStatusRequest): Promise<LifecycleStatusResult>;
}

export class StashError extends Error {
  readonly exitCode: number;
  readonly code: string;

  constructor(code: string, message: string, exitCode = 10) {
    super(message);
    this.name = "StashError";
    this.code = code;
    this.exitCode = exitCode;
  }
}
