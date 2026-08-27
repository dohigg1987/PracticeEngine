import postgres from "postgres";
import { ApiError } from "./core.js";
import {
  assertPlatformEntitled,
  assertPlatformPermission,
  assertPlatformRouteAccess,
  platformContext,
  platformDatabase,
  platformTransaction,
  type PlatformContext,
  type PlatformTX,
} from "./platform-core.js";
import { evaluateRecurrence, type RecurrenceRule } from "./practice-scheduling.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROSPECT_STATUSES = new Set(["prospect", "qualified", "converted", "lost", "archived"]);
const PROPOSAL_EVENTS = new Map([
  ["quotebench.proposal.created", "created"],
  ["quotebench.proposal.sent", "sent"],
  ["quotebench.proposal.viewed", "viewed"],
  ["quotebench.proposal.accepted", "accepted"],
  ["quotebench.proposal.declined", "declined"],
  ["quotebench.proposal.expired", "expired"],
]);
const ONBOARDING_STATUSES = new Set(["not_started", "in_progress", "blocked", "ready_for_delivery", "completed", "cancelled"]);
const BILLING_MODELS = new Set(["fixed_fee", "time_and_materials", "subscription", "retainer", "other"]);

export type QuoteBenchCommercialContext = {
  acceptedValue: number | null;
  currency: string | null;
  billingModel: string | null;
  billingFrequency: string | null;
  serviceValues: Array<{ serviceId: string; value: number; currency: string }>;
};

const response = (data: unknown, status = 200) => {
  const startedAt = performance.now();
  const body = JSON.stringify(data);
  const serializationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const encodedBody = new TextEncoder().encode(body);
  return new Response(encodedBody, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
      "x-pe-response-bytes": String(encodedBody.byteLength),
      "x-pe-serialization-ms": String(serializationMs),
    },
  });
};

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "application/json is required");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 65_536) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON body is too large");
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "A valid JSON object is required");
  }
}

function required(input: Record<string, unknown>, key: string, max = 240): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value))
    throw new ApiError(400, "INVALID_REQUEST", `${key} is required and must be at most ${max} characters`);
  return value.trim();
}

function optional(input: Record<string, unknown>, key: string, max = 1000): string | null | undefined {
  if (!(key in input)) return undefined;
  if (input[key] === null || input[key] === "") return null;
  if (typeof input[key] !== "string" || !input[key].trim() || input[key].trim().length > max)
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be at most ${max} characters`);
  return input[key].trim();
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new ApiError(400, "INVALID_REQUEST", `${label} must be a valid identifier`);
  return value;
}

function ids(input: Record<string, unknown>, key: string): string[] {
  const values = input[key] ?? [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !UUID.test(value)))
    throw new ApiError(400, "INVALID_REQUEST", `${key} must contain valid identifiers`);
  return [...new Set(values as string[])];
}

function numberValue(input: Record<string, unknown>, key: string): number | null {
  if (!(key in input) || input[key] === null || input[key] === "") return null;
  const value = Number(input[key]);
  if (!Number.isFinite(value)) throw new ApiError(400, "INVALID_REQUEST", `${key} must be numeric`);
  return value;
}

function boundedNumberValue(input: Record<string, unknown>, key: string, minimum: number, maximum?: number): number | null {
  const value = numberValue(input, key);
  if (value !== null && (value < minimum || (maximum !== undefined && value > maximum)))
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be between ${minimum} and ${maximum ?? "the supported maximum"}`);
  return value;
}

function dateValue(input: Record<string, unknown>, key: string): string | null | undefined {
  const value = optional(input, key, 10);
  if (value === undefined || value === null) return value;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a valid date in YYYY-MM-DD format`);
  return value;
}

async function opportunityCapabilities(tx: PlatformTX, tenantId: string) {
  const rows = await tx`select actor_has_permission('opportunities.create') can_create,
    actor_has_permission('opportunities.edit') can_edit,
    actor_has_permission('opportunities.convert') can_convert,
    tenant_feature_is_enabled(${tenantId}::uuid,'quotebench.enabled') and
      tenant_feature_is_enabled(${tenantId}::uuid,'quotebench.proposals') quotebench_available`;
  return {
    canCreate: Boolean(rows[0]?.can_create),
    canEdit: Boolean(rows[0]?.can_edit),
    canConvert: Boolean(rows[0]?.can_convert),
    quoteBenchAvailable: Boolean(rows[0]?.quotebench_available),
  };
}

export function quoteBenchCommercialContext(input: Record<string, unknown>): QuoteBenchCommercialContext {
  const acceptedValue = numberValue(input, "acceptedValue");
  if (acceptedValue !== null && acceptedValue < 0) throw new ApiError(400, "INVALID_REQUEST", "acceptedValue must not be negative");
  const currency = optional(input, "currency", 3)?.toUpperCase() ?? null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "INVALID_REQUEST", "currency must be a three-letter code");
  const billingModel = optional(input, "billingModel", 40)?.toLowerCase() ?? null;
  if (billingModel && !BILLING_MODELS.has(billingModel)) throw new ApiError(400, "INVALID_REQUEST", "billingModel is invalid");
  const billingFrequency = optional(input, "billingFrequency", 80) ?? null;
  const raw = input.serviceValues ?? [];
  if (!Array.isArray(raw) || raw.length > 100) throw new ApiError(400, "INVALID_REQUEST", "serviceValues must be a bounded array");
  const serviceValues = raw.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiError(400, "INVALID_REQUEST", "Each service value must be an object");
    const row = item as Record<string, unknown>, serviceId = id(row.serviceId, "serviceId"), value = Number(row.value);
    const itemCurrency = String(row.currency ?? currency ?? "").toUpperCase();
    if (!Number.isFinite(value) || value < 0 || !/^[A-Z]{3}$/.test(itemCurrency)) throw new ApiError(400, "INVALID_REQUEST", "Each service value requires a non-negative value and currency");
    return { serviceId, value, currency: itemCurrency };
  });
  if (new Set(serviceValues.map((item) => item.serviceId)).size !== serviceValues.length)
    throw new ApiError(400, "INVALID_REQUEST", "serviceValues must not repeat a service");
  if (acceptedValue !== null && !currency)
    throw new ApiError(400, "INVALID_REQUEST", "acceptedValue requires currency provenance");
  if ((acceptedValue !== null || serviceValues.length) && !billingModel)
    throw new ApiError(400, "INVALID_REQUEST", "Commercial value requires billingModel provenance");
  return { acceptedValue, currency, billingModel, billingFrequency, serviceValues };
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function recordMutation(
  tx: PlatformTX,
  ctx: PlatformContext,
  auditType: string,
  objectType: string,
  objectId: string,
  clientId: string | null,
  metadata: Record<string, postgres.JSONValue | undefined>,
  domainEvent?: string,
) {
  await tx`select id from tenant where id=${ctx.tenantId} for update`;
  const previous = await tx`select event_hash from audit_event where tenant_id=${ctx.tenantId} order by occurred_at_utc desc,event_id desc limit 1`;
  const eventId = crypto.randomUUID(), occurredAt = new Date().toISOString();
  const previousHash = previous.length ? String(previous[0]!.event_hash) : null;
  const eventHash = await digest(JSON.stringify({ eventId, occurredAt, tenantId: ctx.tenantId, actorId: ctx.actorId, auditType, objectType, objectId, previousHash, metadata }));
  await tx`insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,organisation_id,actor_type,actor_id,event_type,object_type,object_id,previous_hash,correlation_id,metadata,event_hash)
    values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${clientId},'USER',${ctx.actorId},${auditType},${objectType},${objectId},${previousHash},${ctx.correlationId},${tx.json(metadata)},${eventHash})`;
  if (domainEvent) await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key)
    values(${crypto.randomUUID()},${ctx.tenantId},${objectType},${objectId},${domainEvent},${tx.json(metadata)},${ctx.correlationId},${`${ctx.correlationId}:${domainEvent}:${objectId}`}) on conflict(tenant_id,idempotency_key) do nothing`;
}

async function within<T>(request: Request, env: Env, actorId: string, permission: string, feature: string, operation: (tx: PlatformTX, ctx: PlatformContext) => Promise<T>): Promise<T> {
  const ctx = platformContext(request, actorId), sql = platformDatabase(env);
  try {
    return await platformTransaction(sql, ctx, async (tx) => {
      if (actorId.startsWith("quotebench:")) {
        if (new URL(request.url).pathname !== "/v1/integrations/quotebench/events" || request.headers.get("x-practiceengine-machine-verified") !== "quotebench")
          throw new ApiError(403, "MACHINE_ROUTE_FORBIDDEN", "The machine identity is restricted to its integration boundary");
        const decisions = await tx`select machine_tenant_feature_enabled(${ctx.tenantId}::uuid,'quotebench.enabled') enabled,
          machine_tenant_feature_enabled(${ctx.tenantId}::uuid,${feature}) feature_enabled`;
        if (decisions[0]?.enabled !== true || decisions[0]?.feature_enabled !== true)
          throw new ApiError(403, "ENTITLEMENT_REQUIRED", "The QuoteBench integration is not enabled");
        return operation(tx, ctx);
      }
      await assertPlatformRouteAccess(tx, permission, "practice.enabled", feature);
      return operation(tx, ctx);
    });
  } finally { await sql.end(); }
}

