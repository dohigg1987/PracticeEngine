import postgres, { type Sql, type TransactionSql } from "postgres";
import {
  ACCOUNTS_HTML_RENDERER_VERSION,
  renderAccountsHtml,
  type AccountsHtmlInput,
} from "./artefacts.js";
import {
  ACCOUNTS_PDF_RENDERER_VERSION,
  renderAccountsPdf,
} from "./pdf-artefacts.js";
import {
  ACCOUNTS_DOCX_RENDERER_VERSION,
  renderAccountsDocx,
} from "./docx-artefacts.js";
import {
  EVIDENCE_BUNDLE_FORMAT_VERSION,
  MAX_EVIDENCE_BUNDLE_SOURCE_BYTES,
  deterministicEvidenceZip,
  evidenceJson,
  type EvidenceBundleFile,
} from "./evidence-bundle.js";
import { authenticateRequest, neonAccessTokenVerifier } from "./auth.js";
import { handleCommercialRoute } from "./commercial.js";
import { handlePermanentFileRoute } from "./permanent-file.js";
import { handlePlatformCoreRoute } from "./platform-core.js";
import { handlePracticeManagementRoute, runScheduledRecurringGeneration } from "./practice-management.js";
import { handleCrmOnboardingRoute } from "./crm-onboarding.js";
import { handleClientCollaborationRoute } from "./client-collaboration.js";
import { verifyQuoteBenchMachineRequest } from "./quotebench-machine-auth.js";
import {
  MAX_WORKING_PAPER_EVIDENCE_BYTES,
  WORKING_PAPER_ASSERTIONS,
  WORKING_PAPER_EVIDENCE_MEDIA_TYPES,
  WORKING_PAPER_EVIDENCE_TYPES,
  safeWorkingPaperEvidenceFilename,
  workingPaperEvidenceSignatureMatches,
} from "./working-paper-evidence.js";
import { workingPaperReadinessBlocks } from "./working-paper-controls.js";
import {
  incompatibleRequestedTemplateCodes,
  workingPaperTemplateMatches,
} from "./working-paper-library.js";
import {
  SERVICE_NAME,
  readinessReport,
  requestCorrelationId,
} from "./operations.js";
import {
  ApiError,
  decodeTrialBalanceCsv,
  parseTrialBalanceCsv,
  regulatorEvidenceContentType,
  regulatorEvidenceFilename,
  regulatorEvidenceStatus,
  reportingRegimeError,
  requireObject,
  requiredString,
  teamInvitationDatabaseError,
  teamInvitationExpiryHours,
  teamInvitationRole,
  teamInvitationToken,
  trialBalanceReadiness,
  trialBalanceColumnMapping,
  type TrialBalanceColumnMapping,
  workspaceName,
  workspaceOnboardingDatabaseError,
} from "./core.js";
import {
  ACCOUNTS_VERSION_STATUSES,
  DISCLOSURE_APPLICABILITY,
  DISCLOSURE_STATUSES,
  FILING_REGULATORS,
  FILING_STATUSES,
  JOURNAL_STATUSES,
  JOURNAL_TYPES,
  RECONCILIATION_STATUSES,
  RECONCILIATION_TYPES,
  REVIEW_POINT_STATUSES,
  SIGNOFF_TYPES,
  TASK_STATUSES,
  WORKING_PAPER_CATEGORIES,
  WORKING_PAPER_STATUSES,
  assertAccountsVersionTransition,
  assertDisclosureTransition,
  assertFilingTransition,
  assertJournalTransition,
  assertReconciliationTransition,
  assertReviewPointTransition,
  assertTaskTransition,
  assertWorkingPaperTransition,
  canonicalJson,
  enumValue,
  journalLines,
  money,
  optionalBoolean,
  optionalString,
  type AccountsVersionStatus,
  type DisclosureStatus,
  type FilingStatus,
  type JournalStatus,
  type ReconciliationStatus,
  type ReviewPointStatus,
  type SignoffType,
  type TaskStatus,
  type WorkingPaperStatus,
} from "./workflow.js";

interface RequestContext {
  tenantId: string;
  actorId: string;
  correlationId: string;
}
type Database = Sql<Record<string, never>>;
type Transaction = TransactionSql<Record<string, never>>;
type JsonMetadata = { readonly [key: string]: postgres.JSONValue | undefined };
const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const MAX_EVIDENCE_MULTIPART_BYTES = MAX_EVIDENCE_BYTES + 64 * 1024;
const MAX_WORKING_PAPER_MULTIPART_BYTES =
  MAX_WORKING_PAPER_EVIDENCE_BYTES + 128 * 1024;
const WRITE_ROLES = ["PARTNER", "MANAGER", "PREPARER"] as const;
const REVIEW_ROLES = ["PARTNER", "MANAGER", "REVIEWER"] as const;
const WORKFLOW_ROLES = ["PARTNER", "MANAGER", "REVIEWER", "PREPARER"] as const;
const REPORTING_FRAMEWORKS = [
  "FRS_101",
  "FRS_102",
  "FRS_102_1A",
  "FRS_105",
] as const;
const SECTOR_PROFILES = [
  "NONE",
  "CHARITIES_SORP_2026",
  "ACADEMIES_2026",
  "LLP_SORP_2026",
] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
function withCors(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("origin");
  if (!origin || origin !== env.WEB_ORIGIN) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set(
    "access-control-allow-headers",
    "authorization,content-type,x-tenant-id,x-correlation-id,x-filename",
  );
  headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,OPTIONS");
  headers.set("vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
function completeRequest(
  response: Response,
  request: Request,
  env: Env,
  correlationId: string,
  startedAt: number,
): Response {
  const corsResponse = withCors(response, request, env);
  const headers = new Headers(corsResponse.headers);
  headers.set("x-correlation-id", correlationId);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  console.log(
    JSON.stringify({
      event: "http_request",
      service: SERVICE_NAME,
      correlationId,
      method: request.method,
      path: new URL(request.url).pathname,
      status: corsResponse.status,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    }),
  );
  return new Response(corsResponse.body, {
    status: corsResponse.status,
    statusText: corsResponse.statusText,
    headers,
  });
}
function context(request: Request, actorId: string): RequestContext {
  const tenantId = request.headers.get("x-tenant-id");
  if (!tenantId)
    throw new ApiError(
      400,
      "TENANT_REQUIRED",
      "A tenant selection is required",
    );
  return {
    tenantId,
    actorId,
    correlationId:
      request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
  };
}
function db(env: Env): Database {
  return postgres(env.HYPERDRIVE.connectionString, { prepare: false, max: 5 });
}
async function serviceReadiness(env: Env): Promise<Response> {
  const report = await readinessReport({
    database: async () => {
      const sql = db(env);
      try {
        await sql`select 1`;
      } finally {
        await sql.end();
      }
    },
    artefactStorage: async () => {
      await env.ARTEFACTS.list({ limit: 1 });
    },
  });
  return json(report, report.status === "ready" ? 200 : 503);
}
async function withTenantTransaction<T>(
  sql: Database,
  ctx: RequestContext,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const boxed = await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id',${ctx.tenantId},true),set_config('app.actor_id',${ctx.actorId},true)`;
    return { value: await operation(tx) };
  });
  return boxed.value;
}
async function withActorTransaction<T>(
  sql: Database,
  actorId: string,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const boxed = await sql.begin(async (tx) => {
    await tx`select set_config('app.actor_id',${actorId},true)`;
    return { value: await operation(tx) };
  });
  return boxed.value;
}
function declaredBodyLength(request: Request): number | null {
  const header = request.headers.get("content-length");
  if (header === null) return null;
  const length = Number(header);
  if (!Number.isSafeInteger(length) || length < 0)
    throw new ApiError(
      400,
      "INVALID_CONTENT_LENGTH",
      "Content-Length is invalid",
    );
  return length;
}
async function readBodyBounded(
  request: Request,
  maxBytes: number,
  description: string,
): Promise<ArrayBuffer> {
  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > maxBytes)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", `${description} is too large`);
  if (!request.body)
    throw new ApiError(400, "BODY_REQUIRED", "Request body is required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("payload too large");
      throw new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        `${description} is too large`,
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function canonicalHash(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalJson(value)),
    bytes = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(bytes).set(encoded);
  return sha256(bytes);
}
async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (
    !(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("application/json")
  )
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "application/json is required",
    );
  try {
    const bytes = await readBodyBounded(request, MAX_JSON_BYTES, "JSON body");
    return requireObject(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "Request body is not valid JSON");
  }
}
async function tenantRole(
  sql: Transaction,
  ctx: RequestContext,
): Promise<string> {
  const rows =
    await sql`select role_code from tenant_member where tenant_id=${ctx.tenantId} and actor_id=${ctx.actorId}`;
  if (!rows.length)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Actor is not a member of this tenant",
    );
  return String(rows[0]!.role_code);
}
interface EngagementAccess {
  id: string;
  organisationId: string;
  role: string;
}
function requireRole(role: string, allowedRoles: readonly string[]): void {
  if (role !== "OWNER" && role !== "ADMIN" && !allowedRoles.includes(role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Actor does not have permission for this operation",
    );
}
function optionalTimestamp(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const value = optionalString(body, field);
  if (value === undefined || value === null) return value;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()))
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be an ISO timestamp`,
    );
  return date.toISOString();
}
function boundedRequiredString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value = requiredString(body, field).trim();
  if (value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be at most ${maxLength} characters and contain no control characters`,
    );
  }
  return value;
}
async function engagementAccess(
  sql: Transaction,
  ctx: RequestContext,
  engagementId: string,
  allowedRoles?: readonly string[],
): Promise<EngagementAccess> {
  const memberRole = await tenantRole(sql, ctx);
  const rows = await sql`
    select e.id,e.organisation_id,em.role_code from engagement e
    left join engagement_member em on em.engagement_id=e.id and em.tenant_id=e.tenant_id and em.actor_id=${ctx.actorId}
    where e.id=${engagementId} and e.tenant_id=${ctx.tenantId}
    order by case em.role_code
      when 'PARTNER' then 1 when 'MANAGER' then 2 when 'REVIEWER' then 3
      when 'PREPARER' then 4 when 'FILER' then 5 when 'READ_ONLY' then 6 else 99 end
    limit 1`;
  if (!rows.length)
    throw new ApiError(404, "NOT_FOUND", "Engagement not found");
  const role =
    memberRole === "OWNER" || memberRole === "ADMIN"
      ? memberRole
      : rows[0]!.role_code;
  if (!role)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Actor is not assigned to this engagement",
    );
  if (
    allowedRoles &&
    role !== "OWNER" &&
    role !== "ADMIN" &&
    !allowedRoles.includes(String(role))
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Actor does not have permission for this operation",
    );
  return {
    id: String(rows[0]!.id),
    organisationId: String(rows[0]!.organisation_id),
    role: String(role),
  };
}
interface AuditScope {
  organisationId: string | null;
  engagementId: string | null;
}
async function appendScopedEvents(
  tx: Transaction,
  ctx: RequestContext,
  scope: AuditScope,
  eventType: string,
  objectType: string,
  objectId: string,
  metadata: JsonMetadata,
  domainEventType?: string,
): Promise<void> {
  // Serialise the per-tenant ledger so concurrent writes cannot create two audit heads.
  await tx`select id from tenant where id=${ctx.tenantId} for update`;
  const previous =
    await tx`select event_hash from audit_event where tenant_id=${ctx.tenantId} order by occurred_at_utc desc,event_id desc limit 1`;
  const previousHash = previous.length ? String(previous[0]!.event_hash) : null;
  const occurredAt = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const encoded = new TextEncoder().encode(
    JSON.stringify({
      eventId,
      occurredAt,
      tenantId: ctx.tenantId,
      actorId: ctx.actorId,
      eventType,
      objectType,
      objectId,
      previousHash,
      metadata,
    }),
  );
  const eventBytes = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(eventBytes).set(encoded);
  const eventHash = await sha256(eventBytes);
  await tx`
    insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,organisation_id,engagement_id,actor_type,actor_id,event_type,object_type,object_id,previous_hash,correlation_id,metadata,event_hash)
    values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${scope.organisationId},${scope.engagementId},'USER',${ctx.actorId},${eventType},${objectType},${objectId},${previousHash},${ctx.correlationId},${tx.json(metadata)},${eventHash})`;
  const outboxEventType = domainEventType ?? eventType;
  const idempotencyKey = `${ctx.correlationId}:${outboxEventType}:${objectType}:${objectId}`;
  await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key)
    values(${crypto.randomUUID()},${ctx.tenantId},${objectType},${objectId},${outboxEventType},${tx.json(metadata)},${ctx.correlationId},${idempotencyKey})`;
}
async function appendEvents(
  tx: Transaction,
  ctx: RequestContext,
  engagement: EngagementAccess,
  eventType: string,
  objectType: string,
  objectId: string,
  metadata: JsonMetadata,
  domainEventType?: string,
): Promise<void> {
  return appendScopedEvents(
    tx,
    ctx,
    { organisationId: engagement.organisationId, engagementId: engagement.id },
    eventType,
    objectType,
    objectId,
    metadata,
    domainEventType,
  );
}

async function listOrganisations(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      const role = await tenantRole(tx, ctx),
        rawIncludeArchived = new URL(request.url).searchParams.get("includeArchived");
      if (rawIncludeArchived !== null && rawIncludeArchived !== "true" && rawIncludeArchived !== "false")
        throw new ApiError(400, "VALIDATION_ERROR", "includeArchived must be true or false");
      const includeArchived = rawIncludeArchived === "true";
      if (includeArchived && role !== "OWNER" && role !== "ADMIN")
        throw new ApiError(403, "FORBIDDEN", "Only workspace owners and administrators can view archived clients");
      const items =
        await tx`select id,legal_name,legal_form,jurisdiction,lifecycle_status,archive_reason,archived_at,version,created_at,updated_at
        from organisation where tenant_id=${ctx.tenantId} and (${includeArchived} or lifecycle_status='ACTIVE') order by lifecycle_status,legal_name,id`;
      return json({ items });
    });
  } finally {
    await sql.end();
  }
}
async function createOrganisation(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const body = await jsonBody(request);
  const legalName = boundedRequiredString(body, "legalName", 255);
  const legalForm = boundedRequiredString(body, "legalForm", 80);
  const jurisdiction = boundedRequiredString(body, "jurisdiction", 80);
  const organisationId = crypto.randomUUID();
  const sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const role = await tenantRole(tx, ctx);
      if (role !== "OWNER" && role !== "ADMIN")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only tenant owners and administrators can create organisations",
        );
      const inserted =
        await tx`insert into organisation(id,tenant_id,legal_name,legal_form,jurisdiction)
        values(${organisationId},${ctx.tenantId},${legalName},${legalForm},${jurisdiction})
        returning id,legal_name,legal_form,jurisdiction,lifecycle_status,archive_reason,archived_at,version,created_at,updated_at`;
      await appendScopedEvents(
        tx,
        ctx,
        { organisationId, engagementId: null },
        "ORGANISATION_CREATED",
        "ORGANISATION",
        organisationId,
        { legalName, legalForm, jurisdiction },
      );
      return inserted[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}

async function archiveOrganisation(
  request: Request,
  env: Env,
  actorId: string,
  organisationId: string,
): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organisationId))
    throw new ApiError(404, "NOT_FOUND", "Organisation not found");
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    reason = boundedRequiredString(body, "reason", 1000),
    sql = db(env);
  try {
    const result = await withTenantTransaction(sql, ctx, async (tx) => {
      const role = await tenantRole(tx, ctx);
      if (role !== "OWNER" && role !== "ADMIN")
        throw new ApiError(403, "FORBIDDEN", "Only workspace owners and administrators can archive clients");
      const rows = await tx`select * from archive_authenticated_organisation(${organisationId}::uuid,${reason}::text)`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Organisation not found");
      const changed = Boolean(rows[0]!.changed);
      if (changed)
        await appendScopedEvents(
          tx,
          ctx,
          { organisationId, engagementId: null },
          "ORGANISATION_ARCHIVED",
          "ORGANISATION",
          organisationId,
          { reason, fromStatus: "ACTIVE", toStatus: "ARCHIVED" },
        );
      const { changed: _databaseChanged, ...item } = rows[0]!;
      return { item, changed };
    });
    return json(result);
  } finally {
    await sql.end();
  }
}

async function listEngagements(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      const role = await tenantRole(tx, ctx);
      const items =
        role === "OWNER" || role === "ADMIN"
          ? await tx`select e.id,e.organisation_id,e.period_start,e.period_end,e.framework,e.sector_profile,e.status,e.version,o.legal_name
            from engagement e join organisation o on o.id=e.organisation_id and o.tenant_id=e.tenant_id
            where e.tenant_id=${ctx.tenantId} order by e.period_end desc`
          : await tx`select distinct e.id,e.organisation_id,e.period_start,e.period_end,e.framework,e.sector_profile,e.status,e.version,o.legal_name
            from engagement e join organisation o on o.id=e.organisation_id and o.tenant_id=e.tenant_id
            join engagement_member em on em.engagement_id=e.id and em.tenant_id=e.tenant_id
            where e.tenant_id=${ctx.tenantId} and em.actor_id=${ctx.actorId} order by e.period_end desc`;
      return json({ items });
    });
  } finally {
    await sql.end();
  }
}
async function listMyTenants(env: Env, actorId: string): Promise<Response> {
  const sql = db(env);
  try {
    return await withActorTransaction(sql, actorId, async (tx) => {
      const items = await tx`
      select tm.tenant_id,t.name,tm.role_code
      from tenant_member tm join tenant t on t.id=tm.tenant_id
      where tm.actor_id=${actorId}
      order by t.name,tm.tenant_id`;
      return json({
        items,
        onboarding: items.length
          ? null
          : {
              code: "SELF_SERVICE_WORKSPACE_AVAILABLE",
              message: "Create a workspace to get started.",
            },
      });
    });
  } finally {
    await sql.end();
  }
}
async function createMyTenant(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response> {
  const body = await jsonBody(request),
    name = workspaceName(body),
    sql = db(env);
  try {
    const row = await withActorTransaction(sql, actorId, async (tx) => {
      const rows =
        await tx`select tenant_id,name,role_code,created from create_authenticated_workspace(${name}::text)`;
      if (rows.length !== 1)
        throw new ApiError(
          500,
          "WORKSPACE_ONBOARDING_FAILED",
          "Workspace onboarding returned an invalid result",
        );
      const provisioned = rows[0]!;
      if (Boolean(provisioned.created)) {
        const tenantId = String(provisioned.tenant_id);
        await tx`select set_config('app.tenant_id',${tenantId},true)`;
        const auditContext = { tenantId,actorId,correlationId:request.headers.get("x-correlation-id") ?? crypto.randomUUID() };
        await appendScopedEvents(tx,auditContext,{organisationId:null,engagementId:null},"TENANT_CREATED","TENANT",tenantId,{name:String(provisioned.name)});
        const memberships = await tx`select id from tenant_member where tenant_id=${tenantId} and actor_id=${actorId}`;
        await appendScopedEvents(tx,auditContext,{organisationId:null,engagementId:null},"TENANT_MEMBERSHIP_CREATED","TENANT_MEMBER",String(memberships[0]!.id),{role:String(provisioned.role_code),source:"SELF_SERVICE_ONBOARDING"});
      }
      return provisioned;
    });
    const created = Boolean(row.created);
    return json(
      {
        item: {
          id: String(row.tenant_id),
          name: String(row.name),
          role: String(row.role_code),
        },
        created,
      },
      created ? 201 : 200,
    );
  } catch (error) {
    const mapped = workspaceOnboardingDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  } finally {
    await sql.end();
  }
}

function newInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function invitationTokenHash(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const bytes = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(bytes).set(encoded);
  return sha256(bytes);
}

function apiTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function invitationItem(
  row: Record<string, unknown>,
  status: "ACTIVE" | "REVOKED" = "ACTIVE",
): Record<string, unknown> {
  return {
    id: String(row.id),
    role: String(row.role_code),
    status,
    expiresAt: apiTimestamp(row.expires_at),
    createdAt: apiTimestamp(row.created_at),
    ...(status === "REVOKED"
      ? { revokedAt: apiTimestamp(row.revoked_at) }
      : {}),
  };
}

async function listTeam(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      const role = await tenantRole(tx, ctx);
      if (role !== "OWNER" && role !== "ADMIN")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only tenant owners and administrators can view the team",
        );
      const members = await tx`
          select id,role_code,created_at,(actor_id=${ctx.actorId}) as is_current_actor
          from tenant_member
          where tenant_id=${ctx.tenantId}
          order by case role_code when 'OWNER' then 1 when 'ADMIN' then 2 else 3 end,created_at,id`,
        invitations = await tx`
          select id,role_code,created_at,expires_at
          from tenant_invitation
          where tenant_id=${ctx.tenantId}
            and accepted_at is null and revoked_at is null and expires_at>now()
          order by expires_at,id`;
      return json({
        members: members.map((member) => ({
          id: String(member.id),
          role: String(member.role_code),
          createdAt: apiTimestamp(member.created_at),
          isCurrentActor: Boolean(member.is_current_actor),
        })),
        invitations: invitations.map((invitation) =>
          invitationItem(invitation),
        ),
      });
    });
  } finally {
    await sql.end();
  }
}

async function createTeamInvitation(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    invitedRole = teamInvitationRole(body),
    expiresInHours = teamInvitationExpiryHours(body),
    token = newInvitationToken(),
    tokenHash = await invitationTokenHash(token),
    invitationId = crypto.randomUUID(),
    sql = db(env);
  try {
    const row = await withTenantTransaction(sql, ctx, async (tx) => {
      const role = await tenantRole(tx, ctx);
      if (role !== "OWNER" && role !== "ADMIN")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only tenant owners and administrators can create invitations",
        );
      if (role === "ADMIN" && invitedRole !== "MEMBER")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Administrators can invite members only",
        );
      await tx`select id from tenant where id=${ctx.tenantId} for update`;
      const active =
        await tx`select count(*)::int as count from tenant_invitation where tenant_id=${ctx.tenantId} and accepted_at is null and revoked_at is null and expires_at>now()`;
      if (Number(active[0]!.count) >= 50)
        throw new ApiError(
          429,
          "INVITATION_LIMIT_REACHED",
          "Revoke or use an active invitation before creating another",
        );
      const inserted = await tx`
          insert into tenant_invitation(id,tenant_id,token_hash,role_code,created_by,expires_at)
          values(${invitationId},${ctx.tenantId},${tokenHash},${invitedRole},${ctx.actorId},now()+(${expiresInHours}::int*interval '1 hour'))
          returning id,role_code,created_at,expires_at`;
      await appendScopedEvents(
        tx,
        ctx,
        { organisationId: null, engagementId: null },
        "TEAM_INVITATION_CREATED",
        "TENANT_INVITATION",
        invitationId,
        { role: invitedRole, expiresAt: inserted[0]!.expires_at },
      );
      return inserted[0]!;
    });
    const inviteUrl = new URL("/invite", env.WEB_ORIGIN);
    inviteUrl.hash = `token=${token}`;
    return json(
      {
        item: invitationItem(row),
        token,
        inviteUrl: inviteUrl.toString(),
      },
      201,
    );
  } finally {
    await sql.end();
  }
}

async function revokeTeamInvitation(
  request: Request,
  env: Env,
  actorId: string,
  invitationId: string,
): Promise<Response> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      invitationId,
    )
  )
    throw new ApiError(404, "NOT_FOUND", "Invitation not found");
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const role = await tenantRole(tx, ctx);
      if (role !== "OWNER" && role !== "ADMIN")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only tenant owners and administrators can revoke invitations",
        );
      const rows = await tx`
          select id,role_code,created_at,expires_at,accepted_at,revoked_at
          from tenant_invitation
          where id=${invitationId} and tenant_id=${ctx.tenantId}
          for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Invitation not found");
      if (role === "ADMIN" && String(rows[0]!.role_code) !== "MEMBER")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Administrators can revoke member invitations only",
        );
      if (rows[0]!.revoked_at) return invitationItem(rows[0]!, "REVOKED");
      if (
        rows[0]!.accepted_at ||
        new Date(String(rows[0]!.expires_at)).valueOf() <= Date.now()
      )
        throw new ApiError(
          409,
          "INVITATION_NOT_ACTIVE",
          "Only an unused, unexpired invitation can be revoked",
        );
      const updated = await tx`
          update tenant_invitation
          set revoked_at=now(),revoked_by=${ctx.actorId}
          where id=${invitationId} and tenant_id=${ctx.tenantId}
          returning id,role_code,created_at,expires_at,revoked_at`;
      await appendScopedEvents(
        tx,
        ctx,
        { organisationId: null, engagementId: null },
        "TEAM_INVITATION_REVOKED",
        "TENANT_INVITATION",
        invitationId,
        { role: rows[0]!.role_code, revokedAt: updated[0]!.revoked_at },
      );
      return invitationItem(updated[0]!, "REVOKED");
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

async function manageTeamMember(
  request: Request,
  env: Env,
  actorId: string,
  memberId: string,
  action: "SET_ROLE" | "REMOVE",
): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId))
    throw new ApiError(404, "NOT_FOUND", "Workspace member not found");
  const ctx = context(request, actorId);
  const body = action === "SET_ROLE" ? await jsonBody(request) : {};
  const role = action === "SET_ROLE" ? String(body.role || "") : null;
  if (action === "SET_ROLE" && !["OWNER", "ADMIN", "MEMBER"].includes(role!))
    throw new ApiError(400, "INVALID_ROLE", "Select a valid workspace role");
  const sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const rows = await tx`
        select member_id,previous_role,role_code,removed
        from manage_workspace_member(${memberId}::uuid,${action}::text,${role}::text)`;
      if (rows.length !== 1)
        throw new ApiError(500, "MEMBER_MANAGEMENT_FAILED", "Workspace access was not changed");
      const row = rows[0]!;
      await appendScopedEvents(
        tx,
        ctx,
        { organisationId: null, engagementId: null },
        action === "REMOVE" ? "TEAM_MEMBER_REMOVED" : "TEAM_MEMBER_ROLE_CHANGED",
        "TENANT_MEMBER",
        String(row.member_id),
        { previousRole: row.previous_role, role: row.role_code, removed: Boolean(row.removed) },
      );
      return {
        id: String(row.member_id),
        previousRole: String(row.previous_role),
        role: row.role_code === null ? null : String(row.role_code),
        removed: Boolean(row.removed),
      };
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

