import postgres, { type Sql, type TransactionSql } from "postgres";
import { ApiError, requireObject } from "./core.js";
import {
  adviserCreateCommand,
  adviserPatchCommand,
  officerCreateCommand,
  officerPatchCommand,
  permanentProfileCommand,
} from "./permanent-file-contracts.js";

type Database = Sql<Record<string, never>>;
type Transaction = TransactionSql<Record<string, never>>;
interface Context { tenantId: string; actorId: string; correlationId: string }
type Command = Record<string, string | number | null>;
const MAX_JSON_BYTES = 64 * 1024;

const profileColumns: Record<string, string> = {
  tradingName: "trading_name", companyRegistrationNumber: "company_registration_number",
  charityRegistrationNumber: "charity_registration_number", registeredOfficeLine1: "registered_office_line1",
  registeredOfficeLine2: "registered_office_line2", registeredOfficeLocality: "registered_office_locality",
  registeredOfficeRegion: "registered_office_region", registeredOfficePostalCode: "registered_office_postal_code",
  registeredOfficeCountryCode: "registered_office_country_code", accountingReferenceMonth: "accounting_reference_month",
  accountingReferenceDay: "accounting_reference_day", principalActivity: "principal_activity", website: "website",
  telephone: "telephone", notes: "notes",
  officerNameStyle: "officer_name_style",
};
const officerColumns: Record<string, string> = {
  officerType: "officer_type", displayName: "display_name", appointedOn: "appointed_on", resignedOn: "resigned_on",
  title: "title", givenNames: "given_names", middleNames: "middle_names", familyName: "family_name", suffixHonours: "suffix_honours",
  occupation: "occupation", nationality: "nationality", countryOfResidence: "country_of_residence",
  serviceAddressLine1: "service_address_line1", serviceAddressLine2: "service_address_line2",
  serviceAddressLocality: "service_address_locality", serviceAddressRegion: "service_address_region",
  serviceAddressPostalCode: "service_address_postal_code", serviceAddressCountryCode: "service_address_country_code",
  email: "email", telephone: "telephone",
};
const adviserColumns: Record<string, string> = {
  adviserType: "adviser_type", firmName: "firm_name", contactName: "contact_name", addressLine1: "address_line1",
  addressLine2: "address_line2", addressLocality: "address_locality", addressRegion: "address_region",
  addressPostalCode: "address_postal_code", addressCountryCode: "address_country_code", email: "email",
  telephone: "telephone", reference: "reference", activeFrom: "active_from", activeTo: "active_to",
  contactQualifications: "contact_qualifications", professionalBody: "professional_body", reportStyle: "report_style",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}