async function prospectCollection(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await requestBody(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "crm.view" : "prospects.create", "practice.crm", async (tx, ctx) => {
    if (request.method === "GET") return response({ items: await tx`
      with activity_rollup as (
        select tenant_id,prospect_id,max(occurred_at) last_activity_at
        from crm_activity where tenant_id=${ctx.tenantId} and prospect_id is not null group by tenant_id,prospect_id
      ), opportunity_rollup as (
        select tenant_id,prospect_id,count(*)::int open_opportunities
        from opportunity where tenant_id=${ctx.tenantId} and prospect_id is not null and status='open' group by tenant_id,prospect_id
      )
      select p.*,c.display_name primary_contact_name,c.email_normalized primary_contact_email,
        tm.display_name responsible_member_name,t.name responsible_team_name,
        a.last_activity_at,coalesce(o.open_opportunities,0)::int open_opportunities
      from prospect p left join contact c on c.tenant_id=p.tenant_id and c.id=p.primary_contact_id
      left join tenant_member tm on tm.tenant_id=p.tenant_id and tm.id=p.responsible_member_id
      left join team t on t.tenant_id=p.tenant_id and t.id=p.responsible_team_id
      left join activity_rollup a on a.tenant_id=p.tenant_id and a.prospect_id=p.id
      left join opportunity_rollup o on o.tenant_id=p.tenant_id and o.prospect_id=p.id
      where p.tenant_id=${ctx.tenantId} order by p.updated_at desc,p.display_name` });
    const prospectId = crypto.randomUUID();
    const entityType = required(input!, "entityType", 40).toUpperCase();
    const primaryContactId = optional(input!, "primaryContactId", 36);
    if (primaryContactId) id(primaryContactId, "primaryContactId");
    const rows = await tx`insert into prospect(id,tenant_id,display_name,legal_name,entity_type,status,primary_contact_id,responsible_member_id,responsible_team_id,source,created_by,updated_by)
      values(${prospectId},${ctx.tenantId},${required(input!, "displayName", 240)},${optional(input!, "legalName", 240) ?? null},${entityType},'prospect',${primaryContactId ?? null},${optional(input!, "responsibleMemberId", 36) ?? null},${optional(input!, "responsibleTeamId", 36) ?? null},${optional(input!, "source", 120) ?? null},${ctx.actorId},${ctx.actorId}) returning *`;
    for (const contactId of ids(input!, "contactIds")) await tx`insert into prospect_contact_relationship(tenant_id,prospect_id,contact_id,relationship_type,is_primary,created_by)
      values(${ctx.tenantId},${prospectId},${contactId},'CONTACT',${contactId === primaryContactId},${ctx.actorId})`;
    if (primaryContactId) await tx`insert into prospect_contact_relationship(tenant_id,prospect_id,contact_id,relationship_type,is_primary,created_by)
      values(${ctx.tenantId},${prospectId},${primaryContactId},'PRIMARY_CONTACT',true,${ctx.actorId}) on conflict(tenant_id,prospect_id,contact_id) do update set is_primary=true,relationship_type='PRIMARY_CONTACT'`;
    await recordMutation(tx, ctx, "PROSPECT_CREATED", "PROSPECT", prospectId, null, { displayName: String(rows[0]!.display_name), source: rows[0]!.source as postgres.JSONValue }, "prospect.created");
    return response({ item: rows[0] }, 201);
  });
}

async function prospectItem(request: Request, env: Env, actorId: string, prospectId: string) {
  id(prospectId, "prospectId");
  const input = request.method === "PATCH" ? await requestBody(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "crm.view" : "prospects.edit", "practice.crm", async (tx, ctx) => {
    if (request.method === "GET") {
      const rows = await tx`select * from prospect where tenant_id=${ctx.tenantId} and id=${prospectId}`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Prospect not found");
      const contacts = await tx`select c.*,r.relationship_type,r.is_primary from prospect_contact_relationship r join contact c on c.tenant_id=r.tenant_id and c.id=r.contact_id where r.tenant_id=${ctx.tenantId} and r.prospect_id=${prospectId} order by r.is_primary desc,c.display_name`;
      const activities = await tx`select * from crm_activity where tenant_id=${ctx.tenantId} and prospect_id=${prospectId} order by occurred_at desc,id limit 100`;
      return response({ item: { ...rows[0], contacts, activities } });
    }
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    for (const [key, column, max] of [["displayName", "display_name", 240], ["legalName", "legal_name", 240], ["source", "source", 120], ["responsibleMemberId", "responsible_member_id", 36], ["responsibleTeamId", "responsible_team_id", 36]] as const) {
      const value = optional(input!, key, max); if (value !== undefined) changes[column] = value;
    }
    if ("status" in input!) { const status = required(input!, "status", 30).toLowerCase(); if (!PROSPECT_STATUSES.has(status) || status === "converted") throw new ApiError(400, "INVALID_REQUEST", "status is invalid"); changes.status = status; }
    if (Object.keys(changes).length === 2) throw new ApiError(400, "INVALID_REQUEST", "No supported changes were supplied");
    const columns = Object.keys(changes), rows = await tx`update prospect set ${tx(changes, ...columns)} where tenant_id=${ctx.tenantId} and id=${prospectId} and status<>'converted' returning *`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Editable prospect not found");
    await recordMutation(tx, ctx, "PROSPECT_UPDATED", "PROSPECT", prospectId, null, { changedFields: columns });
    return response({ item: rows[0] });
  });
}

