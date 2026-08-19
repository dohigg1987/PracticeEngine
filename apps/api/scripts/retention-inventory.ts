#!/usr/bin/env node
import { HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import {
  createRetentionInventoryEvidence,
  readCompleteR2Inventory,
  type DatabaseArtifactReference,
  type R2ListedObject,
  type RetentionScopeSnapshot,
} from "../src/retention-inventory.ts";

interface Arguments {
  scopeId: string;
  output?: string;
  maximumObjects: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_FLAGS = new Set(["--apply", "--delete", "--purge", "--write"]);

function usage(): string {
  return "Usage: npm run retention:inventory -- --scope-id <uuid> [--output <file>] [--maximum-objects <1..100000>]";
}

export function parseArguments(values: string[]): Arguments {
  for (const value of values)
    if (FORBIDDEN_FLAGS.has(value.toLowerCase()))
      throw new Error(`${value} is forbidden: this command is permanently read-only`);

  let scopeId = "";
  let output: string | undefined;
  let maximumObjects = 100_000;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (value === "--scope-id") scopeId = values[++index] ?? "";
    else if (value === "--output") output = values[++index] ?? "";
    else if (value === "--maximum-objects")
      maximumObjects = Number(values[++index] ?? "");
    else if (value === "--help" || value === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${value}`);
  }
  if (!UUID.test(scopeId)) throw new Error("--scope-id must be a UUID");
  if (output === "") throw new Error("--output requires a file path");
  if (
    !Number.isSafeInteger(maximumObjects) ||
    maximumObjects < 1 ||
    maximumObjects > 100_000
  )
    throw new Error("--maximum-objects must be an integer from 1 to 100000");
  return { scopeId, output, maximumObjects };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function loadDatabaseInventory(scopeId: string): Promise<{
  scope: RetentionScopeSnapshot;
  references: DatabaseArtifactReference[];
}> {
  const connectionString = requiredEnvironment("RETENTION_DATABASE_URL");
  const expectedRole = process.env.RETENTION_EXPECTED_DATABASE_ROLE?.trim() || "neondb_owner";
  if (expectedRole === "accounts_app")
    throw new Error("RETENTION_EXPECTED_DATABASE_ROLE cannot be accounts_app");
  const sql = postgres(connectionString, { max: 1, prepare: false });
  try {
    return await sql.begin("read only isolation level repeatable read", async (tx) => {
      const identity = await tx`select current_user as role`;
      if (String(identity[0]?.role) !== expectedRole)
        throw new Error(
          `Database role mismatch: expected ${expectedRole}; refusing owner maintenance query`,
        );

      const scopes = await tx`
        select s.id,s.tenant_id,s.engagement_id,s.policy_code,s.policy_version_no,
          s.retention_until,retention_scope_is_eligible(s.id) as eligible
        from retention_scope s where s.id=${scopeId}::uuid`;
      if (scopes.length !== 1) throw new Error("Retention scope was not found");
      const row = scopes[0]!;
      const holds = await tx`
        select h.hold_reference
        from legal_hold h
        where h.tenant_id=${row.tenant_id}::uuid
          and (h.engagement_id is null or h.engagement_id=${row.engagement_id}::uuid)
          and not exists(select 1 from legal_hold_release r where r.legal_hold_id=h.id)
        order by h.hold_reference`;
      const artifactRows = await tx`
        select storage_key,content_hash,tenant_id,engagement_id,'import_batch' as source_table,
          id as source_id,'IMPORT_SOURCE' as artifact_kind
        from import_batch
        where tenant_id=${row.tenant_id}::uuid
          and (${row.engagement_id}::uuid is null or engagement_id=${row.engagement_id}::uuid)
        union all
        select storage_key,content_hash,tenant_id,engagement_id,'import_snapshot',id,'IMPORT_SNAPSHOT'
        from import_snapshot
        where tenant_id=${row.tenant_id}::uuid
          and (${row.engagement_id}::uuid is null or engagement_id=${row.engagement_id}::uuid)
        union all
        select html_storage_key,html_content_hash,tenant_id,engagement_id,'accounts_version',id,'ACCOUNTS_HTML'
        from accounts_version
        where html_storage_key is not null and tenant_id=${row.tenant_id}::uuid
          and (${row.engagement_id}::uuid is null or engagement_id=${row.engagement_id}::uuid)
        union all
        select pdf_storage_key,pdf_content_hash,tenant_id,engagement_id,'accounts_version',id,'ACCOUNTS_PDF'
        from accounts_version
        where pdf_storage_key is not null and tenant_id=${row.tenant_id}::uuid
          and (${row.engagement_id}::uuid is null or engagement_id=${row.engagement_id}::uuid)
        union all
        select ixbrl_storage_key,null::text,tenant_id,engagement_id,'accounts_version',id,'ACCOUNTS_IXBRL_UNVERIFIED'
        from accounts_version
        where ixbrl_storage_key is not null and tenant_id=${row.tenant_id}::uuid
          and (${row.engagement_id}::uuid is null or engagement_id=${row.engagement_id}::uuid)
        union all
        select payload_storage_key,payload_hash,tenant_id,engagement_id,'filing_attempt',id,'FILING_PAYLOAD'
        from filing_attempt
        where tenant_id=${row.tenant_id}::uuid
          and (${row.engagement_id}::uuid is null or engagement_id=${row.engagement_id}::uuid)
        union all
        select response_storage_key,response_content_hash,tenant_id,engagement_id,'filing_attempt',id,'FILING_RESPONSE'
        from filing_attempt
        where response_storage_key is not null and tenant_id=${row.tenant_id}::uuid
          and (${row.engagement_id}::uuid is null or engagement_id=${row.engagement_id}::uuid)`;

      return {
        scope: {
          id: String(row.id),
          tenantId: String(row.tenant_id),
          engagementId: row.engagement_id ? String(row.engagement_id) : null,
          policyCode: String(row.policy_code),
          policyVersionNo: Number(row.policy_version_no),
          retentionUntil: new Date(row.retention_until as string | Date).toISOString(),
          eligible: Boolean(row.eligible),
          activeHoldReferences: holds.map((hold) => String(hold.hold_reference)),
        },
        references: artifactRows.map((artifact) => ({
          key: String(artifact.storage_key),
          expectedSha256: artifact.content_hash ? String(artifact.content_hash) : null,
          tenantId: String(artifact.tenant_id),
          engagementId: artifact.engagement_id ? String(artifact.engagement_id) : null,
          sourceTable: String(artifact.source_table),
          sourceId: String(artifact.source_id),
          artifactKind: String(artifact.artifact_kind),
        })),
      };
    });
  } finally {
    await sql.end();
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= values.length) return;
        output[index] = await operation(values[index]!);
      }
    }),
  );
  return output;
}

async function loadR2Inventory(
  prefix: string,
  maximumObjects: number,
): Promise<{ objects: R2ListedObject[]; pageCount: number }> {
  const accountId = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const bucket = requiredEnvironment("R2_BUCKET_NAME");
  if (!/^[0-9a-f]{32}$/i.test(accountId))
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal identifier");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
    throw new Error("R2_BUCKET_NAME is not a valid bucket name");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnvironment("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnvironment("R2_SECRET_ACCESS_KEY"),
    },
  });
  const listed = await readCompleteR2Inventory(async (cursor) => {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: cursor,
        MaxKeys: 1_000,
      }),
    );
    return {
      objects: (page.Contents ?? []).flatMap((object) =>
        object.Key
          ? [{
              key: object.Key,
              size: Number(object.Size ?? 0),
              etag: object.ETag ?? null,
              uploadedAt: object.LastModified?.toISOString() ?? null,
            }]
          : [],
      ),
      truncated: Boolean(page.IsTruncated),
      cursor: page.NextContinuationToken,
    };
  }, maximumObjects);

  const objects = await mapWithConcurrency(listed.objects, 8, async (object) => {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: object.key }),
    );
    return {
      ...object,
      metadataSha256: head.Metadata?.sha256?.toLowerCase() ?? null,
    };
  });
  client.destroy();
  return { objects, pageCount: listed.pageCount };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const database = await loadDatabaseInventory(args.scopeId);
  const prefix = database.scope.engagementId
    ? `tenants/${database.scope.tenantId}/engagements/${database.scope.engagementId}/`
    : `tenants/${database.scope.tenantId}/`;
  const r2 = await loadR2Inventory(prefix, args.maximumObjects);
  const evidence = await createRetentionInventoryEvidence({
    generatedAt: new Date().toISOString(),
    scope: database.scope,
    bucketName: requiredEnvironment("R2_BUCKET_NAME"),
    prefix,
    databaseReferences: database.references,
    r2Objects: r2.objects,
    r2PageCount: r2.pageCount,
  });
  const rendered = `${JSON.stringify(evidence, null, 2)}\n`;
  if (args.output) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(args.output, rendered, { encoding: "utf8", flag: "wx" });
    process.stderr.write(
      `Read-only retention evidence written to ${args.output}; checksum ${evidence.inventoryChecksum}\n`,
    );
  } else process.stdout.write(rendered);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    process.stderr.write(
      `Retention inventory failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  });