async function acceptTeamInvitation(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response> {
  const body = await jsonBody(request),
    token = teamInvitationToken(body),
    tokenHash = await invitationTokenHash(token),
    sql = db(env);
  try {
    const result = await withActorTransaction(sql, actorId, async (tx) => {
      const rows = await tx`
          select invitation_id,tenant_id,name,role_code,member_created,accepted
          from accept_authenticated_invitation(${tokenHash}::text)`;
      if (!rows.length)
        throw new ApiError(
          410,
          "INVITATION_UNAVAILABLE",
          "The invitation is unavailable, expired, revoked, or already used",
        );
      const row = rows[0]!,
        accepted = Boolean(row.accepted),
        tenantId = String(row.tenant_id);
      if (accepted) {
        await tx`select set_config('app.tenant_id',${tenantId},true)`;
        await appendScopedEvents(
          tx,
          {
            tenantId,
            actorId,
            correlationId:
              request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
          },
          { organisationId: null, engagementId: null },
          "TEAM_INVITATION_ACCEPTED",
          "TENANT_INVITATION",
          String(row.invitation_id),
          {
            role: row.role_code,
            memberCreated: Boolean(row.member_created),
          },
        );
        if (Boolean(row.member_created)) {
          const memberships = await tx`select id from tenant_member where tenant_id=${tenantId} and actor_id=${actorId}`;
          await appendScopedEvents(tx,{tenantId,actorId,correlationId:request.headers.get("x-correlation-id") ?? crypto.randomUUID()},{organisationId:null,engagementId:null},"TENANT_MEMBERSHIP_CREATED","TENANT_MEMBER",String(memberships[0]!.id),{role:row.role_code,source:"INVITATION"});
        }
      }
      return {
        item: {
          tenantId,
          name: String(row.name),
          role: String(row.role_code),
        },
        accepted,
        memberCreated: Boolean(row.member_created),
      };
    });
    return json(result, result.accepted ? 201 : 200);
  } catch (error) {
    const mapped = teamInvitationDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  } finally {
    await sql.end();
  }
}

async function createEngagement(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const body = await jsonBody(request);
  const organisationId = requiredString(body, "organisationId");
  const periodStart = requiredString(body, "periodStart");
  const periodEnd = requiredString(body, "periodEnd");
  const framework = enumValue(body, "framework", REPORTING_FRAMEWORKS);
  const sectorProfile =
    body.sectorProfile === undefined ||
    body.sectorProfile === null ||
    body.sectorProfile === ""
      ? null
      : enumValue(body, "sectorProfile", SECTOR_PROFILES);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ||
    periodEnd < periodStart
  )
    throw new ApiError(
      400,
      "INVALID_PERIOD",
      "A valid periodStart and periodEnd are required",
    );
  const sql = db(env);
  try {
    const engagementId = crypto.randomUUID();
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const role = await tenantRole(tx, ctx);
      if (role !== "OWNER" && role !== "ADMIN")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only tenant owners and administrators can create engagements",
        );
      const organisations =
        await tx`select id,legal_form,lifecycle_status from organisation where id=${organisationId} and tenant_id=${ctx.tenantId}`;
      if (!organisations.length)
        throw new ApiError(404, "NOT_FOUND", "Organisation not found");
      if (String(organisations[0]!.lifecycle_status) === "ARCHIVED")
        throw new ApiError(409, "ORGANISATION_ARCHIVED", "Archived clients cannot be used for new accounts periods");
      const regimeError = reportingRegimeError(
        framework,
        sectorProfile,
        String(organisations[0]!.legal_form ?? ""),
      );
      if (regimeError)
        throw new ApiError(
          400,
          "INVALID_REPORTING_COMBINATION",
          regimeError,
        );
      const inserted =
        await tx`insert into engagement(id,tenant_id,organisation_id,period_start,period_end,framework,sector_profile)
        values(${engagementId},${ctx.tenantId},${organisationId},${periodStart},${periodEnd},${framework},${sectorProfile})
        returning id,organisation_id,period_start,period_end,framework,sector_profile,status,version`;
      await tx`insert into engagement_member(id,tenant_id,engagement_id,actor_id,role_code)
        values(${crypto.randomUUID()},${ctx.tenantId},${engagementId},${ctx.actorId},'MANAGER') on conflict(engagement_id,actor_id,role_code) do nothing`;
      await appendEvents(
        tx,
        ctx,
        { id: engagementId, organisationId, role: "MANAGER" },
        "ENGAGEMENT_CREATED",
        "ENGAGEMENT",
        engagementId,
        { periodStart, periodEnd, framework, sectorProfile },
        "ledgerly.workspace.created",
      );
      return inserted[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}

async function csvUpload(
  request: Request,
): Promise<{
  bytes: ArrayBuffer;
  filename: string;
  mapping?: Partial<TrialBalanceColumnMapping>;
}> {
  const contentTypeHeader = request.headers.get("content-type") ?? "";
  const contentType = contentTypeHeader.toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    const multipartBytes = await readBodyBounded(
      request,
      MAX_CSV_BYTES,
      "CSV upload",
    );
    const form = await new Response(multipartBytes, {
      headers: { "content-type": contentTypeHeader },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ApiError(
        400,
        "FILE_REQUIRED",
        'Multipart field "file" is required',
      );
    if (file.size > MAX_CSV_BYTES)
      throw new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "CSV must not exceed 10 MiB",
      );
    return {
      bytes: await file.arrayBuffer(),
      filename: (file.name || "trial-balance.csv").slice(0, 255),
      mapping: trialBalanceColumnMapping(form.get("mapping")),
    };
  }
  if (
    !contentType.includes("text/csv") &&
    !contentType.includes("application/csv")
  )
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send a text/csv body or multipart form field named file",
    );
  const bytes = await readBodyBounded(request, MAX_CSV_BYTES, "CSV upload");
  return {
    bytes,
    filename:
      request.headers.get("x-filename")?.slice(0, 255) || "trial-balance.csv",
  };
}
async function deleteUploadedObject(
  env: Env,
  storageKey: string,
  reason: string,
): Promise<void> {
  try {
    await env.ARTEFACTS.delete(storageKey);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "R2 import cleanup failed",
        reason,
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
async function importCsv(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const sql = db(env);
  try {
    const engagement = await withTenantTransaction(sql, ctx, (tx) =>
      engagementAccess(tx, ctx, engagementId, WRITE_ROLES),
    );
    const upload = await csvUpload(request);
    const sourceHash = await sha256(upload.bytes);
    const hash = upload.mapping
      ? await canonicalHash({ sourceHash, mapping: upload.mapping })
      : sourceHash;
    const decoded = decodeTrialBalanceCsv(upload.bytes);
    const parsed = parseTrialBalanceCsv(decoded.text, upload.mapping);
    if (!parsed.balanced)
      throw new ApiError(
        422,
        "TB_NOT_BALANCED",
        `Trial balance differs by debit ${parsed.debitTotal} and credit ${parsed.creditTotal}`,
      );
    const existing = await withTenantTransaction(
      sql,
      ctx,
      (
        tx,
      ) => tx`select id,status,content_hash,storage_key,created_at,committed_at from import_batch
      where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and content_hash=${hash}
      order by created_at desc limit 1`,
    );
    if (existing.length) return json({ item: existing[0], duplicate: true });
    const batchId = crypto.randomUUID();
    const storageKey = `tenants/${ctx.tenantId}/engagements/${engagementId}/imports/${batchId}-${hash}.csv`;
    const charset = {
      "UTF-8": "utf-8",
      "UTF-16 LE": "utf-16le",
      "UTF-16 BE": "utf-16be",
      "Windows-1252": "windows-1252",
    }[decoded.encoding];
    // R2 completes before the transaction starts: database state can never point at a missing object.
    await env.ARTEFACTS.put(storageKey, upload.bytes, {
      httpMetadata: { contentType: `text/csv; charset=${charset}` },
      customMetadata: {
        sha256: hash,
        sourceSha256: sourceHash,
        tenantId: ctx.tenantId,
        engagementId,
        originalFilename: upload.filename,
        sourceEncoding: decoded.encoding,
      },
    });
    let transactionBodyCompleted = false;
    let duplicateFound = false;
    try {
      const outcome = await withTenantTransaction(sql, ctx, async (tx) => {
        // Sequence, duplicate detection and version allocation are engagement-scoped and serial.
        await tx`select id from engagement where id=${engagementId} and tenant_id=${ctx.tenantId} for update`;
        const duplicate =
          await tx`select id,status,content_hash,storage_key,created_at,committed_at from import_batch
          where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and content_hash=${hash}
          order by created_at desc limit 1`;
        if (duplicate.length) {
          duplicateFound = true;
          transactionBodyCompleted = true;
          return { duplicate: true as const, item: duplicate[0]! };
        }
        const batch =
          await tx`insert into import_batch(id,tenant_id,engagement_id,source_type,original_filename,status,content_hash,storage_key,committed_at)
          values(${batchId},${ctx.tenantId},${engagementId},'CSV',${upload.filename},'COMMITTED',${hash},${storageKey},now()) returning id,status,content_hash,storage_key,created_at,committed_at`;
        if (parsed.rows.length)
          await tx`insert into import_row ${tx(
            parsed.rows.map((row) => ({
              id: crypto.randomUUID(),
              tenant_id: ctx.tenantId,
              import_batch_id: batchId,
              row_no: row.rowNo,
              account_code: row.accountCode,
              account_name: row.accountName,
              debit: row.debit,
              credit: row.credit,
              dimensions: tx.json({}),
              raw_row: tx.json(row.rawRow),
            })),
            "id",
            "tenant_id",
            "import_batch_id",
            "row_no",
            "account_code",
            "account_name",
            "debit",
            "credit",
            "dimensions",
            "raw_row",
          )}`;
        const uniqueAccounts = [
          ...new Map(parsed.rows.map((row) => [row.accountCode, row])).values(),
        ];
        const sourceAccounts = await tx`insert into source_account ${tx(
          uniqueAccounts.map((row) => ({
            id: crypto.randomUUID(),
            tenant_id: ctx.tenantId,
            organisation_id: engagement.organisationId,
            account_code: row.accountCode,
            account_name: row.accountName,
          })),
          "id",
          "tenant_id",
          "organisation_id",
          "account_code",
          "account_name",
        )}
          on conflict(organisation_id,account_code) do update set account_name=excluded.account_name returning id,account_code`;
        const sourceByCode = new Map(
          sourceAccounts.map((row) => [
            String(row.account_code),
            String(row.id),
          ]),
        );
        const sequenceRows =
          await tx`select coalesce(max(sequence_no),0)+1 as sequence_no from import_snapshot where engagement_id=${engagementId}`;
        const sequenceNo = Number(sequenceRows[0]!.sequence_no);
        const snapshotId = crypto.randomUUID();
        await tx`insert into import_snapshot(id,tenant_id,engagement_id,sequence_no,content_hash,storage_key,record_count,debit_total,credit_total,import_batch_id)
          values(${snapshotId},${ctx.tenantId},${engagementId},${sequenceNo},${hash},${storageKey},${parsed.rows.length},${parsed.debitTotal},${parsed.creditTotal},${batchId})`;
        const versionRows =
          await tx`select coalesce(max(version_no),0)+1 as version_no from trial_balance where engagement_id=${engagementId} and state='IMPORTED'`;
        const versionNo = Number(versionRows[0]!.version_no);
        const trialBalanceId = crypto.randomUUID();
        await tx`insert into trial_balance(id,tenant_id,engagement_id,state,version_no,source_import_snapshot_id,content_hash)
          values(${trialBalanceId},${ctx.tenantId},${engagementId},'IMPORTED',${versionNo},${snapshotId},${hash})`;
        const latestMappings =
          await tx`select distinct on(source_account_id) source_account_id,canonical_account_id from account_mapping
          where tenant_id=${ctx.tenantId} and (engagement_id=${engagementId} or engagement_id is null)
          order by source_account_id,(engagement_id is not null) desc,version desc,created_at desc`;
        const canonicalBySource = new Map(
          latestMappings.map((row) => [
            String(row.source_account_id),
            String(row.canonical_account_id),
          ]),
        );
        await tx`insert into trial_balance_line ${tx(
          parsed.rows.map((row) => {
            const sourceAccountId = sourceByCode.get(row.accountCode)!;
            return {
              id: crypto.randomUUID(),
              trial_balance_id: trialBalanceId,
              tenant_id: ctx.tenantId,
              source_account_id: sourceAccountId,
              canonical_account_id:
                canonicalBySource.get(sourceAccountId) ?? null,
              dimensions: tx.json({}),
              debit: row.debit,
              credit: row.credit,
            };
          }),
          "id",
          "trial_balance_id",
          "tenant_id",
          "source_account_id",
          "canonical_account_id",
          "dimensions",
          "debit",
          "credit",
        )}`;
        await appendEvents(
          tx,
          ctx,
          engagement,
          "IMPORT_COMMITTED",
          "IMPORT_BATCH",
          batchId,
          {
            trialBalanceId,
            snapshotId,
            versionNo,
            recordCount: parsed.rows.length,
            contentHash: hash,
            storageKey,
          },
        );
        transactionBodyCompleted = true;
        return {
          duplicate: false as const,
          item: {
            ...batch[0],
            trial_balance_id: trialBalanceId,
            snapshot_id: snapshotId,
            version_no: versionNo,
            record_count: parsed.rows.length,
            debit_total: parsed.debitTotal,
            credit_total: parsed.creditTotal,
          },
        };
      });
      if (outcome.duplicate) {
        await deleteUploadedObject(env, storageKey, "duplicate import");
        return json({ item: outcome.item, duplicate: true });
      }
      return json({ item: outcome.item }, 201);
    } catch (error) {
      // If the callback itself failed, Postgres.js rolls it back. A failure after
      // the callback may be an ambiguous COMMIT outcome, so retain R2 for safety.
      if (duplicateFound || !transactionBodyCompleted)
        await deleteUploadedObject(
          env,
          storageKey,
          duplicateFound ? "duplicate import" : "rolled back import",
        );
      throw error;
    }
  } finally {
    await sql.end();
  }
}

async function mapAccount(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const body = await jsonBody(request);
  const sourceAccountId = requiredString(body, "sourceAccountId");
  const canonicalAccountId = requiredString(body, "canonicalAccountId");
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : null;
  const sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WRITE_ROLES,
      );
      await tx`select id from engagement where id=${engagementId} and tenant_id=${ctx.tenantId} for update`;
      const sources =
        await tx`select id from source_account where id=${sourceAccountId} and tenant_id=${ctx.tenantId} and organisation_id=${engagement.organisationId}`;
      if (!sources.length)
        throw new ApiError(404, "NOT_FOUND", "Source account not found");
      const canonical =
        await tx`select id,canonical_code,name,report_line from canonical_account where id=${canonicalAccountId}`;
      if (!canonical.length)
        throw new ApiError(404, "NOT_FOUND", "Canonical account not found");
      const finalRows =
        await tx`select id from trial_balance where engagement_id=${engagementId} and tenant_id=${ctx.tenantId} and state in ('FINAL','FILED') limit 1`;
      if (finalRows.length)
        throw new ApiError(
          409,
          "TRIAL_BALANCE_LOCKED",
          "Mappings cannot change after the trial balance is final or filed",
        );
      const versions =
        await tx`select coalesce(max(version),0)+1 as version from account_mapping where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and source_account_id=${sourceAccountId}`;
      const version = Number(versions[0]!.version);
      const mappingId = crypto.randomUUID();
      const inserted =
        await tx`insert into account_mapping(id,tenant_id,engagement_id,source_account_id,canonical_account_id,mapping_source,status,version)
        values(${mappingId},${ctx.tenantId},${engagementId},${sourceAccountId},${canonicalAccountId},'MANUAL','CONFIRMED',${version})
        returning id,source_account_id,canonical_account_id,mapping_source,status,version,created_at`;
      await tx`update trial_balance_line tbl set canonical_account_id=${canonicalAccountId} from trial_balance tb
        where tbl.trial_balance_id=tb.id and tbl.tenant_id=${ctx.tenantId} and tb.engagement_id=${engagementId}
          and tb.state not in ('FINAL','FILED') and tbl.source_account_id=${sourceAccountId}`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "MAPPING_CHANGED",
        "ACCOUNT_MAPPING",
        mappingId,
        { sourceAccountId, canonicalAccountId, version, reason },
      );
      return { ...inserted[0], canonical_account: canonical[0] };
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}

async function journalItems(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  journalId?: string,
) {
  return tx`select j.*,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',jl.id,'line_no',jl.line_no,'canonical_account_id',jl.canonical_account_id,
      'canonical_code',ca.canonical_code,'account_name',ca.name,'debit',jl.debit,'credit',jl.credit,
      'dimensions',jl.dimensions,'narrative',jl.narrative) order by jl.line_no)
      from journal_line jl join canonical_account ca on ca.id=jl.canonical_account_id
      where jl.journal_id=j.id and jl.tenant_id=j.tenant_id),'[]'::jsonb) as lines
    from journal j where j.tenant_id=${ctx.tenantId} and j.engagement_id=${engagementId}
      and (${journalId ?? null}::uuid is null or j.id=${journalId ?? null})
    order by j.journal_no desc,j.version desc`;
}

async function listJournals(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      return json({ items: await journalItems(tx, ctx, engagementId) });
    });
  } finally {
    await sql.end();
  }
}

async function createJournal(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    sql = db(env);
  const journalType = enumValue(body, "journalType", JOURNAL_TYPES),
    description = requiredString(body, "description");
  const parsed = journalLines(body);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WRITE_ROLES,
      );
      await tx`select id from engagement where id=${engagementId} and tenant_id=${ctx.tenantId} for update`;
      const canonicalIds = [
        ...new Set(parsed.lines.map((line) => line.canonicalAccountId)),
      ];
      const valid =
        await tx`select id from canonical_account where id in ${tx(canonicalIds)}`;
      if (valid.length !== canonicalIds.length)
        throw new ApiError(
          400,
          "INVALID_CANONICAL_ACCOUNT",
          "One or more canonical accounts are invalid",
        );
      const numbers =
        await tx`select coalesce(max(journal_no),0)+1 as journal_no from journal where tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      const journalId = crypto.randomUUID(),
        journalNo = Number(numbers[0]!.journal_no);
      await tx`insert into journal(id,tenant_id,engagement_id,journal_no,journal_type,description,prepared_by)
        values(${journalId},${ctx.tenantId},${engagementId},${journalNo},${journalType},${description},${ctx.actorId})`;
      await tx`insert into journal_line ${tx(
        parsed.lines.map((line, index) => ({
          id: crypto.randomUUID(),
          tenant_id: ctx.tenantId,
          journal_id: journalId,
          line_no: index + 1,
          canonical_account_id: line.canonicalAccountId,
          debit: line.debit,
          credit: line.credit,
          dimensions: JSON.stringify(line.dimensions),
          narrative: line.narrative,
        })),
        "id",
        "tenant_id",
        "journal_id",
        "line_no",
        "canonical_account_id",
        "debit",
        "credit",
        "dimensions",
        "narrative",
      )}`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "JOURNAL_CREATED",
        "JOURNAL",
        journalId,
        {
          journalNo,
          journalType,
          balanced: parsed.balanced,
          lineCount: parsed.lines.length,
        },
      );
      return (await journalItems(tx, ctx, engagementId, journalId))[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}

async function transitionJournal(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  journalId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    sql = db(env);
  const next = enumValue(body, "status", JOURNAL_STATUSES) as JournalStatus,
    reason = optionalString(body, "reason") ?? null;
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(tx, ctx, engagementId);
      await lockEngagement(tx, ctx, engagementId);
      const rows =
        await tx`select id,status,prepared_by from journal where id=${journalId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Journal not found");
      const current = String(rows[0]!.status) as JournalStatus,
        preparedBy = String(rows[0]!.prepared_by);
      const totals =
        await tx`select coalesce(sum(debit),0)=coalesce(sum(credit),0) as balanced,count(*)::int as line_count from journal_line where tenant_id=${ctx.tenantId} and journal_id=${journalId}`;
      const balanced =
        Boolean(totals[0]!.balanced) && Number(totals[0]!.line_count) >= 2;
      if (next === "APPROVED") requireRole(engagement.role, REVIEW_ROLES);
      else if (next === "POSTED")
        requireRole(engagement.role, ["PARTNER", "MANAGER", "FILER"]);
      else if (next === "VOIDED")
        requireRole(engagement.role, ["PARTNER", "MANAGER"]);
      else requireRole(engagement.role, WRITE_ROLES);
      assertJournalTransition(current, next, ctx.actorId, preparedBy, balanced);
      await tx`update journal set status=${next},version=version+1,updated_at=now(),
        approved_by=case when ${next}='APPROVED' then ${ctx.actorId} when ${next} in ('DRAFT','VOIDED') then null else approved_by end,
        approved_at=case when ${next}='APPROVED' then now() when ${next} in ('DRAFT','VOIDED') then null else approved_at end
        where id=${journalId} and tenant_id=${ctx.tenantId}`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "JOURNAL_STATUS_CHANGED",
        "JOURNAL",
        journalId,
        { from: current, to: next, reason },
      );
      return (await journalItems(tx, ctx, engagementId, journalId))[0]!;
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

async function listReconciliations(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      return json({
        items: await tx`
    select *,(ledger_balance-supporting_balance) as difference from reconciliation
    where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} order by created_at,title`,
      });
    });
  } finally {
    await sql.end();
  }
}

function monetaryMinor(value: string): bigint {
  return BigInt(value.replace(".", ""));
}

async function putReconciliation(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    sql = db(env);
  const id = optionalString(body, "id") ?? null,
    reconciliationType = enumValue(
      body,
      "reconciliationType",
      RECONCILIATION_TYPES,
    ),
    title = requiredString(body, "title");
  const trialBalanceId = optionalString(body, "trialBalanceId") ?? null,
    ledgerBalance = money(body, "ledgerBalance", "0"),
    supportingBalance = money(body, "supportingBalance", "0"),
    tolerance = money(body, "tolerance", "0");
  if (monetaryMinor(tolerance) < 0n)
    throw new ApiError(400, "INVALID_REQUEST", "tolerance cannot be negative");
  const requestedStatus =
    body.status === undefined
      ? undefined
      : (enumValue(
          body,
          "status",
          RECONCILIATION_STATUSES,
        ) as ReconciliationStatus);
  try {
    const result = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WRITE_ROLES,
      );
      if (trialBalanceId) {
        const tb =
          await tx`select id from trial_balance where id=${trialBalanceId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
        if (!tb.length)
          throw new ApiError(
            400,
            "INVALID_TRIAL_BALANCE",
            "trialBalanceId is invalid",
          );
      }
      const withinTolerance =
        monetaryMinor(ledgerBalance) - monetaryMinor(supportingBalance) <=
          monetaryMinor(tolerance) &&
        monetaryMinor(supportingBalance) - monetaryMinor(ledgerBalance) <=
          monetaryMinor(tolerance);
      if (!id) {
        const desired = requestedStatus ?? "NOT_STARTED";
        if (desired !== "NOT_STARTED")
          throw new ApiError(
            409,
            "INVALID_TRANSITION",
            "New reconciliations must start as NOT_STARTED",
          );
        const reconciliationId = crypto.randomUUID();
        const inserted =
          await tx`insert into reconciliation(id,tenant_id,engagement_id,trial_balance_id,reconciliation_type,title,ledger_balance,supporting_balance,tolerance)
          values(${reconciliationId},${ctx.tenantId},${engagementId},${trialBalanceId},${reconciliationType},${title},${ledgerBalance},${supportingBalance},${tolerance}) returning *,(ledger_balance-supporting_balance) as difference`;
        await appendEvents(
          tx,
          ctx,
          engagement,
          "RECONCILIATION_CREATED",
          "RECONCILIATION",
          reconciliationId,
          { reconciliationType, title },
        );
        return { item: inserted[0]!, created: true };
      }
      const currentRows =
        await tx`select * from reconciliation where id=${id} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!currentRows.length)
        throw new ApiError(404, "NOT_FOUND", "Reconciliation not found");
      const current = String(currentRows[0]!.status) as ReconciliationStatus,
        desired = requestedStatus ?? current;
      if (current === "REVIEWED")
        throw new ApiError(
          409,
          "RECONCILIATION_LOCKED",
          "Reviewed reconciliations cannot be edited",
        );
      if (desired === "RECONCILED" && !withinTolerance)
        throw new ApiError(
          409,
          "RECONCILIATION_OUT_OF_TOLERANCE",
          "Difference exceeds tolerance",
        );
      if (desired !== current) assertReconciliationTransition(current, desired);
      const inserted =
        await tx`update reconciliation set trial_balance_id=${trialBalanceId},reconciliation_type=${reconciliationType},title=${title},
        ledger_balance=${ledgerBalance},supporting_balance=${supportingBalance},tolerance=${tolerance},status=${desired},version=version+1,updated_at=now(),
        prepared_by=case when ${desired} in ('RECONCILED','EXCEPTION') then ${ctx.actorId} else prepared_by end,
        prepared_at=case when ${desired} in ('RECONCILED','EXCEPTION') then now() else prepared_at end
        where id=${id} and tenant_id=${ctx.tenantId} returning *,(ledger_balance-supporting_balance) as difference`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "RECONCILIATION_UPDATED",
        "RECONCILIATION",
        id,
        { from: current, to: desired, withinTolerance },
      );
      return { item: inserted[0]!, created: false };
    });
    return json({ item: result.item }, result.created ? 201 : 200);
  } finally {
    await sql.end();
  }
}

async function reviewReconciliation(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  reconciliationId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    reason = optionalString(body, "reason") ?? null,
    sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        REVIEW_ROLES,
      );
      const rows =
        await tx`select * from reconciliation where id=${reconciliationId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Reconciliation not found");
      const row = rows[0]!,
        current = String(row.status) as ReconciliationStatus;
      assertReconciliationTransition(current, "REVIEWED");
      if (!row.prepared_by)
        throw new ApiError(
          409,
          "RECONCILIATION_NOT_PREPARED",
          "Reconciliation has no preparer",
        );
      if (String(row.prepared_by) === ctx.actorId)
        throw new ApiError(
          409,
          "SEGREGATION_REQUIRED",
          "Reviewer must differ from preparer",
        );
      const difference =
          monetaryMinor(String(row.ledger_balance)) -
          monetaryMinor(String(row.supporting_balance)),
        tolerance = monetaryMinor(String(row.tolerance));
      if ((difference < 0n ? -difference : difference) > tolerance)
        throw new ApiError(
          409,
          "RECONCILIATION_OUT_OF_TOLERANCE",
          "Difference exceeds tolerance",
        );
      const updated =
        await tx`update reconciliation set status='REVIEWED',reviewed_by=${ctx.actorId},reviewed_at=now(),version=version+1,updated_at=now()
        where id=${reconciliationId} and tenant_id=${ctx.tenantId} returning *,(ledger_balance-supporting_balance) as difference`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "RECONCILIATION_REVIEWED",
        "RECONCILIATION",
        reconciliationId,
        { reason },
      );
      return updated[0]!;
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

async function listWorkflowTasks(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      return json({
        items:
          await tx`select * from workflow_task where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} order by blocking desc,due_at nulls last,created_at`,
      });
    });
  } finally {
    await sql.end();
  }
}

async function createWorkflowTask(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    sql = db(env);
  const taskType = requiredString(body, "taskType"),
    title = requiredString(body, "title"),
    blocking = optionalBoolean(body, "blocking") ?? false;
  const assignedTo = optionalString(body, "assignedTo") ?? null,
    dueAt = optionalTimestamp(body, "dueAt") ?? null,
    dependencyType = optionalString(body, "dependencyType") ?? null,
    dependencyId = optionalString(body, "dependencyId") ?? null;
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WORKFLOW_ROLES,
      );
      if (assignedTo && assignedTo !== ctx.actorId)
        requireRole(engagement.role, ["PARTNER", "MANAGER"]);
      const id = crypto.randomUUID();
      const inserted =
        await tx`insert into workflow_task(id,tenant_id,engagement_id,task_type,title,blocking,assigned_to,due_at,dependency_type,dependency_id)
        values(${id},${ctx.tenantId},${engagementId},${taskType},${title},${blocking},${assignedTo},${dueAt},${dependencyType},${dependencyId}) returning *`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "WORKFLOW_TASK_CREATED",
        "WORKFLOW_TASK",
        id,
        { taskType, title, blocking, assignedTo, dueAt },
      );
      return inserted[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}

async function patchWorkflowTask(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  pathTaskId?: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    sql = db(env),
    taskId = pathTaskId ?? requiredString(body, "id");
  const title = optionalString(body, "title"),
    blocking = optionalBoolean(body, "blocking"),
    assignedTo = optionalString(body, "assignedTo"),
    dueAt = optionalTimestamp(body, "dueAt");
  if (title === null)
    throw new ApiError(400, "INVALID_REQUEST", "title cannot be empty");
  const requestedStatus =
    body.status === undefined
      ? undefined
      : (enumValue(body, "status", TASK_STATUSES) as TaskStatus);
  if (
    title === undefined &&
    blocking === undefined &&
    assignedTo === undefined &&
    dueAt === undefined &&
    requestedStatus === undefined
  )
    throw new ApiError(400, "INVALID_REQUEST", "No task changes were supplied");
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WORKFLOW_ROLES,
      );
      const rows =
        await tx`select * from workflow_task where id=${taskId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Workflow task not found");
      const row = rows[0]!,
        current = String(row.status) as TaskStatus,
        next = requestedStatus ?? current;
      if (current === "COMPLETE" || current === "CANCELLED")
        throw new ApiError(
          409,
          "TASK_LOCKED",
          "Completed or cancelled tasks cannot be edited",
        );
      if (
        String(row.assigned_to ?? "") &&
        String(row.assigned_to) !== ctx.actorId
      )
        requireRole(engagement.role, ["PARTNER", "MANAGER"]);
      if (assignedTo !== undefined && assignedTo !== ctx.actorId)
        requireRole(engagement.role, ["PARTNER", "MANAGER"]);
      if (next !== current) assertTaskTransition(current, next);
      const updated = await tx`update workflow_task set status=${next},
        title=case when ${title !== undefined} then ${title ?? null} else title end,
        blocking=case when ${blocking !== undefined} then ${blocking ?? false} else blocking end,
        assigned_to=case when ${assignedTo !== undefined} then ${assignedTo ?? null} else assigned_to end,
        due_at=case when ${dueAt !== undefined} then ${dueAt ?? null}::timestamptz else due_at end,
        completed_by=case when ${next}='COMPLETE' then ${ctx.actorId} else completed_by end,
        completed_at=case when ${next}='COMPLETE' then now() else completed_at end,updated_at=now()
        where id=${taskId} and tenant_id=${ctx.tenantId} returning *`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "WORKFLOW_TASK_UPDATED",
        "WORKFLOW_TASK",
        taskId,
        { from: current, to: next, assignedTo: assignedTo ?? row.assigned_to },
      );
      return updated[0]!;
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

async function listReviewPoints(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      return json({
        items:
          await tx`select * from review_point where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} order by (severity='BLOCKING') desc,created_at desc`,
      });
    });
  } finally {
    await sql.end();
  }
}

async function createReviewPoint(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    sql = db(env);
  const objectType = requiredString(body, "objectType"),
    objectId = requiredString(body, "objectId"),
    question = requiredString(body, "question");
  const severity = enumValue(
      body,
      "severity",
      ["NORMAL", "BLOCKING"] as const,
      "NORMAL",
    ),
    assignedTo = optionalString(body, "assignedTo") ?? null;
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
          tx,
          ctx,
          engagementId,
          REVIEW_ROLES,
        ),
        id = crypto.randomUUID();
      const inserted =
        await tx`insert into review_point(id,tenant_id,engagement_id,object_type,object_id,raised_by,assigned_to,severity,question)
        values(${id},${ctx.tenantId},${engagementId},${objectType},${objectId},${ctx.actorId},${assignedTo},${severity},${question}) returning *`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "REVIEW_POINT_RAISED",
        "REVIEW_POINT",
        id,
        { objectType, objectId, severity, assignedTo },
      );
      return inserted[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}