async function opportunityCollection(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await requestBody(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "crm.view" : "opportunities.create", "practice.crm", async (tx, ctx) => {
    if (request.method === "GET") {
      const rows = await tx`
      with capabilities as (
        select actor_has_permission('opportunities.create') can_create,
          actor_has_permission('opportunities.edit') can_edit,
          actor_has_permission('opportunities.convert') can_convert,
          tenant_feature_is_enabled(${ctx.tenantId}::uuid,'quotebench.enabled') and
            tenant_feature_is_enabled(${ctx.tenantId}::uuid,'quotebench.proposals') quotebench_available
      ), service_rollup as (
        select os.tenant_id,os.opportunity_id,
          json_agg(json_build_object('id',os.id,'serviceId',s.id,'name',s.name,'accepted',os.accepted) order by s.name) services
        from opportunity_service os
        join practice_service s on s.tenant_id=os.tenant_id and s.id=os.service_id
        where os.tenant_id=${ctx.tenantId} group by os.tenant_id,os.opportunity_id
      ), latest_proposal as (
        select distinct on (tenant_id,opportunity_id) tenant_id,opportunity_id,status
        from quotebench_proposal_reference where tenant_id=${ctx.tenantId}
        order by tenant_id,opportunity_id,last_event_at desc
      ), opportunity_rows as (
        select o.*,coalesce(p.display_name,c.display_name,c.legal_name) relationship_name,sd.display_name stage_name,
          tm.display_name responsible_member_name,t.name responsible_team_name,
          coalesce(sr.services,'[]'::json) services,lp.status proposal_status
        from opportunity o left join prospect p on p.tenant_id=o.tenant_id and p.id=o.prospect_id
        left join organisation c on c.tenant_id=o.tenant_id and c.id=o.existing_client_id
        join crm_stage_definition sd on sd.tenant_id=o.tenant_id and sd.stage_key=o.stage_key
        left join tenant_member tm on tm.tenant_id=o.tenant_id and tm.id=o.responsible_member_id
        left join team t on t.tenant_id=o.tenant_id and t.id=o.responsible_team_id
        left join service_rollup sr on sr.tenant_id=o.tenant_id and sr.opportunity_id=o.id
        left join latest_proposal lp on lp.tenant_id=o.tenant_id and lp.opportunity_id=o.id
        where o.tenant_id=${ctx.tenantId}
      )
      select opportunity_rows.*,
        capabilities.can_create __can_create,capabilities.can_edit __can_edit,
        capabilities.can_convert __can_convert,capabilities.quotebench_available __quotebench_available
      from capabilities
      left join opportunity_rows on true
      order by opportunity_rows.status,opportunity_rows.expected_close_date nulls last,opportunity_rows.updated_at desc`;
      const capabilityRow = rows[0];
      const items = rows.flatMap((row) => {
        const { __can_create, __can_edit, __can_convert, __quotebench_available, ...item } = row;
        return item.id ? [item] : [];
      });
      return response({
        items,
        capabilities: {
          canCreate: Boolean(capabilityRow?.__can_create),
          canEdit: Boolean(capabilityRow?.__can_edit),
          canConvert: Boolean(capabilityRow?.__can_convert),
          quoteBenchAvailable: Boolean(capabilityRow?.__quotebench_available),
        },
      });
    }
    const opportunityId = crypto.randomUUID();
    const prospectId = input!.prospectId ? id(input!.prospectId, "prospectId") : null;
    const existingClientId = input!.existingClientId ? id(input!.existingClientId, "existingClientId") : null;
    if (!prospectId && !existingClientId) throw new ApiError(400, "INVALID_REQUEST", "prospectId or existingClientId is required");
    if (prospectId && existingClientId) throw new ApiError(400, "INVALID_REQUEST", "Choose either a prospect or an existing client");
    if (prospectId) {
      const prospect = await tx`select id from prospect where tenant_id=${ctx.tenantId} and id=${prospectId} and status in ('prospect','qualified')`;
      if (!prospect.length) throw new ApiError(400, "INVALID_REQUEST", "prospectId must identify an active prospect");
    }
    if (existingClientId) {
      const client = await tx`select id from organisation where tenant_id=${ctx.tenantId} and id=${existingClientId} and lifecycle_status='ACTIVE'`;
      if (!client.length) throw new ApiError(400, "INVALID_REQUEST", "existingClientId must identify an active client");
    }
    const stageKey = optional(input!, "stageKey", 50) ?? "qualification";
    const stage = await tx`select default_probability from crm_stage_definition where tenant_id=${ctx.tenantId} and stage_key=${stageKey} and status='active'`;
    if (!stage.length) throw new ApiError(400, "INVALID_REQUEST", "stageKey is not active");
    const currency = (optional(input!, "currency", 3) ?? "GBP").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "INVALID_REQUEST", "currency must be an ISO-style code");
    const responsibleMemberId = optional(input!, "responsibleMemberId", 36);
    const responsibleTeamId = optional(input!, "responsibleTeamId", 36);
    if (responsibleMemberId) id(responsibleMemberId, "responsibleMemberId");
    if (responsibleTeamId) id(responsibleTeamId, "responsibleTeamId");
    if (responsibleMemberId) {
      const member = await tx`select id from tenant_member where tenant_id=${ctx.tenantId} and id=${responsibleMemberId} and membership_status='ACTIVE'`;
      if (!member.length) throw new ApiError(400, "INVALID_REQUEST", "responsibleMemberId must identify an active member");
    }
    if (responsibleTeamId) {
      const team = await tx`select id from team where tenant_id=${ctx.tenantId} and id=${responsibleTeamId} and status='ACTIVE'`;
      if (!team.length) throw new ApiError(400, "INVALID_REQUEST", "responsibleTeamId must identify an active team");
    }
    const serviceIds = ids(input!, "serviceIds");
    for (const serviceId of serviceIds) {
      const service = await tx`select id from practice_service where tenant_id=${ctx.tenantId} and id=${serviceId} and status='active'`;
      if (!service.length) throw new ApiError(400, "INVALID_REQUEST", "serviceIds must identify active services");
    }
    const rows = await tx`insert into opportunity(id,tenant_id,prospect_id,existing_client_id,name,stage_key,responsible_member_id,responsible_team_id,expected_close_date,probability,estimated_value,currency,source,status,created_by,updated_by)
      values(${opportunityId},${ctx.tenantId},${prospectId},${existingClientId},${required(input!, "name", 240)},${stageKey},${responsibleMemberId ?? null},${responsibleTeamId ?? null},${dateValue(input!, "expectedCloseDate") ?? null},${boundedNumberValue(input!, "probability", 0, 100) ?? stage[0]!.default_probability},${boundedNumberValue(input!, "estimatedValue", 0)},${currency},${optional(input!, "source", 120) ?? null},'open',${ctx.actorId},${ctx.actorId}) returning *`;
    for (const serviceId of serviceIds) await tx`insert into opportunity_service(id,tenant_id,opportunity_id,service_id,created_by) values(${crypto.randomUUID()},${ctx.tenantId},${opportunityId},${serviceId},${ctx.actorId})`;
    await tx`insert into crm_activity(id,tenant_id,prospect_id,opportunity_id,activity_type,summary,created_by)
      values(${crypto.randomUUID()},${ctx.tenantId},${prospectId},${opportunityId},'system','Opportunity created',${ctx.actorId})`;
    await recordMutation(tx, ctx, "OPPORTUNITY_CREATED", "OPPORTUNITY", opportunityId, existingClientId, { prospectId, existingClientId, stageKey, serviceIds }, "opportunity.created");
    return response({ item: rows[0] }, 201);
  });
}

