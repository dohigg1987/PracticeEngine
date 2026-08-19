import postgres, { type Sql, type TransactionSql } from "postgres";
import { ApiError, parseTrialBalanceCsv, requireObject, requiredString } from "./core.js";
import { LIFECYCLE_TRANSITIONS, safeCommercialConfiguration as checkedCommercialConfiguration } from "./commercial-contracts.js";

type Database = Sql<Record<string, never>>;
type Transaction = TransactionSql<Record<string, never>>;
type JsonMetadata = { readonly [key: string]: postgres.JSONValue | undefined };
interface CommercialContext { tenantId: string; actorId: string; correlationId: string }
const MAX_JSON_BYTES = 64 * 1024;
const MAX_CLIENT_DOCUMENT_BYTES = 10 * 1024 * 1024;
const CLIENT_ROLES = ["CLIENT_PREPARER", "CLIENT_APPROVER", "CLIENT_VIEWER"] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}
function database(env: Env): Database {
  return postgres(env.HYPERDRIVE.connectionString, { prepare: false, max: 5 });
}
function requestContext(request: Request, actorId: string): CommercialContext {
  const tenantId = request.headers.get("x-tenant-id");
  if (!tenantId) throw new ApiError(400, "TENANT_REQUIRED", "A tenant selection is required");
  return { tenantId, actorId, correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID() };
}
async function withTenant<T>(sql: Database, ctx: CommercialContext, operation: (tx: Transaction) => Promise<T>): Promise<T> {
  const result = await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id',${ctx.tenantId},true),set_config('app.actor_id',${ctx.actorId},true)`;
    return { value: await operation(tx) };
  });
  return result.value;
}
async function withActor<T>(sql: Database, actorId: string, operation: (tx: Transaction) => Promise<T>): Promise<T> {
  const result = await sql.begin(async (tx) => {
    await tx`select set_config('app.actor_id',${actorId},true)`;
    return { value: await operation(tx) };
  });
  return result.value;
}
async function boundedBytes(request: Request, maximum: number, label: string): Promise<ArrayBuffer> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maximum) throw new ApiError(413, "PAYLOAD_TOO_LARGE", `${label} is too large`);
  if (!request.body) throw new ApiError(400, "BODY_REQUIRED", "Request body is required");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel("payload too large");
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", `${label} is too large`);
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output.buffer;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "application/json is required");
  try { return requireObject(JSON.parse(new TextDecoder().decode(await boundedBytes(request, MAX_JSON_BYTES, "JSON body")))); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "INVALID_JSON", "Request body is not valid JSON"); }
}
function boundedString(input: Record<string, unknown>, field: string, maximum: number): string {
  const value = requiredString(input, field);
  if (value.length > maximum || /[\u0000-\u001f\u007f]/.test(value))
    throw new ApiError(400, "INVALID_REQUEST", `${field} must be at most ${maximum} characters and contain no control characters`);
  return value;
}
function optionalString(input: Record<string, unknown>, field: string, maximum: number): string | null {
  const value = input[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "INVALID_REQUEST", `${field} must be a string`);
  const result = value.trim();
  if (result.length > maximum || /[\u0000-\u001f\u007f]/.test(result))
    throw new ApiError(400, "INVALID_REQUEST", `${field} must be at most ${maximum} characters and contain no control characters`);
  return result || null;
}
function enumValue<T extends string>(input: Record<string, unknown>, field: string, values: readonly T[]): T {
  const value = input[field];
  if (typeof value !== "string" || !values.includes(value as T))
    throw new ApiError(400, "INVALID_REQUEST", `${field} must be one of ${values.join(", ")}`);
  return value as T;
}
export function safeCommercialConfiguration(value: unknown): Record<string, unknown> {
  try { return checkedCommercialConfiguration(value); }
  catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_CONFIGURATION";
    if (code === "CONFIGURATION_TOO_LARGE") throw new ApiError(413, code, "Configuration is too large");
    if (code === "SECRET_CONFIGURATION_FORBIDDEN") throw new ApiError(400, code, "Configuration must not contain credentials or secrets");
    throw new ApiError(400, "INVALID_CONFIGURATION", "Configuration must be a JSON object");
  }
}
async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function deleteR2ObjectSafely(env: Env, key: string, reason: string): Promise<void> {
  try { await env.ARTEFACTS.delete(key); }
  catch (error) { console.error(JSON.stringify({ event: "r2_orphan_cleanup_failed", reason, key, error: error instanceof Error ? error.message : String(error) })); }
}
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32)); let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function tokenHash(token: string): Promise<string> {
  return hashBytes(new TextEncoder().encode(token).buffer as ArrayBuffer);
}
async function tenantRole(tx: Transaction, ctx: CommercialContext): Promise<string> {
  const rows = await tx`select role_code from tenant_member where tenant_id=${ctx.tenantId} and actor_id=${ctx.actorId}`;
  if (!rows.length) throw new ApiError(403, "FORBIDDEN", "Actor is not a member of this tenant");
  return String(rows[0]!.role_code);
}
async function staffEngagement(tx: Transaction, ctx: CommercialContext, engagementId: string, write = false): Promise<{ organisationId: string; role: string }> {
  const memberRole = await tenantRole(tx, ctx);
  const rows = await tx`select e.organisation_id,em.role_code from engagement e left join engagement_member em on em.tenant_id=e.tenant_id and em.engagement_id=e.id and em.actor_id=${ctx.actorId} where e.tenant_id=${ctx.tenantId} and e.id=${engagementId} order by case em.role_code when 'PARTNER' then 1 when 'MANAGER' then 2 when 'REVIEWER' then 3 when 'PREPARER' then 4 else 9 end limit 1`;
  if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Engagement not found");
  const role = memberRole === "OWNER" || memberRole === "ADMIN" ? memberRole : String(rows[0]!.role_code ?? "");
  if (!role) throw new ApiError(403, "FORBIDDEN", "Actor is not assigned to this engagement");
  if (write && !["OWNER", "ADMIN", "PARTNER", "MANAGER"].includes(role))
    throw new ApiError(403, "FORBIDDEN", "Manager access is required");
  return { organisationId: String(rows[0]!.organisation_id), role };
}
async function appendStaffEvent(tx: Transaction, ctx: CommercialContext, scope: { organisationId: string | null; engagementId: string | null }, eventType: string, objectType: string, objectId: string, metadata: JsonMetadata): Promise<void> {
  await tx`select id from tenant where id=${ctx.tenantId} for update`;
  const prior = await tx`select event_hash from audit_event where tenant_id=${ctx.tenantId} order by occurred_at_utc desc,event_id desc limit 1`;
  const occurredAt = new Date().toISOString(), previousHash = prior[0]?.event_hash ? String(prior[0].event_hash) : null, eventId = crypto.randomUUID();
  const eventHash = await hashBytes(new TextEncoder().encode(JSON.stringify({ eventId, occurredAt, tenantId: ctx.tenantId, actorId: ctx.actorId, eventType, objectType, objectId, previousHash, metadata })).buffer as ArrayBuffer);
  await tx`insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,organisation_id,engagement_id,actor_type,actor_id,event_type,object_type,object_id,previous_hash,correlation_id,metadata,event_hash) values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${scope.organisationId},${scope.engagementId},'USER',${ctx.actorId},${eventType},${objectType},${objectId},${previousHash},${ctx.correlationId},${tx.json(metadata)},${eventHash})`;
  await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key) values(${crypto.randomUUID()},${ctx.tenantId},${objectType},${objectId},${eventType},${tx.json(metadata)},${ctx.correlationId},${`${ctx.correlationId}:${eventType}:${objectId}`})`;
}
async function appendClientResponseEvent(tx: Transaction, ctx: CommercialContext, engagementId: string, responseId: string, eventType: string, metadata: JsonMetadata): Promise<void> {
  const occurredAt = new Date().toISOString(), eventId = crypto.randomUUID();
  const eventHash = await hashBytes(new TextEncoder().encode(JSON.stringify({ eventId, occurredAt, tenantId: ctx.tenantId, actorId: ctx.actorId, eventType, responseId, metadata })).buffer as ArrayBuffer);
  await tx`insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,engagement_id,actor_type,actor_id,event_type,object_type,object_id,correlation_id,metadata,event_hash) values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${engagementId},'CLIENT',${ctx.actorId},${eventType},'CLIENT_DOCUMENT_RESPONSE',${responseId},${ctx.correlationId},${tx.json(metadata)},${eventHash})`;
  await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key) values(${crypto.randomUUID()},${ctx.tenantId},'CLIENT_DOCUMENT_RESPONSE',${responseId},${eventType},${tx.json(metadata)},${ctx.correlationId},${`${ctx.correlationId}:${eventType}:${responseId}`})`;
}