async function patchReviewPoint(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  pathReviewPointId?: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    sql = db(env),
    reviewPointId = pathReviewPointId ?? requiredString(body, "id");
  const requestedStatus =
    body.status === undefined
      ? undefined
      : (enumValue(body, "status", REVIEW_POINT_STATUSES) as ReviewPointStatus);
  const response = optionalString(body, "response"),
    assignedTo = optionalString(body, "assignedTo");
  if (
    requestedStatus === undefined &&
    response === undefined &&
    assignedTo === undefined
  )
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "No review-point changes were supplied",
    );
  if (response !== undefined && requestedStatus === undefined)
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "A response update requires a status transition",
    );
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WORKFLOW_ROLES,
      );
      const rows =
        await tx`select * from review_point where id=${reviewPointId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Review point not found");
      const row = rows[0]!,
        current = String(row.status) as ReviewPointStatus,
        next = requestedStatus ?? current,
        nextResponse =
          response === undefined
            ? row.response === null
              ? null
              : String(row.response)
            : response;
      if (current === "CLEARED" && next !== "REOPENED")
        throw new ApiError(
          409,
          "REVIEW_POINT_LOCKED",
          "Cleared review points must be reopened before editing",
        );
      if (next !== current) {
        if (next === "CLEARED" || next === "REOPENED")
          requireRole(engagement.role, REVIEW_ROLES);
        if (
          next === "RESPONDED" &&
          row.assigned_to &&
          String(row.assigned_to) !== ctx.actorId
        )
          requireRole(engagement.role, ["PARTNER", "MANAGER"]);
        assertReviewPointTransition(
          current,
          next,
          nextResponse,
          ctx.actorId,
          String(row.raised_by),
        );
      }
      if (assignedTo !== undefined) requireRole(engagement.role, REVIEW_ROLES);
      const updated = await tx`update review_point set status=${next},
        response=case when ${response !== undefined} then ${response ?? null} else response end,
        assigned_to=case when ${assignedTo !== undefined} then ${assignedTo ?? null} else assigned_to end,
        cleared_by=case when ${next}='CLEARED' then ${ctx.actorId} when ${next}='REOPENED' then null else cleared_by end,
        cleared_at=case when ${next}='CLEARED' then now() when ${next}='REOPENED' then null else cleared_at end,updated_at=now()
        where id=${reviewPointId} and tenant_id=${ctx.tenantId} returning *`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "REVIEW_POINT_UPDATED",
        "REVIEW_POINT",
        reviewPointId,
        { from: current, to: next, assignedTo: assignedTo ?? row.assigned_to },
      );
      return updated[0]!;
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

async function invalidateDependentSignoffs(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  objectType: string,
  objectId: string,
  reason: string,
): Promise<void> {
  await tx`update signoff set invalidated_at=now(),invalidation_reason=${reason}
    where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and invalidated_at is null
      and ((object_type=${objectType} and object_id=${objectId}) or object_type='ACCOUNTS_VERSION')`;
}
async function lockEngagement(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
): Promise<void> {
  await tx`select id from engagement where id=${engagementId} and tenant_id=${ctx.tenantId} for update`;
}
async function workingPaperItems(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  workingPaperId?: string,
) {
  const rows=await tx`select wp.*,coalesce(primary_link.report_line_id,wp.report_line_id) as authoritative_report_line_id,v.content,v.content_hash,v.created_by as version_created_by,v.created_at as version_created_at
    from working_paper wp join working_paper_version v on v.working_paper_id=wp.id and v.tenant_id=wp.tenant_id and v.version=wp.current_version
    left join lateral(select report_line_id from working_paper_report_line_link link where link.tenant_id=wp.tenant_id and link.working_paper_id=wp.id and link.link_purpose='PRIMARY' and not exists(select 1 from working_paper_report_line_link successor where successor.tenant_id=link.tenant_id and successor.supersedes_link_id=link.id) order by link.created_at,link.id limit 1)primary_link on true
    where wp.tenant_id=${ctx.tenantId} and wp.engagement_id=${engagementId}
      and (${workingPaperId ?? null}::uuid is null or wp.id=${workingPaperId ?? null}) order by wp.code`;
  return rows.map(row=>{const{authoritative_report_line_id,...item}=row;return{...item,report_line_id:authoritative_report_line_id};});
}
async function listWorkingPapers(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      return json({ items: await workingPaperItems(tx, ctx, engagementId) });
    });
  } finally {
    await sql.end();
  }
}
async function createWorkingPaper(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    sql = db(env),
    code = boundedRequiredString(body, "code", 80),
    title = boundedRequiredString(body, "title", 255),
    categoryCode = enumValue(
      body,
      "categoryCode",
      WORKING_PAPER_CATEGORIES,
    ),
    objective = boundedRequiredString(body, "objective", 2000);
  const reportLineId = optionalString(body, "reportLineId") ?? null,
    content = body.content === undefined ? {} : requireObject(body.content),
    contentHash = await canonicalHash(content);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WRITE_ROLES,
      );
      await lockEngagement(tx, ctx, engagementId);
      if (reportLineId) {
        const scope=await workingPaperReportingScope(tx,ctx,engagementId);
        if(scope.reason)
          throw new ApiError(409,scope.reason,"The engagement does not have one unambiguous applicable reporting pack and taxonomy");
        if(!scope.lines.some(line=>String(line.id)===reportLineId))
          throw new ApiError(
            400,
            "IMPERMISSIBLE_REPORT_LINE",
            "reportLineId is not permitted by the engagement reporting pack and taxonomy",
          );
      }
      const id = crypto.randomUUID();
      await tx`insert into working_paper(id,tenant_id,engagement_id,code,title,report_line_id,category_code,objective)
      values(${id},${ctx.tenantId},${engagementId},${code},${title},null,${categoryCode},${objective})`;
      if(reportLineId)await tx`insert into working_paper_report_line_link(id,tenant_id,engagement_id,working_paper_id,report_line_id,link_purpose,created_by) values(${crypto.randomUUID()},${ctx.tenantId},${engagementId},${id},${reportLineId},'PRIMARY',${ctx.actorId})`;
      await tx`insert into working_paper_version(id,tenant_id,working_paper_id,version,content,content_hash,created_by)
      values(${crypto.randomUUID()},${ctx.tenantId},${id},1,${canonicalJson(content)}::jsonb,${contentHash},${ctx.actorId})`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "WORKING_PAPER_CREATED",
        "WORKING_PAPER",
        id,
        {
          code,
          title,
          categoryCode,
          objective,
          reportLineId,
          version: 1,
          contentHash,
        },
      );
      return (await workingPaperItems(tx, ctx, engagementId, id))[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}
async function listWorkingPaperVersions(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  workingPaperId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const papers =
        await tx`select id from working_paper where id=${workingPaperId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      if (!papers.length)
        throw new ApiError(404, "NOT_FOUND", "Working paper not found");
      return json({
        items:
          await tx`select id,version,content,content_hash,created_by,created_at from working_paper_version where tenant_id=${ctx.tenantId} and working_paper_id=${workingPaperId} order by version desc`,
      });
    });
  } finally {
    await sql.end();
  }
}
async function createWorkingPaperVersion(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  workingPaperId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    content = requireObject(body.content),
    contentHash = await canonicalHash(content),
    sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WRITE_ROLES,
      );
      await lockEngagement(tx, ctx, engagementId);
      const rows =
        await tx`select * from working_paper where id=${workingPaperId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Working paper not found");
      if (rows[0]!.status === "SUPERSEDED")
        throw new ApiError(
          409,
          "WORKING_PAPER_LOCKED",
          "Superseded working papers cannot be changed",
        );
      const version = Number(rows[0]!.current_version) + 1;
      const inserted =
        await tx`insert into working_paper_version(id,tenant_id,working_paper_id,version,content,content_hash,created_by) values(${crypto.randomUUID()},${ctx.tenantId},${workingPaperId},${version},${canonicalJson(content)}::jsonb,${contentHash},${ctx.actorId}) returning id,version,content,content_hash,created_by,created_at`;
      await tx`update working_paper set current_version=${version},status='IN_PROGRESS',prepared_by=null,reviewed_by=null,updated_at=now() where id=${workingPaperId} and tenant_id=${ctx.tenantId}`;
      await invalidateDependentSignoffs(
        tx,
        ctx,
        engagementId,
        "WORKING_PAPER",
        workingPaperId,
        "Working paper content changed",
      );
      await appendEvents(
        tx,
        ctx,
        engagement,
        "WORKING_PAPER_VERSION_CREATED",
        "WORKING_PAPER",
        workingPaperId,
        { version, contentHash },
      );
      return inserted[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}
async function transitionWorkingPaper(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  workingPaperId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    next = enumValue(
      body,
      "status",
      WORKING_PAPER_STATUSES,
    ) as WorkingPaperStatus,
    reason = optionalString(body, "reason") ?? null,
    sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        next === "REVIEWED" ? REVIEW_ROLES : WRITE_ROLES,
      );
      await lockEngagement(tx, ctx, engagementId);
      const rows =
        await tx`select * from working_paper where id=${workingPaperId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Working paper not found");
      const current = String(rows[0]!.status) as WorkingPaperStatus;
      if(next==="PREPARED"||next==="REVIEWED"){
        const readiness=await workingPaperReadiness(tx,ctx,engagementId,rows[0]!);
        if(!readiness.ready)throw new ApiError(409,"WORKING_PAPER_NOT_READY",`Working paper is not ready: ${readiness.blocks.join(", ")}`);
      }
      assertWorkingPaperTransition(
        current,
        next,
        ctx.actorId,
        rows[0]!.prepared_by ? String(rows[0]!.prepared_by) : null,
      );
      await tx`update working_paper set status=${next},prepared_by=case when ${next}='PREPARED' then ${ctx.actorId} when ${next}='IN_PROGRESS' then null else prepared_by end,reviewed_by=case when ${next}='REVIEWED' then ${ctx.actorId} when ${next}='IN_PROGRESS' then null else reviewed_by end,updated_at=now() where id=${workingPaperId} and tenant_id=${ctx.tenantId}`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "WORKING_PAPER_STATUS_CHANGED",
        "WORKING_PAPER",
        workingPaperId,
        { from: current, to: next, reason },
      );
      return (
        await workingPaperItems(tx, ctx, engagementId, workingPaperId)
      )[0]!;
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

type WorkingPaperLibraryItem = {
  templateCode: string;
  templateVersion: number | null;
  customTemplateId: string | null;
  categoryCode: string;
  sequenceNo: number;
  code: string;
  title: string;
  objective: string;
  guidance: string;
  defaultContent: Record<string, postgres.JSONValue>;
  required: boolean;
  disposition: "INCLUDE" | "EXCLUDE";
  sourceScope: "STANDARD" | "PRACTICE" | "CLIENT";
  overrideReason: string | null;
  deployedWorkingPaperId: string | null;
  deployedApplicability: string | null;
  governanceStatus: "APPROVED" | "BASELINE" | "CUSTOM";
  provenanceLabel: string;
  controlledFallback: boolean;
  serviceFamily: "ACCOUNTS_PRODUCTION" | "CUSTOM";
  applicabilityLayer: "CORE" | "FRAMEWORK" | "SECTOR" | "ENTITY_FORM" | "CLIENT";
};
async function effectiveWorkingPaperLibrary(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  organisationId: string,
): Promise<WorkingPaperLibraryItem[]> {
  const profiles = await tx`select e.framework,e.sector_profile,e.period_start,e.period_end,o.legal_form
    from engagement e join organisation o on o.tenant_id=e.tenant_id and o.id=e.organisation_id
    where e.tenant_id=${ctx.tenantId} and e.id=${engagementId}`;
  if (!profiles.length)
    throw new ApiError(404, "NOT_FOUND", "Engagement not found");
  const profile = profiles[0]!,
    legalForm = String(profile.legal_form),
    framework = String(profile.framework),
    sector = profile.sector_profile ? String(profile.sector_profile) : null,
    periodStart = String(profile.period_start),
    periodEnd = String(profile.period_end);
  const [templates, tenantOverrides, organisationOverrides, customTemplates, deployed] =
    await Promise.all([
      tx`select distinct on(template_code) * from working_paper_template
        where status='ACTIVE' and service_family='ACCOUNTS_PRODUCTION' and (
          (governance_status='APPROVED' and effective_from<=${periodStart}::date and (effective_to is null or effective_to>=${periodEnd}::date))
          or (governance_status='BASELINE' and provenance_label='REPOSITORY_BASELINE_NOT_CERTIFIED')
        )
        order by template_code,
          case governance_status when 'APPROVED' then 0 else 1 end,
          version desc`,
      tx`select * from tenant_working_paper_override where tenant_id=${ctx.tenantId}`,
      tx`select * from organisation_working_paper_override where tenant_id=${ctx.tenantId} and organisation_id=${organisationId}`,
      tx`select * from custom_working_paper_template where tenant_id=${ctx.tenantId} and enabled and (organisation_id is null or organisation_id=${organisationId}) order by category_code,sequence_no,code`,
      tx`select id,template_code,template_version,template_scope,code,applicability from working_paper where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and status<>'SUPERSEDED'`,
    ]);
  const tenantByTemplate = new Map(
      tenantOverrides.map((row) => [
        `${row.template_code}:${row.template_version}`,
        row,
      ]),
    ),
    organisationByTemplate = new Map(
      organisationOverrides.map((row) => [
        `${row.template_code}:${row.template_version}`,
        row,
      ]),
    ),
    deployedByTemplate = new Map(
      deployed
        .filter((row) => row.template_code)
        .map((row) => [`${row.template_code}:${row.template_version}`, row]),
    ),
    deployedByCode = new Map(deployed.map((row) => [String(row.code), row]));
  const items: WorkingPaperLibraryItem[] = templates
    .filter((template) => workingPaperTemplateMatches(template,{legalForm,framework,sector}))
    .map((template) => {
    const key = `${template.template_code}:${template.version}`,
      practice = tenantByTemplate.get(key),
      client = organisationByTemplate.get(key),
      applied = client ?? practice,
      deployedPaper = deployedByTemplate.get(key);
    return {
      templateCode: String(template.template_code),
      templateVersion: Number(template.version),
      customTemplateId: null,
      categoryCode: String(template.category_code),
      sequenceNo: Number(template.sequence_no),
      code: String(applied?.code_override ?? template.template_code),
      title: String(applied?.title_override ?? template.title),
      objective: String(applied?.objective_override ?? template.objective),
      guidance: String(applied?.guidance_override ?? template.guidance),
      defaultContent: (applied?.default_content_override ??
        template.default_content) as Record<string, postgres.JSONValue>,
      required: Boolean(applied?.required_override ?? template.required_by_default),
      disposition: String(applied?.disposition ?? "INCLUDE") as "INCLUDE" | "EXCLUDE",
      sourceScope: client ? "CLIENT" : practice ? "PRACTICE" : "STANDARD",
      overrideReason: applied?.reason ? String(applied.reason) : null,
      deployedWorkingPaperId: deployedPaper ? String(deployedPaper.id) : null,
      deployedApplicability: deployedPaper
        ? String(deployedPaper.applicability)
        : null,
      governanceStatus: String(template.governance_status) as "APPROVED" | "BASELINE",
      provenanceLabel: String(template.provenance_label),
      controlledFallback: String(template.governance_status) === "BASELINE",
      serviceFamily: "ACCOUNTS_PRODUCTION",
      applicabilityLayer: String(template.applicability_layer) as WorkingPaperLibraryItem["applicabilityLayer"],
    };
  });
  for (const custom of customTemplates) {
    if (!workingPaperTemplateMatches(custom,{legalForm,framework,sector})) continue;
    const deployedPaper = deployedByCode.get(String(custom.code));
    items.push({
      templateCode: `CUSTOM:${custom.id}`,
      templateVersion: null,
      customTemplateId: String(custom.id),
      categoryCode: String(custom.category_code),
      sequenceNo: Number(custom.sequence_no),
      code: String(custom.code),
      title: String(custom.title),
      objective: String(custom.objective),
      guidance: String(custom.guidance),
      defaultContent: custom.default_content as Record<string, postgres.JSONValue>,
      required: Boolean(custom.required_by_default),
      disposition: "INCLUDE",
      sourceScope: custom.organisation_id ? "CLIENT" : "PRACTICE",
      overrideReason: null,
      deployedWorkingPaperId: deployedPaper ? String(deployedPaper.id) : null,
      deployedApplicability: deployedPaper
        ? String(deployedPaper.applicability)
        : null,
      governanceStatus: "CUSTOM",
      provenanceLabel: "TENANT_AUTHORED",
      controlledFallback: false,
      serviceFamily: "CUSTOM",
      applicabilityLayer: "CLIENT",
    });
  }
  return items.sort(
    (a, b) => a.sequenceNo - b.sequenceNo || a.code.localeCompare(b.code),
  );
}
async function listWorkingPaperLibrary(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        ["PARTNER", "MANAGER"],
      );
      return json({
        items: await effectiveWorkingPaperLibrary(
          tx,
          ctx,
          engagementId,
          engagement.organisationId,
        ),
      });
    });
  } finally {
    await sql.end();
  }
}
async function putWorkingPaperLibraryOverride(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  templateCode: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    scope = enumValue(body, "scope", ["PRACTICE", "CLIENT"] as const),
    templateVersion = Number(body.templateVersion),
    disposition = enumValue(body, "disposition", ["INCLUDE", "EXCLUDE"] as const),
    reason = boundedRequiredString(body, "reason", 1000),
    titleOverride = optionalString(body, "title") ?? null,
    objectiveOverride = optionalString(body, "objective") ?? null,
    guidanceOverride = optionalString(body, "guidance") ?? null,
    requiredOverride =
      typeof body.required === "boolean" ? body.required : null,
    sql = db(env);
  if (!Number.isInteger(templateVersion) || templateVersion < 1)
    throw new ApiError(400, "VALIDATION_ERROR", "templateVersion is invalid");
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        scope === "PRACTICE" ? [] : ["PARTNER", "MANAGER"],
      );
      if (scope === "PRACTICE") {
        const role = await tenantRole(tx, ctx);
        if (role !== "OWNER" && role !== "ADMIN")
          throw new ApiError(403, "FORBIDDEN", "Practice library changes require owner or administrator access");
      }
      const templates = await tx`select template_code,legal_forms,framework_codes,sector_codes from working_paper_template
        where template_code=${templateCode} and version=${templateVersion} and status='ACTIVE' and service_family='ACCOUNTS_PRODUCTION'`;
      if (!templates.length)
        throw new ApiError(404, "NOT_FOUND", "Working paper template not found");
      const profiles = await tx`select e.framework,e.sector_profile,o.legal_form
        from engagement e join organisation o on o.tenant_id=e.tenant_id and o.id=e.organisation_id
        where e.tenant_id=${ctx.tenantId} and e.id=${engagementId}`;
      const profile = profiles[0]!;
      if (!workingPaperTemplateMatches(templates[0]!, { legalForm:String(profile.legal_form), framework:String(profile.framework), sector:profile.sector_profile ? String(profile.sector_profile) : null }))
        throw new ApiError(409, "WORKING_PAPER_TEMPLATE_INCOMPATIBLE", "This working paper is not compatible with the engagement framework, sector and entity form");
      const rows =
        scope === "PRACTICE"
          ? await tx`insert into tenant_working_paper_override(id,tenant_id,template_code,template_version,disposition,title_override,objective_override,guidance_override,required_override,reason,created_by,updated_by)
              values(${crypto.randomUUID()},${ctx.tenantId},${templateCode},${templateVersion},${disposition},${titleOverride},${objectiveOverride},${guidanceOverride},${requiredOverride},${reason},${ctx.actorId},${ctx.actorId})
              on conflict(tenant_id,template_code,template_version) do update set disposition=excluded.disposition,title_override=excluded.title_override,objective_override=excluded.objective_override,guidance_override=excluded.guidance_override,required_override=excluded.required_override,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now() returning *`
          : await tx`insert into organisation_working_paper_override(id,tenant_id,organisation_id,template_code,template_version,disposition,title_override,objective_override,guidance_override,required_override,reason,created_by,updated_by)
              values(${crypto.randomUUID()},${ctx.tenantId},${engagement.organisationId},${templateCode},${templateVersion},${disposition},${titleOverride},${objectiveOverride},${guidanceOverride},${requiredOverride},${reason},${ctx.actorId},${ctx.actorId})
              on conflict(tenant_id,organisation_id,template_code,template_version) do update set disposition=excluded.disposition,title_override=excluded.title_override,objective_override=excluded.objective_override,guidance_override=excluded.guidance_override,required_override=excluded.required_override,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now() returning *`;
      await appendScopedEvents(
        tx,
        ctx,
        {
          organisationId: scope === "CLIENT" ? engagement.organisationId : null,
          engagementId: null,
        },
        "WORKING_PAPER_LIBRARY_OVERRIDDEN",
        "WORKING_PAPER_TEMPLATE",
        templateCode,
        { scope, templateVersion, disposition, reason },
      );
      return rows[0]!;
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}
async function createCustomWorkingPaperTemplate(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    scope = enumValue(body, "scope", ["PRACTICE", "CLIENT"] as const),
    code = boundedRequiredString(body, "code", 80).toUpperCase(),
    categoryCode = enumValue(body, "categoryCode", WORKING_PAPER_CATEGORIES),
    title = boundedRequiredString(body, "title", 255),
    objective = boundedRequiredString(body, "objective", 2000),
    guidance = optionalString(body, "guidance") ?? "",
    required = body.required === true,
    sql = db(env);
  if (!/^[A-Z][A-Z0-9_.-]{1,79}$/.test(code))
    throw new ApiError(400, "VALIDATION_ERROR", "code is invalid");
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(tx, ctx, engagementId, scope === "PRACTICE" ? [] : ["PARTNER","MANAGER"]);
      if (scope === "PRACTICE") {
        const role = await tenantRole(tx, ctx);
        if (role !== "OWNER" && role !== "ADMIN")
          throw new ApiError(403, "FORBIDDEN", "Practice library changes require owner or administrator access");
      }
      const organisationId = scope === "CLIENT" ? engagement.organisationId : null;
      const sequenceRows = await tx`select coalesce(max(sequence_no),0)+10 as next from custom_working_paper_template where tenant_id=${ctx.tenantId} and organisation_id is not distinct from ${organisationId}`;
      const rows = await tx`insert into custom_working_paper_template(id,tenant_id,organisation_id,code,category_code,sequence_no,title,objective,guidance,required_by_default,created_by,updated_by)
        values(${crypto.randomUUID()},${ctx.tenantId},${organisationId},${code},${categoryCode},${Number(sequenceRows[0]!.next)},${title},${objective},${guidance},${required},${ctx.actorId},${ctx.actorId}) returning *`;
      await appendScopedEvents(tx,ctx,{organisationId,engagementId:null},"WORKING_PAPER_CUSTOM_TEMPLATE_CREATED","WORKING_PAPER_TEMPLATE",String(rows[0]!.id),{scope,code,categoryCode,title});
      return rows[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}
async function deployWorkingPaperLibrary(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId), body = await jsonBody(request), sql = db(env);
  const requested = Array.isArray(body.templateCodes)
    ? new Set(body.templateCodes.map(String))
    : null;
  try {
    const result = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(tx,ctx,engagementId,["PARTNER","MANAGER"]);
      await lockEngagement(tx,ctx,engagementId);
      const library = await effectiveWorkingPaperLibrary(tx,ctx,engagementId,engagement.organisationId);
      if (requested) {
        const incompatible = incompatibleRequestedTemplateCodes(requested,library.filter((item) => item.disposition === "INCLUDE").map((item) => item.templateCode));
        if (incompatible.length)
          throw new ApiError(409,"WORKING_PAPER_TEMPLATE_INCOMPATIBLE",`Requested working papers are not in the applicable accounts-production set: ${incompatible.join(", ")}`);
      }
      let created = 0, skipped = 0, replaced = 0, controlledFallbacks = 0;
      for (const template of library) {
        if (template.disposition !== "INCLUDE" || template.deployedWorkingPaperId || (requested && !requested.has(template.templateCode))) { skipped++; continue; }
        const id = crypto.randomUUID(), contentHash = await canonicalHash(template.defaultContent);
        await tx`insert into working_paper(id,tenant_id,engagement_id,code,title,status,current_version,template_code,template_version,template_scope,category_code,objective)
          values(${id},${ctx.tenantId},${engagementId},${template.code},${template.title},'NOT_STARTED',1,${template.customTemplateId ? null : template.templateCode},${template.templateVersion},${template.sourceScope},${template.categoryCode},${template.objective})`;
        await tx`insert into working_paper_version(id,tenant_id,working_paper_id,version,content,content_hash,created_by)
          values(${crypto.randomUUID()},${ctx.tenantId},${id},1,${tx.json(template.defaultContent)},${contentHash},${ctx.actorId})`;
        if (!template.customTemplateId)
          await tx`insert into working_paper_theme_link(id,tenant_id,engagement_id,working_paper_id,theme_code,is_primary,created_by)
            select gen_random_uuid(),${ctx.tenantId},${engagementId},${id},theme_code,is_primary,${ctx.actorId}
            from working_paper_template_theme where template_code=${template.templateCode} and template_version=${template.templateVersion}`;
        if (!template.customTemplateId) {
          const superseded = await tx`update working_paper
            set status='SUPERSEDED',updated_at=now()
            where tenant_id=${ctx.tenantId} and engagement_id=${engagementId}
              and template_code=${template.templateCode}
              and template_version<>${template.templateVersion}
              and status<>'SUPERSEDED'
            returning id,template_version`;
          replaced += superseded.length;
          for (const previous of superseded)
            await appendEvents(tx,ctx,engagement,"WORKING_PAPER_TEMPLATE_SUPERSEDED","WORKING_PAPER",String(previous.id),{
              reason:"CONTROLLED_TEMPLATE_REPLACEMENT",
              templateCode:template.templateCode,
              previousVersion:Number(previous.template_version),
              replacementVersion:template.templateVersion,
              replacementWorkingPaperId:id,
            });
        }
        if (template.controlledFallback) controlledFallbacks++;
        created++;
      }
      await appendEvents(tx,ctx,engagement,"WORKING_PAPER_LIBRARY_DEPLOYED","ENGAGEMENT",engagementId,{created,skipped,replaced,controlledFallbacks,requested:requested ? requested.size : null,serviceFamily:"ACCOUNTS_PRODUCTION"});
      return { created, skipped, replaced, controlledFallbacks, items: await workingPaperItems(tx,ctx,engagementId) };
    });
    return json(result, result.created ? 201 : 200);
  } finally { await sql.end(); }
}
async function setWorkingPaperApplicability(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  workingPaperId: string,
): Promise<Response> {
  const ctx=context(request,actorId),body=await jsonBody(request),applicability=enumValue(body,"applicability",["APPLICABLE","NOT_APPLICABLE"] as const),reason=applicability==="NOT_APPLICABLE"?boundedRequiredString(body,"reason",1000):null,sql=db(env);
  try {
    const item=await withTenantTransaction(sql,ctx,async(tx)=>{
      const engagement=await engagementAccess(tx,ctx,engagementId,WRITE_ROLES);
      const rows=await tx`select * from working_paper where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and id=${workingPaperId} for update`;
      if(!rows.length) throw new ApiError(404,"NOT_FOUND","Working paper not found");
      if(rows[0]!.template_scope==="ENGAGEMENT") throw new ApiError(409,"WORKING_PAPER_NOT_STANDARD","Only deployed library papers can be marked not applicable");
      await tx`update working_paper set applicability=${applicability},not_applicable_reason=${reason},not_applicable_by=${applicability==="NOT_APPLICABLE"?ctx.actorId:null},not_applicable_at=${applicability==="NOT_APPLICABLE"?new Date().toISOString():null},updated_at=now() where tenant_id=${ctx.tenantId} and id=${workingPaperId}`;
      await appendEvents(tx,ctx,engagement,"WORKING_PAPER_APPLICABILITY_CHANGED","WORKING_PAPER",workingPaperId,{applicability,reason});
      return (await workingPaperItems(tx,ctx,engagementId,workingPaperId))[0]!;
    });
    return json({item});
  } finally { await sql.end(); }
}