async function opportunityItem(request: Request, env: Env, actorId: string, opportunityId: string) {
  id(opportunityId, "opportunityId");
  const input = request.method === "PATCH" ? await requestBody(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "crm.view" : "opportunities.edit", "practice.crm", async (tx, ctx) => {
    const rows = await tx`select o.*,coalesce(p.display_name,c.display_name,c.legal_name) relationship_name,
      sd.display_name stage_name,sd.sequence stage_sequence,sd.terminal_outcome,
      tm.display_name responsible_member_name,t.name responsible_team_name
      from opportunity o
      left join prospect p on p.tenant_id=o.tenant_id and p.id=o.prospect_id
      left join organisation c on c.tenant_id=o.tenant_id and c.id=o.existing_client_id
      join crm_stage_definition sd on sd.tenant_id=o.tenant_id and sd.stage_key=o.stage_key
      left join tenant_member tm on tm.tenant_id=o.tenant_id and tm.id=o.responsible_member_id
      left join team t on t.tenant_id=o.tenant_id and t.id=o.responsible_team_id
      where o.tenant_id=${ctx.tenantId} and o.id=${opportunityId}${request.method === "PATCH" ? tx` for update of o` : tx``}`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Opportunity not found");
    if (request.method === "PATCH") {
      if (rows[0]!.status !== "open") throw new ApiError(409, "OPPORTUNITY_TERMINAL", "A terminal opportunity is read-only");
      const changes: Record<string, unknown> = {};
      const changedFields: string[] = [];
      const setChange = (column: string, field: string, value: unknown, equal?: (current: unknown, next: unknown) => boolean) => {
        const current = rows[0]![column];
        if (!(equal?.(current, value) ?? ((current === null ? null : String(current)) === (value === null ? null : String(value))))) {
          changes[column] = value;
          changedFields.push(field);
        }
      };
      if ("name" in input!) setChange("name", "name", required(input!, "name", 240));
      if ("responsibleMemberId" in input!) {
        const value = optional(input!, "responsibleMemberId", 36); if (value) id(value, "responsibleMemberId");
        if (value) { const member = await tx`select id from tenant_member where tenant_id=${ctx.tenantId} and id=${value} and membership_status='ACTIVE'`; if (!member.length) throw new ApiError(400, "INVALID_REQUEST", "responsibleMemberId must identify an active member"); }
        setChange("responsible_member_id", "responsibleMemberId", value ?? null);
      }
      if ("responsibleTeamId" in input!) {
        const value = optional(input!, "responsibleTeamId", 36); if (value) id(value, "responsibleTeamId");
        if (value) { const team = await tx`select id from team where tenant_id=${ctx.tenantId} and id=${value} and status='ACTIVE'`; if (!team.length) throw new ApiError(400, "INVALID_REQUEST", "responsibleTeamId must identify an active team"); }
        setChange("responsible_team_id", "responsibleTeamId", value ?? null);
      }
      if ("expectedCloseDate" in input!) setChange("expected_close_date", "expectedCloseDate", dateValue(input!, "expectedCloseDate") ?? null);
      const sameNumber = (current: unknown, next: unknown) => current === null || next === null ? current === next : Number(current) === Number(next);
      if ("probability" in input!) setChange("probability", "probability", boundedNumberValue(input!, "probability", 0, 100), sameNumber);
      if ("estimatedValue" in input!) setChange("estimated_value", "estimatedValue", boundedNumberValue(input!, "estimatedValue", 0), sameNumber);
      if ("currency" in input!) {
        const value = required(input!, "currency", 3).toUpperCase();
        if (!/^[A-Z]{3}$/.test(value)) throw new ApiError(400, "INVALID_REQUEST", "currency must be an ISO-style code");
        setChange("currency", "currency", value);
      }
      if ("source" in input!) setChange("source", "source", optional(input!, "source", 120) ?? null);
      let serviceIds: string[] | null = null;
      if ("serviceIds" in input!) {
        serviceIds = ids(input!, "serviceIds");
        for (const serviceId of serviceIds) {
          const service = await tx`select s.id from practice_service s where s.tenant_id=${ctx.tenantId} and s.id=${serviceId}
            and (s.status='active' or exists(select 1 from opportunity_service os where os.tenant_id=s.tenant_id and os.opportunity_id=${opportunityId} and os.service_id=s.id))`;
          if (!service.length) throw new ApiError(400, "INVALID_REQUEST", "serviceIds must identify available services");
        }
        const existingServices = await tx`select service_id from opportunity_service where tenant_id=${ctx.tenantId} and opportunity_id=${opportunityId}`;
        const existingIds = existingServices.map((item) => String(item.service_id)).sort();
        if (existingIds.join(",") !== [...serviceIds].sort().join(",")) changedFields.push("serviceIds");
      }
      if (!changedFields.length) throw new ApiError(400, "NO_SUPPORTED_CHANGES", "No supported changes were supplied");
      if (Object.keys(changes).length) {
        changes.updated_by = ctx.actorId; changes.updated_at = new Date().toISOString();
        const columns = Object.keys(changes);
        const updated = await tx`update opportunity set ${tx(changes, ...columns)} where tenant_id=${ctx.tenantId} and id=${opportunityId} returning *`;
        Object.assign(rows[0]!, updated[0]);
      }
      if (serviceIds) {
        const retained = new Set(serviceIds);
        const currentServices = await tx`select id,service_id from opportunity_service where tenant_id=${ctx.tenantId} and opportunity_id=${opportunityId}`;
        for (const item of currentServices) if (!retained.has(String(item.service_id)))
          await tx`delete from opportunity_service where tenant_id=${ctx.tenantId} and id=${item.id}`;
        for (const serviceId of serviceIds) await tx`insert into opportunity_service(id,tenant_id,opportunity_id,service_id,created_by)
          values(${crypto.randomUUID()},${ctx.tenantId},${opportunityId},${serviceId},${ctx.actorId}) on conflict(tenant_id,opportunity_id,service_id) do nothing`;
      }
      await tx`insert into crm_activity(id,tenant_id,prospect_id,opportunity_id,activity_type,summary,created_by)
        values(${crypto.randomUUID()},${ctx.tenantId},${rows[0]!.prospect_id},${opportunityId},'system',${`Opportunity updated: ${changedFields.join(", ")}`},${ctx.actorId})`;
      await recordMutation(tx, ctx, "OPPORTUNITY_UPDATED", "OPPORTUNITY", opportunityId, rows[0]!.existing_client_id ? String(rows[0]!.existing_client_id) : null, { changedFields }, "opportunity.updated");
      const labels = await tx`select tm.display_name responsible_member_name,t.name responsible_team_name
        from opportunity o left join tenant_member tm on tm.tenant_id=o.tenant_id and tm.id=o.responsible_member_id
        left join team t on t.tenant_id=o.tenant_id and t.id=o.responsible_team_id
        where o.tenant_id=${ctx.tenantId} and o.id=${opportunityId}`;
      Object.assign(rows[0]!, labels[0]);
    }
    const services = await tx`select os.*,s.name service_name,s.category from opportunity_service os join practice_service s on s.tenant_id=os.tenant_id and s.id=os.service_id where os.tenant_id=${ctx.tenantId} and os.opportunity_id=${opportunityId} order by s.name`;
    const proposals = await tx`select * from quotebench_proposal_reference where tenant_id=${ctx.tenantId} and opportunity_id=${opportunityId} order by last_event_at desc`;
    const activities = await tx`select * from crm_activity where tenant_id=${ctx.tenantId} and opportunity_id=${opportunityId} order by occurred_at desc,id limit 100`;
    const conversion = await tx`select cv.*,coalesce(c.display_name,c.legal_name) client_name,e.name engagement_name,oc.status onboarding_status,
      q.proposal_id,q.proposal_version,q.status proposal_status,
      coalesce((select json_agg(json_build_object('clientServiceId',ocs.client_service_id,'opportunityServiceId',ocs.opportunity_service_id,'serviceId',cs.service_id,'serviceName',ps.name) order by ps.name)
        from onboarding_case_service ocs join client_service cs on cs.tenant_id=ocs.tenant_id and cs.id=ocs.client_service_id
        join practice_service ps on ps.tenant_id=cs.tenant_id and ps.id=cs.service_id
        where ocs.tenant_id=cv.tenant_id and ocs.onboarding_case_id=cv.onboarding_case_id),'[]') activated_services
      from crm_conversion cv join organisation c on c.tenant_id=cv.tenant_id and c.id=cv.client_id
      join practice_engagement e on e.tenant_id=cv.tenant_id and e.id=cv.engagement_id
      join onboarding_case oc on oc.tenant_id=cv.tenant_id and oc.id=cv.onboarding_case_id
      join quotebench_proposal_reference q on q.tenant_id=cv.tenant_id and q.id=cv.proposal_reference_id
      where cv.tenant_id=${ctx.tenantId} and cv.opportunity_id=${opportunityId}`;
    return response({ item: { ...rows[0], services, proposals, activities, conversion: conversion[0] ?? null,
      capabilities: await opportunityCapabilities(tx, ctx.tenantId) } });
  });
}

async function opportunityStage(request: Request, env: Env, actorId: string, opportunityId: string) {
  id(opportunityId, "opportunityId"); const input = await requestBody(request);
  return within(request, env, actorId, "opportunities.edit", "practice.crm", async (tx, ctx) => {
    const stageKey = required(input, "stageKey", 50);
    const stage = await tx`select terminal_outcome,default_probability from crm_stage_definition where tenant_id=${ctx.tenantId} and stage_key=${stageKey} and status='active'`;
    if (!stage.length) throw new ApiError(400, "INVALID_REQUEST", "stageKey is not active");
    const current = await tx`select * from opportunity where tenant_id=${ctx.tenantId} and id=${opportunityId} for update`;
    if (!current.length) throw new ApiError(404, "NOT_FOUND", "Opportunity not found");
    if (current[0]!.status !== "open") throw new ApiError(409, "OPPORTUNITY_TERMINAL", "A terminal opportunity cannot change stage");
    if (String(current[0]!.stage_key) === stageKey) throw new ApiError(409, "NO_OP_STAGE_TRANSITION", "Choose a stage other than the current stage");
    if (stage[0]!.terminal_outcome === "won") throw new ApiError(409, "ACCEPTANCE_REQUIRED", "Only accepted proposal conversion can mark an opportunity won");
    const status = stage[0]!.terminal_outcome === "lost" ? "lost" : "open";
    const outcomeReason = stage[0]!.terminal_outcome === "lost" ? required(input, "outcomeReason", 1000) : null;
    const rows = await tx`update opportunity set stage_key=${stageKey},status=${status},probability=${boundedNumberValue(input, "probability", 0, 100) ?? stage[0]!.default_probability},outcome_reason=${outcomeReason},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${opportunityId} returning *`;
    const activitySummary = outcomeReason ? `Stage changed from ${current[0]!.stage_key} to ${stageKey}. Lost reason: ${outcomeReason}` : `Stage changed from ${current[0]!.stage_key} to ${stageKey}`;
    await tx`insert into crm_activity(id,tenant_id,prospect_id,opportunity_id,activity_type,summary,created_by) values(${crypto.randomUUID()},${ctx.tenantId},${current[0]!.prospect_id},${opportunityId},'stage_change',${activitySummary},${ctx.actorId})`;
    await recordMutation(tx, ctx, "OPPORTUNITY_STAGE_CHANGED", "OPPORTUNITY", opportunityId, current[0]!.existing_client_id ? String(current[0]!.existing_client_id) : null, { fromStage: String(current[0]!.stage_key), toStage: stageKey, status, outcomeReason }, "opportunity.stage_changed");
    return response({ item: rows[0] });
  });
}

