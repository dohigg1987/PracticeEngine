import { createHash } from "node:crypto";

export type AccountsVersionStatus = "DRAFT" | "REVIEWED" | "APPROVED" | "FINAL" | "FILED" | "SUPERSEDED";

export interface ManifestDependency {
  objectType: string;
  objectId: string;
  version: number;
  contentHash: string;
}

export interface AccountsManifest {
  engagementId: string;
  accountsVersion: number;
  trialBalanceId: string;
  frameworkPackId: string;
  taxonomyVersion: string;
  dependencies: ManifestDependency[];
  generatedAt: string;
}

export interface FrozenAccountsVersion {
  manifest: AccountsManifest;
  manifestHash: string;
  status: AccountsVersionStatus;
  frozenAt: string;
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function freezeAccountsVersion(manifest: AccountsManifest, frozenAt: string): FrozenAccountsVersion {
  if (manifest.accountsVersion < 1) throw new Error("ACCOUNTS_VERSION_INVALID");
  if (!manifest.dependencies.length) throw new Error("ACCOUNTS_DEPENDENCIES_REQUIRED");
  const keys = new Set<string>();
  const dependencies = [...manifest.dependencies].sort((a, b) => `${a.objectType}:${a.objectId}`.localeCompare(`${b.objectType}:${b.objectId}`));
  for (const dependency of dependencies) {
    const key = `${dependency.objectType}:${dependency.objectId}`;
    if (keys.has(key)) throw new Error(`ACCOUNTS_DEPENDENCY_DUPLICATE:${key}`);
    if (dependency.version < 1 || !dependency.contentHash) throw new Error(`ACCOUNTS_DEPENDENCY_INVALID:${key}`);
    keys.add(key);
  }
  const normalized = { ...manifest, dependencies };
  return { manifest: normalized, manifestHash: sha256Canonical(normalized), status: "FINAL", frozenAt };
}

export function verifyAccountsVersion(version: FrozenAccountsVersion): boolean {
  return version.manifestHash === sha256Canonical(version.manifest);
}

export interface FilingAttemptState {
  attemptNo: number;
  regulator: "COMPANIES_HOUSE" | "HMRC" | "CCEW" | "OSCR" | "CCNI" | "DFE";
  status: "PREPARED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "FAILED" | "WITHDRAWN";
  accountsManifestHash: string;
  payloadHash: string;
  regulatorReference?: string;
}

export function transitionFiling(attempt: FilingAttemptState, next: FilingAttemptState["status"], regulatorReference?: string): FilingAttemptState {
  const allowed: Record<FilingAttemptState["status"], readonly FilingAttemptState["status"][]> = {
    PREPARED: ["SUBMITTED", "WITHDRAWN"],
    SUBMITTED: ["ACCEPTED", "REJECTED", "FAILED"],
    ACCEPTED: [], REJECTED: [], FAILED: [], WITHDRAWN: [],
  };
  if (!allowed[attempt.status].includes(next)) throw new Error(`FILING_TRANSITION_NOT_ALLOWED:${attempt.status}:${next}`);
  if (next === "ACCEPTED" && !regulatorReference) throw new Error("FILING_REGULATOR_REFERENCE_REQUIRED");
  return { ...attempt, status: next, regulatorReference: regulatorReference ?? attempt.regulatorReference };
}