function wpRiskItem(row: Record<string, unknown>) {
  return { id:String(row.id),riskCode:String(row.risk_code),title:String(row.title),description:String(row.description),riskLevel:String(row.risk_level),response:String(row.response),status:String(row.status),createdAt:String(row.created_at),updatedAt:String(row.updated_at) };
}
function wpAttachmentItem(engagementId:string,workingPaperId:string,row:Record<string,unknown>) {
  const id=String(row.id);
  return { id,workingPaperId,workingPaperVersion:Number(row.working_paper_version),filename:String(row.filename),mediaType:String(row.media_type),byteSize:Number(row.byte_size),contentHash:String(row.content_hash),evidenceType:String(row.evidence_type),description:String(row.description),uploadedAt:String(row.uploaded_at),contentPath:`/v1/engagements/${encodeURIComponent(engagementId)}/working-papers/${encodeURIComponent(workingPaperId)}/attachments/${encodeURIComponent(id)}/content` };
}
function wpOptionalBounded(body:Record<string,unknown>,field:string,maximum:number):string|null {
  const raw=body[field];
  if(raw===undefined||raw===null||raw==="") return null;
  if(typeof raw!=="string") throw new ApiError(400,"INVALID_REQUEST",`${field} must be a string`);
  const value=raw.trim();
  if(value.length>maximum||/[\u0000-\u001f\u007f]/.test(value)) throw new ApiError(400,"INVALID_REQUEST",`${field} must be at most ${maximum} characters without control characters`);
  return value;
}
function wpDatabaseCode(error:unknown):string|null {
  return typeof error==="object"&&error!==null&&"code" in error?String((error as {code?:unknown}).code??""):null;
}
async function requireWorkingPaper(tx:Transaction,ctx:RequestContext,engagementId:string,workingPaperId:string,lock=false) {
  const rows=lock
    ?await tx`select * from working_paper where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and id=${workingPaperId} for update`
    :await tx`select * from working_paper where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and id=${workingPaperId}`;
  if(!rows.length) throw new ApiError(404,"NOT_FOUND","Working paper not found");
  return rows[0]!;
}
async function workingPaperReadiness(tx:Transaction,ctx:RequestContext,engagementId:string,paper:Record<string,unknown>){
  const versions=await tx`select content from working_paper_version where tenant_id=${ctx.tenantId} and working_paper_id=${String(paper.id)} and version=${Number(paper.current_version)}`;
  const content=(versions[0]?.content??{}) as Record<string,unknown>,requirements=(typeof content.governanceRequirements==="object"&&content.governanceRequirements!==null&&!Array.isArray(content.governanceRequirements)?content.governanceRequirements:{}) as Record<string,unknown>,templateCode=paper.template_code?String(paper.template_code):null,templateVersion=paper.template_version===null||paper.template_version===undefined?null:Number(paper.template_version);
  const counts=(await tx`select
    (select count(*)::int from working_paper_report_line_link link where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and working_paper_id=${String(paper.id)} and not exists(select 1 from working_paper_report_line_link successor where successor.tenant_id=link.tenant_id and successor.supersedes_link_id=link.id)) report_lines,
    (select count(*)::int from working_paper_assertion_link link where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and working_paper_id=${String(paper.id)} and not exists(select 1 from working_paper_assertion_link successor where successor.tenant_id=link.tenant_id and successor.supersedes_link_id=link.id)) assertions,
    (select count(*)::int from working_paper_risk_link link where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and working_paper_id=${String(paper.id)} and not exists(select 1 from working_paper_risk_link successor where successor.tenant_id=link.tenant_id and successor.supersedes_link_id=link.id)) risks,
    (select count(*)::int from working_paper_theme_link link where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and working_paper_id=${String(paper.id)} and not exists(select 1 from working_paper_theme_link successor where successor.tenant_id=link.tenant_id and successor.supersedes_link_id=link.id)) themes,
    (select count(*)::int from working_paper_attachment where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and working_paper_id=${String(paper.id)} and working_paper_version=${Number(paper.current_version)}) evidence,
    (select count(*)::int from working_paper_template_theme where template_code=${templateCode} and template_version=${templateVersion}) configured_themes`)[0]!;
  const configured={reportLineRequired:requirements.reportLineRequired===true,assertionRequired:requirements.assertionRequired===true,riskRequired:requirements.riskRequired===true,themeRequired:requirements.themeRequired===true||Number(counts.configured_themes)>0,evidenceRequired:requirements.evidenceRequired===true},blocks=workingPaperReadinessBlocks({applicability:String(paper.applicability),objective:paper.objective?String(paper.objective):null,narrative:content.narrative,requirements:configured,counts:{reportLines:Number(counts.report_lines),assertions:Number(counts.assertions),risks:Number(counts.risks),themes:Number(counts.themes),evidence:Number(counts.evidence)}});
  return{ready:blocks.length===0,blocks,requirements:configured};
}
async function workingPaperReportingScope(tx:Transaction,ctx:RequestContext,engagementId:string){
  const pinned=await tx`select p.id,p.pack_code,p.version_no,p.title from accounts_version av join reporting_framework_pack p on p.pack_code=av.framework_pack_id and p.version_no=av.framework_pack_version_no where av.tenant_id=${ctx.tenantId} and av.engagement_id=${engagementId} and av.status<>'SUPERSEDED' order by av.version desc limit 1`;
  const packs=pinned.length?pinned:await tx`select p.id,p.pack_code,p.version_no,p.title from engagement e join reporting_framework_pack p on p.framework_code=e.framework and p.sector_code=coalesce(e.sector_profile,'NONE') and p.lifecycle_status<>'RETIRED' and p.effective_from<=e.period_start and (p.effective_to is null or p.effective_to>=e.period_end) where e.tenant_id=${ctx.tenantId} and e.id=${engagementId} order by p.version_no desc,p.pack_code limit 1`;
  if(!packs.length)return{pack:null,taxonomyVersion:null,lines:[],reason:"REPORTING_PACK_UNAVAILABLE" as const};
  const pack=packs[0]!,lines=await tx`select distinct r.id,r.taxonomy_version,r.line_code,r.caption,r.statement_code,r.display_order from statement_definition s join statement_definition_line l on l.statement_definition_id=s.id cross join lateral unnest(l.canonical_codes) code join canonical_account a on a.canonical_code=code join canonical_report_line r on r.id=a.report_line_id and r.taxonomy_version=a.taxonomy_version where s.framework_pack_id=${pack.id} order by r.taxonomy_version,r.statement_code,r.display_order,r.line_code`,versions=new Set(lines.map(r=>String(r.taxonomy_version)));
  if(versions.size!==1)return{pack,taxonomyVersion:null,lines:[],reason:versions.size?"REPORTING_TAXONOMY_AMBIGUOUS" as const:"REPORTING_LINES_UNAVAILABLE" as const};
  return{pack,taxonomyVersion:[...versions][0]!,lines,reason:null};
}
async function workingPaperGovernanceCatalogue(request:Request,env:Env,actorId:string,engagementId:string):Promise<Response> {
  const ctx=context(request,actorId),sql=db(env);
  try{return await withTenantTransaction(sql,ctx,async(tx)=>{
    await engagementAccess(tx,ctx,engagementId);
    const [areas,themes,templateThemes,reportingScope]=await Promise.all([
      tx`select work_area_code,title,sequence_no,status,provenance_label from working_paper_work_area where status='ACTIVE' order by sequence_no,work_area_code`,
      tx`select theme_code,title,description,status,provenance_label from working_paper_theme where status='ACTIVE' order by title,theme_code`,
      tx`select template_code,template_version,theme_code,is_primary from working_paper_template_theme order by template_code,template_version,theme_code`,
      workingPaperReportingScope(tx,ctx,engagementId)
    ]);
    return json({item:{
      workAreas:areas.map(r=>({code:String(r.work_area_code),title:String(r.title),sequenceNo:Number(r.sequence_no),status:String(r.status),provenanceLabel:String(r.provenance_label)})),
      themes:themes.map(r=>({code:String(r.theme_code),title:String(r.title),description:String(r.description),status:String(r.status),provenanceLabel:String(r.provenance_label)})),
      templateThemes:templateThemes.map(r=>({templateCode:String(r.template_code),templateVersion:Number(r.template_version),themeCode:String(r.theme_code),isPrimary:Boolean(r.is_primary)})),
      assertions:[...WORKING_PAPER_ASSERTIONS],
      reportingScope:{available:reportingScope.reason===null,reason:reportingScope.reason,pack:reportingScope.pack?{packCode:String(reportingScope.pack.pack_code),versionNo:Number(reportingScope.pack.version_no),title:String(reportingScope.pack.title)}:null,taxonomyVersion:reportingScope.taxonomyVersion},
      reportLines:reportingScope.lines.map(r=>({id:String(r.id),taxonomyVersion:String(r.taxonomy_version),lineCode:String(r.line_code),caption:String(r.caption),statementCode:String(r.statement_code),displayOrder:Number(r.display_order)})),
      evidence:{uploadAvailable:true,maxBytes:MAX_WORKING_PAPER_EVIDENCE_BYTES,mediaTypes:[...WORKING_PAPER_EVIDENCE_MEDIA_TYPES],evidenceTypes:[...WORKING_PAPER_EVIDENCE_TYPES]}
    }});
  });}finally{await sql.end();}
}
async function listWorkingPaperRisks(request:Request,env:Env,actorId:string,engagementId:string):Promise<Response>{
  const ctx=context(request,actorId),sql=db(env);
  try{return await withTenantTransaction(sql,ctx,async(tx)=>{await engagementAccess(tx,ctx,engagementId);const rows=await tx`select * from engagement_risk where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} order by case risk_level when 'SIGNIFICANT' then 1 when 'HIGH' then 2 when 'MEDIUM' then 3 else 4 end,risk_code,id`;return json({items:rows.map(wpRiskItem)});});}finally{await sql.end();}
}
async function createWorkingPaperRisk(request:Request,env:Env,actorId:string,engagementId:string):Promise<Response>{
  const ctx=context(request,actorId),body=await jsonBody(request),sql=db(env),id=crypto.randomUUID(),riskCode=boundedRequiredString(body,"riskCode",80).toUpperCase(),title=boundedRequiredString(body,"title",255),description=wpOptionalBounded(body,"description",4000)??"",riskLevel=enumValue(body,"riskLevel",["LOW","MEDIUM","HIGH","SIGNIFICANT"] as const),response=wpOptionalBounded(body,"response",4000)??"",status=body.status===undefined?"OPEN":enumValue(body,"status",["OPEN","MITIGATED","ACCEPTED","CLOSED"] as const);
  if(!/^[A-Z][A-Z0-9_.-]{1,79}$/.test(riskCode))throw new ApiError(400,"INVALID_REQUEST","riskCode is invalid");
  try{const row=await withTenantTransaction(sql,ctx,async(tx)=>{const engagement=await engagementAccess(tx,ctx,engagementId,WRITE_ROLES);const rows=await tx`insert into engagement_risk(id,tenant_id,engagement_id,risk_code,title,description,risk_level,response,status,created_by,updated_by) values(${id},${ctx.tenantId},${engagementId},${riskCode},${title},${description},${riskLevel},${response},${status},${ctx.actorId},${ctx.actorId}) returning *`;await appendEvents(tx,ctx,engagement,"ENGAGEMENT_RISK_CREATED","ENGAGEMENT_RISK",id,{riskCode,riskLevel,status});return rows[0]!;});return json({item:wpRiskItem(row)},201);}finally{await sql.end();}
}
async function patchWorkingPaperRisk(request:Request,env:Env,actorId:string,engagementId:string,riskId:string):Promise<Response>{
  const ctx=context(request,actorId),body=await jsonBody(request),sql=db(env),changes:Record<string,string>={};
  if(body.title!==undefined)changes.title=boundedRequiredString(body,"title",255);if(body.description!==undefined)changes.description=wpOptionalBounded(body,"description",4000)??"";if(body.riskLevel!==undefined)changes.risk_level=enumValue(body,"riskLevel",["LOW","MEDIUM","HIGH","SIGNIFICANT"] as const);if(body.response!==undefined)changes.response=wpOptionalBounded(body,"response",4000)??"";if(body.status!==undefined)changes.status=enumValue(body,"status",["OPEN","MITIGATED","ACCEPTED","CLOSED"] as const);
  if(!Object.keys(changes).length)throw new ApiError(400,"INVALID_REQUEST","At least one mutable risk field is required");
  try{const row=await withTenantTransaction(sql,ctx,async(tx)=>{const engagement=await engagementAccess(tx,ctx,engagementId,WRITE_ROLES);const rows=await tx`update engagement_risk set ${tx(changes,...Object.keys(changes))},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and id=${riskId} returning *`;if(!rows.length)throw new ApiError(404,"NOT_FOUND","Risk not found");await appendEvents(tx,ctx,engagement,"ENGAGEMENT_RISK_UPDATED","ENGAGEMENT_RISK",riskId,{changedFields:Object.keys(body)});return rows[0]!;});return json({item:wpRiskItem(row)});}finally{await sql.end();}
}
async function getWorkingPaperGovernance(request:Request,env:Env,actorId:string,engagementId:string,workingPaperId:string):Promise<Response>{
  const ctx=context(request,actorId),sql=db(env);
  try{return await withTenantTransaction(sql,ctx,async(tx)=>{await engagementAccess(tx,ctx,engagementId);const paper=await requireWorkingPaper(tx,ctx,engagementId,workingPaperId);const [lines,assertions,risks,themes,attachments]=await Promise.all([
    tx`select l.id,l.report_line_id,l.link_purpose,l.created_at,r.line_code,r.caption,r.statement_code from working_paper_report_line_link l join canonical_report_line r on r.id=l.report_line_id where l.tenant_id=${ctx.tenantId} and l.engagement_id=${engagementId} and l.working_paper_id=${workingPaperId} and not exists(select 1 from working_paper_report_line_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) order by case l.link_purpose when 'PRIMARY' then 1 when 'SUPPORTING' then 2 else 3 end,r.display_order,l.id`,
    tx`select l.id,l.assertion_code,l.created_at from working_paper_assertion_link l where l.tenant_id=${ctx.tenantId} and l.engagement_id=${engagementId} and l.working_paper_id=${workingPaperId} and not exists(select 1 from working_paper_assertion_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) order by l.assertion_code,l.id`,
    tx`select l.id,l.risk_id,l.created_at,r.risk_code,r.title,r.risk_level,r.status from working_paper_risk_link l join engagement_risk r on r.tenant_id=l.tenant_id and r.engagement_id=l.engagement_id and r.id=l.risk_id where l.tenant_id=${ctx.tenantId} and l.engagement_id=${engagementId} and l.working_paper_id=${workingPaperId} and not exists(select 1 from working_paper_risk_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) order by r.risk_code,l.id`,
    tx`select l.id,l.theme_code,l.is_primary,l.created_at,t.title from working_paper_theme_link l join working_paper_theme t on t.theme_code=l.theme_code where l.tenant_id=${ctx.tenantId} and l.engagement_id=${engagementId} and l.working_paper_id=${workingPaperId} and not exists(select 1 from working_paper_theme_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) order by l.is_primary desc,t.title,l.id`,
    tx`select * from working_paper_attachment where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and working_paper_id=${workingPaperId} order by working_paper_version desc,uploaded_at desc,id`
  ]),readiness=await workingPaperReadiness(tx,ctx,engagementId,paper);return json({item:{workingPaper:{id:String(paper.id),code:String(paper.code),title:String(paper.title),categoryCode:String(paper.category_code),objective:paper.objective?String(paper.objective):null,status:String(paper.status),currentVersion:Number(paper.current_version),templateCode:paper.template_code?String(paper.template_code):null,templateVersion:paper.template_version===null?null:Number(paper.template_version),templateScope:String(paper.template_scope),applicability:String(paper.applicability)},readiness,reportLines:lines.map(r=>({id:String(r.id),reportLineId:String(r.report_line_id),lineCode:String(r.line_code),caption:String(r.caption),statementCode:String(r.statement_code),linkPurpose:String(r.link_purpose),createdAt:String(r.created_at)})),assertions:assertions.map(r=>({id:String(r.id),assertionCode:String(r.assertion_code),createdAt:String(r.created_at)})),risks:risks.map(r=>({id:String(r.id),riskId:String(r.risk_id),riskCode:String(r.risk_code),title:String(r.title),riskLevel:String(r.risk_level),status:String(r.status),createdAt:String(r.created_at)})),themes:themes.map(r=>({id:String(r.id),themeCode:String(r.theme_code),title:String(r.title),isPrimary:Boolean(r.is_primary),createdAt:String(r.created_at)})),attachments:attachments.map(r=>wpAttachmentItem(engagementId,workingPaperId,r))}});});}finally{await sql.end();}
}
type WpLinkKind="report-line"|"assertion"|"risk"|"theme";
async function putWorkingPaperGovernanceLink(request:Request,env:Env,actorId:string,engagementId:string,workingPaperId:string,kind:WpLinkKind,value:string):Promise<Response>{
  const ctx=context(request,actorId),body=(kind==="report-line"||kind==="theme")?await jsonBody(request):{},sql=db(env),id=crypto.randomUUID();
  try{const result=await withTenantTransaction(sql,ctx,async(tx)=>{const engagement=await engagementAccess(tx,ctx,engagementId,WRITE_ROLES);await requireWorkingPaper(tx,ctx,engagementId,workingPaperId,true);let rows:Record<string,unknown>[]=[],existing:Record<string,unknown>[]=[],eventType="",metadata:JsonMetadata={};
    if(kind==="report-line"){const purpose=enumValue(body,"linkPurpose",["PRIMARY","SUPPORTING","DISCLOSURE"] as const),scope=await workingPaperReportingScope(tx,ctx,engagementId);if(scope.reason)throw new ApiError(409,scope.reason,"The engagement does not have one unambiguous applicable reporting pack and taxonomy");if(!scope.lines.some(line=>String(line.id)===value))throw new ApiError(400,"IMPERMISSIBLE_REPORT_LINE","reportLineId is not permitted by the engagement reporting pack and taxonomy");existing=await tx`select l.*,not exists(select 1 from working_paper_report_line_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) as is_current from working_paper_report_line_link l where l.tenant_id=${ctx.tenantId} and l.working_paper_id=${workingPaperId} and l.report_line_id=${value}`;if(existing.length&&!Boolean(existing[0]!.is_current))throw new ApiError(409,"LINK_TARGET_PREVIOUSLY_USED","The report line was previously linked and superseded");if(existing.length&&String(existing[0]!.link_purpose)!==purpose)throw new ApiError(409,"IMMUTABLE_LINK_CONFLICT","The report line is already linked with a different purpose");if(!existing.length)rows=await tx`insert into working_paper_report_line_link(id,tenant_id,engagement_id,working_paper_id,report_line_id,link_purpose,created_by) values(${id},${ctx.tenantId},${engagementId},${workingPaperId},${value},${purpose},${ctx.actorId}) returning *`;eventType="WORKING_PAPER_REPORT_LINE_LINKED";metadata={reportLineId:value,linkPurpose:purpose,packCode:String(scope.pack!.pack_code),packVersion:Number(scope.pack!.version_no),taxonomyVersion:scope.taxonomyVersion};}
    else if(kind==="assertion"){if(!WORKING_PAPER_ASSERTIONS.includes(value as (typeof WORKING_PAPER_ASSERTIONS)[number]))throw new ApiError(400,"INVALID_ASSERTION","assertionCode is invalid");existing=await tx`select l.*,not exists(select 1 from working_paper_assertion_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) as is_current from working_paper_assertion_link l where l.tenant_id=${ctx.tenantId} and l.working_paper_id=${workingPaperId} and l.assertion_code=${value}`;if(existing.length&&!Boolean(existing[0]!.is_current))throw new ApiError(409,"LINK_TARGET_PREVIOUSLY_USED","The assertion was previously linked and superseded");if(!existing.length)rows=await tx`insert into working_paper_assertion_link(id,tenant_id,engagement_id,working_paper_id,assertion_code,created_by) values(${id},${ctx.tenantId},${engagementId},${workingPaperId},${value},${ctx.actorId}) returning *`;eventType="WORKING_PAPER_ASSERTION_LINKED";metadata={assertionCode:value};}
    else if(kind==="risk"){if(!(await tx`select id from engagement_risk where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and id=${value}`).length)throw new ApiError(400,"INVALID_RISK","riskId is invalid");existing=await tx`select l.*,not exists(select 1 from working_paper_risk_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) as is_current from working_paper_risk_link l where l.tenant_id=${ctx.tenantId} and l.working_paper_id=${workingPaperId} and l.risk_id=${value}`;if(existing.length&&!Boolean(existing[0]!.is_current))throw new ApiError(409,"LINK_TARGET_PREVIOUSLY_USED","The risk was previously linked and superseded");if(!existing.length)rows=await tx`insert into working_paper_risk_link(id,tenant_id,engagement_id,working_paper_id,risk_id,created_by) values(${id},${ctx.tenantId},${engagementId},${workingPaperId},${value},${ctx.actorId}) returning *`;eventType="WORKING_PAPER_RISK_LINKED";metadata={riskId:value};}
    else{const isPrimary=body.isPrimary===true;if(!(await tx`select theme_code from working_paper_theme where theme_code=${value} and status='ACTIVE'`).length)throw new ApiError(400,"INVALID_THEME","themeCode is invalid or retired");existing=await tx`select l.*,not exists(select 1 from working_paper_theme_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) as is_current from working_paper_theme_link l where l.tenant_id=${ctx.tenantId} and l.working_paper_id=${workingPaperId} and l.theme_code=${value}`;if(existing.length&&!Boolean(existing[0]!.is_current))throw new ApiError(409,"LINK_TARGET_PREVIOUSLY_USED","The theme was previously linked and superseded");if(existing.length&&Boolean(existing[0]!.is_primary)!==isPrimary)throw new ApiError(409,"IMMUTABLE_LINK_CONFLICT","The theme is already linked with a different primary setting");if(!existing.length)rows=await tx`insert into working_paper_theme_link(id,tenant_id,engagement_id,working_paper_id,theme_code,is_primary,created_by) values(${id},${ctx.tenantId},${engagementId},${workingPaperId},${value},${isPrimary},${ctx.actorId}) returning *`;eventType="WORKING_PAPER_THEME_LINKED";metadata={themeCode:value,isPrimary};}
    const created=rows.length>0,row=(rows[0]??existing[0])!;if(created)await appendEvents(tx,ctx,engagement,eventType,"WORKING_PAPER",workingPaperId,metadata);return{created,row};});
    const row=result.row,item=kind==="report-line"?{id:String(row.id),reportLineId:String(row.report_line_id),linkPurpose:String(row.link_purpose),createdAt:String(row.created_at)}:kind==="assertion"?{id:String(row.id),assertionCode:String(row.assertion_code),createdAt:String(row.created_at)}:kind==="risk"?{id:String(row.id),riskId:String(row.risk_id),createdAt:String(row.created_at)}:{id:String(row.id),themeCode:String(row.theme_code),isPrimary:Boolean(row.is_primary),createdAt:String(row.created_at)};
    return json({created:result.created,item},result.created?201:200);
  }catch(error){if(wpDatabaseCode(error)==="23505"&&(kind==="report-line"||kind==="theme"))throw new ApiError(409,"PRIMARY_LINK_EXISTS",`This working paper already has a primary ${kind==="theme"?"theme":"report line"}`);throw error;}finally{await sql.end();}
}
async function replaceWorkingPaperGovernanceLink(request:Request,env:Env,actorId:string,engagementId:string,workingPaperId:string,kind:WpLinkKind,linkId:string):Promise<Response>{
  const ctx=context(request,actorId),body=await jsonBody(request),reason=boundedRequiredString(body,"reason",1000),sql=db(env),replacementId=crypto.randomUUID();
  try{const result=await withTenantTransaction(sql,ctx,async(tx)=>{const engagement=await engagementAccess(tx,ctx,engagementId,WRITE_ROLES);await requireWorkingPaper(tx,ctx,engagementId,workingPaperId,true);let old:Record<string,unknown>|undefined,newRows:Record<string,unknown>[]=[],eventType="",metadata:JsonMetadata={supersededLinkId:linkId,replacementLinkId:replacementId,reason};
    if(kind==="report-line"){const reportLineId=boundedRequiredString(body,"reportLineId",80),scope=await workingPaperReportingScope(tx,ctx,engagementId);if(scope.reason)throw new ApiError(409,scope.reason,"The engagement does not have one unambiguous applicable reporting pack and taxonomy");if(!scope.lines.some(line=>String(line.id)===reportLineId))throw new ApiError(400,"IMPERMISSIBLE_REPORT_LINE","reportLineId is not permitted by the engagement reporting pack and taxonomy");old=(await tx`select l.* from working_paper_report_line_link l where l.tenant_id=${ctx.tenantId} and l.working_paper_id=${workingPaperId} and l.id=${linkId} and not exists(select 1 from working_paper_report_line_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) for update`)[0];if((await tx`select 1 from working_paper_report_line_link where tenant_id=${ctx.tenantId} and working_paper_id=${workingPaperId} and report_line_id=${reportLineId}`).length)throw new ApiError(409,"LINK_TARGET_PREVIOUSLY_USED","The replacement report line was already linked to this paper");const linkPurpose=old?String(old.link_purpose):"";if(old)newRows=await tx`insert into working_paper_report_line_link(id,tenant_id,engagement_id,working_paper_id,report_line_id,link_purpose,supersedes_link_id,supersession_reason,created_by) values(${replacementId},${ctx.tenantId},${engagementId},${workingPaperId},${reportLineId},${linkPurpose},${linkId},${reason},${ctx.actorId}) returning *`;eventType="WORKING_PAPER_REPORT_LINE_REPLACED";metadata={...metadata,reportLineId,linkPurpose,packCode:String(scope.pack!.pack_code),packVersion:Number(scope.pack!.version_no),taxonomyVersion:scope.taxonomyVersion};}
    else if(kind==="assertion"){const assertionCode=enumValue(body,"assertionCode",WORKING_PAPER_ASSERTIONS);old=(await tx`select l.* from working_paper_assertion_link l where l.tenant_id=${ctx.tenantId} and l.working_paper_id=${workingPaperId} and l.id=${linkId} and not exists(select 1 from working_paper_assertion_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) for update`)[0];if((await tx`select 1 from working_paper_assertion_link where tenant_id=${ctx.tenantId} and working_paper_id=${workingPaperId} and assertion_code=${assertionCode}`).length)throw new ApiError(409,"LINK_TARGET_PREVIOUSLY_USED","The replacement assertion was already linked to this paper");if(old)newRows=await tx`insert into working_paper_assertion_link(id,tenant_id,engagement_id,working_paper_id,assertion_code,supersedes_link_id,supersession_reason,created_by) values(${replacementId},${ctx.tenantId},${engagementId},${workingPaperId},${assertionCode},${linkId},${reason},${ctx.actorId}) returning *`;eventType="WORKING_PAPER_ASSERTION_REPLACED";metadata={...metadata,assertionCode};}
    else if(kind==="risk"){const riskId=boundedRequiredString(body,"riskId",80);if(!(await tx`select id from engagement_risk where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and id=${riskId}`).length)throw new ApiError(400,"INVALID_RISK","riskId is invalid");old=(await tx`select l.* from working_paper_risk_link l where l.tenant_id=${ctx.tenantId} and l.working_paper_id=${workingPaperId} and l.id=${linkId} and not exists(select 1 from working_paper_risk_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) for update`)[0];if((await tx`select 1 from working_paper_risk_link where tenant_id=${ctx.tenantId} and working_paper_id=${workingPaperId} and risk_id=${riskId}`).length)throw new ApiError(409,"LINK_TARGET_PREVIOUSLY_USED","The replacement risk was already linked to this paper");if(old)newRows=await tx`insert into working_paper_risk_link(id,tenant_id,engagement_id,working_paper_id,risk_id,supersedes_link_id,supersession_reason,created_by) values(${replacementId},${ctx.tenantId},${engagementId},${workingPaperId},${riskId},${linkId},${reason},${ctx.actorId}) returning *`;eventType="WORKING_PAPER_RISK_REPLACED";metadata={...metadata,riskId};}
    else{const themeCode=boundedRequiredString(body,"themeCode",80);if(!(await tx`select theme_code from working_paper_theme where theme_code=${themeCode} and status='ACTIVE'`).length)throw new ApiError(400,"INVALID_THEME","themeCode is invalid or retired");old=(await tx`select l.* from working_paper_theme_link l where l.tenant_id=${ctx.tenantId} and l.working_paper_id=${workingPaperId} and l.id=${linkId} and not exists(select 1 from working_paper_theme_link successor where successor.tenant_id=l.tenant_id and successor.supersedes_link_id=l.id) for update`)[0];if((await tx`select 1 from working_paper_theme_link where tenant_id=${ctx.tenantId} and working_paper_id=${workingPaperId} and theme_code=${themeCode}`).length)throw new ApiError(409,"LINK_TARGET_PREVIOUSLY_USED","The replacement theme was already linked to this paper");const isPrimary=old?Boolean(old.is_primary):false;if(old)newRows=await tx`insert into working_paper_theme_link(id,tenant_id,engagement_id,working_paper_id,theme_code,is_primary,supersedes_link_id,supersession_reason,created_by) values(${replacementId},${ctx.tenantId},${engagementId},${workingPaperId},${themeCode},${isPrimary},${linkId},${reason},${ctx.actorId}) returning *`;eventType="WORKING_PAPER_THEME_REPLACED";metadata={...metadata,themeCode,isPrimary};}
    if(!old)throw new ApiError(404,"CURRENT_LINK_NOT_FOUND","Current governance link not found");await appendEvents(tx,ctx,engagement,eventType,"WORKING_PAPER",workingPaperId,metadata);return newRows[0]!;});const item=kind==="report-line"?{id:String(result.id),reportLineId:String(result.report_line_id),linkPurpose:String(result.link_purpose),createdAt:String(result.created_at)}:kind==="assertion"?{id:String(result.id),assertionCode:String(result.assertion_code),createdAt:String(result.created_at)}:kind==="risk"?{id:String(result.id),riskId:String(result.risk_id),createdAt:String(result.created_at)}:{id:String(result.id),themeCode:String(result.theme_code),isPrimary:Boolean(result.is_primary),createdAt:String(result.created_at)};return json({item,supersededLinkId:linkId,reason},201);
  }catch(error){if(wpDatabaseCode(error)==="23505")throw new ApiError(409,"LINK_REPLACEMENT_CONFLICT","The replacement would violate current-link governance");throw error;}finally{await sql.end();}
}
async function parseWorkingPaperAttachment(request:Request){
  const contentType=request.headers.get("content-type")??"";if(!contentType.toLowerCase().startsWith("multipart/form-data;"))throw new ApiError(415,"UNSUPPORTED_MEDIA_TYPE","multipart/form-data is required");let form:FormData;try{form=await new Response(await readBodyBounded(request,MAX_WORKING_PAPER_MULTIPART_BYTES,"Working paper evidence upload"),{headers:{"content-type":contentType}}).formData();}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,"INVALID_MULTIPART","The multipart request could not be parsed");}
  const files=form.getAll("file");if(files.length!==1||!(files[0] instanceof File))throw new ApiError(400,"FILE_REQUIRED","Exactly one evidence file is required");const file=files[0],bytes=await file.arrayBuffer(),mediaType=file.type.toLowerCase();if(!bytes.byteLength||bytes.byteLength>MAX_WORKING_PAPER_EVIDENCE_BYTES)throw new ApiError(413,"PAYLOAD_TOO_LARGE","Evidence file must be between 1 byte and 10 MiB");if(!WORKING_PAPER_EVIDENCE_MEDIA_TYPES.includes(mediaType as (typeof WORKING_PAPER_EVIDENCE_MEDIA_TYPES)[number]))throw new ApiError(415,"UNSUPPORTED_MEDIA_TYPE","Evidence file type is not supported");if(!workingPaperEvidenceSignatureMatches(mediaType,bytes))throw new ApiError(400,"FILE_SIGNATURE_MISMATCH","Evidence bytes do not match the declared file type");const versionValue=form.get("workingPaperVersion"),version=typeof versionValue==="string"?Number(versionValue):NaN;if(!Number.isSafeInteger(version)||version<1)throw new ApiError(400,"INVALID_REQUEST","workingPaperVersion must be a positive integer");const typeValue=form.get("evidenceType");if(typeof typeValue!=="string"||!WORKING_PAPER_EVIDENCE_TYPES.includes(typeValue as (typeof WORKING_PAPER_EVIDENCE_TYPES)[number]))throw new ApiError(400,"INVALID_REQUEST",`evidenceType must be one of ${WORKING_PAPER_EVIDENCE_TYPES.join(", ")}`);const descriptionValue=form.get("description"),description=typeof descriptionValue==="string"?wpOptionalBounded({description:descriptionValue},"description",2000)??"":"";let filename:string;try{filename=safeWorkingPaperEvidenceFilename(file.name);}catch{throw new ApiError(400,"INVALID_FILENAME","Evidence filename is invalid");}return{bytes,filename,mediaType,version,evidenceType:typeValue,description};
}
async function listWorkingPaperAttachments(request:Request,env:Env,actorId:string,engagementId:string,workingPaperId:string):Promise<Response>{const ctx=context(request,actorId),sql=db(env);try{return await withTenantTransaction(sql,ctx,async(tx)=>{await engagementAccess(tx,ctx,engagementId);await requireWorkingPaper(tx,ctx,engagementId,workingPaperId);const rows=await tx`select * from working_paper_attachment where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and working_paper_id=${workingPaperId} order by working_paper_version desc,uploaded_at desc,id`;return json({items:rows.map(r=>wpAttachmentItem(engagementId,workingPaperId,r))});});}finally{await sql.end();}}
async function uploadWorkingPaperAttachment(request:Request,env:Env,actorId:string,engagementId:string,workingPaperId:string):Promise<Response>{
  const ctx=context(request,actorId),upload=await parseWorkingPaperAttachment(request),contentHash=await sha256(upload.bytes),sql=db(env),attachmentId=crypto.randomUUID();let uploadedKey:string|null=null;
  try{const existing=await withTenantTransaction(sql,ctx,async(tx)=>{await engagementAccess(tx,ctx,engagementId,WRITE_ROLES);await requireWorkingPaper(tx,ctx,engagementId,workingPaperId,true);if(!(await tx`select id from working_paper_version where tenant_id=${ctx.tenantId} and working_paper_id=${workingPaperId} and version=${upload.version}`).length)throw new ApiError(400,"INVALID_WORKING_PAPER_VERSION","workingPaperVersion does not exist");return(await tx`select * from working_paper_attachment where tenant_id=${ctx.tenantId} and working_paper_id=${workingPaperId} and working_paper_version=${upload.version} and content_hash=${contentHash}`)[0]??null;});if(existing){const object=await env.ARTEFACTS.head(String(existing.storage_key));if(!object||object.size!==Number(existing.byte_size)||object.customMetadata?.sha256!==contentHash)throw new ApiError(503,"EVIDENCE_INTEGRITY_FAILED","Existing evidence storage could not be verified");return json({created:false,item:wpAttachmentItem(engagementId,workingPaperId,existing)});}
    uploadedKey=`tenants/${ctx.tenantId}/engagements/${engagementId}/working-papers/${workingPaperId}/versions/${upload.version}/attachments/${attachmentId}`;await env.ARTEFACTS.put(uploadedKey,upload.bytes,{sha256:contentHash,httpMetadata:{contentType:upload.mediaType},customMetadata:{sha256:contentHash,tenantId:ctx.tenantId,engagementId,workingPaperId,workingPaperVersion:String(upload.version),attachmentId}});
    const result=await withTenantTransaction(sql,ctx,async(tx)=>{const engagement=await engagementAccess(tx,ctx,engagementId,WRITE_ROLES);await requireWorkingPaper(tx,ctx,engagementId,workingPaperId,true);const duplicate=await tx`select * from working_paper_attachment where tenant_id=${ctx.tenantId} and working_paper_id=${workingPaperId} and working_paper_version=${upload.version} and content_hash=${contentHash}`;if(duplicate.length)return{created:false,row:duplicate[0]!};const rows=await tx`insert into working_paper_attachment(id,tenant_id,engagement_id,working_paper_id,working_paper_version,storage_key,content_hash,filename,media_type,byte_size,evidence_type,description,uploaded_by) values(${attachmentId},${ctx.tenantId},${engagementId},${workingPaperId},${upload.version},${uploadedKey},${contentHash},${upload.filename},${upload.mediaType},${upload.bytes.byteLength},${upload.evidenceType},${upload.description},${ctx.actorId}) returning *`;await appendEvents(tx,ctx,engagement,"WORKING_PAPER_ATTACHMENT_ADDED","WORKING_PAPER_ATTACHMENT",attachmentId,{workingPaperId,workingPaperVersion:upload.version,contentHash,filename:upload.filename,mediaType:upload.mediaType,byteSize:upload.bytes.byteLength,evidenceType:upload.evidenceType,description:upload.description});return{created:true,row:rows[0]!};});if(!result.created)await deleteUploadedObject(env,uploadedKey,"concurrent working paper evidence winner");uploadedKey=null;return json({created:result.created,item:wpAttachmentItem(engagementId,workingPaperId,result.row)},result.created?201:200);
  }catch(error){if(uploadedKey)await deleteUploadedObject(env,uploadedKey,"working paper evidence transaction failed");throw error;}finally{await sql.end();}
}
async function downloadWorkingPaperAttachment(request:Request,env:Env,actorId:string,engagementId:string,workingPaperId:string,attachmentId:string):Promise<Response>{
  const ctx=context(request,actorId),sql=db(env);try{const row=await withTenantTransaction(sql,ctx,async(tx)=>{await engagementAccess(tx,ctx,engagementId);await requireWorkingPaper(tx,ctx,engagementId,workingPaperId);const rows=await tx`select * from working_paper_attachment where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and working_paper_id=${workingPaperId} and id=${attachmentId}`;if(!rows.length)throw new ApiError(404,"NOT_FOUND","Working paper evidence not found");return rows[0]!;});const key=String(row.storage_key),prefix=`tenants/${ctx.tenantId}/engagements/${engagementId}/working-papers/${workingPaperId}/`;if(!key.startsWith(prefix))throw new ApiError(503,"EVIDENCE_INTEGRITY_FAILED","Evidence storage scope is invalid");const object=await env.ARTEFACTS.get(key);if(!object||object.size!==Number(row.byte_size)||object.size>MAX_WORKING_PAPER_EVIDENCE_BYTES||object.customMetadata?.sha256!==String(row.content_hash))throw new ApiError(503,"EVIDENCE_INTEGRITY_FAILED","Stored evidence could not be verified");const bytes=await object.arrayBuffer();if(await sha256(bytes)!==String(row.content_hash))throw new ApiError(503,"EVIDENCE_INTEGRITY_FAILED","Stored evidence hash does not match its immutable record");const mediaType=String(row.media_type),download=new URL(request.url).searchParams.get("download")==="1"||!(mediaType==="application/pdf"||mediaType==="text/plain"||mediaType.startsWith("image/")),filename=String(row.filename).replace(/["\r\n\\/]/g,"_");return new Response(bytes,{headers:{"content-type":mediaType,"content-length":String(bytes.byteLength),"content-disposition":`${download?"attachment":"inline"}; filename="${filename}"`,"cache-control":"private, no-store","x-content-type-options":"nosniff","x-content-sha256":String(row.content_hash),etag:object.httpEtag}});}finally{await sql.end();}
}

async function disclosureItems(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  disclosureId?: string,
) {
  return tx`select d.*,v.answer,v.content_hash,v.created_by as version_created_by,v.created_at as version_created_at from disclosure d join disclosure_version v on v.disclosure_id=d.id and v.tenant_id=d.tenant_id and v.version=d.current_version where d.tenant_id=${ctx.tenantId} and d.engagement_id=${engagementId} and (${disclosureId ?? null}::uuid is null or d.id=${disclosureId ?? null}) order by d.disclosure_code`;
}
async function listDisclosures(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      return json({ items: await disclosureItems(tx, ctx, engagementId) });
    });
  } finally {
    await sql.end();
  }
}
async function createDisclosure(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    code = boundedRequiredString(body, "disclosureCode", 100),
    applicability = enumValue(
      body,
      "applicability",
      DISCLOSURE_APPLICABILITY,
      "UNASSESSED",
    ),
    ruleVersion = optionalString(body, "ruleVersion") ?? null,
    answer = body.answer === undefined ? {} : requireObject(body.answer),
    contentHash = await canonicalHash(answer),
    sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
          tx,
          ctx,
          engagementId,
          WRITE_ROLES,
        ),
        id = crypto.randomUUID();
      await lockEngagement(tx, ctx, engagementId);
      await tx`insert into disclosure(id,tenant_id,engagement_id,disclosure_code,applicability,rule_version) values(${id},${ctx.tenantId},${engagementId},${code},${applicability},${ruleVersion})`;
      await tx`insert into disclosure_version(id,tenant_id,disclosure_id,version,answer,content_hash,created_by) values(${crypto.randomUUID()},${ctx.tenantId},${id},1,${canonicalJson(answer)}::jsonb,${contentHash},${ctx.actorId})`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "DISCLOSURE_CREATED",
        "DISCLOSURE",
        id,
        { disclosureCode: code, applicability, ruleVersion, contentHash },
      );
      return (await disclosureItems(tx, ctx, engagementId, id))[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}