function contactItem(row: Record<string, unknown>) {
  return { id: String(row.id), displayName: String(row.display_name), email: String(row.email_normalized), accessRole: String(row.access_role), contactStatus: String(row.contact_status), accessStatus: String(row.access_status), createdAt: String(row.created_at), updatedAt: String(row.updated_at), invitation: row.invitation_id ? { id: String(row.invitation_id), status: row.accepted_at ? "ACCEPTED" : row.revoked_at ? "REVOKED" : new Date(String(row.expires_at)).valueOf() <= Date.now() ? "EXPIRED" : "ACTIVE", expiresAt: String(row.expires_at) } : null };
}
async function listPortalContacts(request: Request, env: Env, actorId: string, engagementId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), sql = database(env);
  try { return await withTenant(sql, ctx, async (tx) => {
    await staffEngagement(tx, ctx, engagementId);
    const rows = await tx`select c.id,c.display_name,c.email_normalized,c.status as contact_status,a.access_role,a.status as access_status,c.created_at,a.updated_at,i.id as invitation_id,i.expires_at,i.accepted_at,i.revoked_at from client_engagement_access a join client_contact c on c.tenant_id=a.tenant_id and c.id=a.client_contact_id left join lateral(select invitation.id,invitation.expires_at,invitation.accepted_at,invitation.revoked_at from client_portal_invitation invitation where invitation.tenant_id=a.tenant_id and invitation.client_engagement_access_id=a.id order by invitation.created_at desc limit 1)i on true where a.tenant_id=${ctx.tenantId} and a.engagement_id=${engagementId} order by c.display_name,c.id`;
    return json({ items: rows.map(contactItem) });
  }); } finally { await sql.end(); }
}
async function createPortalContact(request: Request, env: Env, actorId: string, engagementId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), displayName = boundedString(input, "displayName", 160), email = boundedString(input, "email", 320).toLowerCase(), accessRole = enumValue(input, "accessRole", CLIENT_ROLES), sql = database(env);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "INVALID_EMAIL", "email must be valid");
  try { const item = await withTenant(sql, ctx, async (tx) => {
    const engagement = await staffEngagement(tx, ctx, engagementId, true); await tx`select id from engagement where tenant_id=${ctx.tenantId} and id=${engagementId} for update`;
    let contacts = await tx`select id,organisation_id from client_contact where tenant_id=${ctx.tenantId} and email_normalized=${email}`;
    if (contacts.length && String(contacts[0]!.organisation_id) !== engagement.organisationId)
      throw new ApiError(409, "CLIENT_CONTACT_ORGANISATION_CONFLICT", "This email belongs to a contact for another organisation");
    const contactId = contacts.length ? String(contacts[0]!.id) : crypto.randomUUID();
    if (!contacts.length) await tx`insert into client_contact(id,tenant_id,organisation_id,display_name,email_normalized,created_by) values(${contactId},${ctx.tenantId},${engagement.organisationId},${displayName},${email},${ctx.actorId})`;
    const existing = await tx`select id from client_engagement_access where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and client_contact_id=${contactId}`;
    if (existing.length) throw new ApiError(409, "CLIENT_ACCESS_EXISTS", "This contact already has engagement access");
    const accessId = crypto.randomUUID();
    await tx`insert into client_engagement_access(id,tenant_id,engagement_id,client_contact_id,access_role,granted_by) values(${accessId},${ctx.tenantId},${engagementId},${contactId},${accessRole},${ctx.actorId})`;
    await appendStaffEvent(tx, ctx, { organisationId: engagement.organisationId, engagementId }, "CLIENT_PORTAL_ACCESS_CREATED", "CLIENT_ENGAGEMENT_ACCESS", accessId, { contactId, accessRole });
    const rows = await tx`select c.id,c.display_name,c.email_normalized,c.status as contact_status,a.access_role,a.status as access_status,c.created_at,a.updated_at,null::uuid as invitation_id,null::timestamptz as expires_at,null::timestamptz as accepted_at,null::timestamptz as revoked_at from client_engagement_access a join client_contact c on c.tenant_id=a.tenant_id and c.id=a.client_contact_id where a.id=${accessId} and a.tenant_id=${ctx.tenantId}`;
    return contactItem(rows[0]!);
  }); return json({ item }, 201); } finally { await sql.end(); }
}
async function createPortalInvitation(request: Request, env: Env, actorId: string, engagementId: string, contactId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), expiresInHours = input.expiresInHours === undefined ? 72 : Number(input.expiresInHours);
  if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) throw new ApiError(400, "INVALID_REQUEST", "expiresInHours must be an integer from 1 to 168");
  const token = newToken(), hash = await tokenHash(token), invitationId = crypto.randomUUID(), sql = database(env);
  try { const item = await withTenant(sql, ctx, async (tx) => {
    const engagement = await staffEngagement(tx, ctx, engagementId, true);
    const access = await tx`select id,status from client_engagement_access where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and client_contact_id=${contactId} for update`;
    if (!access.length) throw new ApiError(404, "NOT_FOUND", "Client contact access not found");
    if (String(access[0]!.status) !== "INVITED") throw new ApiError(409, "CLIENT_ACCESS_NOT_INVITED", "Only invited access can receive a new invitation");
    const active = await tx`select count(*)::int as count from client_portal_invitation where tenant_id=${ctx.tenantId} and client_engagement_access_id=${access[0]!.id} and accepted_at is null and revoked_at is null and expires_at>now()`;
    if (Number(active[0]!.count) >= 3) throw new ApiError(429, "INVITATION_LIMIT_REACHED", "Too many active invitations exist");
    const inserted = await tx`insert into client_portal_invitation(id,tenant_id,client_engagement_access_id,token_hash,created_by,expires_at) values(${invitationId},${ctx.tenantId},${access[0]!.id},${hash},${ctx.actorId},now()+(${expiresInHours}::int*interval '1 hour')) returning id,client_engagement_access_id,created_at,expires_at`;
    await appendStaffEvent(tx, ctx, { organisationId: engagement.organisationId, engagementId }, "CLIENT_PORTAL_INVITATION_CREATED", "CLIENT_PORTAL_INVITATION", invitationId, { contactId, expiresAt: inserted[0]!.expires_at });
    return { id: invitationId, contactId, status: "ACTIVE", createdAt: String(inserted[0]!.created_at), expiresAt: String(inserted[0]!.expires_at) };
  }); const inviteUrl = new URL("/client-invite", env.WEB_ORIGIN); inviteUrl.hash = `token=${token}`; return json({ item, token, inviteUrl: inviteUrl.toString() }, 201); } finally { await sql.end(); }
}
async function updatePortalAccess(request: Request, env: Env, actorId: string, engagementId: string, contactId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), status = enumValue(input, "status", ["ACTIVE", "SUSPENDED", "REVOKED"] as const), reason = optionalString(input, "reason", 1000), sql = database(env);
  const allowed: Record<string, readonly string[]> = { INVITED: ["SUSPENDED", "REVOKED"], ACTIVE: ["SUSPENDED", "REVOKED"], SUSPENDED: ["ACTIVE", "REVOKED"], REVOKED: [] };
  try { const item = await withTenant(sql, ctx, async (tx) => {
    const engagement = await staffEngagement(tx, ctx, engagementId, true), rows = await tx`select id,status,access_role from client_engagement_access where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and client_contact_id=${contactId} for update`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Client contact access not found");
    const current = String(rows[0]!.status); if (!(allowed[current] ?? []).includes(status)) throw new ApiError(409, "CLIENT_ACCESS_TRANSITION_NOT_ALLOWED", `Cannot transition client access from ${current} to ${status}`);
    const updated = await tx`update client_engagement_access set status=${status},updated_at=now(),revoked_by=case when ${status}='REVOKED' then ${ctx.actorId} else revoked_by end,revoked_at=case when ${status}='REVOKED' then now() else revoked_at end where tenant_id=${ctx.tenantId} and id=${rows[0]!.id} returning id,access_role,status,updated_at,revoked_at`;
    if (status === "REVOKED") await tx`update client_portal_invitation set revoked_by=${ctx.actorId},revoked_at=now() where tenant_id=${ctx.tenantId} and client_engagement_access_id=${rows[0]!.id} and accepted_at is null and revoked_at is null`;
    await appendStaffEvent(tx, ctx, { organisationId: engagement.organisationId, engagementId }, "CLIENT_PORTAL_ACCESS_CHANGED", "CLIENT_ENGAGEMENT_ACCESS", String(rows[0]!.id), { contactId, fromStatus: current, toStatus: status, reason });
    return { id: String(updated[0]!.id), contactId, accessRole: String(updated[0]!.access_role), status: String(updated[0]!.status), updatedAt: String(updated[0]!.updated_at), revokedAt: updated[0]!.revoked_at ? String(updated[0]!.revoked_at) : null };
  }); return json({ item }); } finally { await sql.end(); }
}
async function acceptPortalInvitation(request: Request, env: Env, actorId: string): Promise<Response> {
  const input = await body(request), token = boundedString(input, "token", 80);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(400, "INVALID_REQUEST", "token is invalid");
  const sql = database(env);
  try { const result = await withActor(sql, actorId, async (tx) => {
    const rows = await tx`select invitation_id,tenant_id,engagement_id,client_contact_id,access_id,access_role,accepted from accept_client_portal_invitation(${await tokenHash(token)}::text)`;
    if (!rows.length) throw new ApiError(410, "INVITATION_UNAVAILABLE", "The invitation is unavailable, expired, revoked, or already used");
    const row = rows[0]!; return { item: { tenantId: String(row.tenant_id), engagementId: String(row.engagement_id), contactId: String(row.client_contact_id), accessId: String(row.access_id), accessRole: String(row.access_role) }, accepted: Boolean(row.accepted) };
  }); return json(result, result.accepted ? 201 : 200); } finally { await sql.end(); }
}
async function listClientAccess(env: Env, actorId: string): Promise<Response> {
  const sql = database(env);
  try { return await withActor(sql, actorId, async (tx) => json({ items: (await tx`select * from list_authenticated_client_access()`).map((row) => ({ tenantId: String(row.tenant_id), tenantName: String(row.tenant_name), organisationId: String(row.organisation_id), organisationName: String(row.organisation_name), engagementId: String(row.engagement_id), periodStart: String(row.period_start), periodEnd: String(row.period_end), contactId: String(row.client_contact_id), accessId: String(row.access_id), accessRole: String(row.access_role) })) })); } finally { await sql.end(); }
}

