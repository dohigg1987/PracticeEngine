export interface DependencyVersion {
  objectType: string;
  objectId: string;
  version: number;
  contentHash: string;
}

export interface Signoff {
  id: string;
  objectType: string;
  objectId: string;
  objectVersion: number;
  signedBy: string;
  signedAt: string;
  dependencies: DependencyVersion[];
  status: "VALID" | "INVALIDATED";
  invalidatedAt?: string;
  invalidationReason?: string;
}

function dependencyKey(dependency: DependencyVersion): string {
  return `${dependency.objectType}:${dependency.objectId}`;
}

export function invalidateSignoff(signoff: Signoff, currentDependencies: DependencyVersion[], occurredAt: string): Signoff {
  if (signoff.status === "INVALIDATED") return signoff;
  const current = new Map(currentDependencies.map((dependency) => [dependencyKey(dependency), dependency]));
  const changed = signoff.dependencies.find((signed) => {
    const latest = current.get(dependencyKey(signed));
    return !latest || latest.version !== signed.version || latest.contentHash !== signed.contentHash;
  });
  if (!changed) return signoff;
  return {
    ...signoff,
    status: "INVALIDATED",
    invalidatedAt: occurredAt,
    invalidationReason: `DEPENDENCY_CHANGED:${dependencyKey(changed)}`,
  };
}