async function listDisclosureVersions(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  disclosureId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const rows =
        await tx`select id from disclosure where id=${disclosureId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Disclosure not found");
      return json({
        items:
          await tx`select id,version,answer,content_hash,created_by,created_at from disclosure_version where tenant_id=${ctx.tenantId} and disclosure_id=${disclosureId} order by version desc`,
      });
    });
  } finally {
    await sql.end();
  }
}
async function createDisclosureVersion(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  disclosureId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    answer = requireObject(body.answer),
    contentHash = await canonicalHash(answer),
    sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WRITE_ROLES,
      );
      await lockEngagement(tx, ctx, engagementId);
      const rows =
        await tx`select * from disclosure where id=${disclosureId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Disclosure not found");
      if (rows[0]!.status === "SUPERSEDED")
        throw new ApiError(
          409,
          "DISCLOSURE_LOCKED",
          "Superseded disclosures cannot be changed",
        );
      const version = Number(rows[0]!.current_version) + 1;
      const inserted =
        await tx`insert into disclosure_version(id,tenant_id,disclosure_id,version,answer,content_hash,created_by) values(${crypto.randomUUID()},${ctx.tenantId},${disclosureId},${version},${canonicalJson(answer)}::jsonb,${contentHash},${ctx.actorId}) returning id,version,answer,content_hash,created_by,created_at`;
      await tx`update disclosure set current_version=${version},status='OPEN',updated_at=now() where id=${disclosureId} and tenant_id=${ctx.tenantId}`;
      await invalidateDependentSignoffs(
        tx,
        ctx,
        engagementId,
        "DISCLOSURE",
        disclosureId,
        "Disclosure answer changed",
      );
      await appendEvents(
        tx,
        ctx,
        engagement,
        "DISCLOSURE_VERSION_CREATED",
        "DISCLOSURE",
        disclosureId,
        { version, contentHash },
      );
      return inserted[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}
async function patchDisclosure(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  disclosureId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    applicability =
      body.applicability === undefined
        ? undefined
        : enumValue(body, "applicability", DISCLOSURE_APPLICABILITY),
    next =
      body.status === undefined
        ? undefined
        : (enumValue(body, "status", DISCLOSURE_STATUSES) as DisclosureStatus);
  if (applicability === undefined && next === undefined)
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "No disclosure changes were supplied",
    );
  const sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        next === "REVIEWED" ? REVIEW_ROLES : WRITE_ROLES,
      );
      await lockEngagement(tx, ctx, engagementId);
      const rows =
        await tx`select * from disclosure where id=${disclosureId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Disclosure not found");
      const current = String(rows[0]!.status) as DisclosureStatus,
        desired = next ?? current;
      if (desired !== current) assertDisclosureTransition(current, desired);
      if (current === "SUPERSEDED")
        throw new ApiError(
          409,
          "DISCLOSURE_LOCKED",
          "Superseded disclosures cannot be changed",
        );
      if (["COMPLETE", "REVIEWED"].includes(desired)) {
        const answers = await tx`select answer from disclosure_version where tenant_id=${ctx.tenantId} and disclosure_id=${disclosureId} and version=${Number(rows[0]!.current_version)}`;
        if (/\[[^\]\n]{2,160}\]/.test(JSON.stringify(answers[0]?.answer ?? {})))
          throw new ApiError(
            409,
            "DISCLOSURE_PLACEHOLDERS_REMAIN",
            "Replace every bracketed placeholder before completing or reviewing this disclosure",
          );
      }
      const updated =
        await tx`update disclosure set applicability=coalesce(${applicability ?? null},applicability),status=${desired},updated_at=now() where id=${disclosureId} and tenant_id=${ctx.tenantId} returning *`;
      if (applicability !== undefined)
        await invalidateDependentSignoffs(
          tx,
          ctx,
          engagementId,
          "DISCLOSURE",
          disclosureId,
          "Disclosure applicability changed",
        );
      await appendEvents(
        tx,
        ctx,
        engagement,
        "DISCLOSURE_UPDATED",
        "DISCLOSURE",
        disclosureId,
        {
          from: current,
          to: desired,
          applicability: applicability ?? rows[0]!.applicability,
        },
      );
      return updated[0]!;
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

async function currentDependencyManifest(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  trialBalanceId?: string,
) {
  const tbs = trialBalanceId
    ? await tx`select tb.id,tb.version_no,s.content_hash,
        encode(digest(coalesce((select string_agg(tbl.source_account_id::text||':'||coalesce(tbl.canonical_account_id::text,''),',' order by tbl.source_account_id) from trial_balance_line tbl where tbl.tenant_id=tb.tenant_id and tbl.trial_balance_id=tb.id),''),'sha256'),'hex') as mapping_hash
        from trial_balance tb join import_snapshot s on s.id=tb.source_import_snapshot_id and s.tenant_id=tb.tenant_id
        where tb.id=${trialBalanceId} and tb.tenant_id=${ctx.tenantId} and tb.engagement_id=${engagementId} and tb.state='IMPORTED'`
    : await tx`select tb.id,tb.version_no,s.content_hash,
        encode(digest(coalesce((select string_agg(tbl.source_account_id::text||':'||coalesce(tbl.canonical_account_id::text,''),',' order by tbl.source_account_id) from trial_balance_line tbl where tbl.tenant_id=tb.tenant_id and tbl.trial_balance_id=tb.id),''),'sha256'),'hex') as mapping_hash
        from trial_balance tb join import_snapshot s on s.id=tb.source_import_snapshot_id and s.tenant_id=tb.tenant_id
        where tb.tenant_id=${ctx.tenantId} and tb.engagement_id=${engagementId} and tb.state='IMPORTED' order by tb.version_no desc limit 1`;
  if (!tbs.length)
    throw new ApiError(
      409,
      "TRIAL_BALANCE_REQUIRED",
      "An imported trial balance is required",
    );
  const journals =
    await tx`select id,journal_no,version from journal where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and status='POSTED' order by journal_no,id`;
  const workingPapers =
    await tx`select wp.id,wp.code,wp.current_version as version,v.content_hash from working_paper wp join working_paper_version v on v.tenant_id=wp.tenant_id and v.working_paper_id=wp.id and v.version=wp.current_version where wp.tenant_id=${ctx.tenantId} and wp.engagement_id=${engagementId} and wp.status<>'SUPERSEDED' and wp.applicability='APPLICABLE' order by wp.code,wp.id`;
  const disclosures =
    await tx`select d.id,d.disclosure_code,d.applicability,d.current_version as version,v.content_hash from disclosure d join disclosure_version v on v.tenant_id=d.tenant_id and v.disclosure_id=d.id and v.version=d.current_version where d.tenant_id=${ctx.tenantId} and d.engagement_id=${engagementId} and d.status<>'SUPERSEDED' order by d.disclosure_code,d.id`;
  return {
    schemaVersion: 1,
    trialBalance: tbs[0]!,
    journals,
    workingPapers,
    disclosures,
  };
}
async function listReportingPacks(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const items =
        await tx`select p.pack_code,p.version_no,p.title,p.framework_code,p.sector_code,p.effective_from,p.effective_to,
        p.certification_status,p.provenance_label,
        case p.certification_status when 'REGULATOR_CERTIFIED' then 'Regulator certified' else 'Repository baseline - not regulator certified' end as certification_label
        from engagement e join reporting_framework_pack p
          on p.framework_code=e.framework and p.sector_code=coalesce(e.sector_profile,'NONE')
          and p.effective_from<=e.period_start and (p.effective_to is null or p.effective_to>=e.period_end)
        where e.id=${engagementId} and e.tenant_id=${ctx.tenantId}
        order by p.version_no desc,p.pack_code`;
      return json({ items });
    });
  } finally {
    await sql.end();
  }
}
async function accountsVersionItems(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  accountsVersionId?: string,
) {
  return tx`select av.*,coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'signoff_type',s.signoff_type,'signed_by',s.signed_by,'signed_at',s.signed_at,'invalidated_at',s.invalidated_at,'invalidation_reason',s.invalidation_reason) order by s.signed_at) from signoff s where s.tenant_id=av.tenant_id and s.engagement_id=av.engagement_id and s.object_type='ACCOUNTS_VERSION' and s.object_id=av.id::text),'[]'::jsonb) as signoffs from accounts_version av where av.tenant_id=${ctx.tenantId} and av.engagement_id=${engagementId} and (${accountsVersionId ?? null}::uuid is null or av.id=${accountsVersionId ?? null}) order by av.version desc`;
}
async function listAccountsVersions(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      return json({ items: await accountsVersionItems(tx, ctx, engagementId) });
    });
  } finally {
    await sql.end();
  }
}

async function accountsHtmlSource(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  accountsVersionId: string,
  verifyDependencies: boolean,
): Promise<{
  row: Record<string, unknown>;
  input: AccountsHtmlInput;
}> {
  const rows =
    await tx`select av.*,e.period_start,e.period_end,e.framework,e.sector_profile,
      o.legal_name,o.legal_form,o.jurisdiction,p.title as pack_title,p.certification_status,p.provenance_label
    from accounts_version av
    join engagement e on e.id=av.engagement_id and e.tenant_id=av.tenant_id
    join organisation o on o.id=e.organisation_id and o.tenant_id=e.tenant_id
    join reporting_framework_pack p on p.pack_code=av.framework_pack_id and p.version_no=av.framework_pack_version_no
    where av.id=${accountsVersionId} and av.tenant_id=${ctx.tenantId} and av.engagement_id=${engagementId}`;
  if (!rows.length)
    throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
  const row = rows[0]!;
  if (verifyDependencies) {
    const current = await currentDependencyManifest(
      tx,
      ctx,
      engagementId,
      String(row.trial_balance_id),
    );
    const currentHash = await canonicalHash({
      ...current,
      frameworkPackId: String(row.framework_pack_id),
      frameworkPackVersionNo: Number(row.framework_pack_version_no),
    });
    if (currentHash !== String(row.content_hash))
      throw new ApiError(
        409,
        "ACCOUNTS_DEPENDENCIES_CHANGED",
        "Dependencies changed; generate a new accounts version before rendering",
      );
  }
  const lines = await tx`with raw_balance as (
      select ca.canonical_code,case ca.normal_balance when 'CREDIT' then (tbl.credit-tbl.debit) else (tbl.debit-tbl.credit) end as amount
      from accounts_version av join trial_balance_line tbl on tbl.trial_balance_id=av.trial_balance_id and tbl.tenant_id=av.tenant_id
      join canonical_account ca on ca.id=tbl.canonical_account_id where av.id=${accountsVersionId} and av.tenant_id=${ctx.tenantId}
      union all
      select ca.canonical_code,case ca.normal_balance when 'CREDIT' then (jl.credit-jl.debit) else (jl.debit-jl.credit) end as amount
      from accounts_version av cross join lateral jsonb_array_elements(coalesce(av.content_manifest->'journals','[]'::jsonb)) dep
      join journal j on j.id=(dep->>'id')::uuid and j.tenant_id=av.tenant_id and j.engagement_id=av.engagement_id and j.version=(dep->>'version')::integer and j.status='POSTED'
      join journal_line jl on jl.journal_id=j.id and jl.tenant_id=j.tenant_id join canonical_account ca on ca.id=jl.canonical_account_id
      where av.id=${accountsVersionId} and av.tenant_id=${ctx.tenantId}
    ), balances as (select canonical_code,sum(amount) as balance from raw_balance group by canonical_code)
    select s.statement_code,s.caption as statement_caption,s.display_order as statement_order,
      l.line_code,l.caption,l.display_order,coalesce(sum(b.balance),0)::text as balance
    from accounts_version av join reporting_framework_pack p on p.pack_code=av.framework_pack_id and p.version_no=av.framework_pack_version_no
    join statement_definition s on s.framework_pack_id=p.id join statement_definition_line l on l.statement_definition_id=s.id
    left join balances b on b.canonical_code=any(l.canonical_codes)
    where av.id=${accountsVersionId} and av.tenant_id=${ctx.tenantId}
    group by s.id,s.statement_code,s.caption,s.display_order,l.id,l.line_code,l.caption,l.display_order
    order by s.display_order,l.display_order`;
  const disclosures =
    await tx`select d.disclosure_code,coalesce(dep->>'applicability',d.applicability) as applicability,dv.answer
    from accounts_version av cross join lateral jsonb_array_elements(coalesce(av.content_manifest->'disclosures','[]'::jsonb)) dep
    join disclosure d on d.id=(dep->>'id')::uuid and d.tenant_id=av.tenant_id and d.engagement_id=av.engagement_id
    join disclosure_version dv on dv.disclosure_id=d.id and dv.tenant_id=d.tenant_id and dv.version=(dep->>'version')::integer
    where av.id=${accountsVersionId} and av.tenant_id=${ctx.tenantId} order by d.disclosure_code`;
  return {
    row,
    input: {
      organisation: {
        legalName: String(row.legal_name),
        legalForm: String(row.legal_form),
        jurisdiction: String(row.jurisdiction),
      },
      engagement: {
        periodStart: String(row.period_start),
        periodEnd: String(row.period_end),
        framework: String(row.framework),
        sectorProfile: String(row.sector_profile ?? "NONE"),
      },
      accountsVersion: {
        version: Number(row.version),
        status: String(row.status),
        contentHash: String(row.content_hash),
        generatedAt: new Date(String(row.generated_at)).toISOString(),
      },
      pack: {
        code: String(row.framework_pack_id),
        version: Number(row.framework_pack_version_no),
        title: String(row.pack_title),
        certificationStatus: String(row.certification_status),
        provenanceLabel: String(row.provenance_label),
      },
      lines: lines.map((line) => ({
        statementCode: String(line.statement_code),
        statementCaption: String(line.statement_caption),
        statementOrder: Number(line.statement_order),
        lineCode: String(line.line_code),
        caption: String(line.caption),
        displayOrder: Number(line.display_order),
        balance: String(line.balance),
      })),
      disclosures: disclosures.map((item) => ({
        code: String(item.disclosure_code),
        applicability: String(item.applicability),
        answer: requireObject(item.answer),
      })),
    },
  };
}

function htmlArtefactItem(
  engagementId: string,
  accountsVersionId: string,
  contentHash: string,
  byteSize: number,
) {
  const base = `/v1/engagements/${encodeURIComponent(engagementId)}/accounts-versions/${encodeURIComponent(accountsVersionId)}/artefacts/html`;
  return {
    kind: "HTML",
    status: "READY",
    rendererVersion: ACCOUNTS_HTML_RENDERER_VERSION,
    contentHash,
    byteSize,
    viewPath: base,
    downloadPath: `${base}?download=1`,
  };
}

async function generateAccountsHtml(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  let uploadedKey: string | null = null;
  try {
    const source = await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId, WRITE_ROLES);
      const result = await accountsHtmlSource(
        tx,
        ctx,
        engagementId,
        accountsVersionId,
        true,
      );
      if (String(result.row.status) === "SUPERSEDED")
        throw new ApiError(
          409,
          "ACCOUNTS_VERSION_LOCKED",
          "Superseded accounts versions cannot generate new artefacts",
        );
      return result;
    });
    const existingKey = source.row.html_storage_key
      ? String(source.row.html_storage_key)
      : null;
    const existingHash = source.row.html_content_hash
      ? String(source.row.html_content_hash)
      : null;
    if (existingKey && existingHash) {
      const existing = await env.ARTEFACTS.head(existingKey);
      if (existing) {
        if (existing.customMetadata?.sha256 !== existingHash)
          throw new ApiError(
            503,
            "ARTEFACT_INTEGRITY_FAILED",
            "The persisted HTML artefact failed its integrity check",
          );
        return json({
          item: htmlArtefactItem(
            engagementId,
            accountsVersionId,
            existingHash,
            existing.size,
          ),
          created: false,
          capabilities: await accountsArtefactCapabilities(
            request,
            env,
            actorId,
            engagementId,
            accountsVersionId,
            true,
          ),
        });
      }
    }
    const html = renderAccountsHtml(source.input),
      encoded = new TextEncoder().encode(html),
      bytes = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(bytes).set(encoded);
    const htmlHash = await sha256(bytes);
    uploadedKey = `tenants/${ctx.tenantId}/engagements/${engagementId}/accounts-versions/${accountsVersionId}/${crypto.randomUUID()}-${htmlHash}.html`;
    await env.ARTEFACTS.put(uploadedKey, bytes, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
      customMetadata: {
        sha256: htmlHash,
        rendererVersion: ACCOUNTS_HTML_RENDERER_VERSION,
        accountsVersionId,
      },
    });
    const result = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WRITE_ROLES,
      );
      const rows =
        await tx`select id,version,status,content_hash,html_storage_key,html_content_hash from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
      if (
        String(rows[0]!.status) === "SUPERSEDED" ||
        String(rows[0]!.content_hash) !== String(source.row.content_hash)
      )
        throw new ApiError(
          409,
          "ACCOUNTS_VERSION_CHANGED",
          "Accounts version changed while the artefact was rendered",
        );
      if (rows[0]!.html_storage_key && rows[0]!.html_content_hash)
        return {
          created: false,
          key: String(rows[0]!.html_storage_key),
          hash: String(rows[0]!.html_content_hash),
        };
      await tx`update accounts_version set html_storage_key=${uploadedKey},html_content_hash=${htmlHash} where id=${accountsVersionId} and tenant_id=${ctx.tenantId}`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "ACCOUNTS_HTML_GENERATED",
        "ACCOUNTS_VERSION",
        accountsVersionId,
        {
          accountsVersion: Number(rows[0]!.version),
          accountsContentHash: String(rows[0]!.content_hash),
          htmlContentHash: htmlHash,
          rendererVersion: ACCOUNTS_HTML_RENDERER_VERSION,
          byteSize: encoded.byteLength,
        },
      );
      return { created: true, key: uploadedKey!, hash: htmlHash };
    });
    if (!result.created) {
      await deleteUploadedObject(env, uploadedKey, "concurrent HTML winner");
      uploadedKey = null;
      const winner = await env.ARTEFACTS.head(result.key);
      if (!winner)
        throw new ApiError(
          503,
          "ARTEFACT_UNAVAILABLE",
          "The persisted HTML artefact is unavailable",
        );
      if (winner.customMetadata?.sha256 !== result.hash)
        throw new ApiError(
          503,
          "ARTEFACT_INTEGRITY_FAILED",
          "The persisted HTML artefact failed its integrity check",
        );
      return json({
        item: htmlArtefactItem(
          engagementId,
          accountsVersionId,
          result.hash,
          winner.size,
        ),
        created: false,
      });
    }
    uploadedKey = null;
    return json(
      {
        item: htmlArtefactItem(
          engagementId,
          accountsVersionId,
          htmlHash,
          encoded.byteLength,
        ),
        created: true,
      },
      201,
    );
  } finally {
    if (uploadedKey)
      await deleteUploadedObject(env, uploadedKey, "HTML transaction failed");
    await sql.end();
  }
}

async function getAccountsHtml(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    const row = await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const rows =
        await tx`select html_storage_key,html_content_hash from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
      if (!rows[0]!.html_storage_key || !rows[0]!.html_content_hash)
        throw new ApiError(
          404,
          "ARTEFACT_NOT_GENERATED",
          "HTML accounts have not been generated",
        );
      return rows[0]!;
    });
    const object = await env.ARTEFACTS.get(String(row.html_storage_key));
    if (!object)
      throw new ApiError(
        503,
        "ARTEFACT_UNAVAILABLE",
        "The persisted HTML artefact is unavailable",
      );
    if (object.customMetadata?.sha256 !== String(row.html_content_hash))
      throw new ApiError(
        503,
        "ARTEFACT_INTEGRITY_FAILED",
        "The persisted HTML artefact failed its integrity check",
      );
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(object.body, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-length": String(object.size),
        etag: object.httpEtag,
        "cache-control": "private, no-store",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        "x-content-type-options": "nosniff",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="accounts-${accountsVersionId}.html"`,
      },
    });
  } finally {
    await sql.end();
  }
}

function pdfArtefactItem(
  engagementId: string,
  accountsVersionId: string,
  contentHash: string,
  byteSize: number,
) {
  const base = `/v1/engagements/${encodeURIComponent(engagementId)}/accounts-versions/${encodeURIComponent(accountsVersionId)}/artefacts/pdf`;
  return {
    kind: "PDF",
    status: "READY",
    rendererVersion: ACCOUNTS_PDF_RENDERER_VERSION,
    contentHash,
    byteSize,
    viewPath: base,
    downloadPath: `${base}?download=1`,
  };
}

async function verifiedPdfObject(
  env: Env,
  storageKey: string,
  expectedHash: string,
  accountsVersionId: string,
): Promise<{ object: R2ObjectBody; bytes: ArrayBuffer }> {
  const object = await env.ARTEFACTS.get(storageKey);
  if (!object)
    throw new ApiError(
      503,
      "ARTEFACT_UNAVAILABLE",
      "The persisted PDF artefact is unavailable",
    );
  const bytes = await object.arrayBuffer();
  if (
    object.httpMetadata?.contentType !== "application/pdf" ||
    object.customMetadata?.sha256 !== expectedHash ||
    object.customMetadata?.rendererVersion !== ACCOUNTS_PDF_RENDERER_VERSION ||
    object.customMetadata?.accountsVersionId !== accountsVersionId ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-" ||
    (await sha256(bytes)) !== expectedHash
  )
    throw new ApiError(
      503,
      "ARTEFACT_INTEGRITY_FAILED",
      "The persisted PDF artefact failed its integrity check",
    );
  return { object, bytes };
}