function documentRequestItem(row: Record<string, unknown>) {
  return { id: String(row.id), contactId: String(row.client_contact_id), title: String(row.title), description: row.description ? String(row.description) : null, status: String(row.status), dueAt: row.due_at ? String(row.due_at) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at), latestResponse: row.response_id ? { id: String(row.response_id), version: Number(row.version_no), filename: String(row.original_filename), contentType: String(row.media_type), byteSize: Number(row.byte_size), contentHash: String(row.content_hash), submittedAt: String(row.submitted_at), review: row.review_id ? { id: String(row.review_id), decision: String(row.decision), reason: row.review_reason ? String(row.review_reason) : null, reviewedAt: String(row.reviewed_at) } : null } : null };
}
async function documentRows(tx: Transaction, ctx: CommercialContext, engagementId: string) {
  return tx`select r.*,response.id as response_id,response.version_no,response.original_filename,response.media_type,response.byte_size,response.content_hash,response.submitted_at,review.id as review_id,review.decision,review.reason as review_reason,review.reviewed_at from client_document_request r left join lateral(select * from client_document_response cr where cr.tenant_id=r.tenant_id and cr.document_request_id=r.id order by cr.version_no desc limit 1)response on true left join client_document_review review on review.tenant_id=r.tenant_id and review.document_response_id=response.id where r.tenant_id=${ctx.tenantId} and r.engagement_id=${engagementId} order by r.created_at desc,r.id`;
}
async function listDocuments(request: Request, env: Env, actorId: string, engagementId: string, client = false): Promise<Response> {
  const ctx = requestContext(request, actorId), sql = database(env);
  try { return await withTenant(sql, ctx, async (tx) => {
    if (client) { const access = await tx`select 1 from client_engagement_access a join client_portal_identity i on i.tenant_id=a.tenant_id and i.client_contact_id=a.client_contact_id where a.tenant_id=${ctx.tenantId} and a.engagement_id=${engagementId} and a.status='ACTIVE' and i.auth_actor_id=${ctx.actorId}`; if (!access.length) throw new ApiError(403, "FORBIDDEN", "Active client access is required"); }
    else await staffEngagement(tx, ctx, engagementId);
    return json({ items: (await documentRows(tx, ctx, engagementId)).map(documentRequestItem) });
  }); } finally { await sql.end(); }
}
async function createDocumentRequest(request: Request, env: Env, actorId: string, engagementId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), contactId = boundedString(input, "contactId", 36), title = boundedString(input, "title", 200), description = optionalString(input, "description", 4000), dueAt = optionalString(input, "dueAt", 64), sql = database(env), id = crypto.randomUUID();
  if (dueAt && !Number.isFinite(new Date(dueAt).valueOf())) throw new ApiError(400, "INVALID_REQUEST", "dueAt must be an ISO timestamp");
  try { const item = await withTenant(sql, ctx, async (tx) => {
    const engagement = await staffEngagement(tx, ctx, engagementId, true);
    const access = await tx`select 1 from client_engagement_access where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and client_contact_id=${contactId} and status in ('INVITED','ACTIVE')`;
    if (!access.length) throw new ApiError(404, "NOT_FOUND", "Client contact access not found");
    const inserted = await tx`insert into client_document_request(id,tenant_id,engagement_id,client_contact_id,title,description,due_at,requested_by) values(${id},${ctx.tenantId},${engagementId},${contactId},${title},${description},${dueAt},${ctx.actorId}) returning *`;
    await appendStaffEvent(tx, ctx, { organisationId: engagement.organisationId, engagementId }, "CLIENT_DOCUMENT_REQUEST_CREATED", "CLIENT_DOCUMENT_REQUEST", id, { contactId, title, dueAt });
    return documentRequestItem(inserted[0]!);
  }); return json({ item }, 201); } finally { await sql.end(); }
}
async function reviewDocument(request: Request, env: Env, actorId: string, engagementId: string, requestId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), responseId = boundedString(input, "responseId", 36), decision = enumValue(input, "decision", ["APPROVED", "REJECTED"] as const), reason = optionalString(input, "reason", 2000), sql = database(env);
  if (decision === "REJECTED" && !reason) throw new ApiError(400, "CLIENT_REJECTION_REASON_REQUIRED", "A rejection reason is required");
  try { const item = await withTenant(sql, ctx, async (tx) => {
    const engagement = await staffEngagement(tx, ctx, engagementId);
    if (!["OWNER", "ADMIN", "PARTNER", "MANAGER", "REVIEWER"].includes(engagement.role))
      throw new ApiError(403, "FORBIDDEN", "Reviewer access is required");
    const requests = await tx`select id,status from client_document_request where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and id=${requestId} for update`;
    if (!requests.length) throw new ApiError(404, "NOT_FOUND", "Document request not found");
    if (String(requests[0]!.status) !== "RESPONDED") throw new ApiError(409, "CLIENT_RESPONSE_DECISION_NOT_ALLOWED", "Only a responded request can be reviewed");
    const responses = await tx`select id,submitted_by,content_hash,version_no from client_document_response where tenant_id=${ctx.tenantId} and document_request_id=${requestId} and id=${responseId}`;
    if (!responses.length) throw new ApiError(404, "NOT_FOUND", "Document response not found");
    if (String(responses[0]!.submitted_by) === ctx.actorId) throw new ApiError(409, "CLIENT_RESPONSE_SEGREGATION_REQUIRED", "The response submitter cannot review it");
    const reviewId = crypto.randomUUID();
    await tx`insert into client_document_review(id,tenant_id,document_request_id,document_response_id,decision,reviewed_by,reason,evidence) values(${reviewId},${ctx.tenantId},${requestId},${responseId},${decision},${ctx.actorId},${reason},${JSON.stringify({ contentHash: responses[0]!.content_hash, responseVersion: responses[0]!.version_no })}::jsonb)`;
    await tx`update client_document_request set status=${decision},updated_at=now() where tenant_id=${ctx.tenantId} and id=${requestId}`;
    await appendStaffEvent(tx, ctx, { organisationId: engagement.organisationId, engagementId }, "CLIENT_DOCUMENT_RESPONSE_REVIEWED", "CLIENT_DOCUMENT_REVIEW", reviewId, { requestId, responseId, decision, reason });
    return { id: reviewId, requestId, responseId, decision, reason, reviewedBy: ctx.actorId };
  }); return json({ item }, 201); } finally { await sql.end(); }
}
async function cancelDocumentRequest(request: Request, env: Env, actorId: string, engagementId: string, requestId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), reason = boundedString(input, "reason", 1000), sql = database(env);
  try { const item = await withTenant(sql, ctx, async (tx) => {
    const engagement = await staffEngagement(tx, ctx, engagementId, true), rows = await tx`select id,status from client_document_request where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} and id=${requestId} for update`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Document request not found");
    if (!["OPEN", "REJECTED"].includes(String(rows[0]!.status))) throw new ApiError(409, "CLIENT_REQUEST_CANCEL_NOT_ALLOWED", "Only an open or rejected request can be cancelled");
    const updated = await tx`update client_document_request set status='CANCELLED',updated_at=now() where tenant_id=${ctx.tenantId} and id=${requestId} returning *`;
    await appendStaffEvent(tx, ctx, { organisationId: engagement.organisationId, engagementId }, "CLIENT_DOCUMENT_REQUEST_CANCELLED", "CLIENT_DOCUMENT_REQUEST", requestId, { reason });
    return documentRequestItem(updated[0]!);
  }); return json({ item }); } finally { await sql.end(); }
}
async function uploadClientResponse(request: Request, env: Env, actorId: string, requestId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "multipart/form-data is required");
  const form = await new Response(await boundedBytes(request, MAX_CLIENT_DOCUMENT_BYTES + 64 * 1024, "Client document upload"), { headers: { "content-type": contentType } }).formData(), file = form.get("file"), note = typeof form.get("note") === "string" ? String(form.get("note")).trim().slice(0, 2000) : null;
  if (!(file instanceof File)) throw new ApiError(400, "FILE_REQUIRED", 'Multipart field "file" is required');
  if (file.size < 1 || file.size > MAX_CLIENT_DOCUMENT_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Client document file is too large");
  const filename = file.name.trim();
  if (!filename || filename.length > 180 || /[\u0000-\u001f\u007f\\/]/.test(filename)) throw new ApiError(400, "INVALID_FILENAME", "The filename is invalid");
  const acceptedTypes = new Set(["application/pdf", "application/zip", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "text/csv", "text/plain"]);
  if (!acceptedTypes.has(file.type.toLowerCase())) throw new ApiError(415, "UNSUPPORTED_DOCUMENT_TYPE", "The client document file type is not supported");
  const bytes = await file.arrayBuffer(), contentHash = await hashBytes(bytes), responseId = crypto.randomUUID(), sql = database(env);
  let uploadedKey: string | null = null;
  try {
    const source = await withTenant(sql, ctx, async (tx) => {
      const rows = await tx`select r.engagement_id,r.status,a.access_role from client_document_request r join client_portal_identity i on i.tenant_id=r.tenant_id and i.client_contact_id=r.client_contact_id join client_engagement_access a on a.tenant_id=i.tenant_id and a.client_contact_id=i.client_contact_id and a.engagement_id=r.engagement_id where r.tenant_id=${ctx.tenantId} and r.id=${requestId} and i.auth_actor_id=${ctx.actorId} and a.status='ACTIVE' and a.access_role in ('CLIENT_PREPARER','CLIENT_APPROVER')`;
      if (!rows.length) throw new ApiError(403, "FORBIDDEN", "Active client preparer or approver access is required");
      if (!["OPEN", "REJECTED"].includes(String(rows[0]!.status))) throw new ApiError(409, "CLIENT_RESPONSE_NOT_ALLOWED", "The request does not accept a response in its current state");
      return { engagementId: String(rows[0]!.engagement_id) };
    });
    uploadedKey = `tenants/${ctx.tenantId}/engagements/${source.engagementId}/client-documents/${requestId}/${responseId}-${contentHash}`;
    await env.ARTEFACTS.put(uploadedKey, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { sha256: contentHash, tenantId: ctx.tenantId, engagementId: source.engagementId, requestId, originalFilename: filename } });
    const outcome = await withTenant(sql, ctx, async (tx) => {
      const recorded = await tx`select response_id,version_no,content_hash,created from record_client_document_response(${requestId}::uuid,${responseId}::uuid,${uploadedKey}::text,${contentHash}::text,${filename}::text,${file.type || "application/octet-stream"}::text,${file.size}::bigint,${JSON.stringify({ note })}::jsonb)`;
      if (!recorded.length) throw new ApiError(409, "CLIENT_RESPONSE_NOT_ALLOWED", "The request or client access no longer accepts this response");
      const row = recorded[0]!, stored = await tx`select id,version_no,original_filename,media_type,byte_size,content_hash,submitted_at from client_document_response where tenant_id=${ctx.tenantId} and id=${row.response_id}`;
      if (!stored.length) throw new ApiError(500, "RESPONSE_EVIDENCE_MISSING", "The recorded response evidence could not be read");
      return { created: Boolean(row.created), item: { id: String(stored[0]!.id), requestId, version: Number(stored[0]!.version_no), filename: String(stored[0]!.original_filename), contentType: String(stored[0]!.media_type), byteSize: Number(stored[0]!.byte_size), contentHash: String(stored[0]!.content_hash), createdAt: String(stored[0]!.submitted_at) } };
    });
    if (outcome.created) uploadedKey = null;
    return json(outcome, outcome.created ? 201 : 200);
  } finally { if (uploadedKey) await deleteR2ObjectSafely(env, uploadedKey, "client document response transaction/replay"); await sql.end(); }
}
async function clientDocumentContent(request: Request, env: Env, actorId: string, responseId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), sql = database(env);
  try {
    const row = await withTenant(sql, ctx, async (tx) => {
      const rows = await tx`select response.storage_key,response.content_hash,response.original_filename,response.media_type,response.byte_size from client_document_response response where response.tenant_id=${ctx.tenantId} and response.id=${responseId}`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Client document response not found");
      return rows[0]!;
    });
    const object = await env.ARTEFACTS.get(String(row.storage_key));
    if (!object) throw new ApiError(503, "DOCUMENT_OBJECT_MISSING", "The client document object is unavailable");
    if (object.customMetadata?.sha256 !== String(row.content_hash)) throw new ApiError(503, "DOCUMENT_INTEGRITY_FAILED", "The client document metadata does not match its immutable hash");
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(object.body, { headers: { "content-type": String(row.media_type), "content-length": String(row.byte_size), "content-disposition": `${disposition}; filename="${String(row.original_filename).replace(/["\r\n]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-content-sha256": String(row.content_hash) } });
  } finally { await sql.end(); }
}

function connectionItem(row: Record<string, unknown>) {
  const capabilities = (row.capabilities ?? {}) as Record<string, unknown>;
  return { id: String(row.id), organisationId: String(row.organisation_id), connectorCode: String(row.connector_code), sourceType: String(row.source_type), displayName: String(row.display_name), status: String(row.status), availability: capabilities.implemented === true ? "AVAILABLE" : "UNAVAILABLE", hasCredentials: Boolean(row.has_credentials), configuration: row.configuration ?? {}, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
async function listIntegrations(request: Request, env: Env, actorId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), sql = database(env);
  try { return await withTenant(sql, ctx, async (tx) => {
    await tenantRole(tx, ctx);
    const definitions = await tx`select connector_code,display_name,source_type,credential_mode,lifecycle_status,capabilities from connector_definition order by connector_code`;
    const connections = await tx`select c.id,c.organisation_id,c.connector_code,d.source_type,c.display_name,c.status,false as has_credentials,c.configuration,c.created_at,c.updated_at,d.capabilities from integration_connection c join connector_definition d on d.connector_code=c.connector_code where c.tenant_id=${ctx.tenantId} order by c.created_at desc`;
    return json({ definitions: definitions.map((row) => ({ connectorCode: String(row.connector_code), displayName: String(row.display_name), sourceType: String(row.source_type), credentialMode: String(row.credential_mode), lifecycleStatus: String(row.lifecycle_status), capabilities: row.capabilities })), items: connections.map(connectionItem) });
  }); } finally { await sql.end(); }
}
async function createIntegration(request: Request, env: Env, actorId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), organisationId = boundedString(input, "organisationId", 36), connectorCode = enumValue(input, "connectorCode", ["CSV", "XLSX", "XERO", "QUICKBOOKS", "SAGE", "FREEAGENT"] as const), displayName = boundedString(input, "displayName", 160), configuration = safeCommercialConfiguration(input.configuration), sql = database(env);
  if (connectorCode !== "CSV") throw new ApiError(501, "CONNECTOR_NOT_AVAILABLE", `${connectorCode} connectivity is not implemented`);
  try { const item = await withTenant(sql, ctx, async (tx) => {
    const role = await tenantRole(tx, ctx); if (!["OWNER", "ADMIN"].includes(role)) throw new ApiError(403, "FORBIDDEN", "Tenant administrator access is required");
    const organisations = await tx`select id from organisation where tenant_id=${ctx.tenantId} and id=${organisationId}`; if (!organisations.length) throw new ApiError(404, "NOT_FOUND", "Organisation not found");
    const id = crypto.randomUUID(), rows = await tx`insert into integration_connection(id,tenant_id,organisation_id,connector_code,display_name,status,configuration,created_by) values(${id},${ctx.tenantId},${organisationId},${connectorCode},${displayName},'ACTIVE',${JSON.stringify(configuration)}::jsonb,${ctx.actorId}) returning id,organisation_id,connector_code,display_name,status,configuration,created_at,updated_at`;
    await appendStaffEvent(tx, ctx, { organisationId, engagementId: null }, "INTEGRATION_CONNECTION_CREATED", "INTEGRATION_CONNECTION", id, { connectorCode, displayName });
    return connectionItem({ ...rows[0], source_type: "CSV", has_credentials: false, capabilities: { implemented: true } });
  }); return json({ item }, 201); } finally { await sql.end(); }
}
async function updateIntegration(request: Request, env: Env, actorId: string, connectionId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), displayName = input.displayName === undefined ? undefined : boundedString(input, "displayName", 160), status = input.status === undefined ? undefined : enumValue(input, "status", ["ACTIVE", "SUSPENDED", "REVOKED"] as const), configuration = input.configuration === undefined ? undefined : safeCommercialConfiguration(input.configuration), sql = database(env);
  if (displayName === undefined && status === undefined && configuration === undefined) throw new ApiError(400, "INVALID_REQUEST", "At least one mutable field is required");
  try { const item = await withTenant(sql, ctx, async (tx) => {
    const role = await tenantRole(tx, ctx); if (!["OWNER", "ADMIN"].includes(role)) throw new ApiError(403, "FORBIDDEN", "Tenant administrator access is required");
    const current = await tx`select c.*,d.source_type,d.capabilities from integration_connection c join connector_definition d on d.connector_code=c.connector_code where c.tenant_id=${ctx.tenantId} and c.id=${connectionId} for update`; if (!current.length) throw new ApiError(404, "NOT_FOUND", "Integration connection not found");
    const rows = await tx`update integration_connection set display_name=coalesce(${displayName ?? null},display_name),status=coalesce(${status ?? null},status),configuration=coalesce(${configuration === undefined ? null : JSON.stringify(configuration)}::jsonb,configuration),updated_at=now() where tenant_id=${ctx.tenantId} and id=${connectionId} returning id,organisation_id,connector_code,display_name,status,configuration,created_at,updated_at`;
    await appendStaffEvent(tx, ctx, { organisationId: String(current[0]!.organisation_id), engagementId: null }, "INTEGRATION_CONNECTION_UPDATED", "INTEGRATION_CONNECTION", connectionId, { displayName, status, configurationChanged: configuration !== undefined });
    return connectionItem({ ...rows[0], source_type: current[0]!.source_type, has_credentials: false, capabilities: current[0]!.capabilities });
  }); return json({ item }); } finally { await sql.end(); }
}
function syncRunItem(row: Record<string, unknown>) {
  return { id: String(row.id), engagementId: String(row.engagement_id), connectionId: String(row.connection_id), idempotencyKey: String(row.idempotency_key), syncType: String(row.sync_type), status: String(row.status), itemCount: Number(row.item_count), errorCount: Number(row.error_count), startedAt: row.started_at ? String(row.started_at) : null, completedAt: row.completed_at ? String(row.completed_at) : null, createdAt: String(row.created_at), errors: row.errors ?? [] };
}
async function listSyncRuns(request: Request, env: Env, actorId: string, connectionId: string, runId?: string): Promise<Response> {
  const ctx = requestContext(request, actorId), sql = database(env);
  try { return await withTenant(sql, ctx, async (tx) => {
    await tenantRole(tx, ctx);
    const rows = await tx`select r.*,coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'errorCode',e.error_code,'errorClass',e.error_class,'retryable',e.retryable,'message',e.message,'occurredAt',e.occurred_at) order by e.occurred_at,e.id) from integration_sync_error e where e.tenant_id=r.tenant_id and e.sync_run_id=r.id),'[]'::jsonb) as errors from integration_sync_run r where r.tenant_id=${ctx.tenantId} and r.connection_id=${connectionId} and (${runId ?? null}::uuid is null or r.id=${runId ?? null}) order by r.created_at desc limit 100`;
    if (runId && !rows.length) throw new ApiError(404, "NOT_FOUND", "Sync run not found");
    return runId ? json({ item: syncRunItem(rows[0]!) }) : json({ items: rows.map(syncRunItem) });
  }); } finally { await sql.end(); }
}
async function createSyncRun(request: Request, env: Env, actorId: string, connectionId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), engagementId = boundedString(input, "engagementId", 36), idempotencyKey = boundedString(input, "idempotencyKey", 200), sql = database(env);
  try { return await withTenant(sql, ctx, async (tx) => {
    await staffEngagement(tx, ctx, engagementId, true);
    const connections = await tx`select c.id,c.status,d.source_type,d.capabilities from integration_connection c join connector_definition d on d.connector_code=c.connector_code where c.tenant_id=${ctx.tenantId} and c.id=${connectionId}`;
    if (!connections.length) throw new ApiError(404, "NOT_FOUND", "Integration connection not found");
    const previous = await tx`select * from integration_sync_run where tenant_id=${ctx.tenantId} and connection_id=${connectionId} and idempotency_key=${idempotencyKey}`;
    if (previous.length) return json({ item: syncRunItem(previous[0]!), created: false });
    throw new ApiError(501, "CONNECTOR_EXECUTION_NOT_AVAILABLE", "No live connector runner is configured; use the trial-balance upload for CSV imports");
  }); } finally { await sql.end(); }
}
async function normalizeImport(request: Request, env: Env, actorId: string, engagementId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "multipart/form-data is required");
  const form = await new Response(await boundedBytes(request, 10 * 1024 * 1024, "Import preview"), { headers: { "content-type": contentType } }).formData(), file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "FILE_REQUIRED", 'Multipart field "file" is required');
  if (!file.name.toLowerCase().endsWith(".csv")) throw new ApiError(501, "XLSX_NORMALIZATION_NOT_AVAILABLE", "XLSX normalization is not implemented; upload CSV");
  const sql = database(env);
  try { await withTenant(sql, ctx, async (tx) => { await staffEngagement(tx, ctx, engagementId); }); } finally { await sql.end(); }
  const parsed = parseTrialBalanceCsv(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(await file.arrayBuffer()));
  return json({ item: { sourceType: "CSV", filename: file.name, recordCount: parsed.rows.length, debitTotal: parsed.debitTotal, creditTotal: parsed.creditTotal, balanced: parsed.balanced, columns: ["accountCode", "accountName", "debit", "credit"], preview: parsed.rows.slice(0, 50).map((row) => ({ rowNo: row.rowNo, accountCode: row.accountCode, accountName: row.accountName, debit: row.debit, credit: row.credit })) } });
}

function notificationItem(row: Record<string, unknown>) {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return { id: String(row.id), engagementId: row.engagement_id ? String(row.engagement_id) : null, channel: String(row.channel), type: String(row.template_code), title: typeof payload.title === "string" ? payload.title : String(row.template_code), message: typeof payload.message === "string" ? payload.message : "", severity: typeof payload.severity === "string" ? payload.severity : "INFO", status: String(row.read_status), actionPath: typeof payload.actionPath === "string" ? payload.actionPath : null, createdAt: String(row.created_at), readAt: row.read_at ? String(row.read_at) : null };
}
async function listNotifications(request: Request, env: Env, actorId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), filter = new URL(request.url).searchParams.get("status"), sql = database(env);
  if (filter && !["UNREAD", "READ"].includes(filter)) throw new ApiError(400, "INVALID_REQUEST", "status must be UNREAD or READ");
  try { return await withTenant(sql, ctx, async (tx) => { await tenantRole(tx, ctx); const rows = await tx`select id,engagement_id,channel,template_code,payload,read_status,read_at,created_at from notification where tenant_id=${ctx.tenantId} and recipient_reference=${ctx.actorId} and (${filter}::text is null or read_status=${filter}) order by created_at desc,id desc limit 200`; return json({ items: rows.map(notificationItem) }); }); } finally { await sql.end(); }
}
async function readNotification(request: Request, env: Env, actorId: string, notificationId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), sql = database(env);
  try { const item = await withTenant(sql, ctx, async (tx) => { await tenantRole(tx, ctx); const rows = await tx`update notification set read_status='READ',read_by=${ctx.actorId},read_at=coalesce(read_at,now()) where tenant_id=${ctx.tenantId} and id=${notificationId} and recipient_reference=${ctx.actorId} returning id,engagement_id,channel,template_code,payload,read_status,read_at,created_at`; if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Notification not found"); return notificationItem(rows[0]!); }); return json({ item }); } finally { await sql.end(); }
}

async function tenantSettings(request: Request, env: Env, actorId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), sql = database(env);
  try { return await withTenant(sql, ctx, async (tx) => { await tenantRole(tx, ctx); const rows = await tx`select t.id,t.name,t.created_at,coalesce(s.status,'ACTIVE') as lifecycle_status,s.reason,s.effective_at,s.updated_at from tenant t left join tenant_lifecycle_state s on s.tenant_id=t.id where t.id=${ctx.tenantId}`; return json({ item: { id: String(rows[0]!.id), name: String(rows[0]!.name), lifecycleStatus: String(rows[0]!.lifecycle_status), reason: rows[0]!.reason ? String(rows[0]!.reason) : null, createdAt: String(rows[0]!.created_at), updatedAt: rows[0]!.updated_at ? String(rows[0]!.updated_at) : String(rows[0]!.created_at) } }); }); } finally { await sql.end(); }
}
async function updateTenantSettings(request: Request, env: Env, actorId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), name = boundedString(input, "name", 160), sql = database(env);
  try { const item = await withTenant(sql, ctx, async (tx) => { const role = await tenantRole(tx, ctx); if (!["OWNER", "ADMIN"].includes(role)) throw new ApiError(403, "FORBIDDEN", "Tenant administrator access is required"); const rows = await tx`update tenant set name=${name} where id=${ctx.tenantId} returning id,name,created_at`; await appendStaffEvent(tx, ctx, { organisationId: null, engagementId: null }, "TENANT_SETTINGS_UPDATED", "TENANT", ctx.tenantId, { name }); return { id: String(rows[0]!.id), name: String(rows[0]!.name), createdAt: String(rows[0]!.created_at) }; }); return json({ item }); } finally { await sql.end(); }
}
async function transitionTenantLifecycle(request: Request, env: Env, actorId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), status = enumValue(input, "status", ["ACTIVE", "SUSPENDED", "CLOSURE_REQUESTED", "CLOSED"] as const), reason = optionalString(input, "reason", 2000), sql = database(env);
  if (status !== "ACTIVE" && !reason) throw new ApiError(400, "WORKSPACE_TRANSITION_REASON_REQUIRED", "A reason is required");
  try { const result = await withTenant(sql, ctx, async (tx) => { const role = await tenantRole(tx, ctx); if (!["OWNER", "ADMIN"].includes(role)) throw new ApiError(403, "FORBIDDEN", "Tenant administrator access is required"); const currentRows = await tx`select status from tenant_lifecycle_state where tenant_id=${ctx.tenantId}`, current = currentRows.length ? String(currentRows[0]!.status) : "ACTIVE"; if (current !== status && !(LIFECYCLE_TRANSITIONS[current] ?? []).includes(status)) throw new ApiError(409, "WORKSPACE_TRANSITION_NOT_ALLOWED", `Cannot transition from ${current} to ${status}`); const rows = await tx`select tenant_id,status,changed from transition_tenant_lifecycle(${ctx.tenantId}::uuid,${status}::text,${reason}::text)`; if (!rows.length) throw new ApiError(409, "WORKSPACE_TRANSITION_NOT_ALLOWED", "The lifecycle transition was rejected"); const changed = Boolean(rows[0]!.changed); if (changed) await appendStaffEvent(tx, ctx, { organisationId: null, engagementId: null }, "TENANT_LIFECYCLE_CHANGED", "TENANT", ctx.tenantId, { fromStatus: current, toStatus: status, reason }); return { item: { tenantId: ctx.tenantId, fromStatus: current, status: String(rows[0]!.status), reason }, changed }; }); return json(result, result.changed ? 201 : 200); } finally { await sql.end(); }
}
async function listExportRequests(request: Request, env: Env, actorId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), sql = database(env);
  try { return await withTenant(sql, ctx, async (tx) => { const role = await tenantRole(tx, ctx); if (!["OWNER", "ADMIN"].includes(role)) throw new ApiError(403, "FORBIDDEN", "Tenant administrator access is required"); const rows = await tx`select id,status,scope_type,engagement_id,export_format,idempotency_key,requested_at,completed_at,expires_at,content_hash,failure_code from tenant_export_request where tenant_id=${ctx.tenantId} and requested_by=${ctx.actorId} order by requested_at desc`; return json({ items: rows.map((row) => ({ id: String(row.id), status: String(row.status), scope: String(row.scope_type), engagementId: row.engagement_id ? String(row.engagement_id) : null, format: String(row.export_format), idempotencyKey: String(row.idempotency_key), requestedAt: String(row.requested_at), completedAt: row.completed_at ? String(row.completed_at) : null, expiresAt: row.expires_at ? String(row.expires_at) : null, contentHash: row.content_hash ? String(row.content_hash) : null, failureCode: row.failure_code ? String(row.failure_code) : null, downloadPath: null })) }); }); } finally { await sql.end(); }
}
async function createExportRequest(request: Request, env: Env, actorId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), input = await body(request), scope = enumValue(input, "scope", ["TENANT", "ENGAGEMENT"] as const), engagementId = optionalString(input, "engagementId", 36), idempotencyKey = boundedString(input, "idempotencyKey", 200), sql = database(env);
  if ((scope === "TENANT") !== (engagementId === null)) throw new ApiError(400, "INVALID_REQUEST", "engagementId is required only for ENGAGEMENT exports");
  try { const result = await withTenant(sql, ctx, async (tx) => { const role = await tenantRole(tx, ctx); if (!["OWNER", "ADMIN"].includes(role)) throw new ApiError(403, "FORBIDDEN", "Tenant administrator access is required"); if (engagementId) await staffEngagement(tx, ctx, engagementId); const existing = await tx`select * from tenant_export_request where tenant_id=${ctx.tenantId} and idempotency_key=${idempotencyKey}`; if (existing.length) return { row: existing[0]!, created: false }; const id = crypto.randomUUID(), rows = await tx`insert into tenant_export_request(id,tenant_id,scope_type,engagement_id,export_format,idempotency_key,requested_by,metadata) values(${id},${ctx.tenantId},${scope},${engagementId},'ZIP',${idempotencyKey},${ctx.actorId},${JSON.stringify({ capability: 'REQUEST_ONLY', generationConfigured: false })}::jsonb) returning *`; await appendStaffEvent(tx, ctx, { organisationId: null, engagementId }, "TENANT_EXPORT_REQUESTED", "TENANT_EXPORT_REQUEST", id, { scope, engagementId, format: 'ZIP' }); return { row: rows[0]!, created: true }; }); const row = result.row; return json({ item: { id: String(row.id), status: String(row.status), scope: String(row.scope_type), engagementId: row.engagement_id ? String(row.engagement_id) : null, format: String(row.export_format), idempotencyKey: String(row.idempotency_key), requestedAt: String(row.requested_at), downloadPath: null }, created: result.created, capability: { generationAvailable: false, code: "EXPORT_RUNNER_NOT_CONFIGURED" } }, result.created ? 202 : 200); } finally { await sql.end(); }
}

async function comparativePresentation(request: Request, env: Env, actorId: string, engagementId: string, accountsVersionId: string): Promise<Response> {
  const ctx = requestContext(request, actorId), sql = database(env);
  try { return await withTenant(sql, ctx, async (tx) => {
    await staffEngagement(tx, ctx, engagementId);
    const versions = await tx`select current.id,current.content_hash,current_e.period_start,current_e.period_end,comparison.comparative_accounts_version_id,comparison.comparative_manifest_hash,prior_e.period_start as comparative_period_start,prior_e.period_end as comparative_period_end from accounts_version current join engagement current_e on current_e.tenant_id=current.tenant_id and current_e.id=current.engagement_id left join accounts_version_comparative comparison on comparison.tenant_id=current.tenant_id and comparison.accounts_version_id=current.id left join engagement prior_e on prior_e.tenant_id=comparison.tenant_id and prior_e.id=comparison.comparative_engagement_id where current.tenant_id=${ctx.tenantId} and current.engagement_id=${engagementId} and current.id=${accountsVersionId}`;
    if (!versions.length) throw new ApiError(404, "NOT_FOUND", "Accounts version not found");
    const row = versions[0]!;
    const currentLines = await reportLinesForAccountsVersion(tx, ctx.tenantId, accountsVersionId);
    const comparativeId = row.comparative_accounts_version_id ? String(row.comparative_accounts_version_id) : null, comparativeLines = comparativeId ? await reportLinesForAccountsVersion(tx, ctx.tenantId, comparativeId) : [];
    const prior = new Map(comparativeLines.map((line) => [String(line.code), line]));
    const current = new Map(currentLines.map((line) => [String(line.code), line]));
    const lines = [...new Set([...current.keys(), ...prior.keys()])].sort().map((code) => ({ code, caption: String(current.get(code)?.caption ?? prior.get(code)?.caption ?? code), statementCode: String(current.get(code)?.statement_code ?? prior.get(code)?.statement_code ?? "UNCLASSIFIED"), current: String(current.get(code)?.balance ?? "0.00"), comparative: prior.has(code) ? String(prior.get(code)!.balance) : null }));
    const statements = [...new Set(lines.map((line) => line.statementCode))].map((statementCode) => ({ statementCode, title: statementCode.replaceAll("_", " "), columns: [{ key: "current", label: String(row.period_end).slice(0, 4) }, ...(comparativeId ? [{ key: "comparative", label: String(row.comparative_period_end).slice(0, 4) }] : [])], lines: lines.filter((line) => line.statementCode === statementCode).map(({ statementCode: _, ...line }) => line) }));
    return json({ item: { accountsVersionId, currentManifestHash: String(row.content_hash), currentPeriod: { start: String(row.period_start), end: String(row.period_end) }, comparativePeriod: comparativeId ? { start: String(row.comparative_period_start), end: String(row.comparative_period_end), accountsVersionId: comparativeId, manifestHash: String(row.comparative_manifest_hash) } : null, statements, readiness: { comparativeConfigured: Boolean(comparativeId), comparativeComplete: Boolean(comparativeId && comparativeLines.length), blocks: comparativeId && !comparativeLines.length ? ["COMPARATIVE_REPORT_LINES_UNAVAILABLE"] : [] } } });
  }); } finally { await sql.end(); }
}
async function reportLinesForAccountsVersion(tx: Transaction, tenantId: string, accountsVersionId: string) {
  return tx`select rl.line_code as code,rl.caption,rl.statement_code,rl.display_order,sum(case ca.normal_balance when 'CREDIT' then tbl.credit-tbl.debit else tbl.debit-tbl.credit end) as balance from accounts_version av join trial_balance_line tbl on tbl.tenant_id=av.tenant_id and tbl.trial_balance_id=av.trial_balance_id join canonical_account ca on ca.id=tbl.canonical_account_id join canonical_report_line rl on rl.id=ca.report_line_id where av.tenant_id=${tenantId} and av.id=${accountsVersionId} group by rl.id,rl.line_code,rl.caption,rl.statement_code,rl.display_order order by rl.statement_code,rl.display_order`;
}

export async function handleCommercialRoute(request: Request, env: Env, actorId: string): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/v1/me/client-portal/access") return listClientAccess(env, actorId);
  if (request.method === "POST" && path === "/v1/me/client-portal/invitations/accept") return acceptPortalInvitation(request, env, actorId);
  const contacts = /^\/v1\/engagements\/([^/]+)\/client-portal\/contacts$/.exec(path);
  if (contacts && request.method === "GET") return listPortalContacts(request, env, actorId, contacts[1]!);
  if (contacts && request.method === "POST") return createPortalContact(request, env, actorId, contacts[1]!);
  const invitation = /^\/v1\/engagements\/([^/]+)\/client-portal\/contacts\/([^/]+)\/invitations$/.exec(path);
  if (invitation && request.method === "POST") return createPortalInvitation(request, env, actorId, invitation[1]!, invitation[2]!);
  const access = /^\/v1\/engagements\/([^/]+)\/client-portal\/contacts\/([^/]+)\/access$/.exec(path);
  if (access && request.method === "PATCH") return updatePortalAccess(request, env, actorId, access[1]!, access[2]!);
  const documents = /^\/v1\/engagements\/([^/]+)\/client-portal\/document-requests$/.exec(path);
  if (documents && request.method === "GET") return listDocuments(request, env, actorId, documents[1]!);
  if (documents && request.method === "POST") return createDocumentRequest(request, env, actorId, documents[1]!);
  const documentReview = /^\/v1\/engagements\/([^/]+)\/client-portal\/document-requests\/([^/]+)\/review$/.exec(path);
  if (documentReview && request.method === "POST") return reviewDocument(request, env, actorId, documentReview[1]!, documentReview[2]!);
  const documentCancel = /^\/v1\/engagements\/([^/]+)\/client-portal\/document-requests\/([^/]+)\/cancel$/.exec(path);
  if (documentCancel && request.method === "POST") return cancelDocumentRequest(request, env, actorId, documentCancel[1]!, documentCancel[2]!);
  const clientDocuments = /^\/v1\/client-portal\/engagements\/([^/]+)\/document-requests$/.exec(path);
  if (clientDocuments && request.method === "GET") return listDocuments(request, env, actorId, clientDocuments[1]!, true);
  const clientResponse = /^\/v1\/client-portal\/document-requests\/([^/]+)\/responses$/.exec(path);
  if (clientResponse && request.method === "POST") return uploadClientResponse(request, env, actorId, clientResponse[1]!);
  const documentContent = /^\/v1\/client-portal\/document-responses\/([^/]+)\/content$/.exec(path);
  if (documentContent && request.method === "GET") return clientDocumentContent(request, env, actorId, documentContent[1]!);
  if (path === "/v1/integrations" && request.method === "GET") return listIntegrations(request, env, actorId);
  if (path === "/v1/integrations" && request.method === "POST") return createIntegration(request, env, actorId);
  const integration = /^\/v1\/integrations\/([^/]+)$/.exec(path);
  if (integration && request.method === "PATCH") return updateIntegration(request, env, actorId, integration[1]!);
  const syncRuns = /^\/v1\/integrations\/([^/]+)\/sync-runs$/.exec(path);
  if (syncRuns && request.method === "GET") return listSyncRuns(request, env, actorId, syncRuns[1]!);
  if (syncRuns && request.method === "POST") return createSyncRun(request, env, actorId, syncRuns[1]!);
  const syncRun = /^\/v1\/integrations\/([^/]+)\/sync-runs\/([^/]+)$/.exec(path);
  if (syncRun && request.method === "GET") return listSyncRuns(request, env, actorId, syncRun[1]!, syncRun[2]!);
  const normalize = /^\/v1\/engagements\/([^/]+)\/imports\/normalize$/.exec(path);
  if (normalize && request.method === "POST") return normalizeImport(request, env, actorId, normalize[1]!);
  if (path === "/v1/notifications" && request.method === "GET") return listNotifications(request, env, actorId);
  const notification = /^\/v1\/notifications\/([^/]+)\/read$/.exec(path);
  if (notification && request.method === "POST") return readNotification(request, env, actorId, notification[1]!);
  if (path === "/v1/tenant/settings" && request.method === "GET") return tenantSettings(request, env, actorId);
  if (path === "/v1/tenant/settings" && request.method === "PATCH") return updateTenantSettings(request, env, actorId);
  if (path === "/v1/tenant/lifecycle" && request.method === "POST") return transitionTenantLifecycle(request, env, actorId);
  if (path === "/v1/tenant/export-requests" && request.method === "GET") return listExportRequests(request, env, actorId);
  if (path === "/v1/tenant/export-requests" && request.method === "POST") return createExportRequest(request, env, actorId);
  const presentation = /^\/v1\/engagements\/([^/]+)\/accounts-versions\/([^/]+)\/presentation$/.exec(path);
  if (presentation && request.method === "GET") return comparativePresentation(request, env, actorId, presentation[1]!, presentation[2]!);
  return null;
}
