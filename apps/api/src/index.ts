import postgres, { type Sql, type TransactionSql } from 'postgres';
import { ApiError, parseTrialBalanceCsv, requireObject, requiredString } from './core.js';

interface RequestContext { tenantId: string; actorId: string; correlationId: string; }
type Database = Sql<Record<string, never>>;
const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const WRITE_ROLES = ['PARTNER', 'MANAGER', 'PREPARER'] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}
function withCors(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get('origin');
  if (!origin || origin !== env.WEB_ORIGIN) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-headers', 'content-type,x-tenant-id,x-actor-id,x-correlation-id,x-filename');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function context(request: Request): RequestContext {
  const tenantId = request.headers.get('x-tenant-id');
  const actorId = request.headers.get('x-actor-id');
  if (!tenantId || !actorId) throw new ApiError(401, 'AUTH_CONTEXT_REQUIRED', 'Tenant and actor context are required');
  return { tenantId, actorId, correlationId: request.headers.get('x-correlation-id') ?? crypto.randomUUID() };
}
function db(env: Env): Database { return postgres(env.HYPERDRIVE.connectionString, { prepare: false, max: 5 }); }
function declaredBodyLength(request: Request): number | null {
  const header = request.headers.get('content-length');
  if (header === null) return null;
  const length = Number(header);
  if (!Number.isSafeInteger(length) || length < 0) throw new ApiError(400, 'INVALID_CONTENT_LENGTH', 'Content-Length is invalid');
  return length;
}
async function readBodyBounded(request: Request, maxBytes: number, description: string): Promise<ArrayBuffer> {
  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `${description} is too large`);
  if (!request.body) throw new ApiError(400, 'BODY_REQUIRED', 'Request body is required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('payload too large');
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `${description} is too large`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}
async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'application/json is required');
  try {
    const bytes = await readBodyBounded(request, MAX_JSON_BYTES, 'JSON body');
    return requireObject(JSON.parse(new TextDecoder().decode(bytes)));
  }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON'); }
}
async function tenantRole(sql: Database, ctx: RequestContext): Promise<string> {
  const rows = await sql`select role_code from tenant_member where tenant_id=${ctx.tenantId} and actor_id=${ctx.actorId}`;
  if (!rows.length) throw new ApiError(403, 'FORBIDDEN', 'Actor is not a member of this tenant');
  return String(rows[0]!.role_code);
}
interface EngagementAccess { id: string; organisationId: string; role: string; }
async function engagementAccess(sql: Database, ctx: RequestContext, engagementId: string, allowedRoles?: readonly string[]): Promise<EngagementAccess> {
  const memberRole = await tenantRole(sql, ctx);
  const rows = await sql`
    select e.id,e.organisation_id,em.role_code from engagement e
    left join engagement_member em on em.engagement_id=e.id and em.tenant_id=e.tenant_id and em.actor_id=${ctx.actorId}
    where e.id=${engagementId} and e.tenant_id=${ctx.tenantId}
    order by case em.role_code
      when 'PARTNER' then 1 when 'MANAGER' then 2 when 'REVIEWER' then 3
      when 'PREPARER' then 4 when 'FILER' then 5 when 'READ_ONLY' then 6 else 99 end
    limit 1`;
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Engagement not found');
  const role = memberRole === 'OWNER' || memberRole === 'ADMIN' ? memberRole : rows[0]!.role_code;
  if (!role) throw new ApiError(403, 'FORBIDDEN', 'Actor is not assigned to this engagement');
  if (allowedRoles && role !== 'OWNER' && role !== 'ADMIN' && !allowedRoles.includes(String(role))) throw new ApiError(403, 'FORBIDDEN', 'Actor does not have permission for this operation');
  return { id: String(rows[0]!.id), organisationId: String(rows[0]!.organisation_id), role: String(role) };
}
async function appendEvents(tx: TransactionSql<Record<string, never>>, ctx: RequestContext, engagement: EngagementAccess, eventType: string, objectType: string, objectId: string, metadata: Record<string, unknown>): Promise<void> {
  // Serialise the per-tenant ledger so concurrent writes cannot create two audit heads.
  await tx`select id from tenant where id=${ctx.tenantId} for update`;
  const previous = await tx`select event_hash from audit_event where tenant_id=${ctx.tenantId} order by occurred_at_utc desc,event_id desc limit 1`;
  const previousHash = previous.length ? String(previous[0]!.event_hash) : null;
  const occurredAt = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const encoded = new TextEncoder().encode(JSON.stringify({ eventId, occurredAt, tenantId: ctx.tenantId, actorId: ctx.actorId, eventType, objectType, objectId, previousHash, metadata }));
  const eventBytes = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(eventBytes).set(encoded);
  const eventHash = await sha256(eventBytes);
  await tx`
    insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,organisation_id,engagement_id,actor_type,actor_id,event_type,object_type,object_id,previous_hash,correlation_id,metadata,event_hash)
    values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${engagement.organisationId},${engagement.id},'USER',${ctx.actorId},${eventType},${objectType},${objectId},${previousHash},${ctx.correlationId},${JSON.stringify(metadata)}::jsonb,${eventHash})`;
  const idempotencyKey = `${ctx.correlationId}:${eventType}:${objectType}:${objectId}`;
  await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key)
    values(${crypto.randomUUID()},${ctx.tenantId},${objectType},${objectId},${eventType},${JSON.stringify(metadata)}::jsonb,${ctx.correlationId},${idempotencyKey})`;
}

async function listEngagements(request: Request, env: Env): Promise<Response> {
  const ctx = context(request); const sql = db(env);
  try {
    const role = await tenantRole(sql, ctx);
    const items = role === 'OWNER' || role === 'ADMIN'
      ? await sql`select e.id,e.organisation_id,e.period_start,e.period_end,e.framework,e.sector_profile,e.status,e.version,o.legal_name
          from engagement e join organisation o on o.id=e.organisation_id and o.tenant_id=e.tenant_id
          where e.tenant_id=${ctx.tenantId} order by e.period_end desc`
      : await sql`select distinct e.id,e.organisation_id,e.period_start,e.period_end,e.framework,e.sector_profile,e.status,e.version,o.legal_name
          from engagement e join organisation o on o.id=e.organisation_id and o.tenant_id=e.tenant_id
          join engagement_member em on em.engagement_id=e.id and em.tenant_id=e.tenant_id
          where e.tenant_id=${ctx.tenantId} and em.actor_id=${ctx.actorId} order by e.period_end desc`;
    return json({ items });
  } finally { await sql.end(); }
}
async function createEngagement(request: Request, env: Env): Promise<Response> {
  const ctx = context(request); const body = await jsonBody(request);
  const organisationId = requiredString(body, 'organisationId'); const periodStart = requiredString(body, 'periodStart');
  const periodEnd = requiredString(body, 'periodEnd'); const framework = requiredString(body, 'framework');
  const sectorProfile = typeof body.sectorProfile === 'string' && body.sectorProfile.trim() ? body.sectorProfile.trim() : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart) throw new ApiError(400, 'INVALID_PERIOD', 'A valid periodStart and periodEnd are required');
  const sql = db(env);
  try {
    const role = await tenantRole(sql, ctx);
    if (role !== 'OWNER' && role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Only tenant owners and administrators can create engagements');
    const engagementId = crypto.randomUUID();
    const item = await sql.begin(async (tx) => {
      const organisations = await tx`select id from organisation where id=${organisationId} and tenant_id=${ctx.tenantId}`;
      if (!organisations.length) throw new ApiError(404, 'NOT_FOUND', 'Organisation not found');
      const inserted = await tx`insert into engagement(id,tenant_id,organisation_id,period_start,period_end,framework,sector_profile)
        values(${engagementId},${ctx.tenantId},${organisationId},${periodStart},${periodEnd},${framework},${sectorProfile})
        returning id,organisation_id,period_start,period_end,framework,sector_profile,status,version`;
      await tx`insert into engagement_member(id,tenant_id,engagement_id,actor_id,role_code)
        values(${crypto.randomUUID()},${ctx.tenantId},${engagementId},${ctx.actorId},'MANAGER') on conflict(engagement_id,actor_id,role_code) do nothing`;
      await appendEvents(tx, ctx, { id: engagementId, organisationId, role: 'MANAGER' }, 'ENGAGEMENT_CREATED', 'ENGAGEMENT', engagementId, { periodStart, periodEnd, framework, sectorProfile });
      return inserted[0]!;
    });
    return json({ item }, 201);
  } finally { await sql.end(); }
}

async function csvUpload(request: Request): Promise<{ bytes: ArrayBuffer; filename: string }> {
  const contentTypeHeader = request.headers.get('content-type') ?? '';
  const contentType = contentTypeHeader.toLowerCase();
  if (contentType.includes('multipart/form-data')) {
    const multipartBytes = await readBodyBounded(request, MAX_CSV_BYTES, 'CSV upload');
    const form = await new Response(multipartBytes, { headers: { 'content-type': contentTypeHeader } }).formData(); const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'FILE_REQUIRED', 'Multipart field "file" is required');
    if (file.size > MAX_CSV_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'CSV must not exceed 10 MiB');
    return { bytes: await file.arrayBuffer(), filename: (file.name || 'trial-balance.csv').slice(0, 255) };
  }
  if (!contentType.includes('text/csv') && !contentType.includes('application/csv')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send a text/csv body or multipart form field named file');
  const bytes = await readBodyBounded(request, MAX_CSV_BYTES, 'CSV upload');
  return { bytes, filename: request.headers.get('x-filename')?.slice(0, 255) || 'trial-balance.csv' };
}
async function deleteUploadedObject(env: Env, storageKey: string, reason: string): Promise<void> {
  try { await env.ARTEFACTS.delete(storageKey); }
  catch (error) {
    console.error(JSON.stringify({ message: 'R2 import cleanup failed', reason, storageKey, error: error instanceof Error ? error.message : String(error) }));
  }
}
async function importCsv(request: Request, env: Env, engagementId: string): Promise<Response> {
  const ctx = context(request); const sql = db(env);
  try {
    const engagement = await engagementAccess(sql, ctx, engagementId, WRITE_ROLES); const upload = await csvUpload(request);
    const hash = await sha256(upload.bytes);
    let csv: string;
    try { csv = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(upload.bytes); }
    catch { throw new ApiError(422, 'INVALID_CSV', 'CSV must be valid UTF-8 text'); }
    const parsed = parseTrialBalanceCsv(csv);
    if (!parsed.balanced) throw new ApiError(422, 'TB_NOT_BALANCED', `Trial balance differs by debit ${parsed.debitTotal} and credit ${parsed.creditTotal}`);
    const existing = await sql`select id,status,content_hash,storage_key,created_at,committed_at from import_batch
      where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and content_hash=${hash}
      order by created_at desc limit 1`;
    if (existing.length) return json({ item: existing[0], duplicate: true });
    const batchId = crypto.randomUUID(); const storageKey = `tenants/${ctx.tenantId}/engagements/${engagementId}/imports/${batchId}-${hash}.csv`;
    // R2 completes before the transaction starts: database state can never point at a missing object.
    await env.ARTEFACTS.put(storageKey, upload.bytes, { httpMetadata: { contentType: 'text/csv; charset=utf-8' }, customMetadata: { sha256: hash, tenantId: ctx.tenantId, engagementId, originalFilename: upload.filename } });
    let transactionBodyCompleted = false;
    let duplicateFound = false;
    try {
      const outcome = await sql.begin(async (tx) => {
        // Sequence, duplicate detection and version allocation are engagement-scoped and serial.
        await tx`select id from engagement where id=${engagementId} and tenant_id=${ctx.tenantId} for update`;
        const duplicate = await tx`select id,status,content_hash,storage_key,created_at,committed_at from import_batch
          where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and content_hash=${hash}
          order by created_at desc limit 1`;
        if (duplicate.length) {
          duplicateFound = true;
          transactionBodyCompleted = true;
          return { duplicate: true as const, item: duplicate[0]! };
        }
        const batch = await tx`insert into import_batch(id,tenant_id,engagement_id,source_type,original_filename,status,content_hash,storage_key,committed_at)
          values(${batchId},${ctx.tenantId},${engagementId},'CSV',${upload.filename},'COMMITTED',${hash},${storageKey},now()) returning id,status,content_hash,storage_key,created_at,committed_at`;
        if (parsed.rows.length) await tx`insert into import_row ${tx(parsed.rows.map((row) => ({
          id: crypto.randomUUID(), tenant_id: ctx.tenantId, import_batch_id: batchId, row_no: row.rowNo, account_code: row.accountCode,
          account_name: row.accountName, debit: row.debit, credit: row.credit, dimensions: tx.json({}), raw_row: tx.json(row.rawRow),
        })), 'id', 'tenant_id', 'import_batch_id', 'row_no', 'account_code', 'account_name', 'debit', 'credit', 'dimensions', 'raw_row')}`;
        const uniqueAccounts = [...new Map(parsed.rows.map((row) => [row.accountCode, row])).values()];
        const sourceAccounts = await tx`insert into source_account ${tx(uniqueAccounts.map((row) => ({
          id: crypto.randomUUID(), tenant_id: ctx.tenantId, organisation_id: engagement.organisationId, account_code: row.accountCode, account_name: row.accountName,
        })), 'id', 'tenant_id', 'organisation_id', 'account_code', 'account_name')}
          on conflict(organisation_id,account_code) do update set account_name=excluded.account_name returning id,account_code`;
        const sourceByCode = new Map(sourceAccounts.map((row) => [String(row.account_code), String(row.id)]));
        const sequenceRows = await tx`select coalesce(max(sequence_no),0)+1 as sequence_no from import_snapshot where engagement_id=${engagementId}`;
        const sequenceNo = Number(sequenceRows[0]!.sequence_no); const snapshotId = crypto.randomUUID();
        await tx`insert into import_snapshot(id,tenant_id,engagement_id,sequence_no,content_hash,storage_key,record_count,debit_total,credit_total,import_batch_id)
          values(${snapshotId},${ctx.tenantId},${engagementId},${sequenceNo},${hash},${storageKey},${parsed.rows.length},${parsed.debitTotal},${parsed.creditTotal},${batchId})`;
        const versionRows = await tx`select coalesce(max(version_no),0)+1 as version_no from trial_balance where engagement_id=${engagementId} and state='IMPORTED'`;
        const versionNo = Number(versionRows[0]!.version_no); const trialBalanceId = crypto.randomUUID();
        await tx`insert into trial_balance(id,tenant_id,engagement_id,state,version_no,source_import_snapshot_id,content_hash)
          values(${trialBalanceId},${ctx.tenantId},${engagementId},'IMPORTED',${versionNo},${snapshotId},${hash})`;
        const latestMappings = await tx`select distinct on(source_account_id) source_account_id,canonical_account_id from account_mapping
          where tenant_id=${ctx.tenantId} and (engagement_id=${engagementId} or engagement_id is null)
          order by source_account_id,(engagement_id is not null) desc,version desc,created_at desc`;
        const canonicalBySource = new Map(latestMappings.map((row) => [String(row.source_account_id), String(row.canonical_account_id)]));
        await tx`insert into trial_balance_line ${tx(parsed.rows.map((row) => {
          const sourceAccountId = sourceByCode.get(row.accountCode)!;
          return { id: crypto.randomUUID(), trial_balance_id: trialBalanceId, tenant_id: ctx.tenantId, source_account_id: sourceAccountId,
            canonical_account_id: canonicalBySource.get(sourceAccountId) ?? null, dimensions: tx.json({}), debit: row.debit, credit: row.credit };
        }), 'id', 'trial_balance_id', 'tenant_id', 'source_account_id', 'canonical_account_id', 'dimensions', 'debit', 'credit')}`;
        await appendEvents(tx, ctx, engagement, 'IMPORT_COMMITTED', 'IMPORT_BATCH', batchId, { trialBalanceId, snapshotId, versionNo, recordCount: parsed.rows.length, contentHash: hash, storageKey });
        transactionBodyCompleted = true;
        return { duplicate: false as const, item: { ...batch[0], trial_balance_id: trialBalanceId, snapshot_id: snapshotId, version_no: versionNo, record_count: parsed.rows.length, debit_total: parsed.debitTotal, credit_total: parsed.creditTotal } };
      });
      if (outcome.duplicate) {
        await deleteUploadedObject(env, storageKey, 'duplicate import');
        return json({ item: outcome.item, duplicate: true });
      }
      return json({ item: outcome.item }, 201);
    } catch (error) {
      // If the callback itself failed, Postgres.js rolls it back. A failure after
      // the callback may be an ambiguous COMMIT outcome, so retain R2 for safety.
      if (duplicateFound || !transactionBodyCompleted) await deleteUploadedObject(env, storageKey, duplicateFound ? 'duplicate import' : 'rolled back import');
      throw error;
    }
  } finally { await sql.end(); }
}

async function mapAccount(request: Request, env: Env, engagementId: string): Promise<Response> {
  const ctx = context(request); const body = await jsonBody(request); const sourceAccountId = requiredString(body, 'sourceAccountId');
  const canonicalAccountId = requiredString(body, 'canonicalAccountId'); const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
  const sql = db(env);
  try {
    const engagement = await engagementAccess(sql, ctx, engagementId, WRITE_ROLES);
    const item = await sql.begin(async (tx) => {
      await tx`select id from engagement where id=${engagementId} and tenant_id=${ctx.tenantId} for update`;
      const sources = await tx`select id from source_account where id=${sourceAccountId} and tenant_id=${ctx.tenantId} and organisation_id=${engagement.organisationId}`;
      if (!sources.length) throw new ApiError(404, 'NOT_FOUND', 'Source account not found');
      const canonical = await tx`select id,canonical_code,name,report_line from canonical_account where id=${canonicalAccountId}`;
      if (!canonical.length) throw new ApiError(404, 'NOT_FOUND', 'Canonical account not found');
      const finalRows = await tx`select id from trial_balance where engagement_id=${engagementId} and tenant_id=${ctx.tenantId} and state in ('FINAL','FILED') limit 1`;
      if (finalRows.length) throw new ApiError(409, 'TRIAL_BALANCE_LOCKED', 'Mappings cannot change after the trial balance is final or filed');
      const versions = await tx`select coalesce(max(version),0)+1 as version from account_mapping where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and source_account_id=${sourceAccountId}`;
      const version = Number(versions[0]!.version); const mappingId = crypto.randomUUID();
      const inserted = await tx`insert into account_mapping(id,tenant_id,engagement_id,source_account_id,canonical_account_id,mapping_source,status,version)
        values(${mappingId},${ctx.tenantId},${engagementId},${sourceAccountId},${canonicalAccountId},'MANUAL','CONFIRMED',${version})
        returning id,source_account_id,canonical_account_id,mapping_source,status,version,created_at`;
      await tx`update trial_balance_line tbl set canonical_account_id=${canonicalAccountId} from trial_balance tb
        where tbl.trial_balance_id=tb.id and tbl.tenant_id=${ctx.tenantId} and tb.engagement_id=${engagementId}
          and tb.state not in ('FINAL','FILED') and tbl.source_account_id=${sourceAccountId}`;
      await appendEvents(tx, ctx, engagement, 'MAPPING_CHANGED', 'ACCOUNT_MAPPING', mappingId, { sourceAccountId, canonicalAccountId, version, reason });
      return { ...inserted[0], canonical_account: canonical[0] };
    });
    return json({ item }, 201);
  } finally { await sql.end(); }
}

async function engagementTrialBalance(request: Request, env: Env, engagementId: string): Promise<Response> {
  const ctx = context(request); const sql = db(env);
  try {
    await engagementAccess(sql, ctx, engagementId);
    const lines = await sql`select sa.id as source_account_id,sa.account_code,sa.account_name,tbl.debit,tbl.credit,ca.id as canonical_account_id,ca.canonical_code,ca.name as canonical_name,ca.report_line
      from trial_balance tb join trial_balance_line tbl on tbl.trial_balance_id=tb.id and tbl.tenant_id=tb.tenant_id
      join source_account sa on sa.id=tbl.source_account_id and sa.tenant_id=tb.tenant_id left join canonical_account ca on ca.id=tbl.canonical_account_id
      where tb.engagement_id=${engagementId} and tb.tenant_id=${ctx.tenantId} and tb.state='IMPORTED'
        and tb.version_no=(select max(version_no) from trial_balance where engagement_id=${engagementId} and tenant_id=${ctx.tenantId} and state='IMPORTED') order by sa.account_code`;
    return json({ items: lines });
  } finally { await sql.end(); }
}
async function report(request: Request, env: Env, engagementId: string): Promise<Response> {
  const ctx = context(request); const sql = db(env);
  try {
    await engagementAccess(sql, ctx, engagementId);
    const summaries = await sql`with latest as (select id,version_no,source_import_snapshot_id from trial_balance
        where engagement_id=${engagementId} and tenant_id=${ctx.tenantId} and state='IMPORTED' order by version_no desc limit 1)
      select latest.id,latest.version_no,latest.source_import_snapshot_id,coalesce(sum(tbl.debit),0) as debit_total,coalesce(sum(tbl.credit),0) as credit_total,
        count(*)::int as account_count,count(*) filter(where tbl.canonical_account_id is null)::int as unmapped_count
      from latest join trial_balance_line tbl on tbl.trial_balance_id=latest.id group by latest.id,latest.version_no,latest.source_import_snapshot_id`;
    if (!summaries.length) throw new ApiError(404, 'NOT_FOUND', 'No imported trial balance found');
    const lines = await sql`with latest as (select id from trial_balance where engagement_id=${engagementId} and tenant_id=${ctx.tenantId} and state='IMPORTED' order by version_no desc limit 1)
      select rl.line_code as code,rl.caption,rl.statement_code,rl.display_order,sum(tbl.debit-tbl.credit) as balance,
        array_agg(distinct ca.canonical_code order by ca.canonical_code) as canonical_codes,array_agg(distinct sa.id order by sa.id) as source_account_ids
      from latest join trial_balance_line tbl on tbl.trial_balance_id=latest.id join source_account sa on sa.id=tbl.source_account_id
      join canonical_account ca on ca.id=tbl.canonical_account_id join canonical_report_line rl on rl.id=ca.report_line_id
      group by rl.id,rl.line_code,rl.caption,rl.statement_code,rl.display_order order by rl.statement_code,rl.display_order`;
    return json({ trialBalance: summaries[0], balanced: summaries[0]!.debit_total === summaries[0]!.credit_total, fullyMapped: summaries[0]!.unmapped_count === 0, lines });
  } finally { await sql.end(); }
}
async function auditHistory(request: Request, env: Env, engagementId: string): Promise<Response> {
  const ctx = context(request); const sql = db(env);
  try {
    await engagementAccess(sql, ctx, engagementId);
    return json({ items: await sql`select event_id,occurred_at_utc,actor_id,event_type,object_type,object_id,reason,correlation_id,metadata,event_hash
      from audit_event where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} order by occurred_at_utc desc,event_id desc limit 250` });
  } finally { await sql.end(); }
}
async function canonicalAccounts(request: Request, env: Env): Promise<Response> {
  const ctx = context(request); const sql = db(env); const url = new URL(request.url);
  const taxonomyVersion = url.searchParams.get('taxonomyVersion') ?? 'UK-CANONICAL-2026';
  try {
    await tenantRole(sql, ctx);
    return json({ items: await sql`select id,taxonomy_version,canonical_code,name,report_line,normal_balance
      from canonical_account where taxonomy_version=${taxonomyVersion} order by canonical_code` });
  } finally { await sql.end(); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('origin');
      const response = origin === env.WEB_ORIGIN ? new Response(null, { status: 204 }) : json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Origin is not allowed' } }, 403);
      return withCors(response, request, env);
    }
    try {
      const url = new URL(request.url);
      let response: Response;
      if (url.pathname === '/health') response = json({ status: 'ok', service: 'uk-accounts-api' });
      else if (url.pathname === '/v1/capabilities') response = json({ accountingCore: 'vertical-slice-2', database: 'neon-postgres-via-hyperdrive', artefacts: 'r2', modules: ['tenancy', 'engagements', 'csv-import', 'trial-balance', 'canonical-mapping', 'audit-ledger', 'rules', 'report-provenance'] });
      else if (request.method === 'GET' && url.pathname === '/v1/engagements') response = await listEngagements(request, env);
      else if (request.method === 'POST' && url.pathname === '/v1/engagements') response = await createEngagement(request, env);
      else if (request.method === 'GET' && url.pathname === '/v1/canonical-accounts') response = await canonicalAccounts(request, env);
      else {
        const importRoute = url.pathname.match(/^\/v1\/engagements\/([^/]+)\/imports(?:\/csv)?$/);
        const mappingRoute = url.pathname.match(/^\/v1\/engagements\/([^/]+)\/mappings$/);
        const tbRoute = url.pathname.match(/^\/v1\/engagements\/([^/]+)\/trial-balance$/);
        const reportRoute = url.pathname.match(/^\/v1\/engagements\/([^/]+)\/report$/);
        const historyRoute = url.pathname.match(/^\/v1\/engagements\/([^/]+)\/history$/);
        if (request.method === 'POST' && importRoute) response = await importCsv(request, env, importRoute[1]!);
        else if (request.method === 'POST' && mappingRoute) response = await mapAccount(request, env, mappingRoute[1]!);
        else if (request.method === 'GET' && tbRoute) response = await engagementTrialBalance(request, env, tbRoute[1]!);
        else if (request.method === 'GET' && reportRoute) response = await report(request, env, reportRoute[1]!);
        else if (request.method === 'GET' && historyRoute) response = await auditHistory(request, env, historyRoute[1]!);
        else response = json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
      }
      return withCors(response, request, env);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'Request failed');
      console.error(JSON.stringify({ message: 'request failed', code: apiError.code, error: error instanceof Error ? error.message : String(error), path: new URL(request.url).pathname }));
      return withCors(json({ error: { code: apiError.code, message: apiError.message } }, apiError.status), request, env);
    }
  },
} satisfies ExportedHandler<Env>;