async function generateAccountsPdf(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  let uploadedKey: string | null = null;
  try {
    const source = await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId, WRITE_ROLES);
      const result = await accountsHtmlSource(
        tx,
        ctx,
        engagementId,
        accountsVersionId,
        true,
      );
      if (String(result.row.status) === "SUPERSEDED")
        throw new ApiError(
          409,
          "ACCOUNTS_VERSION_LOCKED",
          "Superseded accounts versions cannot generate new artefacts",
        );
      return result;
    });
    const existingKey = source.row.pdf_storage_key
      ? String(source.row.pdf_storage_key)
      : null;
    const existingHash = source.row.pdf_content_hash
      ? String(source.row.pdf_content_hash)
      : null;
    if (existingKey && existingHash) {
      const existing = await env.ARTEFACTS.head(existingKey);
      if (existing) {
        const verified = await verifiedPdfObject(
          env,
          existingKey,
          existingHash,
          accountsVersionId,
        );
        return json({
          item: pdfArtefactItem(
            engagementId,
            accountsVersionId,
            existingHash,
            verified.object.size,
          ),
          created: false,
          capabilities: await accountsArtefactCapabilities(
            request,
            env,
            actorId,
            engagementId,
            accountsVersionId,
            true,
          ),
        });
      }
    }
    const rendered = await renderAccountsPdf(source.input),
      bytes = new ArrayBuffer(rendered.byteLength);
    new Uint8Array(bytes).set(rendered);
    const pdfHash = await sha256(bytes);
    uploadedKey = `tenants/${ctx.tenantId}/engagements/${engagementId}/accounts-versions/${accountsVersionId}/${crypto.randomUUID()}-${pdfHash}.pdf`;
    await env.ARTEFACTS.put(uploadedKey, bytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: {
        sha256: pdfHash,
        rendererVersion: ACCOUNTS_PDF_RENDERER_VERSION,
        accountsVersionId,
      },
    });
    const result = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WRITE_ROLES,
      );
      const rows =
        await tx`select id,version,status,content_hash,pdf_storage_key,pdf_content_hash from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
      if (
        String(rows[0]!.status) === "SUPERSEDED" ||
        String(rows[0]!.content_hash) !== String(source.row.content_hash)
      )
        throw new ApiError(
          409,
          "ACCOUNTS_VERSION_CHANGED",
          "Accounts version changed while the artefact was rendered",
        );
      if (rows[0]!.pdf_storage_key && rows[0]!.pdf_content_hash)
        return {
          created: false,
          key: String(rows[0]!.pdf_storage_key),
          hash: String(rows[0]!.pdf_content_hash),
        };
      await tx`update accounts_version set pdf_storage_key=${uploadedKey},pdf_content_hash=${pdfHash} where id=${accountsVersionId} and tenant_id=${ctx.tenantId}`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "ACCOUNTS_PDF_GENERATED",
        "ACCOUNTS_VERSION",
        accountsVersionId,
        {
          accountsVersion: Number(rows[0]!.version),
          accountsContentHash: String(rows[0]!.content_hash),
          pdfContentHash: pdfHash,
          rendererVersion: ACCOUNTS_PDF_RENDERER_VERSION,
          byteSize: rendered.byteLength,
        },
      );
      return { created: true, key: uploadedKey!, hash: pdfHash };
    });
    if (!result.created) {
      await deleteUploadedObject(env, uploadedKey, "concurrent PDF winner");
      uploadedKey = null;
      const winner = await verifiedPdfObject(
        env,
        result.key,
        result.hash,
        accountsVersionId,
      );
      return json({
        item: pdfArtefactItem(
          engagementId,
          accountsVersionId,
          result.hash,
          winner.object.size,
        ),
        created: false,
      });
    }
    uploadedKey = null;
    return json(
      {
        item: pdfArtefactItem(
          engagementId,
          accountsVersionId,
          pdfHash,
          rendered.byteLength,
        ),
        created: true,
      },
      201,
    );
  } finally {
    if (uploadedKey)
      await deleteUploadedObject(env, uploadedKey, "PDF transaction failed");
    await sql.end();
  }
}

async function getAccountsPdf(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    const row = await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const rows =
        await tx`select pdf_storage_key,pdf_content_hash from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
      if (!rows[0]!.pdf_storage_key || !rows[0]!.pdf_content_hash)
        throw new ApiError(
          404,
          "ARTEFACT_NOT_GENERATED",
          "PDF accounts have not been generated",
        );
      return rows[0]!;
    });
    const verified = await verifiedPdfObject(
      env,
      String(row.pdf_storage_key),
      String(row.pdf_content_hash),
      accountsVersionId,
    );
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(verified.bytes, {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(verified.object.size),
        etag: verified.object.httpEtag,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="accounts-${accountsVersionId}.pdf"`,
      },
    });
  } finally {
    await sql.end();
  }
}

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function docxArtefactItem(
  engagementId: string,
  accountsVersionId: string,
  contentHash: string,
  byteSize: number,
) {
  const base = `/v1/engagements/${encodeURIComponent(engagementId)}/accounts-versions/${encodeURIComponent(accountsVersionId)}/artefacts/docx`;
  return {
    kind: "DOCX",
    status: "READY",
    rendererVersion: ACCOUNTS_DOCX_RENDERER_VERSION,
    contentHash,
    byteSize,
    downloadPath: `${base}?download=1`,
  };
}

async function verifiedDocxObject(
  env: Env,
  storageKey: string,
  expectedHash: string,
  accountsVersionId: string,
): Promise<{ object: R2ObjectBody; bytes: ArrayBuffer }> {
  const object = await env.ARTEFACTS.get(storageKey);
  if (!object)
    throw new ApiError(503, "ARTEFACT_UNAVAILABLE", "The persisted Word artefact is unavailable");
  const bytes = await object.arrayBuffer();
  const signature = new Uint8Array(bytes.slice(0, 2));
  if (
    object.httpMetadata?.contentType !== DOCX_CONTENT_TYPE ||
    object.customMetadata?.sha256 !== expectedHash ||
    object.customMetadata?.rendererVersion !== ACCOUNTS_DOCX_RENDERER_VERSION ||
    object.customMetadata?.accountsVersionId !== accountsVersionId ||
    signature[0] !== 0x50 ||
    signature[1] !== 0x4b ||
    (await sha256(bytes)) !== expectedHash
  )
    throw new ApiError(503, "ARTEFACT_INTEGRITY_FAILED", "The persisted Word artefact failed its integrity check");
  return { object, bytes };
}

async function generateAccountsDocx(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
): Promise<Response> {
  const ctx = context(request, actorId), sql = db(env);
  let uploadedKey: string | null = null;
  try {
    const source = await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId, WRITE_ROLES);
      const result = await accountsHtmlSource(tx, ctx, engagementId, accountsVersionId, true);
      if (String(result.row.status) === "SUPERSEDED")
        throw new ApiError(409, "ACCOUNTS_VERSION_LOCKED", "Superseded accounts versions cannot generate new artefacts");
      return result;
    });
    const existingKey = source.row.docx_storage_key ? String(source.row.docx_storage_key) : null;
    const existingHash = source.row.docx_content_hash ? String(source.row.docx_content_hash) : null;
    if (existingKey && existingHash) {
      const verified = await verifiedDocxObject(env, existingKey, existingHash, accountsVersionId);
      return json({ item: docxArtefactItem(engagementId, accountsVersionId, existingHash, verified.object.size), created: false });
    }
    const rendered = await renderAccountsDocx(source.input);
    const bytes = new ArrayBuffer(rendered.byteLength);
    new Uint8Array(bytes).set(rendered);
    const contentHash = await sha256(bytes);
    uploadedKey = `tenants/${ctx.tenantId}/engagements/${engagementId}/accounts-versions/${accountsVersionId}/${crypto.randomUUID()}-${contentHash}.docx`;
    await env.ARTEFACTS.put(uploadedKey, bytes, {
      httpMetadata: { contentType: DOCX_CONTENT_TYPE },
      customMetadata: { sha256: contentHash, rendererVersion: ACCOUNTS_DOCX_RENDERER_VERSION, accountsVersionId },
    });
    const result = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(tx, ctx, engagementId, WRITE_ROLES);
      const rows = await tx`select id,version,status,content_hash,docx_storage_key,docx_content_hash from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
      if (String(rows[0]!.status) === "SUPERSEDED" || String(rows[0]!.content_hash) !== String(source.row.content_hash))
        throw new ApiError(409, "ACCOUNTS_VERSION_CHANGED", "Accounts version changed while the artefact was rendered");
      if (rows[0]!.docx_storage_key && rows[0]!.docx_content_hash)
        return { created: false, key: String(rows[0]!.docx_storage_key), hash: String(rows[0]!.docx_content_hash) };
      await tx`update accounts_version set docx_storage_key=${uploadedKey},docx_content_hash=${contentHash} where id=${accountsVersionId} and tenant_id=${ctx.tenantId}`;
      await appendEvents(tx, ctx, engagement, "ACCOUNTS_DOCX_GENERATED", "ACCOUNTS_VERSION", accountsVersionId, {
        accountsVersion: Number(rows[0]!.version), accountsContentHash: String(rows[0]!.content_hash), docxContentHash: contentHash,
        rendererVersion: ACCOUNTS_DOCX_RENDERER_VERSION, byteSize: rendered.byteLength,
      });
      return { created: true, key: uploadedKey!, hash: contentHash };
    });
    if (!result.created) {
      await deleteUploadedObject(env, uploadedKey, "concurrent DOCX winner");
      uploadedKey = null;
      const winner = await verifiedDocxObject(env, result.key, result.hash, accountsVersionId);
      return json({ item: docxArtefactItem(engagementId, accountsVersionId, result.hash, winner.object.size), created: false });
    }
    uploadedKey = null;
    return json({ item: docxArtefactItem(engagementId, accountsVersionId, contentHash, rendered.byteLength), created: true }, 201);
  } finally {
    if (uploadedKey) await deleteUploadedObject(env, uploadedKey, "DOCX transaction failed");
    await sql.end();
  }
}

async function getAccountsDocx(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
): Promise<Response> {
  const ctx = context(request, actorId), sql = db(env);
  try {
    const row = await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const rows = await tx`select docx_storage_key,docx_content_hash from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
      if (!rows[0]!.docx_storage_key || !rows[0]!.docx_content_hash)
        throw new ApiError(404, "ARTEFACT_NOT_GENERATED", "Word accounts have not been generated");
      return rows[0]!;
    });
    const verified = await verifiedDocxObject(env, String(row.docx_storage_key), String(row.docx_content_hash), accountsVersionId);
    return new Response(verified.bytes, { headers: {
      "content-type": DOCX_CONTENT_TYPE, "content-length": String(verified.object.size), etag: verified.object.httpEtag,
      "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      "content-disposition": `attachment; filename="accounts-${accountsVersionId}.docx"`,
    }});
  } finally { await sql.end(); }
}

async function accountsArtefactCapabilities(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
  dataOnly = false,
): Promise<Response | Record<string, unknown>> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    const capabilities = await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const versions =
        await tx`select framework_pack_id,framework_pack_version_no,html_storage_key,pdf_storage_key,docx_storage_key from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      if (!versions.length)
        throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
      const mappings =
        await tx`select count(*)::int as count from reporting_framework_pack p join taxonomy_concept_mapping m on m.framework_pack_id=p.id where p.pack_code=${String(versions[0]!.framework_pack_id)} and p.version_no=${Number(versions[0]!.framework_pack_version_no)}`;
      const taxonomyMappings = Number(mappings[0]!.count);
      return {
        html: {
          available: true,
          generated: Boolean(versions[0]!.html_storage_key),
        },
        pdf: {
          available: true,
          generated: Boolean(versions[0]!.pdf_storage_key),
          rendererVersion: ACCOUNTS_PDF_RENDERER_VERSION,
        },
        docx: {
          available: true,
          generated: Boolean(versions[0]!.docx_storage_key),
          rendererVersion: ACCOUNTS_DOCX_RENDERER_VERSION,
        },
        ixbrl: taxonomyMappings
          ? {
              available: false,
              code: "IXBRL_RENDERER_NOT_IMPLEMENTED",
              message:
                "Taxonomy mappings exist, but the iXBRL renderer is not implemented.",
              taxonomyMappings,
            }
          : {
              available: false,
              code: "TAXONOMY_MAPPINGS_UNAVAILABLE",
              message:
                "The pinned reporting pack has no taxonomy concept mappings.",
              taxonomyMappings: 0,
            },
      };
    });
    return dataOnly ? capabilities : json({ capabilities });
  } finally {
    await sql.end();
  }
}

async function unavailableAccountsArtefact(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
  kind: "pdf" | "ixbrl",
): Promise<Response> {
  const capabilities = (await accountsArtefactCapabilities(
    request,
    env,
    actorId,
    engagementId,
    accountsVersionId,
    true,
  )) as Record<string, Record<string, unknown>>;
  const capability = capabilities[kind]!;
  return json(
    {
      error: {
        code: String(capability.code),
        message: String(capability.message),
      },
      capability,
    },
    501,
  );
}

interface EvidenceBundleSource {
  row: Record<string, unknown>;
  manifest: Record<string, unknown>;
  dependencyIds: string[];
  missingDependencies: Array<Record<string, unknown>>;
  signoffs: Array<Record<string, unknown>>;
  auditTrail: Array<Record<string, unknown>>;
}

function evidenceManifestDependencies(
  manifest: Record<string, unknown>,
  accountsVersionId: string,
): string[] {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ids = [accountsVersionId];
  const trialBalance = requireObject(manifest.trialBalance);
  const trialBalanceId = requiredString(trialBalance, "id");
  if (!uuid.test(trialBalanceId))
    throw new ApiError(
      503,
      "EVIDENCE_MANIFEST_INVALID",
      "The accounts dependency manifest is invalid",
    );
  ids.push(trialBalanceId);
  for (const field of ["journals", "workingPapers", "disclosures"] as const) {
    const values = manifest[field];
    if (!Array.isArray(values))
      throw new ApiError(
        503,
        "EVIDENCE_MANIFEST_INVALID",
        "The accounts dependency manifest is invalid",
      );
    for (const value of values) {
      const dependency = requireObject(value),
        id = requiredString(dependency, "id"),
        version = Number(dependency.version);
      if (!uuid.test(id) || !Number.isSafeInteger(version) || version < 1)
        throw new ApiError(
          503,
          "EVIDENCE_MANIFEST_INVALID",
          "The accounts dependency manifest is invalid",
        );
      ids.push(id);
    }
  }
  return [...new Set(ids)].sort();
}

async function loadEvidenceBundleSource(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  accountsVersionId: string,
): Promise<EvidenceBundleSource> {
  await engagementAccess(tx, ctx, engagementId);
  const rows = await tx`select av.id,av.version,av.status,av.trial_balance_id,
      av.framework_pack_id,av.framework_pack_version_no,av.content_manifest,av.content_hash,
      av.html_storage_key,av.html_content_hash,av.pdf_storage_key,av.pdf_content_hash,
      av.generated_by,av.generated_at,av.frozen_at,
      e.organisation_id,e.period_start,e.period_end,e.framework,e.sector_profile,e.status as engagement_status,
      o.legal_name,o.legal_form,o.jurisdiction,
      p.title as pack_title,p.certification_status,p.provenance_label
    from accounts_version av
    join engagement e on e.id=av.engagement_id and e.tenant_id=av.tenant_id
    join organisation o on o.id=e.organisation_id and o.tenant_id=e.tenant_id
    left join reporting_framework_pack p on p.pack_code=av.framework_pack_id and p.version_no=av.framework_pack_version_no
    where av.id=${accountsVersionId} and av.tenant_id=${ctx.tenantId} and av.engagement_id=${engagementId}`;
  if (!rows.length)
    throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
  const row = rows[0]!,
    manifest = requireObject(row.content_manifest);
  if ((await canonicalHash(manifest)) !== String(row.content_hash))
    throw new ApiError(
      503,
      "EVIDENCE_MANIFEST_INTEGRITY_FAILED",
      "The accounts dependency manifest failed its integrity check",
    );
  const dependencyIds = evidenceManifestDependencies(
    manifest,
    accountsVersionId,
  );
  const missingDependencies = await tx`with av as (
      select * from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}
    ), missing as (
      select 'TRIAL_BALANCE'::text as kind,av.content_manifest->'trialBalance'->>'id' as dependency_id
      from av where not exists (
        select 1 from trial_balance tb join import_snapshot s on s.id=tb.source_import_snapshot_id and s.tenant_id=tb.tenant_id
        where tb.id=av.trial_balance_id and tb.tenant_id=av.tenant_id and tb.engagement_id=av.engagement_id
          and tb.state='IMPORTED'
          and tb.version_no=(av.content_manifest->'trialBalance'->>'version_no')::integer
          and s.content_hash=av.content_manifest->'trialBalance'->>'content_hash'
          and encode(digest(coalesce((select string_agg(tbl.source_account_id::text||':'||coalesce(tbl.canonical_account_id::text,''),',' order by tbl.source_account_id) from trial_balance_line tbl where tbl.tenant_id=tb.tenant_id and tbl.trial_balance_id=tb.id),''),'sha256'),'hex')=av.content_manifest->'trialBalance'->>'mapping_hash'
      )
      union all
      select 'JOURNAL',dep->>'id' from av cross join lateral jsonb_array_elements(coalesce(av.content_manifest->'journals','[]'::jsonb)) dep
      where not exists (select 1 from journal j where j.id=(dep->>'id')::uuid and j.tenant_id=av.tenant_id and j.engagement_id=av.engagement_id and j.version=(dep->>'version')::integer and j.status='POSTED')
      union all
      select 'WORKING_PAPER_VERSION',dep->>'id' from av cross join lateral jsonb_array_elements(coalesce(av.content_manifest->'workingPapers','[]'::jsonb)) dep
      where not exists (select 1 from working_paper wp join working_paper_version v on v.tenant_id=wp.tenant_id and v.working_paper_id=wp.id where wp.id=(dep->>'id')::uuid and wp.tenant_id=av.tenant_id and wp.engagement_id=av.engagement_id and v.version=(dep->>'version')::integer and v.content_hash=dep->>'content_hash')
      union all
      select 'DISCLOSURE_VERSION',dep->>'id' from av cross join lateral jsonb_array_elements(coalesce(av.content_manifest->'disclosures','[]'::jsonb)) dep
      where not exists (select 1 from disclosure d join disclosure_version v on v.tenant_id=d.tenant_id and v.disclosure_id=d.id where d.id=(dep->>'id')::uuid and d.tenant_id=av.tenant_id and d.engagement_id=av.engagement_id and v.version=(dep->>'version')::integer and v.content_hash=dep->>'content_hash')
      union all
      select 'REPORTING_FRAMEWORK_PACK',av.framework_pack_id from av
      where not exists (select 1 from reporting_framework_pack p where p.pack_code=av.framework_pack_id and p.version_no=av.framework_pack_version_no)
    ) select kind,dependency_id from missing order by kind,dependency_id`;
  const signoffs =
    await tx`select id,object_type,object_id,object_version,signoff_type,
      signed_by,signed_at,dependency_manifest,signature_hash,invalidated_at,invalidation_reason
    from signoff where tenant_id=${ctx.tenantId} and engagement_id=${engagementId}
      and object_type='ACCOUNTS_VERSION' and object_id=${accountsVersionId}
      and object_version=${Number(row.version)}
    order by signed_at,id`;
  const auditTrail =
    await tx`select event_id,occurred_at_utc,recorded_at_utc,actor_type,actor_id,
      event_type,object_type,object_id,version_before,version_after,previous_hash,new_hash,reason,
      correlation_id,causation_id,metadata,event_hash,ledger_integrity_reference
    from audit_event where tenant_id=${ctx.tenantId} and engagement_id=${engagementId}
      and object_id in ${tx(dependencyIds)}
    order by occurred_at_utc,event_id limit 2001`;
  if (auditTrail.length > 2000)
    throw new ApiError(
      413,
      "EVIDENCE_BUNDLE_TOO_LARGE",
      "The scoped audit trail exceeds the evidence bundle limit",
    );
  return {
    row,
    manifest,
    dependencyIds,
    missingDependencies,
    signoffs,
    auditTrail,
  };
}

function evidenceReadiness(source: EvidenceBundleSource) {
  const activeTypes = new Set(
    source.signoffs
      .filter((signoff) => !signoff.invalidated_at)
      .map((signoff) => String(signoff.signoff_type)),
  );
  return {
    available: source.missingDependencies.length === 0,
    code:
      source.missingDependencies.length === 0
        ? "EVIDENCE_BUNDLE_AVAILABLE"
        : "EVIDENCE_DEPENDENCIES_UNAVAILABLE",
    formatVersion: EVIDENCE_BUNDLE_FORMAT_VERSION,
    accountsVersion: {
      id: source.row.id,
      version: Number(source.row.version),
      status: source.row.status,
      contentHash: source.row.content_hash,
    },
    dependencies: {
      complete: source.missingDependencies.length === 0,
      referencedObjectCount: source.dependencyIds.length,
      missing: source.missingDependencies,
    },
    signoffs: {
      total: source.signoffs.length,
      active: source.signoffs.filter((signoff) => !signoff.invalidated_at)
        .length,
      invalidated: source.signoffs.filter((signoff) => signoff.invalidated_at)
        .length,
      activeTypes: [...activeTypes].sort(),
      preparedAndReviewed:
        activeTypes.has("PREPARED") && activeTypes.has("REVIEWED"),
      clientAndPartnerApproved:
        activeTypes.has("CLIENT_APPROVED") &&
        activeTypes.has("PARTNER_APPROVED"),
      filingAuthorised: activeTypes.has("FILING_AUTHORISED"),
    },
    artefacts: {
      html: { generated: Boolean(source.row.html_storage_key) },
      pdf: { generated: Boolean(source.row.pdf_storage_key) },
    },
    auditEventCount: source.auditTrail.length,
    maxSourceBytes: MAX_EVIDENCE_BUNDLE_SOURCE_BYTES,
  };
}

async function optionalBundleArtefact(
  env: Env,
  source: EvidenceBundleSource,
  kind: "html" | "pdf",
  accountsVersionId: string,
): Promise<EvidenceBundleFile | null> {
  const key = source.row[`${kind}_storage_key`],
    expectedHash = source.row[`${kind}_content_hash`];
  if (!key && !expectedHash) return null;
  if (!key || !expectedHash)
    throw new ApiError(
      503,
      "ARTEFACT_METADATA_INCONSISTENT",
      `The ${kind.toUpperCase()} artefact metadata is inconsistent`,
    );
  const object = await env.ARTEFACTS.get(String(key));
  if (!object)
    throw new ApiError(
      503,
      "ARTEFACT_UNAVAILABLE",
      `The persisted ${kind.toUpperCase()} artefact is unavailable`,
    );
  const bytes = await object.arrayBuffer(),
    contentHash = await sha256(bytes),
    rendererVersion =
      kind === "html"
        ? ACCOUNTS_HTML_RENDERER_VERSION
        : ACCOUNTS_PDF_RENDERER_VERSION,
    contentType =
      kind === "html" ? "text/html; charset=utf-8" : "application/pdf";
  if (
    contentHash !== String(expectedHash) ||
    object.customMetadata?.sha256 !== String(expectedHash) ||
    object.customMetadata?.rendererVersion !== rendererVersion ||
    object.customMetadata?.accountsVersionId !== accountsVersionId ||
    object.httpMetadata?.contentType !== contentType
  )
    throw new ApiError(
      503,
      "ARTEFACT_INTEGRITY_FAILED",
      `The persisted ${kind.toUpperCase()} artefact failed its integrity check`,
    );
  return {
    path: `artefacts/accounts.${kind}`,
    bytes: new Uint8Array(bytes),
    compress: kind === "html",
  };
}

async function evidenceBundleCapability(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    const source = await withTenantTransaction(sql, ctx, (tx) =>
      loadEvidenceBundleSource(tx, ctx, engagementId, accountsVersionId),
    );
    return json({ capability: evidenceReadiness(source) });
  } finally {
    await sql.end();
  }
}

