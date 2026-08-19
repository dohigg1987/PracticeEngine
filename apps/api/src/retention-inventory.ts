import { canonicalJson } from "./workflow.ts";

export const RETENTION_INVENTORY_CONTRACT_VERSION = 1 as const;
export const RETENTION_INVENTORY_MAX_OBJECTS = 100_000;

export interface DatabaseArtifactReference {
  key: string;
  expectedSha256: string | null;
  tenantId: string;
  engagementId: string | null;
  sourceTable: string;
  sourceId: string;
  artifactKind: string;
}

export interface R2ListedObject {
  key: string;
  size: number;
  etag: string | null;
  uploadedAt: string | null;
  metadataSha256?: string | null;
}

export interface R2InventoryPage {
  objects: R2ListedObject[];
  truncated: boolean;
  cursor?: string;
}

export type R2PageReader = (
  cursor: string | undefined,
) => Promise<R2InventoryPage>;

export interface RetentionScopeSnapshot {
  id: string;
  tenantId: string;
  engagementId: string | null;
  policyCode: string;
  policyVersionNo: number;
  retentionUntil: string;
  eligible: boolean;
  activeHoldReferences: string[];
}

export interface InventoryFinding {
  code:
    | "DATABASE_HASH_CONFLICT"
    | "DATABASE_HASH_INVALID"
    | "DATABASE_HASH_UNAVAILABLE"
    | "DATABASE_KEY_OUTSIDE_SCOPE_PREFIX"
    | "R2_OBJECT_MISSING"
    | "R2_OBJECT_UNREFERENCED"
    | "R2_HASH_METADATA_MISSING"
    | "R2_HASH_METADATA_MISMATCH";
  key: string;
  expectedSha256?: string | null;
  observedSha256?: string | null;
  detail: string;
  action: "REVIEW_ONLY";
}

interface CanonicalDatabaseArtifact {
  key: string;
  expectedSha256: string | null;
  tenantId: string;
  engagementIds: string[];
  references: Array<{
    table: string;
    id: string;
    kind: string;
  }>;
  hashConflict: boolean;
}

export interface RetentionInventoryEvidence {
  contractVersion: 1;
  mode: "DRY_RUN_READ_ONLY";
  generatedAt: string;
  scope: RetentionScopeSnapshot;
  databaseInventory: {
    contractVersion: 1;
    queryComplete: true;
    scopeId: string;
    artifacts: CanonicalDatabaseArtifact[];
    inventoryHash: string;
  };
  r2Inventory: {
    contractVersion: 1;
    continuationComplete: true;
    bucketName: string;
    prefix: string;
    pageCount: number;
    objects: R2ListedObject[];
    inventoryHash: string;
  };
  findings: InventoryFinding[];
  summary: Record<string, number>;
  inventoryChecksum: string;
  destructiveActionAuthorized: false;
}