async function linkProposal(request: Request, env: Env, actorId: string, opportunityId: string) {
  id(opportunityId, "opportunityId"); const input = await requestBody(request);
  return within(request, env, actorId, "opportunities.edit", "practice.crm", async (tx, ctx) => {
    await assertPlatformEntitled(tx, "quotebench.enabled"); await assertPlatformEntitled(tx, "quotebench.proposals");
    const opportunity = await tx`select * from opportunity where tenant_id=${ctx.tenantId} and id=${opportunityId} and status='open'`;
    if (!opportunity.length) throw new ApiError(404, "NOT_FOUND", "Open opportunity not found");
    const services = await tx`select os.id opportunity_service_id,os.service_id,s.name from opportunity_service os join practice_service s on s.tenant_id=os.tenant_id and s.id=os.service_id where os.tenant_id=${ctx.tenantId} and os.opportunity_id=${opportunityId}`;
    if (!services.length) throw new ApiError(409, "SERVICES_REQUIRED", "Select at least one service before linking a proposal");
    const proposalReferenceId = crypto.randomUUID(), proposalId = required(input, "proposalId", 200), version = optional(input, "proposalVersion", 80) ?? "1";
    const rows = await tx`insert into quotebench_proposal_reference(id,tenant_id,opportunity_id,proposal_id,proposal_version,status,created_by,updated_by) values(${proposalReferenceId},${ctx.tenantId},${opportunityId},${proposalId},${version},'created',${ctx.actorId},${ctx.actorId}) returning *`;
    await tx`insert into crm_activity(id,tenant_id,prospect_id,opportunity_id,activity_type,summary,created_by)
      values(${crypto.randomUUID()},${ctx.tenantId},${opportunity[0]!.prospect_id},${opportunityId},'system',${`QuoteBench proposal ${proposalId} linked`},${ctx.actorId})`;
    await recordMutation(tx, ctx, "PROPOSAL_LINKED", "QUOTEBENCH_PROPOSAL_REFERENCE", proposalReferenceId, opportunity[0]!.existing_client_id ? String(opportunity[0]!.existing_client_id) : null, { opportunityId, proposalId, proposalVersion: version, serviceIds: services.map((item) => String(item.service_id)) }, "proposal.linked");
    return response({ item: rows[0], sharedContext: { tenantId: ctx.tenantId, opportunityId, prospectId: opportunity[0]!.prospect_id, clientId: opportunity[0]!.existing_client_id, responsibleMemberId: opportunity[0]!.responsible_member_id, currency: opportunity[0]!.currency, services } }, 201);
  });
}

async function instantiateOnboardingWork(tx: PlatformTX, ctx: PlatformContext, templateId: string, clientId: string, clientServiceId: string, engagementId: string): Promise<string> {
  const templates = await tx`select * from work_template where tenant_id=${ctx.tenantId} and id=${templateId} and status in ('published','superseded')`;
  if (!templates.length) throw new ApiError(409, "ONBOARDING_TEMPLATE_INVALID", "Onboarding template must be published");
  const workId = crypto.randomUUID();
  await tx`insert into work_item(id,tenant_id,client_id,client_service_id,engagement_id,title,status,assigned_member_id,assigned_team_id,source_template_id,source_template_version,created_by,updated_by)
    values(${workId},${ctx.tenantId},${clientId},${clientServiceId},${engagementId},${`Client onboarding — ${templates[0]!.name}`},'not_started',null,null,${templateId},${templates[0]!.version},${ctx.actorId},${ctx.actorId})`;
  const stageIds = new Map<string, string>();
  const stages = await tx`select * from work_template_stage where tenant_id=${ctx.tenantId} and work_template_id=${templateId} and status='active' order by sequence,id`;
  for (const stage of stages) {
    const stageId = crypto.randomUUID(); stageIds.set(String(stage.id), stageId);
    await tx`insert into work_stage(id,tenant_id,work_item_id,source_template_stage_id,source_template_id,source_template_version,name,sequence,stage_type,status,entry_criteria,completion_criteria,skippable,created_by,updated_by)
      values(${stageId},${ctx.tenantId},${workId},${stage.id},${templateId},${templates[0]!.version},${stage.name},${stage.sequence},${stage.stage_type},'not_started',${tx.json(stage.entry_criteria as postgres.JSONValue)},${tx.json(stage.completion_criteria as postgres.JSONValue)},${stage.skippable},${ctx.actorId},${ctx.actorId})`;
  }
  const tasks = await tx`select * from work_template_task where tenant_id=${ctx.tenantId} and work_template_id=${templateId} order by sequence,id`;
  for (const task of tasks) await tx`insert into practice_task(id,tenant_id,work_item_id,title,description,status,team_id,sequence,source_template_task_id,mandatory,work_stage_id,review_required,created_by,updated_by)
    values(${crypto.randomUUID()},${ctx.tenantId},${workId},${task.title},${task.description},'not_started',${task.default_team_id},${task.sequence},${task.id},${task.mandatory},${task.work_template_stage_id ? stageIds.get(String(task.work_template_stage_id)) ?? null : null},${task.review_required},${ctx.actorId},${ctx.actorId})`;
  await recordMutation(tx, ctx, "WORK_TEMPLATE_INSTANTIATED", "WORK_ITEM", workId, clientId, { templateId, templateVersion: Number(templates[0]!.version), taskCount: tasks.length, stageCount: stages.length }, "work.template_instantiated");
  return workId;
}