async function downloadEvidenceBundle(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    const source = await withTenantTransaction(sql, ctx, (tx) =>
      loadEvidenceBundleSource(tx, ctx, engagementId, accountsVersionId),
    );
    const readiness = evidenceReadiness(source);
    if (!readiness.available)
      throw new ApiError(
        409,
        "EVIDENCE_DEPENDENCIES_UNAVAILABLE",
        `Evidence dependencies are unavailable: ${source.missingDependencies.map((item) => `${item.kind}:${item.dependency_id}`).join(", ")}`,
      );
    const artefacts = await Promise.all([
      optionalBundleArtefact(env, source, "html", accountsVersionId),
      optionalBundleArtefact(env, source, "pdf", accountsVersionId),
    ]);
    const bundleManifest = {
      formatVersion: EVIDENCE_BUNDLE_FORMAT_VERSION,
      accountsVersion: {
        id: source.row.id,
        version: Number(source.row.version),
        status: source.row.status,
        contentHash: source.row.content_hash,
        generatedBy: source.row.generated_by,
        generatedAt: source.row.generated_at,
        frozenAt: source.row.frozen_at,
        dependencyManifest: source.manifest,
      },
      engagement: {
        id: engagementId,
        organisationId: source.row.organisation_id,
        periodStart: source.row.period_start,
        periodEnd: source.row.period_end,
        framework: source.row.framework,
        sectorProfile: source.row.sector_profile,
        status: source.row.engagement_status,
      },
      organisation: {
        legalName: source.row.legal_name,
        legalForm: source.row.legal_form,
        jurisdiction: source.row.jurisdiction,
      },
      reportingPack: {
        code: source.row.framework_pack_id,
        version: Number(source.row.framework_pack_version_no),
        title: source.row.pack_title,
        certificationStatus: source.row.certification_status,
        provenanceLabel: source.row.provenance_label,
      },
      includedArtefacts: artefacts.filter(Boolean).map((file) => file!.path),
    };
    const files: EvidenceBundleFile[] = [
      {
        path: "bundle-manifest.json",
        bytes: evidenceJson(bundleManifest),
      },
      { path: "readiness-summary.json", bytes: evidenceJson(readiness) },
      { path: "signoffs.json", bytes: evidenceJson(source.signoffs) },
      { path: "audit-trail.json", bytes: evidenceJson(source.auditTrail) },
      ...artefacts.filter((file): file is EvidenceBundleFile => file !== null),
    ];
    let zip: Uint8Array;
    try {
      zip = deterministicEvidenceZip(
        files,
        new Date(String(source.row.generated_at)),
      );
    } catch (error) {
      throw new ApiError(
        413,
        "EVIDENCE_BUNDLE_TOO_LARGE",
        error instanceof Error
          ? error.message
          : "The evidence bundle exceeds its bounded size",
      );
    }
    const zipBytes = new ArrayBuffer(zip.byteLength);
    new Uint8Array(zipBytes).set(zip);
    const zipHash = await sha256(zipBytes);
    return new Response(zipBytes, {
      headers: {
        "content-type": "application/zip",
        "content-length": String(zip.byteLength),
        "content-disposition": `attachment; filename="accounts-${accountsVersionId}-evidence.zip"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-content-sha256": zipHash,
      },
    });
  } finally {
    await sql.end();
  }
}
async function generateAccountsVersion(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    trialBalanceId = optionalString(body, "trialBalanceId") ?? undefined,
    comparativeAccountsVersionId =
      optionalString(body, "comparativeAccountsVersionId") ?? undefined,
    frameworkPackId = boundedRequiredString(body, "frameworkPackId", 160),
    frameworkPackVersionNo =
      body.frameworkPackVersionNo === undefined
        ? 1
        : Number(body.frameworkPackVersionNo),
    sql = db(env);
  if (
    !Number.isSafeInteger(frameworkPackVersionNo) ||
    frameworkPackVersionNo < 1
  )
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "frameworkPackVersionNo must be a positive integer",
    );
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
        tx,
        ctx,
        engagementId,
        WRITE_ROLES,
      );
      await tx`select id from engagement where id=${engagementId} and tenant_id=${ctx.tenantId} for update`;
      const packs =
        await tx`select p.pack_code,p.version_no from engagement e join reporting_framework_pack p
        on p.framework_code=e.framework and p.sector_code=coalesce(e.sector_profile,'NONE')
        and p.effective_from<=e.period_start and (p.effective_to is null or p.effective_to>=e.period_end)
        where e.id=${engagementId} and e.tenant_id=${ctx.tenantId}
          and p.pack_code=${frameworkPackId} and p.version_no=${frameworkPackVersionNo}`;
      if (!packs.length)
        throw new ApiError(
          409,
          "REPORTING_PACK_NOT_APPLICABLE",
          "The selected reporting pack/version is not applicable to this engagement",
        );
      const comparativeRows = comparativeAccountsVersionId
        ? await tx`select av.id,av.engagement_id,av.content_hash,av.status,e.period_start,e.period_end
          from accounts_version av join engagement e on e.tenant_id=av.tenant_id and e.id=av.engagement_id
          join engagement current_e on current_e.tenant_id=e.tenant_id and current_e.id=${engagementId}
          where av.tenant_id=${ctx.tenantId} and av.id=${comparativeAccountsVersionId}
            and e.organisation_id=current_e.organisation_id and e.period_end<current_e.period_start
            and av.status in ('FINAL','FILED')`
        : [];
      if (comparativeAccountsVersionId && !comparativeRows.length)
        throw new ApiError(
          409,
          "COMPARATIVE_VERSION_INVALID",
          "The comparative accounts version must be a final earlier period for the same organisation",
        );
      const dependencies = await currentDependencyManifest(
          tx,
          ctx,
          engagementId,
          trialBalanceId,
        ),
        manifest = {
          ...dependencies,
          frameworkPackId,
          frameworkPackVersionNo,
          ...(comparativeRows.length
            ? {
                comparativeAccounts: {
                  accountsVersionId: String(comparativeRows[0]!.id),
                  engagementId: String(comparativeRows[0]!.engagement_id),
                  contentHash: String(comparativeRows[0]!.content_hash),
                  periodStart: String(comparativeRows[0]!.period_start),
                  periodEnd: String(comparativeRows[0]!.period_end),
                },
              }
            : {}),
        },
        contentHash = await canonicalHash(manifest),
        numbers =
          await tx`select coalesce(max(version),0)+1 as version from accounts_version where tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`,
        id = crypto.randomUUID(),
        version = Number(numbers[0]!.version);
      await tx`insert into accounts_version(id,tenant_id,engagement_id,version,trial_balance_id,framework_pack_id,framework_pack_version_no,content_manifest,content_hash,generated_by) values(${id},${ctx.tenantId},${engagementId},${version},${String(manifest.trialBalance.id)},${frameworkPackId},${frameworkPackVersionNo},${canonicalJson(manifest)}::jsonb,${contentHash},${ctx.actorId})`;
      if (comparativeRows.length)
        await tx`insert into accounts_version_comparative(id,tenant_id,engagement_id,accounts_version_id,current_manifest_hash,comparative_engagement_id,comparative_accounts_version_id,comparative_manifest_hash,created_by)
          values(${crypto.randomUUID()},${ctx.tenantId},${engagementId},${id},${contentHash},${comparativeRows[0]!.engagement_id},${comparativeRows[0]!.id},${comparativeRows[0]!.content_hash},${ctx.actorId})`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "ACCOUNTS_VERSION_GENERATED",
        "ACCOUNTS_VERSION",
        id,
        {
          version,
          frameworkPackId,
          frameworkPackVersionNo,
          contentHash,
          comparativeAccountsVersionId: comparativeAccountsVersionId ?? null,
        },
        version === 1 ? "ledgerly.accounts.started" : undefined,
      );
      return (await accountsVersionItems(tx, ctx, engagementId, id))[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}
async function transitionAccountsVersion(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  accountsVersionId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    next = enumValue(
      body,
      "status",
      ACCOUNTS_VERSION_STATUSES,
    ) as AccountsVersionStatus,
    reason = optionalString(body, "reason") ?? null,
    sql = db(env);
  if (next === "FILED")
    throw new ApiError(
      409,
      "FILING_EVIDENCE_REQUIRED",
      "Accounts become filed only through an accepted filing attempt",
    );
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
          tx,
          ctx,
          engagementId,
          next === "REVIEWED" ? REVIEW_ROLES : ["PARTNER", "MANAGER"],
        ),
        rows =
          await tx`select * from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
      const current = String(rows[0]!.status) as AccountsVersionStatus;
      assertAccountsVersionTransition(current, next);
      if (["APPROVED", "FINAL"].includes(next)) {
        const disclosureRows = await tx`select d.disclosure_code,d.status,v.answer from disclosure d join disclosure_version v on v.tenant_id=d.tenant_id and v.disclosure_id=d.id and v.version=d.current_version where d.tenant_id=${ctx.tenantId} and d.engagement_id=${engagementId} and d.applicability in ('REQUIRED','RECOMMENDED') and d.status<>'SUPERSEDED' order by d.disclosure_code`;
        const unresolved = disclosureRows.filter(
          (row) =>
            String(row.status) !== "REVIEWED" ||
            /\[[^\]\n]{2,160}\]/.test(JSON.stringify(row.answer ?? {})),
        );
        if (unresolved.length)
          throw new ApiError(
            409,
            "DISCLOSURE_REVIEW_REQUIRED",
            `Required disclosures must be reviewed and free of placeholders: ${unresolved.map((row) => String(row.disclosure_code)).join(", ")}`,
          );
      }
      const active =
          await tx`select signoff_type from signoff where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and object_type='ACCOUNTS_VERSION' and object_id=${accountsVersionId} and object_version=${Number(rows[0]!.version)} and invalidated_at is null`,
        types = new Set(active.map((row) => String(row.signoff_type)));
      if (
        next === "REVIEWED" &&
        (!types.has("PREPARED") || !types.has("REVIEWED"))
      )
        throw new ApiError(
          409,
          "SIGNOFFS_REQUIRED",
          "Prepared and reviewed signoffs are required",
        );
      if (next === "APPROVED" && !types.has("PARTNER_APPROVED"))
        throw new ApiError(
          409,
          "SIGNOFFS_REQUIRED",
          "Partner approval is required",
        );
      if (
        next === "FINAL" &&
        (!types.has("CLIENT_APPROVED") || !types.has("PARTNER_APPROVED"))
      )
        throw new ApiError(
          409,
          "SIGNOFFS_REQUIRED",
          "Client and partner approval are required",
        );
      const updated =
        await tx`update accounts_version set status=${next},frozen_at=case when ${next} in ('APPROVED','FINAL','FILED') then coalesce(frozen_at,now()) else frozen_at end where id=${accountsVersionId} and tenant_id=${ctx.tenantId} returning *`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "ACCOUNTS_VERSION_STATUS_CHANGED",
        "ACCOUNTS_VERSION",
        accountsVersionId,
        { from: current, to: next, reason },
        next === "FINAL" ? "ledgerly.accounts.completed" : undefined,
      );
      return updated[0]!;
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

async function targetDependency(
  tx: Transaction,
  ctx: RequestContext,
  engagementId: string,
  objectType: string,
  objectId: string,
  objectVersion: number,
) {
  if (objectType === "ACCOUNTS_VERSION") {
    const rows =
      await tx`select id,version,content_hash from accounts_version where id=${objectId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
    if (!rows.length || Number(rows[0]!.version) !== objectVersion)
      throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
    return {
      objectType,
      objectId,
      objectVersion,
      contentHash: String(rows[0]!.content_hash),
    };
  }
  if (objectType === "WORKING_PAPER") {
    const rows =
      await tx`select wp.id,v.version,v.content_hash from working_paper wp join working_paper_version v on v.tenant_id=wp.tenant_id and v.working_paper_id=wp.id and v.version=${objectVersion} where wp.id=${objectId} and wp.tenant_id=${ctx.tenantId} and wp.engagement_id=${engagementId}`;
    if (!rows.length)
      throw new ApiError(404, "NOT_FOUND", "Working-paper version not found");
    return {
      objectType,
      objectId,
      objectVersion,
      contentHash: String(rows[0]!.content_hash),
    };
  }
  if (objectType === "DISCLOSURE") {
    const rows =
      await tx`select d.id,v.version,v.content_hash from disclosure d join disclosure_version v on v.tenant_id=d.tenant_id and v.disclosure_id=d.id and v.version=${objectVersion} where d.id=${objectId} and d.tenant_id=${ctx.tenantId} and d.engagement_id=${engagementId}`;
    if (!rows.length)
      throw new ApiError(404, "NOT_FOUND", "Disclosure version not found");
    return {
      objectType,
      objectId,
      objectVersion,
      contentHash: String(rows[0]!.content_hash),
    };
  }
  throw new ApiError(400, "INVALID_REQUEST", "objectType is invalid");
}
async function listSignoffs(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      return json({
        items:
          await tx`select * from signoff where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} order by signed_at desc`,
      });
    });
  } finally {
    await sql.end();
  }
}
async function createSignoff(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    objectType = enumValue(body, "objectType", [
      "ACCOUNTS_VERSION",
      "WORKING_PAPER",
      "DISCLOSURE",
    ] as const),
    objectId = requiredString(body, "objectId"),
    objectVersion = Number(body.objectVersion),
    signoffType = enumValue(body, "signoffType", SIGNOFF_TYPES) as SignoffType;
  if (!Number.isSafeInteger(objectVersion) || objectVersion < 1)
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "objectVersion must be a positive integer",
    );
  const sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const allowed =
          signoffType === "PREPARED"
            ? WRITE_ROLES
            : signoffType === "REVIEWED"
              ? REVIEW_ROLES
              : signoffType === "CLIENT_APPROVED"
                ? ["FILER"]
                : signoffType === "PARTNER_APPROVED"
                  ? ["PARTNER"]
                  : ["PARTNER", "FILER"],
        engagement = await engagementAccess(tx, ctx, engagementId, allowed),
        dependency = await targetDependency(
          tx,
          ctx,
          engagementId,
          objectType,
          objectId,
          objectVersion,
        ),
        existing =
          await tx`select signoff_type,signed_by from signoff where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and object_type=${objectType} and object_id=${objectId} and object_version=${objectVersion} and invalidated_at is null`;
      if (
        existing.some(
          (row) =>
            String(row.signed_by) === ctx.actorId &&
            String(row.signoff_type) !== signoffType,
        ) &&
        signoffType !== "FILING_AUTHORISED"
      )
        throw new ApiError(
          409,
          "SEGREGATION_REQUIRED",
          "The same actor cannot perform multiple preparation, review, client or partner signoffs",
        );
      const types = new Set(existing.map((row) => String(row.signoff_type)));
      if (signoffType === "REVIEWED" && !types.has("PREPARED"))
        throw new ApiError(
          409,
          "SIGNOFF_PREREQUISITE",
          "Prepared signoff is required",
        );
      if (
        ["CLIENT_APPROVED", "PARTNER_APPROVED"].includes(signoffType) &&
        !types.has("REVIEWED")
      )
        throw new ApiError(
          409,
          "SIGNOFF_PREREQUISITE",
          "Reviewed signoff is required",
        );
      if (signoffType === "FILING_AUTHORISED" && !types.has("PARTNER_APPROVED"))
        throw new ApiError(
          409,
          "SIGNOFF_PREREQUISITE",
          "Partner approval is required",
        );
      if (
        existing.some(
          (row) =>
            String(row.signed_by) === ctx.actorId &&
            String(row.signoff_type) === signoffType,
        )
      )
        throw new ApiError(
          409,
          "DUPLICATE_SIGNOFF",
          "This signoff already exists",
        );
      const dependencyManifest = { schemaVersion: 1, ...dependency },
        signatureHash = await canonicalHash({
          ...dependencyManifest,
          signoffType,
          signedBy: ctx.actorId,
        }),
        id = crypto.randomUUID(),
        inserted =
          await tx`insert into signoff(id,tenant_id,engagement_id,object_type,object_id,object_version,signoff_type,signed_by,dependency_manifest,signature_hash) values(${id},${ctx.tenantId},${engagementId},${objectType},${objectId},${objectVersion},${signoffType},${ctx.actorId},${canonicalJson(dependencyManifest)}::jsonb,${signatureHash}) returning *`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "SIGNOFF_CREATED",
        "SIGNOFF",
        id,
        { objectType, objectId, objectVersion, signoffType, signatureHash },
      );
      return inserted[0]!;
    });
    return json({ item }, 201);
  } finally {
    await sql.end();
  }
}
async function invalidateSignoff(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  signoffId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    reason = boundedRequiredString(body, "reason", 500),
    sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(
          tx,
          ctx,
          engagementId,
          REVIEW_ROLES,
        ),
        rows =
          await tx`select * from signoff where id=${signoffId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Signoff not found");
      if (rows[0]!.invalidated_at)
        throw new ApiError(
          409,
          "SIGNOFF_ALREADY_INVALIDATED",
          "Signoff is already invalidated",
        );
      const updated =
        await tx`update signoff set invalidated_at=now(),invalidation_reason=${reason} where id=${signoffId} and tenant_id=${ctx.tenantId} returning *`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "SIGNOFF_INVALIDATED",
        "SIGNOFF",
        signoffId,
        { reason },
      );
      return updated[0]!;
    });
    return json({ item });
  } finally {
    await sql.end();
  }
}

async function listFilingAttempts(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const rows = await tx`select f.id,f.accounts_version_id,av.version as accounts_version,
        f.regulator,f.attempt_no,f.status,f.payload_hash,f.response_content_hash,
        f.regulator_reference,f.submitted_by,f.submitted_at,f.responded_at,f.created_at
        from filing_attempt f join accounts_version av on av.id=f.accounts_version_id and av.tenant_id=f.tenant_id
        where f.tenant_id=${ctx.tenantId} and f.engagement_id=${engagementId} order by f.created_at desc`;
      return json({
        items: rows,
      });
    });
  } finally {
    await sql.end();
  }
}
async function createFilingAttempt(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    accountsVersionId = requiredString(body, "accountsVersionId"),
    regulator = enumValue(body, "regulator", FILING_REGULATORS),
    sql = db(env),
    filingId = crypto.randomUUID();
  let storageKey: string | null = null;
  try {
    const account = await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId, ["PARTNER", "FILER"]);
      const rows =
        await tx`select id,version,status,content_hash from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
      if (!["FINAL", "FILED"].includes(String(rows[0]!.status)))
        throw new ApiError(
          409,
          "ACCOUNTS_NOT_FINAL",
          "Only final accounts can be prepared for filing",
        );
      const authorised =
        await tx`select 1 from signoff where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and object_type='ACCOUNTS_VERSION' and object_id=${accountsVersionId} and object_version=${Number(rows[0]!.version)} and signoff_type='FILING_AUTHORISED' and invalidated_at is null limit 1`;
      if (!authorised.length)
        throw new ApiError(
          409,
          "SIGNOFFS_REQUIRED",
          "Filing authorisation is required",
        );
      return rows[0]!;
    });
    const payload = {
      schemaVersion: 1,
      engagementId,
      accountsVersionId,
      accountsVersion: Number(account.version),
      accountsContentHash: String(account.content_hash),
      regulator,
    };
    const payloadText = canonicalJson(payload),
      encoded = new TextEncoder().encode(payloadText),
      bytes = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(bytes).set(encoded);
    const payloadHash = await sha256(bytes);
    storageKey = `tenants/${ctx.tenantId}/engagements/${engagementId}/filings/${filingId}-payload.json`;
    await env.ARTEFACTS.put(storageKey, bytes, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { payloadHash, accountsVersionId, regulator },
    });
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(tx, ctx, engagementId, [
        "PARTNER",
        "FILER",
      ]);
      await tx`select id from engagement where id=${engagementId} and tenant_id=${ctx.tenantId} for update`;
      const currentAccount =
        await tx`select id,version,status,content_hash from accounts_version where id=${accountsVersionId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (
        !currentAccount.length ||
        !["FINAL", "FILED"].includes(String(currentAccount[0]!.status)) ||
        String(currentAccount[0]!.content_hash) !== String(account.content_hash)
      )
        throw new ApiError(
          409,
          "ACCOUNTS_CHANGED",
          "Accounts changed while the filing payload was prepared",
        );
      const currentAuthorisation =
        await tx`select 1 from signoff where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and object_type='ACCOUNTS_VERSION' and object_id=${accountsVersionId} and object_version=${Number(currentAccount[0]!.version)} and signoff_type='FILING_AUTHORISED' and invalidated_at is null limit 1`;
      if (!currentAuthorisation.length)
        throw new ApiError(
          409,
          "SIGNOFFS_REQUIRED",
          "Filing authorisation is required",
        );
      const numbers =
          await tx`select coalesce(max(attempt_no),0)+1 as attempt_no from filing_attempt where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and regulator=${regulator}`,
        attemptNo = Number(numbers[0]!.attempt_no),
        inserted =
          await tx`insert into filing_attempt(id,tenant_id,engagement_id,accounts_version_id,regulator,attempt_no,payload_storage_key,payload_hash) values(${filingId},${ctx.tenantId},${engagementId},${accountsVersionId},${regulator},${attemptNo},${storageKey},${payloadHash}) returning *`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "FILING_ATTEMPT_PREPARED",
        "FILING_ATTEMPT",
        filingId,
        { accountsVersionId, regulator, attemptNo, payloadHash, storageKey },
      );
      return inserted[0]!;
    });
    storageKey = null;
    return json({ item: publicFilingAttempt(item) }, 201);
  } finally {
    if (storageKey)
      await deleteUploadedObject(env, storageKey, "filing transaction failed");
    await sql.end();
  }
}

interface RegulatorEvidenceUpload {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  regulatorReference: string | null;
  respondedAt: string | null;
  status: "ACCEPTED" | "REJECTED";
}

function publicFilingAttempt(row: Record<string, unknown>) {
  return {
    id: row.id,
    accounts_version_id: row.accounts_version_id,
    accounts_version: row.accounts_version,
    regulator: row.regulator,
    attempt_no: row.attempt_no,
    status: row.status,
    payload_hash: row.payload_hash,
    response_content_hash: row.response_content_hash,
    regulator_reference: row.regulator_reference,
    submitted_by: row.submitted_by,
    submitted_at: row.submitted_at,
    responded_at: row.responded_at,
    created_at: row.created_at,
  };
}

