import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createRetentionInventoryEvidence,
  readCompleteR2Inventory,
  type DatabaseArtifactReference,
  type RetentionScopeSnapshot,
} from "../src/retention-inventory.ts";

const scope: RetentionScopeSnapshot = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  engagementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  policyCode: "ACCOUNTING_RECORDS",
  policyVersionNo: 1,
  retentionUntil: "2033-12-31T00:00:00.000Z",
  eligible: false,
  activeHoldReferences: ["LITIGATION-1"],
};

function reference(
  key: string,
  hash: string | null,
  sourceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
): DatabaseArtifactReference {
  return {
    key,
    expectedSha256: hash,
    tenantId: scope.tenantId,
    engagementId: scope.engagementId,
    sourceTable: "accounts_version",
    sourceId,
    artifactKind: "ACCOUNTS_PDF",
  };
}

test("R2 inventory follows every cursor and canonicalises object order", async () => {
  const seen: Array<string | undefined> = [];
  const inventory = await readCompleteR2Inventory(async (cursor) => {
    seen.push(cursor);
    return cursor
      ? {
          objects: [{ key: "a", size: 1, etag: "a", uploadedAt: null }],
          truncated: false,
        }
      : {
          objects: [{ key: "z", size: 2, etag: "z", uploadedAt: null }],
          truncated: true,
          cursor: "next",
        };
  });
  assert.deepEqual(seen, [undefined, "next"]);
  assert.equal(inventory.pageCount, 2);
  assert.deepEqual(inventory.objects.map((object) => object.key), ["a", "z"]);
});

test("R2 pagination fails closed on repeated cursors and safety limits", async () => {
  await assert.rejects(
    readCompleteR2Inventory(async () => ({
      objects: [],
      truncated: true,
      cursor: "same",
    })),
    /repeated continuation cursor/,
  );
  await assert.rejects(
    readCompleteR2Inventory(async () => ({
      objects: [
        { key: "a", size: 1, etag: null, uploadedAt: null },
        { key: "b", size: 1, etag: null, uploadedAt: null },
      ],
      truncated: false,
    }), 1),
    /object safety limit/,
  );
});

test("evidence finds conflicts, missing hashes, R2 mismatches, missing and orphan objects", async () => {
  const hashA = "a".repeat(64), hashB = "b".repeat(64);
  const evidence = await createRetentionInventoryEvidence({
    generatedAt: "2026-08-18T12:00:00.000Z",
    scope,
    bucketName: "test-bucket",
    prefix: `tenants/${scope.tenantId}/engagements/${scope.engagementId}/`,
    databaseReferences: [
      reference("conflict", hashA, "10000000-0000-4000-8000-000000000001"),
      reference("conflict", hashB, "10000000-0000-4000-8000-000000000002"),
      reference("unverifiable", null),
      reference("missing", hashA),
      reference("mismatch", hashA),
      reference("metadata-missing", hashA),
    ],
    r2Objects: [
      { key: "conflict", size: 1, etag: null, uploadedAt: null, metadataSha256: hashA },
      { key: "unverifiable", size: 1, etag: null, uploadedAt: null },
      { key: "mismatch", size: 1, etag: null, uploadedAt: null, metadataSha256: hashB },
      { key: "metadata-missing", size: 1, etag: null, uploadedAt: null },
      { key: "orphan", size: 1, etag: null, uploadedAt: null, metadataSha256: hashA },
    ],
    r2PageCount: 1,
  });
  assert.deepEqual(
    new Set(evidence.findings.map((finding) => finding.code)),
    new Set([
      "DATABASE_HASH_CONFLICT",
      "DATABASE_KEY_OUTSIDE_SCOPE_PREFIX",
      "DATABASE_HASH_UNAVAILABLE",
      "R2_OBJECT_MISSING",
      "R2_HASH_METADATA_MISSING",
      "R2_HASH_METADATA_MISMATCH",
      "R2_OBJECT_UNREFERENCED",
    ]),
  );
  assert.equal(evidence.databaseInventory.queryComplete, true);
  assert.equal(evidence.r2Inventory.continuationComplete, true);
  assert.equal(evidence.destructiveActionAuthorized, false);
  assert.ok(evidence.findings.every((finding) => finding.action === "REVIEW_ONLY"));
});

test("checksum is deterministic and excludes the display generation timestamp", async () => {
  const input = {
    scope,
    bucketName: "test-bucket",
    prefix: `tenants/${scope.tenantId}/`,
    databaseReferences: [reference("a", "a".repeat(64))],
    r2Objects: [{
      key: "a",
      size: 1,
      etag: "etag",
      uploadedAt: "2026-08-18T00:00:00.000Z",
      metadataSha256: "a".repeat(64),
    }],
    r2PageCount: 1,
  };
  const first = await createRetentionInventoryEvidence({
    ...input,
    generatedAt: "2026-08-18T12:00:00.000Z",
  });
  const second = await createRetentionInventoryEvidence({
    ...input,
    generatedAt: "2026-08-19T12:00:00.000Z",
  });
  assert.equal(first.inventoryChecksum, second.inventoryChecksum);
  assert.match(first.inventoryChecksum, /^[0-9a-f]{64}$/);
});

test("owner CLI has no destructive R2 command or database mutation statement", async () => {
  const source = await readFile(
    new URL("../scripts/retention-inventory.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /DeleteObjectCommand|PutObjectCommand/);
  assert.doesNotMatch(source, /tx`\s*(insert|update|delete|truncate|drop|alter)\b/i);
  assert.match(source, /read only isolation level repeatable read/);
  assert.match(source, /--purge/);
  assert.match(source, /permanently read-only/);
});