async function queueNotification(tx: PlatformTX, ctx: PlatformContext, recipientReference: string, templateCode: string, relatedType: string, relatedId: string, payload: Record<string, postgres.JSONValue>) {
  const outboxId = crypto.randomUUID(), notificationId = crypto.randomUUID(), idempotencyKey = `${ctx.correlationId}:notification:${templateCode}:${recipientReference}:${relatedId}`;
  const envelope = { channel: "IN_APP", recipientReference, templateCode, relatedEntityType: relatedType, relatedEntityId: relatedId, payload, notificationId };
  const inserted = await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key,max_attempts)
    values(${outboxId},${ctx.tenantId},${relatedType},${relatedId},'notification.requested',${tx.json(envelope)},${ctx.correlationId},${idempotencyKey},8)
    on conflict(tenant_id,idempotency_key) do nothing returning id`;
  if (!inserted.length) return;
  await tx`insert into notification(id,tenant_id,outbox_event_id,channel,recipient_reference,template_code,payload,idempotency_key,created_by,related_entity_type,related_entity_id)
    values(${notificationId},${ctx.tenantId},${outboxId},'IN_APP',${recipientReference},${templateCode},${tx.json(payload)},${idempotencyKey},${ctx.actorId},${relatedType},${relatedId})`;
  await recordMutation(tx, ctx, "NOTIFICATION_QUEUED", "NOTIFICATION", notificationId, null, { templateCode, relatedEntityType: relatedType, relatedEntityId: relatedId });
}

export async function convertAcceptedProposal(tx: PlatformTX, ctx: PlatformContext, input: Record<string, unknown>, proposal: postgres.Row, eventId: string) {
  const existing = await tx`select * from crm_conversion where tenant_id=${ctx.tenantId} and acceptance_event_id=${eventId}`;
  if (existing.length) return existing[0];
  const opportunityId = String(proposal.opportunity_id);
  const opportunityRows = await tx`select o.*,p.display_name prospect_display_name,p.legal_name prospect_legal_name,p.entity_type prospect_entity_type,p.primary_contact_id,p.converted_client_id
    from opportunity o left join prospect p on p.tenant_id=o.tenant_id and p.id=o.prospect_id where o.tenant_id=${ctx.tenantId} and o.id=${opportunityId} for update of o`;
  if (!opportunityRows.length) throw new ApiError(404, "NOT_FOUND", "Opportunity not found");
  const opportunity = opportunityRows[0]!;
  let clientId = opportunity.existing_client_id ? String(opportunity.existing_client_id) : opportunity.converted_client_id ? String(opportunity.converted_client_id) : null;
  if (!clientId) {
    if (!opportunity.prospect_id) throw new ApiError(409, "CLIENT_SELECTION_REQUIRED", "An existing client or prospect is required");
    clientId = crypto.randomUUID();
    await tx`insert into organisation(id,tenant_id,legal_name,legal_form,jurisdiction,display_name,entity_type,responsible_member_id,responsible_team_id,primary_contact_id,created_by,updated_by,originating_prospect_id,originating_opportunity_id,originating_proposal_reference_id,converted_at)
      values(${clientId},${ctx.tenantId},${opportunity.prospect_legal_name ?? opportunity.prospect_display_name},${opportunity.prospect_entity_type ?? 'OTHER'},'UK',${opportunity.prospect_display_name},${opportunity.prospect_entity_type ?? 'OTHER'},${opportunity.responsible_member_id},${opportunity.responsible_team_id},${opportunity.primary_contact_id},${ctx.actorId},${ctx.actorId},${opportunity.prospect_id},${opportunityId},${proposal.id},now())`;
    await tx`insert into client_contact_relationship(tenant_id,client_id,contact_id,relationship_type_key,is_primary,created_by,updated_by)
      select r.tenant_id,${clientId},r.contact_id,case when r.is_primary then 'PRIMARY_CONTACT' else 'OTHER' end,r.is_primary,${ctx.actorId},${ctx.actorId}
      from prospect_contact_relationship r where r.tenant_id=${ctx.tenantId} and r.prospect_id=${opportunity.prospect_id} on conflict do nothing`;
    await recordMutation(tx, ctx, "CLIENT_CREATED_FROM_PROSPECT", "CLIENT", clientId, clientId, { prospectId: String(opportunity.prospect_id), opportunityId, proposalReferenceId: String(proposal.id) }, "client.created_from_prospect");
  } else {
    const clients = await tx`select id from organisation where tenant_id=${ctx.tenantId} and id=${clientId} and lifecycle_status='ACTIVE'`;
    if (!clients.length) throw new ApiError(409, "CLIENT_NOT_ACTIVE", "The selected existing client is not active");
  }
  const services = await tx`select os.*,s.name,s.default_frequency,s.default_work_template_id,s.specialist_module_key,s.required_entitlement_feature_key
    from opportunity_service os join practice_service s on s.tenant_id=os.tenant_id and s.id=os.service_id
    where os.tenant_id=${ctx.tenantId} and os.opportunity_id=${opportunityId} order by os.created_at,os.id`;
  if (!services.length) throw new ApiError(409, "SERVICES_REQUIRED", "Accepted opportunity has no proposed services");
  const activated: Array<{ opportunityServiceId: string; clientServiceId: string; serviceId: string }> = [];
  for (const service of services) {
    if (service.specialist_module_key === "ledgerly") {
      await assertPlatformEntitled(tx, "ledgerly.enabled");
      await assertPlatformEntitled(tx, String(service.required_entitlement_feature_key ?? "ledgerly.accounts"));
    } else if (service.required_entitlement_feature_key) await assertPlatformEntitled(tx, String(service.required_entitlement_feature_key));
    let clientService = await tx`select id from client_service where tenant_id=${ctx.tenantId} and originating_opportunity_service_id=${service.id}`;
    if (!clientService.length) clientService = await tx`insert into client_service(id,tenant_id,client_id,service_id,status,start_date,frequency,responsible_member_id,responsible_team_id,specialist_module_key,configuration,created_by,updated_by,delivery_readiness,originating_opportunity_service_id)
      values(${crypto.randomUUID()},${ctx.tenantId},${clientId},${service.service_id},'active',current_date,${service.default_frequency},${opportunity.responsible_member_id},${opportunity.responsible_team_id},${service.specialist_module_key},'{}'::jsonb,${ctx.actorId},${ctx.actorId},'onboarding',${service.id}) returning id`;
    await tx`update opportunity_service set accepted=true where tenant_id=${ctx.tenantId} and id=${service.id}`;
    activated.push({ opportunityServiceId: String(service.id), clientServiceId: String(clientService[0]!.id), serviceId: String(service.service_id) });
    await recordMutation(tx, ctx, "CLIENT_SERVICE_ACTIVATED_FROM_PROPOSAL", "CLIENT_SERVICE", String(clientService[0]!.id), clientId, { opportunityId, opportunityServiceId: String(service.id), serviceId: String(service.service_id), deliveryReadiness: "onboarding" }, "client_service.activated_from_proposal");
  }
  const engagementId = crypto.randomUUID();
  const engagement = await tx`insert into practice_engagement(id,tenant_id,client_id,reference,name,status,start_date,responsible_owner_id,responsible_team_id,acceptance_state,accepted_by,accepted_at,created_by,updated_by)
    values(${engagementId},${ctx.tenantId},${clientId},${`QB-${opportunityId.slice(0, 8)}-${String(proposal.proposal_version).slice(0, 20)}`},${String(opportunity.name)},'active',current_date,${opportunity.responsible_member_id},${opportunity.responsible_team_id},'accepted',${ctx.actorId},now(),${ctx.actorId},${ctx.actorId}) returning *`;
  for (const item of activated) await tx`insert into practice_engagement_service(tenant_id,engagement_id,client_service_id,client_id,created_by) values(${ctx.tenantId},${engagementId},${item.clientServiceId},${clientId},${ctx.actorId})`;
  const commercial = quoteBenchCommercialContext(input);
  for (const item of commercial.serviceValues) {
    const activatedService = activated.find((candidate) => candidate.serviceId === item.serviceId);
    if (!activatedService) throw new ApiError(409, "COMMERCIAL_SERVICE_MISMATCH", "Commercial context references a service outside the accepted proposal");
    const contextId = crypto.randomUUID();
    await tx`insert into work_commercial_context(id,tenant_id,client_id,client_service_id,engagement_id,proposal_reference_id,agreed_value,currency,billing_model,billing_frequency,value_status,source_type,source_version,effective_from,created_by,updated_by)
      values(${contextId},${ctx.tenantId},${clientId},${activatedService.clientServiceId},${engagementId},${proposal.id},${item.value},${item.currency},${commercial.billingModel},${commercial.billingFrequency},'known','quotebench_accepted_proposal',${String(proposal.proposal_version)},current_date,${ctx.actorId},${ctx.actorId})`;
    await recordMutation(tx, ctx, "COMMERCIAL_CONTEXT_CAPTURED", "WORK_COMMERCIAL_CONTEXT", contextId, clientId, { proposalReferenceId: String(proposal.id), clientServiceId: activatedService.clientServiceId, serviceId: item.serviceId, currency: item.currency, valueStatus: "known" }, "commercial.context_captured");
  }
  await recordMutation(tx, ctx, "ENGAGEMENT_ACTIVATED_FROM_PROPOSAL", "PRACTICE_ENGAGEMENT", engagementId, clientId, { opportunityId, proposalReferenceId: String(proposal.id), clientServiceIds: activated.map((item) => item.clientServiceId) }, "engagement.activated_from_proposal");
  for (const item of activated) {
    const service = services.find((candidate) => String(candidate.id) === item.opportunityServiceId)!;
    if (!service.default_work_template_id || !service.default_frequency) continue;
    const template = await tx`select id from work_template where tenant_id=${ctx.tenantId} and id=${service.default_work_template_id} and service_id=${service.service_id} and status='published'`;
    if (!template.length) continue;
    const frequency = String(service.default_frequency).toLowerCase();
    const recurrence: RecurrenceRule | null = frequency === "weekly" ? { frequency: "weekly", interval: 1 }
      : frequency === "monthly" ? { frequency: "monthly", interval: 1 }
      : frequency === "quarterly" ? { frequency: "quarterly", interval: 1 }
      : ["annual", "annually", "yearly"].includes(frequency) ? { frequency: "annually", interval: 1 } : null;
    if (!recurrence) continue;
    const effectiveFrom = new Date().toISOString().slice(0, 10), throughDate = new Date();
    throughDate.setUTCFullYear(throughDate.getUTCFullYear() + 2);
    const next = evaluateRecurrence(recurrence, effectiveFrom, throughDate.toISOString().slice(0, 10), null, 1)[0];
    const scheduleId = crypto.randomUUID();
    await tx`insert into recurring_work_schedule(id,tenant_id,client_id,client_service_id,engagement_id,work_template_id,recurrence_rule,effective_from,generation_horizon_type,generation_horizon_value,due_date_rule,default_assignee_member_id,default_team_id,specialist_module_key,next_occurrence_date,created_by,updated_by)
      values(${scheduleId},${ctx.tenantId},${clientId},${item.clientServiceId},${engagementId},${service.default_work_template_id},${tx.json(recurrence as unknown as postgres.JSONValue)},${effectiveFrom},'periods',12,'{}'::jsonb,${opportunity.responsible_member_id},${opportunity.responsible_team_id},${service.specialist_module_key},${next?.occurrenceDate ?? null},${ctx.actorId},${ctx.actorId})`;
    await recordMutation(tx, ctx, "RECURRING_SCHEDULE_CREATED", "RECURRING_SCHEDULE", scheduleId, clientId, { clientServiceId: item.clientServiceId, workTemplateId: String(service.default_work_template_id), opportunityId }, "recurring_schedule.created");
  }
  const onboardingTemplateId = input.onboardingTemplateId ? id(input.onboardingTemplateId, "onboardingTemplateId") : null;
  const workItemId = onboardingTemplateId ? await instantiateOnboardingWork(tx, ctx, onboardingTemplateId, clientId, activated[0]!.clientServiceId, engagementId) : null;
  const onboardingCaseId = crypto.randomUUID();
  await tx`insert into onboarding_case(id,tenant_id,client_id,opportunity_id,proposal_reference_id,engagement_id,work_template_id,work_item_id,responsible_member_id,responsible_team_id,status,started_at,created_by,updated_by)
    values(${onboardingCaseId},${ctx.tenantId},${clientId},${opportunityId},${proposal.id},${engagementId},${onboardingTemplateId},${workItemId},${opportunity.responsible_member_id},${opportunity.responsible_team_id},'in_progress',now(),${ctx.actorId},${ctx.actorId})`;
  for (const item of activated) await tx`insert into onboarding_case_service(tenant_id,onboarding_case_id,client_service_id,opportunity_service_id) values(${ctx.tenantId},${onboardingCaseId},${item.clientServiceId},${item.opportunityServiceId})`;
  const conversionId = crypto.randomUUID();
  const conversion = await tx`insert into crm_conversion(id,tenant_id,acceptance_event_id,opportunity_id,proposal_reference_id,prospect_id,client_id,engagement_id,onboarding_case_id,converted_by)
    values(${conversionId},${ctx.tenantId},${eventId},${opportunityId},${proposal.id},${opportunity.prospect_id},${clientId},${engagementId},${onboardingCaseId},${ctx.actorId}) returning *`;
  await tx`update opportunity set stage_key='won',status='won',probability=100,conversion_state='converted',updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${opportunityId}`;
  if (opportunity.prospect_id) await tx`update prospect set status='converted',converted_client_id=${clientId},converted_at=now(),updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${opportunity.prospect_id} and status<>'converted'`;
  await tx`update organisation set originating_prospect_id=coalesce(originating_prospect_id,${opportunity.prospect_id}),originating_opportunity_id=coalesce(originating_opportunity_id,${opportunityId}),originating_proposal_reference_id=coalesce(originating_proposal_reference_id,${proposal.id}),converted_at=coalesce(converted_at,now()) where tenant_id=${ctx.tenantId} and id=${clientId}`;
  await tx`insert into crm_activity(id,tenant_id,prospect_id,opportunity_id,activity_type,summary,created_by)
    values(${crypto.randomUUID()},${ctx.tenantId},${opportunity.prospect_id},${opportunityId},'system','QuoteBench proposal accepted; opportunity converted to client and onboarding',${ctx.actorId})`;
  await recordMutation(tx, ctx, "PROSPECT_CONVERTED", "PROSPECT", String(opportunity.prospect_id ?? opportunityId), clientId, { opportunityId, clientId, proposalReferenceId: String(proposal.id) }, "prospect.converted");
  await recordMutation(tx, ctx, "ONBOARDING_STARTED", "ONBOARDING_CASE", onboardingCaseId, clientId, { opportunityId, engagementId, workItemId, clientServiceIds: activated.map((item) => item.clientServiceId) }, "onboarding.started");
  const recipient = await tx`select actor_id from tenant_member where tenant_id=${ctx.tenantId} and id=${opportunity.responsible_member_id} and membership_status='ACTIVE'`;
  await queueNotification(tx, ctx, recipient.length ? String(recipient[0]!.actor_id) : ctx.actorId, "proposal.accepted", "OPPORTUNITY", opportunityId, { opportunityId, clientId, onboardingCaseId });
  return conversion[0]!;
}

async function quoteBenchEvent(request: Request, env: Env, actorId: string) {
  const input = await requestBody(request), eventId = id(input.eventId, "eventId"), eventType = required(input, "eventType", 160), status = PROPOSAL_EVENTS.get(eventType);
  if (!status) throw new ApiError(400, "INVALID_EVENT_TYPE", "Unsupported QuoteBench event type");
  return within(request, env, actorId, eventType.endsWith("accepted") ? "opportunities.convert" : "opportunities.edit", "practice.crm", async (tx, ctx) => {
    if (actorId.startsWith("quotebench:")) {
      const keyId = request.headers.get("x-practiceengine-machine-key-id"), machineEventId = request.headers.get("x-practiceengine-machine-event-id"), payloadHash = request.headers.get("x-practiceengine-payload-hash"), signedAt = request.headers.get("x-practiceengine-machine-signed-at"), expiresAt = request.headers.get("x-practiceengine-machine-expires-at");
      if (!keyId || machineEventId !== eventId || !payloadHash || !signedAt || !expiresAt)
        throw new ApiError(401, "MACHINE_CONTEXT_INVALID", "The verified machine context does not match the event");
      const claimed = await tx`select claim_quotebench_request(${ctx.tenantId}::uuid,${keyId},${eventId},${payloadHash},${signedAt}::timestamptz,${expiresAt}::timestamptz) claimed`;
      if (claimed[0]?.claimed !== true) throw new ApiError(409, "MACHINE_REQUEST_REPLAYED", "The signed machine request was already used or has expired");
    }
    if (actorId.startsWith("quotebench:")) {
      const proposalDecision = await tx`select machine_tenant_feature_enabled(${ctx.tenantId}::uuid,'quotebench.proposals') enabled`;
      if (proposalDecision[0]?.enabled !== true) throw new ApiError(403, "ENTITLEMENT_REQUIRED", "QuoteBench proposals are not enabled");
    } else {
      await assertPlatformEntitled(tx, "quotebench.enabled"); await assertPlatformEntitled(tx, "quotebench.proposals");
    }
    const receipt = await tx`select id from specialist_event_receipt where tenant_id=${ctx.tenantId} and module_key='quotebench' and event_id=${eventId}`;
    if (receipt.length) {
      const conversion = await tx`select * from crm_conversion where tenant_id=${ctx.tenantId} and acceptance_event_id=${eventId}`;
      return response({ duplicate: true, conversion: conversion[0] ?? null });
    }
    const proposalId = required(input, "proposalId", 200), version = optional(input, "proposalVersion", 80) ?? "1";
    const proposals = await tx`select * from quotebench_proposal_reference where tenant_id=${ctx.tenantId} and proposal_id=${proposalId} and proposal_version=${version} for update`;
    if (!proposals.length) throw new ApiError(404, "NOT_FOUND", "QuoteBench proposal reference not found");
    const proposal = proposals[0]!;
    let conversion: postgres.Row | null = null;
    if (status === "accepted") {
      const commercial = quoteBenchCommercialContext(input);
      await tx`update quotebench_proposal_reference set status='accepted',accepted_event_id=${eventId},accepted_at=now(),commercial_acceptance_reference=${optional(input, "commercialAcceptanceReference", 500) ?? null},accepted_value=${commercial.acceptedValue},accepted_currency=${commercial.currency},billing_model=${commercial.billingModel},billing_frequency=${commercial.billingFrequency},accepted_service_values=${tx.json(commercial.serviceValues)},last_event_at=now(),updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${proposal.id}`;
      conversion = await convertAcceptedProposal(tx, ctx, input, { ...proposal, accepted_event_id: eventId }, eventId);
      await recordMutation(tx, ctx, "PROPOSAL_ACCEPTED", "QUOTEBENCH_PROPOSAL_REFERENCE", String(proposal.id), String(conversion.client_id), { proposalId, proposalVersion: version, opportunityId: String(proposal.opportunity_id), acceptanceEventId: eventId, acceptedValueKnown: commercial.acceptedValue !== null, serviceValueCount: commercial.serviceValues.length }, "proposal.accepted");
    } else {
      await tx`update quotebench_proposal_reference set status=${status},last_event_at=now(),updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${proposal.id}`;
      await tx`insert into crm_activity(id,tenant_id,prospect_id,opportunity_id,activity_type,summary,created_by)
        select ${crypto.randomUUID()},${ctx.tenantId},o.prospect_id,o.id,'system',${`QuoteBench proposal ${status}`},${ctx.actorId}
        from opportunity o where o.tenant_id=${ctx.tenantId} and o.id=${proposal.opportunity_id}`;
      await recordMutation(tx, ctx, `PROPOSAL_${status.toUpperCase()}`, "QUOTEBENCH_PROPOSAL_REFERENCE", String(proposal.id), null, { proposalId, proposalVersion: version, opportunityId: String(proposal.opportunity_id) }, eventType);
    }
    await tx`insert into specialist_event_receipt(id,tenant_id,module_key,event_id,event_type,payload_version,status,subject_reference,correlation_id) values(${crypto.randomUUID()},${ctx.tenantId},'quotebench',${eventId},${eventType},${Number(input.payloadVersion ?? 1)},'processed',${proposalId},${ctx.correlationId})`;
    return response({ duplicate: false, status, conversion }, status === "accepted" ? 201 : 200);
  });
}

async function onboardingCollection(request: Request, env: Env, actorId: string) {
  return within(request, env, actorId, "onboarding.view", "practice.onboarding", async (tx, ctx) => response({ items: await tx`
    select oc.*,coalesce(o.display_name,o.legal_name) client_name,op.name opportunity_name,e.name engagement_name,w.title work_title,
      (select count(*)::int from onboarding_blocker b where b.tenant_id=oc.tenant_id and b.onboarding_case_id=oc.id and b.status='open') open_blockers
    from onboarding_case oc join organisation o on o.tenant_id=oc.tenant_id and o.id=oc.client_id
    join opportunity op on op.tenant_id=oc.tenant_id and op.id=oc.opportunity_id
    join practice_engagement e on e.tenant_id=oc.tenant_id and e.id=oc.engagement_id
    left join work_item w on w.tenant_id=oc.tenant_id and w.id=oc.work_item_id
    where oc.tenant_id=${ctx.tenantId} order by oc.status,oc.updated_at desc` }));
}

async function onboardingDetail(request: Request, env: Env, actorId: string, onboardingId: string) {
  id(onboardingId, "onboardingId");
  return within(request, env, actorId, "onboarding.view", "practice.onboarding", async (tx, ctx) => {
    const rows = await tx`select * from onboarding_case where tenant_id=${ctx.tenantId} and id=${onboardingId}`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Onboarding case not found");
    const services = await tx`select cs.*,s.name service_name from onboarding_case_service ocs join client_service cs on cs.tenant_id=ocs.tenant_id and cs.id=ocs.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id where ocs.tenant_id=${ctx.tenantId} and ocs.onboarding_case_id=${onboardingId}`;
    const blockers = await tx`select * from onboarding_blocker where tenant_id=${ctx.tenantId} and onboarding_case_id=${onboardingId} order by status,created_at`;
    const tasks = rows[0]!.work_item_id ? await tx`select * from practice_task where tenant_id=${ctx.tenantId} and work_item_id=${rows[0]!.work_item_id} order by sequence,id` : [];
    const stages = rows[0]!.work_item_id ? await tx`select * from work_stage where tenant_id=${ctx.tenantId} and work_item_id=${rows[0]!.work_item_id} order by sequence,id` : [];
    return response({ item: { ...rows[0], services, blockers, tasks, stages } });
  });
}

async function onboardingStatus(request: Request, env: Env, actorId: string, onboardingId: string) {
  id(onboardingId, "onboardingId"); const input = await requestBody(request), next = required(input, "status", 40).toLowerCase();
  if (!ONBOARDING_STATUSES.has(next)) throw new ApiError(400, "INVALID_REQUEST", "status is invalid");
  const permission = next === "completed" || next === "ready_for_delivery" ? "onboarding.complete" : "onboarding.manage";
  return within(request, env, actorId, permission, "practice.onboarding", async (tx, ctx) => {
    const rows = await tx`select * from onboarding_case where tenant_id=${ctx.tenantId} and id=${onboardingId} for update`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Onboarding case not found");
    if (["completed", "cancelled"].includes(String(rows[0]!.status))) throw new ApiError(409, "ONBOARDING_TERMINAL", "Terminal onboarding cannot change status");
    if (["ready_for_delivery", "completed"].includes(next)) {
      const blockers = await tx`select count(*)::int count from onboarding_blocker where tenant_id=${ctx.tenantId} and onboarding_case_id=${onboardingId} and status='open'`;
      const tasks = rows[0]!.work_item_id ? await tx`select count(*)::int count from practice_task where tenant_id=${ctx.tenantId} and work_item_id=${rows[0]!.work_item_id} and mandatory and status not in ('completed','skipped')` : [{ count: 0 }];
      const stages = rows[0]!.work_item_id ? await tx`select count(*)::int count from work_stage where tenant_id=${ctx.tenantId} and work_item_id=${rows[0]!.work_item_id} and status not in ('completed','skipped')` : [{ count: 0 }];
      if (Number(blockers[0]!.count) || Number(tasks[0]!.count) || Number(stages[0]!.count)) throw new ApiError(409, "ONBOARDING_GATES_OPEN", "Mandatory onboarding gates remain incomplete");
    }
    const completed = next === "completed", ready = next === "ready_for_delivery" || completed;
    const updated = await tx`update onboarding_case set status=${next},mandatory_gates_complete=${ready},completed_at=case when ${completed} then now() else null end,updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${onboardingId} returning *`;
    await tx`update client_service cs set delivery_readiness=${completed ? 'active' : ready ? 'ready_for_delivery' : 'onboarding'},updated_by=${ctx.actorId},updated_at=now() from onboarding_case_service ocs where ocs.tenant_id=${ctx.tenantId} and ocs.onboarding_case_id=${onboardingId} and cs.tenant_id=ocs.tenant_id and cs.id=ocs.client_service_id`;
    await recordMutation(tx, ctx, completed ? "ONBOARDING_COMPLETED" : "ONBOARDING_STATUS_CHANGED", "ONBOARDING_CASE", onboardingId, String(rows[0]!.client_id), { fromStatus: String(rows[0]!.status), toStatus: next }, completed ? "onboarding.completed" : "onboarding.status_changed");
    return response({ item: updated[0] });
  });
}

async function onboardingBlockers(request: Request, env: Env, actorId: string, onboardingId: string) {
  id(onboardingId, "onboardingId"); const input = await requestBody(request);
  return within(request, env, actorId, "onboarding.manage", "practice.onboarding", async (tx, ctx) => {
    const exists = await tx`select client_id from onboarding_case where tenant_id=${ctx.tenantId} and id=${onboardingId}`;
    if (!exists.length) throw new ApiError(404, "NOT_FOUND", "Onboarding case not found");
    const blockerId = crypto.randomUUID(), rows = await tx`insert into onboarding_blocker(id,tenant_id,onboarding_case_id,summary,created_by) values(${blockerId},${ctx.tenantId},${onboardingId},${required(input, "summary", 1000)},${ctx.actorId}) returning *`;
    await tx`update onboarding_case set status='blocked',updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${onboardingId} and status not in ('completed','cancelled')`;
    await recordMutation(tx, ctx, "ONBOARDING_BLOCKED", "ONBOARDING_BLOCKER", blockerId, String(exists[0]!.client_id), { onboardingCaseId: onboardingId });
    return response({ item: rows[0] }, 201);
  });
}

async function resolveBlocker(request: Request, env: Env, actorId: string, blockerId: string) {
  id(blockerId, "blockerId");
  return within(request, env, actorId, "onboarding.manage", "practice.onboarding", async (tx, ctx) => {
    const rows = await tx`update onboarding_blocker set status='resolved',resolved_at=now(),resolved_by=${ctx.actorId} where tenant_id=${ctx.tenantId} and id=${blockerId} and status='open' returning *`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Open onboarding blocker not found");
    await recordMutation(tx, ctx, "ONBOARDING_BLOCKER_RESOLVED", "ONBOARDING_BLOCKER", blockerId, null, { onboardingCaseId: String(rows[0]!.onboarding_case_id) });
    return response({ item: rows[0] });
  });
}

async function notificationDeliveryState(request: Request, env: Env, actorId: string) {
  return within(request, env, actorId, "notifications.view", "practice.enabled", async (tx, ctx) => response({ items: await tx`
    select id,channel,recipient_reference,template_code,related_entity_type,related_entity_id,delivery_status,scheduled_at,attempt_count,last_error,delivered_at,created_at
    from notification where tenant_id=${ctx.tenantId} order by created_at desc,id limit 200` }));
}

export async function handleCrmOnboardingRoute(request: Request, env: Env, actorId: string): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/v1/crm/prospects" && ["GET", "POST"].includes(request.method)) return prospectCollection(request, env, actorId);
  let match = path.match(/^\/v1\/crm\/prospects\/([^/]+)$/);
  if (match && ["GET", "PATCH"].includes(request.method)) return prospectItem(request, env, actorId, match[1]!);
  if (path === "/v1/crm/opportunities" && ["GET", "POST"].includes(request.method)) return opportunityCollection(request, env, actorId);
  match = path.match(/^\/v1\/crm\/opportunities\/([^/]+)$/);
  if (match && ["GET", "PATCH"].includes(request.method)) return opportunityItem(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/crm\/opportunities\/([^/]+)\/stage$/);
  if (match && request.method === "POST") return opportunityStage(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/crm\/opportunities\/([^/]+)\/proposals$/);
  if (match && request.method === "POST") return linkProposal(request, env, actorId, match[1]!);
  if (path === "/v1/integrations/quotebench/events" && request.method === "POST") return quoteBenchEvent(request, env, actorId);
  if (path === "/v1/onboarding" && request.method === "GET") return onboardingCollection(request, env, actorId);
  match = path.match(/^\/v1\/onboarding\/([^/]+)$/);
  if (match && request.method === "GET") return onboardingDetail(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/onboarding\/([^/]+)\/status$/);
  if (match && request.method === "POST") return onboardingStatus(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/onboarding\/([^/]+)\/blockers$/);
  if (match && request.method === "POST") return onboardingBlockers(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/onboarding\/blockers\/([^/]+)\/resolve$/);
  if (match && request.method === "POST") return resolveBlocker(request, env, actorId, match[1]!);
  if (path === "/v1/notifications/delivery" && request.method === "GET") return notificationDeliveryState(request, env, actorId);
  return null;
}