function evidenceFormString(form: FormData, field: string): string | null {
  const values = form.getAll(field);
  if (
    values.length > 1 ||
    (values.length === 1 && typeof values[0] !== "string")
  )
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be supplied once as text`,
    );
  const value = values[0];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function regulatorEvidenceUpload(
  request: Request,
): Promise<RegulatorEvidenceUpload> {
  const requestContentType = request.headers.get("content-type") ?? "";
  if (!requestContentType.toLowerCase().startsWith("multipart/form-data;"))
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "multipart/form-data with a file field is required",
    );
  const body = await readBodyBounded(
    request,
    MAX_EVIDENCE_MULTIPART_BYTES,
    "Regulator response evidence upload",
  );
  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { "content-type": requestContentType },
    }).formData();
  } catch {
    throw new ApiError(
      400,
      "INVALID_MULTIPART",
      "The multipart request could not be parsed",
    );
  }
  const files = form.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File))
    throw new ApiError(
      400,
      "EVIDENCE_FILE_REQUIRED",
      "Exactly one evidence file is required",
    );
  const file = files[0];
  if (!file.size)
    throw new ApiError(400, "EMPTY_EVIDENCE_FILE", "Evidence file is empty");
  if (file.size > MAX_EVIDENCE_BYTES)
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Regulator response evidence file is too large",
    );
  const regulatorReference = evidenceFormString(form, "regulatorReference");
  if (
    regulatorReference &&
    (regulatorReference.length > 255 ||
      /[\u0000-\u001f\u007f]/.test(regulatorReference))
  )
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "regulatorReference must be at most 255 characters and contain no control characters",
    );
  const respondedAtValue = evidenceFormString(form, "respondedAt");
  const respondedAt = optionalTimestamp(
    { respondedAt: respondedAtValue ?? undefined },
    "respondedAt",
  );
  return {
    bytes: await file.arrayBuffer(),
    contentType: regulatorEvidenceContentType(file.type),
    filename: regulatorEvidenceFilename(file.name),
    regulatorReference,
    respondedAt: respondedAt ?? null,
    status: regulatorEvidenceStatus(evidenceFormString(form, "status")),
  };
}

async function evidenceResponseItem(
  env: Env,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const storageKey = String(row.response_storage_key ?? "");
  const object = storageKey ? await env.ARTEFACTS.head(storageKey) : null;
  if (!object)
    throw new ApiError(
      503,
      "EVIDENCE_UNAVAILABLE",
      "Stored regulator response evidence is unavailable",
    );
  let filename = "regulator-response-evidence";
  const encodedFilename = object.customMetadata?.originalFilename;
  if (encodedFilename) {
    try {
      filename = decodeURIComponent(encodedFilename);
    } catch {
      filename = "regulator-response-evidence";
    }
  }
  return {
    id: row.id,
    status: row.status,
    regulator: row.regulator,
    attempt_no: row.attempt_no,
    accounts_version_id: row.accounts_version_id,
    regulator_reference: row.regulator_reference,
    submitted_at: row.submitted_at,
    responded_at: row.responded_at,
    evidence: {
      filename,
      contentType:
        object.httpMetadata?.contentType ?? "application/octet-stream",
      byteSize: object.size,
      contentHash: row.response_content_hash,
    },
  };
}

async function recordFilingEvidence(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  filingId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    upload = await regulatorEvidenceUpload(request),
    contentHash = await sha256(upload.bytes),
    sql = db(env);
  let uploadedKey: string | null = null;
  try {
    const existing = await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId, ["PARTNER", "FILER"]);
      const rows =
        await tx`select id,status,regulator,attempt_no,accounts_version_id,regulator_reference,submitted_at,responded_at,response_storage_key,response_content_hash from filing_attempt where id=${filingId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Filing attempt not found");
      const current = String(rows[0]!.status) as FilingStatus;
      if (
        current === upload.status &&
        String(rows[0]!.response_content_hash) === contentHash
      )
        return rows[0]!;
      if (current !== "SUBMITTED")
        throw new ApiError(
          409,
          "INVALID_TRANSITION",
          `Filing attempt cannot record ${upload.status} evidence from ${current}`,
        );
      assertFilingTransition(current, upload.status);
      return null;
    });
    if (existing)
      return json({
        item: await evidenceResponseItem(env, existing),
        created: false,
      });

    uploadedKey = `tenants/${ctx.tenantId}/engagements/${engagementId}/filings/${filingId}/responses/${crypto.randomUUID()}-${contentHash}`;
    await env.ARTEFACTS.put(uploadedKey, upload.bytes, {
      httpMetadata: { contentType: upload.contentType },
      customMetadata: {
        contentHash,
        decision: upload.status,
        filingId,
        originalFilename: encodeURIComponent(upload.filename),
      },
    });

    const result = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(tx, ctx, engagementId, [
          "PARTNER",
          "FILER",
        ]),
        rows =
          await tx`select * from filing_attempt where id=${filingId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Filing attempt not found");
      const current = String(rows[0]!.status) as FilingStatus;
      if (
        current === upload.status &&
        String(rows[0]!.response_content_hash) === contentHash
      )
        return { row: rows[0]!, created: false };
      assertFilingTransition(current, upload.status);
      const updated =
        await tx`update filing_attempt set status=${upload.status},regulator_reference=${upload.regulatorReference},response_storage_key=${uploadedKey},response_content_hash=${contentHash},responded_at=coalesce(${upload.respondedAt}::timestamptz,now()) where id=${filingId} and tenant_id=${ctx.tenantId} returning *`;
      if (upload.status === "ACCEPTED") {
        const accounts =
          await tx`update accounts_version set status='FILED',frozen_at=coalesce(frozen_at,now()) where id=${String(rows[0]!.accounts_version_id)} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and status in ('FINAL','FILED') returning id`;
        if (!accounts.length)
          throw new ApiError(
            409,
            "ACCOUNTS_NOT_FINAL",
            "Accepted filing evidence requires a final accounts version",
          );
      }
      await appendEvents(
        tx,
        ctx,
        engagement,
        "FILING_RESPONSE_EVIDENCE_RECORDED",
        "FILING_ATTEMPT",
        filingId,
        {
          from: current,
          to: upload.status,
          regulatorReference: upload.regulatorReference,
          respondedAt: updated[0]!.responded_at,
          evidence: {
            filename: upload.filename,
            contentType: upload.contentType,
            byteSize: upload.bytes.byteLength,
            contentHash,
          },
        },
      );
      return { row: updated[0]!, created: true };
    });
    if (!result.created) {
      await deleteUploadedObject(
        env,
        uploadedKey,
        "concurrent filing evidence winner",
      );
      uploadedKey = null;
    } else {
      uploadedKey = null;
    }
    return json(
      {
        item: await evidenceResponseItem(env, result.row),
        created: result.created,
      },
      result.created ? 201 : 200,
    );
  } finally {
    if (uploadedKey)
      await deleteUploadedObject(
        env,
        uploadedKey,
        "filing evidence transaction failed",
      );
    await sql.end();
  }
}

async function patchFilingAttempt(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
  filingId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    body = await jsonBody(request),
    next = enumValue(body, "status", FILING_STATUSES) as FilingStatus,
    regulatorReference = optionalString(body, "regulatorReference");
  if ("responseStorageKey" in body)
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "responseStorageKey is server-managed",
    );
  if (next === "ACCEPTED" || next === "REJECTED")
    throw new ApiError(
      409,
      "EVIDENCE_UPLOAD_REQUIRED",
      "Use the filing evidence endpoint to record a regulator decision",
    );
  const sql = db(env);
  try {
    const item = await withTenantTransaction(sql, ctx, async (tx) => {
      const engagement = await engagementAccess(tx, ctx, engagementId, [
          "PARTNER",
          "FILER",
        ]),
        rows =
          await tx`select * from filing_attempt where id=${filingId} and tenant_id=${ctx.tenantId} and engagement_id=${engagementId} for update`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Filing attempt not found");
      const current = String(rows[0]!.status) as FilingStatus;
      assertFilingTransition(current, next);
      const updated =
        await tx`update filing_attempt set status=${next},regulator_reference=case when ${regulatorReference !== undefined} then ${regulatorReference ?? null} else regulator_reference end,submitted_by=case when ${next}='SUBMITTED' then ${ctx.actorId} else submitted_by end,submitted_at=case when ${next}='SUBMITTED' then now() else submitted_at end where id=${filingId} and tenant_id=${ctx.tenantId} returning *`;
      await appendEvents(
        tx,
        ctx,
        engagement,
        "FILING_ATTEMPT_STATUS_CHANGED",
        "FILING_ATTEMPT",
        filingId,
        {
          from: current,
          to: next,
          regulatorReference:
            regulatorReference ?? rows[0]!.regulator_reference,
        },
        next === "SUBMITTED" ? "ledgerly.filing.submitted" : undefined,
      );
      return updated[0]!;
    });
    return json({ item: publicFilingAttempt(item) });
  } finally {
    await sql.end();
  }
}

function countsByStatus(
  rows: readonly Record<string, unknown>[],
): Record<string, number> {
  return Object.fromEntries(
    rows.map((row) => [String(row.status), Number(row.count)]),
  );
}
async function dashboard(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const journals =
        await tx`select status,count(*)::int as count from journal where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} group by status`;
      const reconciliations =
        await tx`select status,count(*)::int as count from reconciliation where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} group by status`;
      const tasks =
        await tx`select status,count(*)::int as count from workflow_task where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} group by status`;
      const reviewPoints =
        await tx`select status,count(*)::int as count from review_point where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} group by status`;
      const workingPapers =
        await tx`select status,count(*)::int as count from working_paper where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} group by status`;
      const disclosures =
        await tx`select status,count(*)::int as count from disclosure where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} group by status`;
      const accountsVersions =
        await tx`select status,count(*)::int as count from accounts_version where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} group by status`;
      const signoffs =
        await tx`select case when invalidated_at is null then 'ACTIVE' else 'INVALIDATED' end as status,count(*)::int as count from signoff where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} group by (invalidated_at is null)`;
      const filingAttempts =
        await tx`select status,count(*)::int as count from filing_attempt where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} group by status`;
      const progressRows =
        await tx`select count(*) filter(where status<>'CANCELLED')::int as total_tasks,count(*) filter(where status='COMPLETE')::int as completed_tasks from workflow_task where tenant_id=${ctx.tenantId} and engagement_id=${engagementId}`;
      const blockerRows = await tx`select
      (select count(*) from workflow_task where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and blocking and status not in ('COMPLETE','CANCELLED'))+
      (select count(*) from review_point where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and severity='BLOCKING' and status<>'CLEARED')+
      (select count(*) from reconciliation where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and status='EXCEPTION') as blocking_items`;
      const totalTasks = Number(progressRows[0]!.total_tasks),
        completedTasks = Number(progressRows[0]!.completed_tasks);
      return json({
        engagementId,
        journals: {
          total: journals.reduce((sum, row) => sum + Number(row.count), 0),
          byStatus: countsByStatus(journals),
        },
        reconciliations: {
          total: reconciliations.reduce(
            (sum, row) => sum + Number(row.count),
            0,
          ),
          byStatus: countsByStatus(reconciliations),
        },
        tasks: {
          total: tasks.reduce((sum, row) => sum + Number(row.count), 0),
          byStatus: countsByStatus(tasks),
        },
        reviewPoints: {
          total: reviewPoints.reduce((sum, row) => sum + Number(row.count), 0),
          byStatus: countsByStatus(reviewPoints),
        },
        workingPapers: {
          total: workingPapers.reduce((sum, row) => sum + Number(row.count), 0),
          byStatus: countsByStatus(workingPapers),
        },
        disclosures: {
          total: disclosures.reduce((sum, row) => sum + Number(row.count), 0),
          byStatus: countsByStatus(disclosures),
        },
        accountsVersions: {
          total: accountsVersions.reduce(
            (sum, row) => sum + Number(row.count),
            0,
          ),
          byStatus: countsByStatus(accountsVersions),
        },
        signoffs: {
          total: signoffs.reduce((sum, row) => sum + Number(row.count), 0),
          byStatus: countsByStatus(signoffs),
        },
        filingAttempts: {
          total: filingAttempts.reduce(
            (sum, row) => sum + Number(row.count),
            0,
          ),
          byStatus: countsByStatus(filingAttempts),
        },
        progress: {
          completedTasks,
          totalTasks,
          percent: totalTasks
            ? Math.round((completedTasks * 100) / totalTasks)
            : 0,
        },
        blockingItems: Number(blockerRows[0]!.blocking_items),
      });
    });
  } finally {
    await sql.end();
  }
}

async function engagementTrialBalance(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const lines =
        await tx`select sa.id as source_account_id,sa.account_code,sa.account_name,tbl.debit,tbl.credit,ca.id as canonical_account_id,ca.canonical_code,ca.name as canonical_name,ca.report_line
        from trial_balance tb join trial_balance_line tbl on tbl.trial_balance_id=tb.id and tbl.tenant_id=tb.tenant_id
        join source_account sa on sa.id=tbl.source_account_id and sa.tenant_id=tb.tenant_id left join canonical_account ca on ca.id=tbl.canonical_account_id
        where tb.engagement_id=${engagementId} and tb.tenant_id=${ctx.tenantId} and tb.state='IMPORTED'
          and tb.version_no=(select max(version_no) from trial_balance where engagement_id=${engagementId} and tenant_id=${ctx.tenantId} and state='IMPORTED') order by sa.account_code`;
      return json({ items: lines });
    });
  } finally {
    await sql.end();
  }
}
async function report(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      const summaries =
        await tx`with latest as (select id,version_no,source_import_snapshot_id from trial_balance
          where engagement_id=${engagementId} and tenant_id=${ctx.tenantId} and state='IMPORTED' order by version_no desc limit 1)
        select latest.id,latest.version_no,latest.source_import_snapshot_id,coalesce(sum(tbl.debit),0) as debit_total,coalesce(sum(tbl.credit),0) as credit_total,
          count(*)::int as account_count,count(*) filter(where tbl.canonical_account_id is null)::int as unmapped_count
        from latest join trial_balance_line tbl on tbl.trial_balance_id=latest.id group by latest.id,latest.version_no,latest.source_import_snapshot_id`;
      if (!summaries.length)
        throw new ApiError(404, "NOT_FOUND", "No imported trial balance found");
      const lines =
        await tx`with latest as (select id from trial_balance where engagement_id=${engagementId} and tenant_id=${ctx.tenantId} and state='IMPORTED' order by version_no desc limit 1)
        select rl.line_code as code,rl.caption,rl.statement_code,rl.display_order,sum(tbl.debit-tbl.credit) as balance,
          array_agg(distinct ca.canonical_code order by ca.canonical_code) as canonical_codes,array_agg(distinct sa.id order by sa.id) as source_account_ids
        from latest join trial_balance_line tbl on tbl.trial_balance_id=latest.id join source_account sa on sa.id=tbl.source_account_id
        join canonical_account ca on ca.id=tbl.canonical_account_id join canonical_report_line rl on rl.id=ca.report_line_id
        group by rl.id,rl.line_code,rl.caption,rl.statement_code,rl.display_order order by rl.statement_code,rl.display_order`;
      const readiness = trialBalanceReadiness(
        Number(summaries[0]!.account_count),
        Number(summaries[0]!.unmapped_count),
        summaries[0]!.debit_total as string | number,
        summaries[0]!.credit_total as string | number,
      );
      return json({
        trialBalance: summaries[0],
        ...readiness,
        lines,
      });
    });
  } finally {
    await sql.end();
  }
}
async function auditHistory(
  request: Request,
  env: Env,
  actorId: string,
  engagementId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const sql = db(env);
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await engagementAccess(tx, ctx, engagementId);
      return json({
        items:
          await tx`select event_id,occurred_at_utc,actor_id,event_type,object_type,object_id,reason,correlation_id,metadata,event_hash
        from audit_event where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} order by occurred_at_utc desc,event_id desc limit 250`,
      });
    });
  } finally {
    await sql.end();
  }
}
async function canonicalAccounts(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response> {
  const ctx = context(request, actorId);
  const sql = db(env);
  const url = new URL(request.url);
  const taxonomyVersion =
    url.searchParams.get("taxonomyVersion") ?? "UK-CANONICAL-2026";
  try {
    return await withTenantTransaction(sql, ctx, async (tx) => {
      await tenantRole(tx, ctx);
      return json({
        items:
          await tx`select id,taxonomy_version,canonical_code,name,report_line,normal_balance
        from canonical_account where taxonomy_version=${taxonomyVersion} order by canonical_code`,
      });
    });
  } finally {
    await sql.end();
  }
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const result = await runScheduledRecurringGeneration(env);
    console.log(JSON.stringify({ message: "recurrence generation completed", scheduledTime: controller.scheduledTime, cron: controller.cron, ...result }));
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const startedAt = performance.now();
    const correlationId = requestCorrelationId(
      request.headers.get("x-correlation-id"),
    );
    if (request.headers.get("x-correlation-id") !== correlationId) {
      const headers = new Headers(request.headers);
      headers.set("x-correlation-id", correlationId);
      request = new Request(request, { headers });
    }
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("origin");
      const response =
        origin === env.WEB_ORIGIN
          ? new Response(null, { status: 204 })
          : json(
              {
                error: {
                  code: "FORBIDDEN_ORIGIN",
                  message: "Origin is not allowed",
                },
              },
              403,
            );
      return completeRequest(
        response,
        request,
        env,
        correlationId,
        startedAt,
      );
    }
    try {
      const url = new URL(request.url);
      const teamInvitationRevokeRoute = url.pathname.match(
        /^\/v1\/team\/invitations\/([^/]+)\/revoke$/,
      );
      const teamMemberRoleRoute = url.pathname.match(
        /^\/v1\/team\/members\/([^/]+)\/role$/,
      );
      const teamMemberRemoveRoute = url.pathname.match(
        /^\/v1\/team\/members\/([^/]+)\/remove$/,
      );
      const organisationArchiveRoute = url.pathname.match(
        /^\/v1\/organisations\/([^/]+)\/archive$/,
      );
      const quoteBenchMachineRoute = url.pathname === "/v1/integrations/quotebench/events" && request.method === "POST";
      let actorId = "";
      if (quoteBenchMachineRoute) {
        const verified = await verifyQuoteBenchMachineRequest(request, env);
        actorId = verified.actorId;
        request = verified.request;
      } else if (url.pathname.startsWith("/v1/")) {
        actorId = await authenticateRequest(request, neonAccessTokenVerifier(env.NEON_AUTH_URL));
      }
      const commercialResponse = actorId
        ? await handleCommercialRoute(request, env, actorId)
        : null;
      const permanentFileResponse = actorId
        ? await handlePermanentFileRoute(request, env, actorId)
        : null;
      const platformCoreResponse = actorId
        ? await handlePlatformCoreRoute(request, env, actorId)
        : null;
      const practiceManagementResponse = actorId
        ? await handlePracticeManagementRoute(request, env, actorId)
        : null;
      const crmOnboardingResponse = actorId
        ? await handleCrmOnboardingRoute(request, env, actorId)
        : null;
      const clientCollaborationResponse = actorId
        ? await handleClientCollaborationRoute(request, env, actorId)
        : null;
      let response: Response;
      if (url.pathname === "/health")
        response = json({ status: "ok", service: SERVICE_NAME });
      else if (url.pathname === "/ready") response = await serviceReadiness(env);
      else if (url.pathname === "/v1/capabilities")
        response = json({
          accountingCore: "vertical-slice-4",
          database: "neon-postgres-via-hyperdrive",
          artefacts: "r2",
          modules: [
            "tenancy",
            "team-invitations",
            "self-service-onboarding",
            "organisations",
            "organisation-lifecycle",
            "organisation-permanent-file",
            "engagements",
            "csv-import",
            "trial-balance",
            "canonical-mapping",
            "journals",
            "reconciliations",
            "working-papers",
            "governed-working-paper-evidence",
            "workflow-tasks",
            "review-points",
            "disclosures",
            "accounts-versions",
            "accounts-html-artefacts",
            "accounts-pdf-artefacts",
            "accounts-evidence-bundles",
            "reporting-packs",
            "signoffs",
            "filing-evidence",
            "dashboard",
            "audit-ledger",
            "rules",
            "report-provenance",
            "client-portal",
            "integration-metadata",
            "notifications",
            "tenant-lifecycle",
            "tenant-export-requests",
            "comparative-presentation",
            "platform-authorization",
            "platform-teams",
            "canonical-client-master",
            "shared-settings",
            "commercial-entitlements",
            "practice-service-catalogue",
            "practice-engagements",
            "practice-work-management",
            "work-templates",
            "ledgerly-work-link",
            "crm-prospects-opportunities",
            "quotebench-proposal-boundary",
            "proposal-client-conversion",
            "workflow-backed-onboarding",
            "durable-notification-delivery",
            "unified-client-portal",
            "client-requests",
            "portal-document-exchange",
            "secure-portal-messaging",
            "client-confirmations",
          ],
          limitations: {
            externalConnectors: "not-configured",
            xlsxNormalization: "not-implemented",
            exportGeneration: "runner-not-configured",
            outboxPublisher: "publisher-hyperdrive-not-configured",
          },
        });
      else if (permanentFileResponse) response = permanentFileResponse;
      else if (commercialResponse) response = commercialResponse;
      else if (platformCoreResponse) response = platformCoreResponse;
      else if (practiceManagementResponse)
        response = practiceManagementResponse;
      else if (crmOnboardingResponse) response = crmOnboardingResponse;
      else if (clientCollaborationResponse) response = clientCollaborationResponse;
      else if (request.method === "GET" && url.pathname === "/v1/me/tenants")
        response = await listMyTenants(env, actorId);
      else if (request.method === "POST" && url.pathname === "/v1/me/tenants")
        response = await createMyTenant(request, env, actorId);
      else if (
        request.method === "POST" &&
        url.pathname === "/v1/me/invitations/accept"
      )
        response = await acceptTeamInvitation(request, env, actorId);
      else if (request.method === "GET" && url.pathname === "/v1/team")
        response = await listTeam(request, env, actorId);
      else if (
        request.method === "POST" &&
        url.pathname === "/v1/team/invitations"
      )
        response = await createTeamInvitation(request, env, actorId);
      else if (request.method === "POST" && teamInvitationRevokeRoute)
        response = await revokeTeamInvitation(
          request,
          env,
          actorId,
          teamInvitationRevokeRoute[1]!,
        );
      else if (request.method === "POST" && teamMemberRoleRoute)
        response = await manageTeamMember(request, env, actorId, teamMemberRoleRoute[1]!, "SET_ROLE");
      else if (request.method === "POST" && teamMemberRemoveRoute)
        response = await manageTeamMember(request, env, actorId, teamMemberRemoveRoute[1]!, "REMOVE");
      else if (request.method === "GET" && url.pathname === "/v1/organisations")
        response = await listOrganisations(request, env, actorId);
      else if (
        request.method === "POST" &&
        url.pathname === "/v1/organisations"
      )
        response = await createOrganisation(request, env, actorId);
      else if (request.method === "POST" && organisationArchiveRoute)
        response = await archiveOrganisation(
          request,
          env,
          actorId,
          organisationArchiveRoute[1]!,
        );
      else if (request.method === "GET" && url.pathname === "/v1/engagements")
        response = await listEngagements(request, env, actorId);
      else if (request.method === "POST" && url.pathname === "/v1/engagements")
        response = await createEngagement(request, env, actorId);
      else if (
        request.method === "GET" &&
        url.pathname === "/v1/canonical-accounts"
      )
        response = await canonicalAccounts(request, env, actorId);
      else {
        const importRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/imports(?:\/csv)?$/,
        );
        const mappingRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/mappings$/,
        );
        const tbRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/trial-balance$/,
        );
        const reportRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/report$/,
        );
        const reportingPacksRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/reporting-packs$/,
        );
        const historyRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/history$/,
        );
        const journalsRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/journals$/,
        );
        const journalTransitionRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/journals\/([^/]+)\/transitions$/,
        );
        const reconciliationsRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/reconciliations$/,
        );
        const reconciliationReviewRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/reconciliations\/([^/]+)\/review$/,
        );
        const tasksRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/workflow-tasks$/,
        );
        const taskItemRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/workflow-tasks\/([^/]+)$/,
        );
        const reviewPointsRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/review-points$/,
        );
        const reviewPointItemRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/review-points\/([^/]+)$/,
        );
        const dashboardRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/dashboard$/,
        );
        const workingPapersRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers$/,
        );
        const workingPaperGovernanceCatalogueRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-paper-governance\/catalogue$/,
        );
        const workingPaperRisksRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/risks$/,
        );
        const workingPaperRiskItemRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/risks\/([^/]+)$/,
        );
        const workingPaperGovernanceRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/governance$/,
        );
        const workingPaperReportLineLinkRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/report-line-links\/([^/]+)$/,
        );
        const workingPaperAssertionLinkRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/assertion-links\/([^/]+)$/,
        );
        const workingPaperRiskLinkRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/risk-links\/([^/]+)$/,
        );
        const workingPaperThemeLinkRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/theme-links\/([^/]+)$/,
        );
        const workingPaperReportLineReplaceRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/report-line-links\/([^/]+)\/replace$/,
        );
        const workingPaperAssertionReplaceRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/assertion-links\/([^/]+)\/replace$/,
        );
        const workingPaperRiskReplaceRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/risk-links\/([^/]+)\/replace$/,
        );
        const workingPaperThemeReplaceRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/theme-links\/([^/]+)\/replace$/,
        );
        const workingPaperAttachmentsRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/attachments$/,
        );
        const workingPaperAttachmentContentRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/attachments\/([^/]+)\/content$/,
        );
        const workingPaperLibraryRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-paper-library$/,
        );
        const workingPaperLibraryItemRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-paper-library\/([^/]+)$/,
        );
        const workingPaperDeployRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/deploy$/,
        );
        const workingPaperApplicabilityRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/applicability$/,
        );
        const workingPaperVersionsRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/versions$/,
        );
        const workingPaperTransitionRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/working-papers\/([^/]+)\/transitions$/,
        );
        const disclosuresRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/disclosures$/,
        );
        const disclosureItemRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/disclosures\/([^/]+)$/,
        );
        const disclosureVersionsRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/disclosures\/([^/]+)\/versions$/,
        );
        const accountsVersionsRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions$/,
        );
        const accountsVersionGenerateRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions\/generate$/,
        );
        const accountsVersionTransitionRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions\/([^/]+)\/transitions$/,
        );
        const accountsHtmlArtefactRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions\/([^/]+)\/artefacts\/html$/,
        );
        const accountsPdfArtefactRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions\/([^/]+)\/artefacts\/pdf$/,
        );
        const accountsDocxArtefactRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions\/([^/]+)\/artefacts\/docx$/,
        );
        const accountsIxbrlArtefactRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions\/([^/]+)\/artefacts\/ixbrl$/,
        );
        const accountsArtefactCapabilitiesRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions\/([^/]+)\/artefacts\/capabilities$/,
        );
        const evidenceBundleRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions\/([^/]+)\/evidence-bundle\.zip$/,
        );
        const evidenceBundleCapabilitiesRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/accounts-versions\/([^/]+)\/evidence-bundle\/capabilities$/,
        );
        const signoffsRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/signoffs$/,
        );
        const signoffInvalidationRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/signoffs\/([^/]+)\/invalidate$/,
        );
        const filingsRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/filing-attempts$/,
        );
        const filingItemRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/filing-attempts\/([^/]+)$/,
        );
        const filingEvidenceRoute = url.pathname.match(
          /^\/v1\/engagements\/([^/]+)\/filing-attempts\/([^/]+)\/evidence$/,
        );
        if (request.method === "GET" && journalsRoute)
          response = await listJournals(
            request,
            env,
            actorId,
            journalsRoute[1]!,
          );
        else if (request.method === "POST" && journalsRoute)
          response = await createJournal(
            request,
            env,
            actorId,
            journalsRoute[1]!,
          );
        else if (request.method === "POST" && journalTransitionRoute)
          response = await transitionJournal(
            request,
            env,
            actorId,
            journalTransitionRoute[1]!,
            journalTransitionRoute[2]!,
          );
        else if (request.method === "GET" && reconciliationsRoute)
          response = await listReconciliations(
            request,
            env,
            actorId,
            reconciliationsRoute[1]!,
          );
        else if (request.method === "PUT" && reconciliationsRoute)
          response = await putReconciliation(
            request,
            env,
            actorId,
            reconciliationsRoute[1]!,
          );
        else if (request.method === "POST" && reconciliationReviewRoute)
          response = await reviewReconciliation(
            request,
            env,
            actorId,
            reconciliationReviewRoute[1]!,
            reconciliationReviewRoute[2]!,
          );
        else if (request.method === "GET" && tasksRoute)
          response = await listWorkflowTasks(
            request,
            env,
            actorId,
            tasksRoute[1]!,
          );
        else if (request.method === "POST" && tasksRoute)
          response = await createWorkflowTask(
            request,
            env,
            actorId,
            tasksRoute[1]!,
          );
        else if (request.method === "PATCH" && tasksRoute)
          response = await patchWorkflowTask(
            request,
            env,
            actorId,
            tasksRoute[1]!,
          );
        else if (request.method === "PATCH" && taskItemRoute)
          response = await patchWorkflowTask(
            request,
            env,
            actorId,
            taskItemRoute[1]!,
            taskItemRoute[2]!,
          );
        else if (request.method === "GET" && reviewPointsRoute)
          response = await listReviewPoints(
            request,
            env,
            actorId,
            reviewPointsRoute[1]!,
          );
        else if (request.method === "POST" && reviewPointsRoute)
          response = await createReviewPoint(
            request,
            env,
            actorId,
            reviewPointsRoute[1]!,
          );
        else if (request.method === "PATCH" && reviewPointsRoute)
          response = await patchReviewPoint(
            request,
            env,
            actorId,
            reviewPointsRoute[1]!,
          );
        else if (request.method === "PATCH" && reviewPointItemRoute)
          response = await patchReviewPoint(
            request,
            env,
            actorId,
            reviewPointItemRoute[1]!,
            reviewPointItemRoute[2]!,
          );
        else if (request.method === "GET" && dashboardRoute)
          response = await dashboard(request, env, actorId, dashboardRoute[1]!);
        else if (request.method === "GET" && workingPapersRoute)
          response = await listWorkingPapers(
            request,
            env,
            actorId,
            workingPapersRoute[1]!,
          );
        else if (request.method === "POST" && workingPapersRoute)
          response = await createWorkingPaper(
            request,
            env,
            actorId,
            workingPapersRoute[1]!,
          );
        else if (request.method === "GET" && workingPaperGovernanceCatalogueRoute)
          response = await workingPaperGovernanceCatalogue(request,env,actorId,workingPaperGovernanceCatalogueRoute[1]!);
        else if (request.method === "GET" && workingPaperRisksRoute)
          response = await listWorkingPaperRisks(request,env,actorId,workingPaperRisksRoute[1]!);
        else if (request.method === "POST" && workingPaperRisksRoute)
          response = await createWorkingPaperRisk(request,env,actorId,workingPaperRisksRoute[1]!);
        else if (request.method === "PATCH" && workingPaperRiskItemRoute)
          response = await patchWorkingPaperRisk(request,env,actorId,workingPaperRiskItemRoute[1]!,workingPaperRiskItemRoute[2]!);
        else if (request.method === "GET" && workingPaperGovernanceRoute)
          response = await getWorkingPaperGovernance(request,env,actorId,workingPaperGovernanceRoute[1]!,workingPaperGovernanceRoute[2]!);
        else if (request.method === "PUT" && workingPaperReportLineLinkRoute)
          response = await putWorkingPaperGovernanceLink(request,env,actorId,workingPaperReportLineLinkRoute[1]!,workingPaperReportLineLinkRoute[2]!,"report-line",workingPaperReportLineLinkRoute[3]!);
        else if (request.method === "PUT" && workingPaperAssertionLinkRoute)
          response = await putWorkingPaperGovernanceLink(request,env,actorId,workingPaperAssertionLinkRoute[1]!,workingPaperAssertionLinkRoute[2]!,"assertion",workingPaperAssertionLinkRoute[3]!);
        else if (request.method === "PUT" && workingPaperRiskLinkRoute)
          response = await putWorkingPaperGovernanceLink(request,env,actorId,workingPaperRiskLinkRoute[1]!,workingPaperRiskLinkRoute[2]!,"risk",workingPaperRiskLinkRoute[3]!);
        else if (request.method === "PUT" && workingPaperThemeLinkRoute)
          response = await putWorkingPaperGovernanceLink(request,env,actorId,workingPaperThemeLinkRoute[1]!,workingPaperThemeLinkRoute[2]!,"theme",workingPaperThemeLinkRoute[3]!);
        else if (request.method === "POST" && workingPaperReportLineReplaceRoute)
          response = await replaceWorkingPaperGovernanceLink(request,env,actorId,workingPaperReportLineReplaceRoute[1]!,workingPaperReportLineReplaceRoute[2]!,"report-line",workingPaperReportLineReplaceRoute[3]!);
        else if (request.method === "POST" && workingPaperAssertionReplaceRoute)
          response = await replaceWorkingPaperGovernanceLink(request,env,actorId,workingPaperAssertionReplaceRoute[1]!,workingPaperAssertionReplaceRoute[2]!,"assertion",workingPaperAssertionReplaceRoute[3]!);
        else if (request.method === "POST" && workingPaperRiskReplaceRoute)
          response = await replaceWorkingPaperGovernanceLink(request,env,actorId,workingPaperRiskReplaceRoute[1]!,workingPaperRiskReplaceRoute[2]!,"risk",workingPaperRiskReplaceRoute[3]!);
        else if (request.method === "POST" && workingPaperThemeReplaceRoute)
          response = await replaceWorkingPaperGovernanceLink(request,env,actorId,workingPaperThemeReplaceRoute[1]!,workingPaperThemeReplaceRoute[2]!,"theme",workingPaperThemeReplaceRoute[3]!);
        else if (request.method === "GET" && workingPaperAttachmentsRoute)
          response = await listWorkingPaperAttachments(request,env,actorId,workingPaperAttachmentsRoute[1]!,workingPaperAttachmentsRoute[2]!);
        else if (request.method === "POST" && workingPaperAttachmentsRoute)
          response = await uploadWorkingPaperAttachment(request,env,actorId,workingPaperAttachmentsRoute[1]!,workingPaperAttachmentsRoute[2]!);
        else if (request.method === "GET" && workingPaperAttachmentContentRoute)
          response = await downloadWorkingPaperAttachment(request,env,actorId,workingPaperAttachmentContentRoute[1]!,workingPaperAttachmentContentRoute[2]!,workingPaperAttachmentContentRoute[3]!);
        else if (request.method === "GET" && workingPaperLibraryRoute)
          response = await listWorkingPaperLibrary(
            request,
            env,
            actorId,
            workingPaperLibraryRoute[1]!,
          );
        else if (request.method === "POST" && workingPaperLibraryRoute)
          response = await createCustomWorkingPaperTemplate(
            request,
            env,
            actorId,
            workingPaperLibraryRoute[1]!,
          );
        else if (request.method === "PUT" && workingPaperLibraryItemRoute)
          response = await putWorkingPaperLibraryOverride(
            request,
            env,
            actorId,
            workingPaperLibraryItemRoute[1]!,
            workingPaperLibraryItemRoute[2]!,
          );
        else if (request.method === "POST" && workingPaperDeployRoute)
          response = await deployWorkingPaperLibrary(
            request,
            env,
            actorId,
            workingPaperDeployRoute[1]!,
          );
        else if (request.method === "PATCH" && workingPaperApplicabilityRoute)
          response = await setWorkingPaperApplicability(
            request,
            env,
            actorId,
            workingPaperApplicabilityRoute[1]!,
            workingPaperApplicabilityRoute[2]!,
          );
        else if (request.method === "GET" && workingPaperVersionsRoute)
          response = await listWorkingPaperVersions(
            request,
            env,
            actorId,
            workingPaperVersionsRoute[1]!,
            workingPaperVersionsRoute[2]!,
          );
        else if (request.method === "POST" && workingPaperVersionsRoute)
          response = await createWorkingPaperVersion(
            request,
            env,
            actorId,
            workingPaperVersionsRoute[1]!,
            workingPaperVersionsRoute[2]!,
          );
        else if (request.method === "POST" && workingPaperTransitionRoute)
          response = await transitionWorkingPaper(
            request,
            env,
            actorId,
            workingPaperTransitionRoute[1]!,
            workingPaperTransitionRoute[2]!,
          );
        else if (request.method === "GET" && disclosuresRoute)
          response = await listDisclosures(
            request,
            env,
            actorId,
            disclosuresRoute[1]!,
          );
        else if (request.method === "POST" && disclosuresRoute)
          response = await createDisclosure(
            request,
            env,
            actorId,
            disclosuresRoute[1]!,
          );
        else if (request.method === "PATCH" && disclosureItemRoute)
          response = await patchDisclosure(
            request,
            env,
            actorId,
            disclosureItemRoute[1]!,
            disclosureItemRoute[2]!,
          );
        else if (request.method === "GET" && disclosureVersionsRoute)
          response = await listDisclosureVersions(
            request,
            env,
            actorId,
            disclosureVersionsRoute[1]!,
            disclosureVersionsRoute[2]!,
          );
        else if (request.method === "POST" && disclosureVersionsRoute)
          response = await createDisclosureVersion(
            request,
            env,
            actorId,
            disclosureVersionsRoute[1]!,
            disclosureVersionsRoute[2]!,
          );
        else if (request.method === "GET" && accountsVersionsRoute)
          response = await listAccountsVersions(
            request,
            env,
            actorId,
            accountsVersionsRoute[1]!,
          );
        else if (request.method === "POST" && accountsVersionGenerateRoute)
          response = await generateAccountsVersion(
            request,
            env,
            actorId,
            accountsVersionGenerateRoute[1]!,
          );
        else if (request.method === "POST" && accountsVersionTransitionRoute)
          response = await transitionAccountsVersion(
            request,
            env,
            actorId,
            accountsVersionTransitionRoute[1]!,
            accountsVersionTransitionRoute[2]!,
          );
        else if (request.method === "POST" && accountsHtmlArtefactRoute)
          response = await generateAccountsHtml(
            request,
            env,
            actorId,
            accountsHtmlArtefactRoute[1]!,
            accountsHtmlArtefactRoute[2]!,
          );
        else if (request.method === "GET" && accountsHtmlArtefactRoute)
          response = await getAccountsHtml(
            request,
            env,
            actorId,
            accountsHtmlArtefactRoute[1]!,
            accountsHtmlArtefactRoute[2]!,
          );
        else if (request.method === "POST" && accountsPdfArtefactRoute)
          response = await generateAccountsPdf(
            request,
            env,
            actorId,
            accountsPdfArtefactRoute[1]!,
            accountsPdfArtefactRoute[2]!,
          );
        else if (request.method === "GET" && accountsPdfArtefactRoute)
          response = await getAccountsPdf(
            request,
            env,
            actorId,
            accountsPdfArtefactRoute[1]!,
            accountsPdfArtefactRoute[2]!,
          );
        else if (request.method === "POST" && accountsDocxArtefactRoute)
          response = await generateAccountsDocx(
            request,
            env,
            actorId,
            accountsDocxArtefactRoute[1]!,
            accountsDocxArtefactRoute[2]!,
          );
        else if (request.method === "GET" && accountsDocxArtefactRoute)
          response = await getAccountsDocx(
            request,
            env,
            actorId,
            accountsDocxArtefactRoute[1]!,
            accountsDocxArtefactRoute[2]!,
          );
        else if (request.method === "POST" && accountsIxbrlArtefactRoute)
          response = await unavailableAccountsArtefact(
            request,
            env,
            actorId,
            accountsIxbrlArtefactRoute[1]!,
            accountsIxbrlArtefactRoute[2]!,
            "ixbrl",
          );
        else if (request.method === "GET" && accountsArtefactCapabilitiesRoute)
          response = (await accountsArtefactCapabilities(
            request,
            env,
            actorId,
            accountsArtefactCapabilitiesRoute[1]!,
            accountsArtefactCapabilitiesRoute[2]!,
          )) as Response;
        else if (request.method === "GET" && evidenceBundleCapabilitiesRoute)
          response = await evidenceBundleCapability(
            request,
            env,
            actorId,
            evidenceBundleCapabilitiesRoute[1]!,
            evidenceBundleCapabilitiesRoute[2]!,
          );
        else if (request.method === "GET" && evidenceBundleRoute)
          response = await downloadEvidenceBundle(
            request,
            env,
            actorId,
            evidenceBundleRoute[1]!,
            evidenceBundleRoute[2]!,
          );
        else if (request.method === "GET" && signoffsRoute)
          response = await listSignoffs(
            request,
            env,
            actorId,
            signoffsRoute[1]!,
          );
        else if (request.method === "POST" && signoffsRoute)
          response = await createSignoff(
            request,
            env,
            actorId,
            signoffsRoute[1]!,
          );
        else if (request.method === "POST" && signoffInvalidationRoute)
          response = await invalidateSignoff(
            request,
            env,
            actorId,
            signoffInvalidationRoute[1]!,
            signoffInvalidationRoute[2]!,
          );
        else if (request.method === "GET" && filingsRoute)
          response = await listFilingAttempts(
            request,
            env,
            actorId,
            filingsRoute[1]!,
          );
        else if (request.method === "POST" && filingsRoute)
          response = await createFilingAttempt(
            request,
            env,
            actorId,
            filingsRoute[1]!,
          );
        else if (request.method === "POST" && filingEvidenceRoute)
          response = await recordFilingEvidence(
            request,
            env,
            actorId,
            filingEvidenceRoute[1]!,
            filingEvidenceRoute[2]!,
          );
        else if (request.method === "PATCH" && filingItemRoute)
          response = await patchFilingAttempt(
            request,
            env,
            actorId,
            filingItemRoute[1]!,
            filingItemRoute[2]!,
          );
        else if (request.method === "POST" && importRoute)
          response = await importCsv(request, env, actorId, importRoute[1]!);
        else if (request.method === "POST" && mappingRoute)
          response = await mapAccount(request, env, actorId, mappingRoute[1]!);
        else if (request.method === "GET" && tbRoute)
          response = await engagementTrialBalance(
            request,
            env,
            actorId,
            tbRoute[1]!,
          );
        else if (request.method === "GET" && reportRoute)
          response = await report(request, env, actorId, reportRoute[1]!);
        else if (request.method === "GET" && reportingPacksRoute)
          response = await listReportingPacks(
            request,
            env,
            actorId,
            reportingPacksRoute[1]!,
          );
        else if (request.method === "GET" && historyRoute)
          response = await auditHistory(
            request,
            env,
            actorId,
            historyRoute[1]!,
          );
        else
          response = json(
            { error: { code: "NOT_FOUND", message: "Route not found" } },
            404,
          );
      }
      return completeRequest(
        response,
        request,
        env,
        correlationId,
        startedAt,
      );
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(500, "INTERNAL_ERROR", "Request failed");
      console.error(
        JSON.stringify({
          message: "request failed",
          correlationId,
          code: apiError.code,
          error: error instanceof Error ? error.message : String(error),
          path: new URL(request.url).pathname,
        }),
      );
      return completeRequest(
        json(
          { error: { code: apiError.code, message: apiError.message } },
          apiError.status,
        ),
        request,
        env,
        correlationId,
        startedAt,
      );
    }
  },
} satisfies ExportedHandler<Env>;