function database(env: Env): Database {
  return postgres(env.HYPERDRIVE.connectionString, { prepare: false, max: 5 });
}
function context(request: Request, actorId: string): Context {
  const tenantId = request.headers.get("x-tenant-id");
  if (!tenantId) throw new ApiError(400, "TENANT_REQUIRED", "A tenant selection is required");
  return { tenantId, actorId, correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID() };
}
async function withTenant<T>(sql: Database, ctx: Context, operation: (tx: Transaction) => Promise<T>): Promise<T> {
  const result = await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id',${ctx.tenantId},true),set_config('app.actor_id',${ctx.actorId},true)`;
    return { value: await operation(tx) };
  });
  return result.value;
}
async function bytes(request: Request): Promise<ArrayBuffer> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_JSON_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON body is too large");
  if (!request.body) throw new ApiError(400, "BODY_REQUIRED", "Request body is required");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) { await reader.cancel("payload too large"); throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON body is too large"); }
    chunks.push(value);
  }
  const output = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output.buffer;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "application/json is required");
  try { return requireObject(JSON.parse(new TextDecoder().decode(await bytes(request)))); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "INVALID_JSON", "Request body is not valid JSON"); }
}
function databaseCommand(command: Command, columns: Record<string, string>): Record<string, string | number | null> {
  return Object.fromEntries(Object.entries(command).map(([key, value]) => [columns[key]!, value]));
}
async function authorise(tx: Transaction, ctx: Context, organisationId: string): Promise<void> {
  const organisations = await tx`select id from organisation where tenant_id=${ctx.tenantId} and id=${organisationId}`;
  if (!organisations.length) throw new ApiError(404, "NOT_FOUND", "Organisation not found");
  const tenant = await tx`select role_code from tenant_member where tenant_id=${ctx.tenantId} and actor_id=${ctx.actorId}`;
  if (!tenant.length) throw new ApiError(403, "FORBIDDEN", "Workspace access is required");
  if (["OWNER", "ADMIN"].includes(String(tenant[0]!.role_code))) return;
  const assignment = await tx`select 1 from engagement e join engagement_member em on em.tenant_id=e.tenant_id and em.engagement_id=e.id where e.tenant_id=${ctx.tenantId} and e.organisation_id=${organisationId} and em.actor_id=${ctx.actorId} and em.role_code in ('PARTNER','MANAGER') limit 1`;
  if (!assignment.length) throw new ApiError(403, "FORBIDDEN", "Partner or manager access is required");
}
async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, "0")).join("");
}
async function appendEvent(tx: Transaction, ctx: Context, organisationId: string, eventType: string, objectType: string, objectId: string, changedFields: string[]): Promise<void> {
  await tx`select id from tenant where id=${ctx.tenantId} for update`;
  const prior = await tx`select event_hash from audit_event where tenant_id=${ctx.tenantId} order by occurred_at_utc desc,event_id desc limit 1`;
  const occurredAt = new Date().toISOString(), previousHash = prior[0]?.event_hash ? String(prior[0].event_hash) : null;
  const eventId = crypto.randomUUID(), metadata = { changedFields };
  const eventHash = await digest(JSON.stringify({ eventId, occurredAt, tenantId: ctx.tenantId, actorId: ctx.actorId, eventType, objectType, objectId, previousHash, metadata }));
  await tx`insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,organisation_id,actor_type,actor_id,event_type,object_type,object_id,previous_hash,correlation_id,metadata,event_hash) values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${organisationId},'USER',${ctx.actorId},${eventType},${objectType},${objectId},${previousHash},${ctx.correlationId},${JSON.stringify(metadata)}::jsonb,${eventHash})`;
  await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key) values(${crypto.randomUUID()},${ctx.tenantId},${objectType},${objectId},${eventType},${JSON.stringify(metadata)}::jsonb,${ctx.correlationId},${`${ctx.correlationId}:${eventType}:${objectId}`})`;
}
function address(row: Record<string, unknown>, prefix: string) {
  return { line1: row[`${prefix}line1`] ?? null, line2: row[`${prefix}line2`] ?? null, locality: row[`${prefix}locality`] ?? null, region: row[`${prefix}region`] ?? null, postalCode: row[`${prefix}postal_code`] ?? null, countryCode: row[`${prefix}country_code`] ?? null };
}
function officer(row: Record<string, unknown>) {
  return { id: String(row.id), officerType: String(row.officer_type), displayName: String(row.display_name), title: row.title ?? null, givenNames: row.given_names ?? null, middleNames: row.middle_names ?? null, familyName: row.family_name ?? null, suffixHonours: row.suffix_honours ?? null, appointedOn: String(row.appointed_on), resignedOn: row.resigned_on ? String(row.resigned_on) : null, occupation: row.occupation ?? null, nationality: row.nationality ?? null, countryOfResidence: row.country_of_residence ?? null, serviceAddress: address(row, "service_address_"), email: row.email ?? null, telephone: row.telephone ?? null, updatedAt: String(row.updated_at) };
}
function adviser(row: Record<string, unknown>) {
  return { id: String(row.id), adviserType: String(row.adviser_type), firmName: String(row.firm_name), contactName: row.contact_name ?? null, contactQualifications: row.contact_qualifications ?? null, professionalBody: row.professional_body ?? null, reportStyle: row.report_style ?? "GENERIC", address: address(row, "address_"), email: row.email ?? null, telephone: row.telephone ?? null, reference: row.reference ?? null, status: String(row.status), activeFrom: row.active_from ? String(row.active_from) : null, activeTo: row.active_to ? String(row.active_to) : null, updatedAt: String(row.updated_at) };
}
async function getPermanentFile(request: Request, env: Env, actorId: string, organisationId: string): Promise<Response> {
  const ctx = context(request, actorId), sql = database(env);
  try { return await withTenant(sql, ctx, async (tx) => {
    await authorise(tx, ctx, organisationId);
    const organisations = await tx`select o.id,o.legal_name,o.legal_form,o.jurisdiction,o.created_at,p.* from organisation o left join organisation_permanent_profile p on p.tenant_id=o.tenant_id and p.organisation_id=o.id where o.tenant_id=${ctx.tenantId} and o.id=${organisationId}`;
    const engagements = await tx`select id,period_start,period_end,framework,sector_profile,status from engagement where tenant_id=${ctx.tenantId} and organisation_id=${organisationId} order by period_end desc,id`;
    const officers = await tx`select * from organisation_officer where tenant_id=${ctx.tenantId} and organisation_id=${organisationId} order by resigned_on nulls first,appointed_on,display_name,id`;
    const advisers = await tx`select * from organisation_professional_adviser where tenant_id=${ctx.tenantId} and organisation_id=${organisationId} order by active_to nulls first,adviser_type,firm_name,id`;
    const row = organisations[0]!;
    return json({ item: { organisation: { id: String(row.id), legalName: String(row.legal_name), legalForm: String(row.legal_form), jurisdiction: String(row.jurisdiction), officerNameStyle: row.officer_name_style ?? "FULL_NAME", tradingName: row.trading_name ?? null, companyRegistrationNumber: row.company_registration_number ?? null, charityRegistrationNumber: row.charity_registration_number ?? null, registeredOfficeAddress: address(row, "registered_office_"), accountingReferenceMonth: row.accounting_reference_month ?? null, accountingReferenceDay: row.accounting_reference_day ?? null, principalActivity: row.principal_activity ?? null, website: row.website ?? null, telephone: row.telephone ?? null, notes: row.notes ?? null, createdAt: String(row.created_at), updatedAt: row.updated_at ? String(row.updated_at) : null }, engagements: engagements.map((item) => ({ id: String(item.id), periodStart: String(item.period_start), periodEnd: String(item.period_end), framework: String(item.framework), sectorProfile: String(item.sector_profile), status: String(item.status) })), officers: officers.map(officer), advisers: advisers.map(adviser) } });
  }); } finally { await sql.end(); }
}
async function patchProfile(request: Request, env: Env, actorId: string, organisationId: string): Promise<Response> {
  const ctx = context(request, actorId), command = permanentProfileCommand(await body(request)), sql = database(env);
  try { const item = await withTenant(sql, ctx, async (tx) => {
    await authorise(tx, ctx, organisationId);
    const { legalForm, ...profileCommand } = command;
    if (typeof legalForm === "string")
      await tx`update organisation set legal_form=${legalForm},version=version+1,updated_at=now() where tenant_id=${ctx.tenantId} and id=${organisationId}`;
    const changes = databaseCommand(profileCommand, profileColumns), columns = Object.keys(changes);
    const rows = columns.length
      ? await tx`insert into organisation_permanent_profile ${tx({ tenant_id: ctx.tenantId, organisation_id: organisationId, created_by: ctx.actorId, updated_by: ctx.actorId, ...changes })}
          on conflict(tenant_id,organisation_id) do update set ${tx(changes, ...columns)},updated_by=${ctx.actorId},updated_at=now() returning *`
      : await tx`select now() as updated_at`;
    await appendEvent(tx, ctx, organisationId, "ORGANISATION_PROFILE_UPDATED", "ORGANISATION", organisationId, Object.keys(command));
    return rows[0]!;
  }); return json({ item: { organisationId, updatedAt: String(item.updated_at) } }); } finally { await sql.end(); }
}
async function createOfficer(request: Request, env: Env, actorId: string, organisationId: string): Promise<Response> {
  const ctx = context(request, actorId), command = officerCreateCommand(await body(request)), sql = database(env), id = crypto.randomUUID();
  try { const row = await withTenant(sql, ctx, async (tx) => { await authorise(tx, ctx, organisationId); const values = databaseCommand(command, officerColumns); const rows = await tx`insert into organisation_officer ${tx({ id, tenant_id: ctx.tenantId, organisation_id: organisationId, created_by: ctx.actorId, updated_by: ctx.actorId, ...values })} returning *`; await appendEvent(tx, ctx, organisationId, "ORGANISATION_OFFICER_CREATED", "ORGANISATION_OFFICER", id, Object.keys(command)); return rows[0]!; }); return json({ item: officer(row) }, 201); } finally { await sql.end(); }
}
async function patchOfficer(request: Request, env: Env, actorId: string, organisationId: string, officerId: string): Promise<Response> {
  const ctx = context(request, actorId), command = officerPatchCommand(await body(request)), sql = database(env);
  try { const row = await withTenant(sql, ctx, async (tx) => { await authorise(tx, ctx, organisationId); const changes = databaseCommand(command, officerColumns), columns = Object.keys(changes); const rows = await tx`update organisation_officer set ${tx(changes, ...columns)},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and organisation_id=${organisationId} and id=${officerId} returning *`; if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Officer not found"); await appendEvent(tx, ctx, organisationId, "ORGANISATION_OFFICER_UPDATED", "ORGANISATION_OFFICER", officerId, Object.keys(command)); return rows[0]!; }); return json({ item: officer(row) }); } finally { await sql.end(); }
}
async function createAdviser(request: Request, env: Env, actorId: string, organisationId: string): Promise<Response> {
  const ctx = context(request, actorId), command = adviserCreateCommand(await body(request)), sql = database(env), id = crypto.randomUUID();
  try { const row = await withTenant(sql, ctx, async (tx) => { await authorise(tx, ctx, organisationId); const values = databaseCommand(command, adviserColumns); const rows = await tx`insert into organisation_professional_adviser ${tx({ id, tenant_id: ctx.tenantId, organisation_id: organisationId, status: command.activeTo ? "ENDED" : "ACTIVE", created_by: ctx.actorId, updated_by: ctx.actorId, ...values })} returning *`; await appendEvent(tx, ctx, organisationId, "ORGANISATION_ADVISER_CREATED", "ORGANISATION_ADVISER", id, Object.keys(command)); return rows[0]!; }); return json({ item: adviser(row) }, 201); } finally { await sql.end(); }
}
async function patchAdviser(request: Request, env: Env, actorId: string, organisationId: string, adviserId: string): Promise<Response> {
  const ctx = context(request, actorId), command = adviserPatchCommand(await body(request)), sql = database(env);
  try { const row = await withTenant(sql, ctx, async (tx) => { await authorise(tx, ctx, organisationId); const changes = databaseCommand(command, adviserColumns); if ("activeTo" in command) changes.status = command.activeTo ? "ENDED" : "ACTIVE"; const columns = Object.keys(changes); const rows = await tx`update organisation_professional_adviser set ${tx(changes, ...columns)},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and organisation_id=${organisationId} and id=${adviserId} returning *`; if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Adviser not found"); await appendEvent(tx, ctx, organisationId, "ORGANISATION_ADVISER_UPDATED", "ORGANISATION_ADVISER", adviserId, Object.keys(command)); return rows[0]!; }); return json({ item: adviser(row) }); } finally { await sql.end(); }
}

export async function handlePermanentFileRoute(request: Request, env: Env, actorId: string): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const root = path.match(/^\/v1\/organisations\/([^/]+)\/permanent-file$/);
  const officers = path.match(/^\/v1\/organisations\/([^/]+)\/permanent-file\/officers$/);
  const officerItem = path.match(/^\/v1\/organisations\/([^/]+)\/permanent-file\/officers\/([^/]+)$/);
  const advisers = path.match(/^\/v1\/organisations\/([^/]+)\/permanent-file\/advisers$/);
  const adviserItem = path.match(/^\/v1\/organisations\/([^/]+)\/permanent-file\/advisers\/([^/]+)$/);
  if (request.method === "GET" && root) return getPermanentFile(request, env, actorId, root[1]!);
  if ((request.method === "PATCH" || request.method === "PUT") && root) return patchProfile(request, env, actorId, root[1]!);
  if (request.method === "POST" && officers) return createOfficer(request, env, actorId, officers[1]!);
  if (request.method === "PATCH" && officerItem) return patchOfficer(request, env, actorId, officerItem[1]!, officerItem[2]!);
  if (request.method === "POST" && advisers) return createAdviser(request, env, actorId, advisers[1]!);
  if (request.method === "PATCH" && adviserItem) return patchAdviser(request, env, actorId, adviserItem[1]!, adviserItem[2]!);
  return null;
}