function normalizedSha256(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.toLowerCase();
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function readCompleteR2Inventory(
  readPage: R2PageReader,
  maximumObjects = RETENTION_INVENTORY_MAX_OBJECTS,
): Promise<{ objects: R2ListedObject[]; pageCount: number }> {
  if (!Number.isSafeInteger(maximumObjects) || maximumObjects < 1)
    throw new Error("maximumObjects must be a positive safe integer");

  const objects: R2ListedObject[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let pageCount = 0;

  for (;;) {
    const page = await readPage(cursor);
    pageCount += 1;
    objects.push(...page.objects);
    if (objects.length > maximumObjects)
      throw new Error(
        `R2 inventory exceeds the configured ${maximumObjects} object safety limit`,
      );
    if (!page.truncated) break;
    if (!page.cursor)
      throw new Error("R2 inventory was truncated without a continuation cursor");
    if (seenCursors.has(page.cursor))
      throw new Error("R2 inventory returned a repeated continuation cursor");
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }

  return {
    objects: objects
      .map((item) => ({
        ...item,
        metadataSha256: normalizedSha256(item.metadataSha256),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    pageCount,
  };
}

function canonicalDatabaseArtifacts(
  references: DatabaseArtifactReference[],
): CanonicalDatabaseArtifact[] {
  const byKey = new Map<string, DatabaseArtifactReference[]>();
  for (const reference of references) {
    const current = byKey.get(reference.key) ?? [];
    current.push(reference);
    byKey.set(reference.key, current);
  }

  return [...byKey.entries()]
    .map(([key, items]) => {
      const hashes = [
        ...new Set(
          items
            .map((item) => normalizedSha256(item.expectedSha256))
            .filter((hash): hash is string => hash !== null),
        ),
      ].sort();
      return {
        key,
        expectedSha256: hashes.length === 1 ? hashes[0]! : null,
        tenantId: items[0]!.tenantId,
        engagementIds: [
          ...new Set(
            items
              .map((item) => item.engagementId)
              .filter((id): id is string => id !== null),
          ),
        ].sort(),
        references: items
          .map((item) => ({
            table: item.sourceTable,
            id: item.sourceId,
            kind: item.artifactKind,
          }))
          .sort((left, right) =>
            `${left.table}:${left.id}:${left.kind}`.localeCompare(
              `${right.table}:${right.id}:${right.kind}`,
            ),
          ),
        hashConflict: hashes.length > 1,
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

function findingsFor(
  databaseArtifacts: CanonicalDatabaseArtifact[],
  r2Objects: R2ListedObject[],
  expectedPrefix: string,
): InventoryFinding[] {
  const findings: InventoryFinding[] = [];
  const databaseByKey = new Map(
    databaseArtifacts.map((artifact) => [artifact.key, artifact]),
  );
  const r2ByKey = new Map(r2Objects.map((object) => [object.key, object]));

  for (const artifact of databaseArtifacts) {
    if (!artifact.key.startsWith(expectedPrefix))
      findings.push({
        code: "DATABASE_KEY_OUTSIDE_SCOPE_PREFIX",
        key: artifact.key,
        detail: "The database key is outside the selected tenant or engagement R2 prefix",
        action: "REVIEW_ONLY",
      });
    if (artifact.hashConflict)
      findings.push({
        code: "DATABASE_HASH_CONFLICT",
        key: artifact.key,
        detail: "Database references disagree on the expected SHA-256 hash",
        action: "REVIEW_ONLY",
      });
    else if (!artifact.expectedSha256)
      findings.push({
        code: "DATABASE_HASH_UNAVAILABLE",
        key: artifact.key,
        expectedSha256: null,
        detail:
          "The database has an object key but no immutable content hash; byte integrity cannot be established",
        action: "REVIEW_ONLY",
      });
    else if (!/^[0-9a-f]{64}$/.test(artifact.expectedSha256))
      findings.push({
        code: "DATABASE_HASH_INVALID",
        key: artifact.key,
        expectedSha256: artifact.expectedSha256,
        detail: "The database content hash is not a lowercase hexadecimal SHA-256 value",
        action: "REVIEW_ONLY",
      });

    const object = r2ByKey.get(artifact.key);
    if (!object) {
      findings.push({
        code: "R2_OBJECT_MISSING",
        key: artifact.key,
        expectedSha256: artifact.expectedSha256,
        detail: "The database references an object absent from the complete R2 listing",
        action: "REVIEW_ONLY",
      });
      continue;
    }
    if (!artifact.expectedSha256) continue;
    if (!object.metadataSha256)
      findings.push({
        code: "R2_HASH_METADATA_MISSING",
        key: artifact.key,
        expectedSha256: artifact.expectedSha256,
        observedSha256: null,
        detail: "R2 object metadata does not contain a sha256 value",
        action: "REVIEW_ONLY",
      });
    else if (object.metadataSha256 !== artifact.expectedSha256)
      findings.push({
        code: "R2_HASH_METADATA_MISMATCH",
        key: artifact.key,
        expectedSha256: artifact.expectedSha256,
        observedSha256: object.metadataSha256,
        detail: "R2 sha256 metadata differs from the database content hash",
        action: "REVIEW_ONLY",
      });
  }

  for (const object of r2Objects)
    if (!databaseByKey.has(object.key))
      findings.push({
        code: "R2_OBJECT_UNREFERENCED",
        key: object.key,
        observedSha256: object.metadataSha256 ?? null,
        detail:
          "The object is present under the selected tenant prefix but has no matching database reference in scope",
        action: "REVIEW_ONLY",
      });

  return findings.sort((left, right) =>
    `${left.key}:${left.code}`.localeCompare(`${right.key}:${right.code}`),
  );
}

export async function createRetentionInventoryEvidence(input: {
  generatedAt: string;
  scope: RetentionScopeSnapshot;
  bucketName: string;
  prefix: string;
  databaseReferences: DatabaseArtifactReference[];
  r2Objects: R2ListedObject[];
  r2PageCount: number;
}): Promise<RetentionInventoryEvidence> {
  const databaseArtifacts = canonicalDatabaseArtifacts(input.databaseReferences);
  const r2Objects = [...input.r2Objects].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const databaseInventoryHash = await sha256Hex(canonicalJson(databaseArtifacts));
  const r2InventoryHash = await sha256Hex(canonicalJson(r2Objects));
  const findings = findingsFor(databaseArtifacts, r2Objects, input.prefix);
  const summary: Record<string, number> = {
    databaseObjects: databaseArtifacts.length,
    r2Objects: r2Objects.length,
    findings: findings.length,
  };
  for (const finding of findings)
    summary[finding.code] = (summary[finding.code] ?? 0) + 1;

  const databaseInventory = {
    contractVersion: RETENTION_INVENTORY_CONTRACT_VERSION,
    queryComplete: true as const,
    scopeId: input.scope.id,
    artifacts: databaseArtifacts,
    inventoryHash: databaseInventoryHash,
  };
  const r2Inventory = {
    contractVersion: RETENTION_INVENTORY_CONTRACT_VERSION,
    continuationComplete: true as const,
    bucketName: input.bucketName,
    prefix: input.prefix,
    pageCount: input.r2PageCount,
    objects: r2Objects,
    inventoryHash: r2InventoryHash,
  };
  const inventoryChecksum = await sha256Hex(
    canonicalJson({
      contractVersion: RETENTION_INVENTORY_CONTRACT_VERSION,
      scope: input.scope,
      databaseInventory,
      r2Inventory,
      findings,
    }),
  );

  return {
    contractVersion: RETENTION_INVENTORY_CONTRACT_VERSION,
    mode: "DRY_RUN_READ_ONLY",
    generatedAt: input.generatedAt,
    scope: input.scope,
    databaseInventory,
    r2Inventory,
    findings,
    summary,
    inventoryChecksum,
    destructiveActionAuthorized: false,
  };
}
