import postgres from "postgres";
import { ApiError } from "./core.js";
import {
  assertPlatformEntitled,
  assertPlatformPermission,
  platformContext,
  platformDatabase,
  platformTransaction,
  type PlatformContext,
  type PlatformTX,
} from "./platform-core.js";
import { addDays, addMonths, calculateDeadline, dateInTimeZone, evaluateRecurrence, validateRecurrenceRule, type DeadlineRule, type RecurrenceRule } from "./practice-scheduling.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICE_STATUSES = new Set(["active", "inactive"]);
const CLIENT_SERVICE_STATUSES = new Set(["active", "inactive", "terminated"]);
const ENGAGEMENT_STATUSES = new Set(["draft", "proposed", "active", "suspended", "completed", "terminated"]);
const WORK_STATUSES = new Set(["not_started", "ready", "in_progress", "waiting_on_client", "waiting_internal", "review", "completed", "cancelled"]);
const TASK_STATUSES = new Set(["not_started", "in_progress", "blocked", "review", "completed", "skipped"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const TEMPLATE_STATUSES = new Set(["draft", "published", "superseded", "archived"]);
const SCHEDULE_STATUSES = new Set(["active", "suspended", "blocked_entitlement", "archived"]);
const ENGAGEMENT_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  draft: new Set(["proposed", "active", "terminated"]),
  proposed: new Set(["draft", "active", "terminated"]),
  active: new Set(["suspended", "completed", "terminated"]),
  suspended: new Set(["active", "completed", "terminated"]),
  completed: new Set(),
  terminated: new Set(),
};

const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "application/json is required");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 65536)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON body is too large");
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
  const result = value.trim();
  if (key.endsWith("Id") && !UUID.test(result))
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a valid identifier`);
  if (key.endsWith("Date") && !validDate(result))
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a valid ISO date`);
  return result;
}

function optional(input: Record<string, unknown>, key: string, max = 1000): string | null | undefined {
  if (!(key in input)) return undefined;
  if (input[key] === null || input[key] === "") return null;
  if (typeof input[key] !== "string" || !String(input[key]).trim() || String(input[key]).trim().length > max)
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be at most ${max} characters`);
  const value = String(input[key]).trim();
  if (key.endsWith("Id") && !UUID.test(value))
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a valid identifier`);
  if (key.endsWith("Date") && !validDate(value))
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a valid ISO date`);
  return value;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function uuid(value: string, label: string): string {
  if (!UUID.test(value)) throw new ApiError(404, "NOT_FOUND", `${label} not found`);
  return value;
}

function enumValue(input: Record<string, unknown>, key: string, values: ReadonlySet<string>, fallback?: string): string {
  const value = key in input ? required(input, key, 40).toLowerCase() : fallback;
  if (!value || !values.has(value)) throw new ApiError(400, "INVALID_REQUEST", `${key} is invalid`);
  return value;
}

function jsonObject(input: Record<string, unknown>, key: string): postgres.JSONValue {
  const value = input[key] ?? {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be an object`);
  return value as postgres.JSONValue;
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
  const eventHash = await digest(JSON.stringify({ eventId, occurredAt, tenantId: ctx.tenantId, actorId: ctx.actorId, eventType: auditType, objectType, objectId, previousHash, metadata }));
  await tx`insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,organisation_id,actor_type,actor_id,event_type,object_type,object_id,previous_hash,correlation_id,metadata,event_hash) values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${clientId},'USER',${ctx.actorId},${auditType},${objectType},${objectId},${previousHash},${ctx.correlationId},${tx.json(metadata)},${eventHash})`;
  if (domainEvent)
    await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key) values(${crypto.randomUUID()},${ctx.tenantId},${objectType},${objectId},${domainEvent},${tx.json(metadata)},${ctx.correlationId},${`${ctx.correlationId}:${domainEvent}:${objectId}`})`;
}

async function within<T>(request: Request, env: Env, actorId: string, permission: string, feature: string, operation: (tx: PlatformTX, ctx: PlatformContext) => Promise<T>): Promise<T> {
  const ctx = platformContext(request, actorId), sql = platformDatabase(env);
  try {
    return await platformTransaction(sql, ctx, async (tx) => {
      await assertPlatformPermission(tx, permission);
      await assertPlatformEntitled(tx, "practice.enabled");
      await assertPlatformEntitled(tx, feature);
      return operation(tx, ctx);
    });
  } finally {
    await sql.end();
  }
}

async function requireEntitlementForModule(tx: PlatformTX, moduleKey: string | null, featureKey: string | null) {
  if (featureKey) {
    if (!moduleKey) throw new ApiError(400, "INVALID_MODULE_FEATURE", "An entitlement feature requires a specialist module");
    const definitions = await tx`select 1 from feature_definition where feature_key=${featureKey} and module_key=${moduleKey} and status='ACTIVE'`;
    if (!definitions.length) throw new ApiError(400, "INVALID_MODULE_FEATURE", "Entitlement feature does not belong to the specialist module");
  }
  if (moduleKey === "ledgerly") {
    await assertPlatformEntitled(tx, "ledgerly.enabled");
    await assertPlatformEntitled(tx, featureKey ?? "ledgerly.accounts");
  } else if (featureKey) await assertPlatformEntitled(tx, featureKey);
}

async function serviceCollection(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "services.view" : "services.manage", "practice.work", async (tx, ctx) => {
    if (request.method === "GET") {
      const status = new URL(request.url).searchParams.get("status");
      if (status && !SERVICE_STATUSES.has(status)) throw new ApiError(400, "INVALID_REQUEST", "status is invalid");
      return response({ items: await tx`select * from practice_service where tenant_id=${ctx.tenantId} and (${status}::text is null or status=${status}) order by name,id` });
    }
    const id = crypto.randomUUID(), moduleKey = optional(input!, "specialistModuleKey", 80) ?? null;
    const featureKey = optional(input!, "requiredEntitlementFeatureKey", 100) ?? null;
    await requireEntitlementForModule(tx, moduleKey, featureKey);
    const rows = await tx`insert into practice_service(id,tenant_id,name,description,category,status,default_frequency,responsible_team_id,specialist_module_key,required_entitlement_feature_key,created_by,updated_by) values(${id},${ctx.tenantId},${required(input!, "name", 180)},${optional(input!, "description", 2000) ?? null},${required(input!, "category", 100)},${enumValue(input!, "status", SERVICE_STATUSES, "active")},${optional(input!, "defaultFrequency", 80) ?? null},${optional(input!, "responsibleTeamId", 36) ?? null},${moduleKey},${featureKey},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx, ctx, "SERVICE_CREATED", "PRACTICE_SERVICE", id, null, { name: String(rows[0]!.name), category: String(rows[0]!.category) });
    return response({ item: rows[0] }, 201);
  });
}

async function serviceItem(request: Request, env: Env, actorId: string, serviceId: string) {
  uuid(serviceId, "Service");
  const input = request.method === "PATCH" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "services.view" : "services.manage", "practice.work", async (tx, ctx) => {
    if (request.method === "GET") {
      const rows = await tx`select * from practice_service where tenant_id=${ctx.tenantId} and id=${serviceId}`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Service not found");
      return response({ item: rows[0] });
    }
    const current = await tx`select specialist_module_key,required_entitlement_feature_key from practice_service where tenant_id=${ctx.tenantId} and id=${serviceId}`;
    if (!current.length) throw new ApiError(404, "NOT_FOUND", "Service not found");
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    const map: Record<string, [string, number]> = { name: ["name", 180], description: ["description", 2000], category: ["category", 100], defaultFrequency: ["default_frequency", 80], responsibleTeamId: ["responsible_team_id", 36], defaultWorkTemplateId: ["default_work_template_id", 36], specialistModuleKey: ["specialist_module_key", 80], requiredEntitlementFeatureKey: ["required_entitlement_feature_key", 100] };
    for (const [key, [column, max]] of Object.entries(map)) { const value = optional(input!, key, max); if (value !== undefined) changes[column] = value; }
    if ("status" in input!) changes.status = enumValue(input!, "status", SERVICE_STATUSES);
    if (Object.keys(changes).length === 2) throw new ApiError(400, "INVALID_REQUEST", "No supported changes were supplied");
    await requireEntitlementForModule(tx,
      "specialist_module_key" in changes ? changes.specialist_module_key as string | null : current[0]!.specialist_module_key ? String(current[0]!.specialist_module_key) : null,
      "required_entitlement_feature_key" in changes ? changes.required_entitlement_feature_key as string | null : current[0]!.required_entitlement_feature_key ? String(current[0]!.required_entitlement_feature_key) : null);
    const columns = Object.keys(changes), rows = await tx`update practice_service set ${tx(changes, ...columns)} where tenant_id=${ctx.tenantId} and id=${serviceId} returning *`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Service not found");
    await recordMutation(tx, ctx, "SERVICE_UPDATED", "PRACTICE_SERVICE", serviceId, null, { changedFields: columns });
    return response({ item: rows[0] });
  });
}

async function clientServices(request: Request, env: Env, actorId: string, clientId: string) {
  uuid(clientId, "Client");
  const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "services.view" : "services.manage", "practice.work", async (tx, ctx) => {
    if (request.method === "GET") return response({ items: await tx`select cs.*,s.name service_name,s.category from client_service cs join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id where cs.tenant_id=${ctx.tenantId} and cs.client_id=${clientId} order by cs.status,cs.start_date desc` });
    const serviceId = uuid(required(input!, "serviceId", 36), "Service"), id = crypto.randomUUID();
    const services = await tx`select specialist_module_key,required_entitlement_feature_key,default_frequency from practice_service where tenant_id=${ctx.tenantId} and id=${serviceId} and status='active'`;
    if (!services.length) throw new ApiError(404, "NOT_FOUND", "Active service not found");
    const moduleKey = optional(input!, "specialistModuleKey", 80) ?? (services[0]!.specialist_module_key ? String(services[0]!.specialist_module_key) : null);
    const requiredFeature = services[0]!.required_entitlement_feature_key ? String(services[0]!.required_entitlement_feature_key) : null;
    await requireEntitlementForModule(tx, moduleKey, requiredFeature);
    const rows = await tx`insert into client_service(id,tenant_id,client_id,service_id,status,start_date,frequency,responsible_member_id,responsible_team_id,specialist_module_key,instance_key,configuration,created_by,updated_by) values(${id},${ctx.tenantId},${clientId},${serviceId},'active',${required(input!, "startDate", 10)},${optional(input!, "frequency", 80) ?? services[0]!.default_frequency ?? null},${optional(input!, "responsibleMemberId", 36) ?? null},${optional(input!, "responsibleTeamId", 36) ?? null},${moduleKey},${optional(input!, "instanceKey", 100) ?? "primary"},${tx.json(jsonObject(input!, "configuration"))},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx, ctx, "CLIENT_SERVICE_ACTIVATED", "CLIENT_SERVICE", id, clientId, { clientId, serviceId, effectiveDate: String(rows[0]!.start_date) }, "service.activated");
    return response({ item: rows[0] }, 201);
  });
}

async function clientServiceLifecycle(request: Request, env: Env, actorId: string, clientServiceId: string, action: "activate" | "terminate") {
  uuid(clientServiceId, "Client service");
  const input = await body(request);
  return within(request, env, actorId, "services.manage", "practice.work", async (tx, ctx) => {
    const current = await tx`select cs.*,s.required_entitlement_feature_key from client_service cs join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id where cs.tenant_id=${ctx.tenantId} and cs.id=${clientServiceId} for update of cs`;
    if (!current.length) throw new ApiError(404, "NOT_FOUND", "Client service not found");
    if (action === "activate") {
      if (current[0]!.status === "active" || current[0]!.status === "terminated") throw new ApiError(409, "INVALID_STATUS_TRANSITION", `Client service cannot be activated from ${current[0]!.status}`);
      const moduleKey = current[0]!.specialist_module_key ? String(current[0]!.specialist_module_key) : null;
      await requireEntitlementForModule(tx, moduleKey, current[0]!.required_entitlement_feature_key ? String(current[0]!.required_entitlement_feature_key) : null);
      const rows = await tx`update client_service set status='active',end_date=null,updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${clientServiceId} returning *`;
      await recordMutation(tx, ctx, "CLIENT_SERVICE_ACTIVATED", "CLIENT_SERVICE", clientServiceId, String(current[0]!.client_id), { clientId: String(current[0]!.client_id), serviceId: String(current[0]!.service_id), effectiveDate: optional(input, "effectiveDate", 10) ?? new Date().toISOString().slice(0, 10) }, "service.activated");
      return response({ item: rows[0] });
    }
    if (current[0]!.status === "terminated") throw new ApiError(409, "INVALID_STATUS_TRANSITION", "Client service is already terminated");
    const endDate = required(input, "endDate", 10);
    const rows = await tx`update client_service set status='terminated',end_date=${endDate},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${clientServiceId} returning *`;
    await recordMutation(tx, ctx, "CLIENT_SERVICE_TERMINATED", "CLIENT_SERVICE", clientServiceId, String(current[0]!.client_id), { clientId: String(current[0]!.client_id), serviceId: String(current[0]!.service_id), effectiveDate: endDate, reasonCategory: optional(input, "reasonCategory", 100) ?? "unspecified" }, "service.terminated");
    return response({ item: rows[0] });
  });
}

async function engagementCollection(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "engagements.view" : "engagements.manage", "practice.work", async (tx, ctx) => {
    if (request.method === "GET") {
      const url = new URL(request.url), clientId = url.searchParams.get("clientId"), status = url.searchParams.get("status");
      if (clientId) uuid(clientId, "Client");
      if (status && !ENGAGEMENT_STATUSES.has(status)) throw new ApiError(400, "INVALID_REQUEST", "status is invalid");
      return response({ items: await tx`select * from practice_engagement where tenant_id=${ctx.tenantId} and (${clientId}::uuid is null or client_id=${clientId}) and (${status}::text is null or status=${status}) order by created_at desc,id` });
    }
    const id = crypto.randomUUID(), clientId = uuid(required(input!, "clientId", 36), "Client");
    const state = optional(input!, "acceptanceState", 30) ?? "pending";
    if (!["not_required", "pending", "accepted", "declined"].includes(state)) throw new ApiError(400, "INVALID_REQUEST", "acceptanceState is invalid");
    const accepted = state === "accepted", rows = await tx`insert into practice_engagement(id,tenant_id,client_id,reference,name,status,start_date,end_date,responsible_owner_id,responsible_team_id,acceptance_state,accepted_by,accepted_at,created_by,updated_by) values(${id},${ctx.tenantId},${clientId},${required(input!, "reference", 100)},${required(input!, "name", 240)},${enumValue(input!, "status", ENGAGEMENT_STATUSES, "draft")},${optional(input!, "startDate", 10) ?? null},${optional(input!, "endDate", 10) ?? null},${optional(input!, "responsibleOwnerId", 36) ?? null},${optional(input!, "responsibleTeamId", 36) ?? null},${state},${accepted ? ctx.actorId : null},${accepted ? new Date().toISOString() : null},${ctx.actorId},${ctx.actorId}) returning *`;
    const clientServiceIds = input!.clientServiceIds;
    if (clientServiceIds !== undefined) {
      if (!Array.isArray(clientServiceIds) || clientServiceIds.some((value) => typeof value !== "string" || !UUID.test(value))) throw new ApiError(400, "INVALID_REQUEST", "clientServiceIds must contain valid IDs");
      for (const value of clientServiceIds as string[]) await tx`insert into practice_engagement_service(tenant_id,engagement_id,client_service_id,client_id,created_by) values(${ctx.tenantId},${id},${value},${clientId},${ctx.actorId})`;
    }
    await recordMutation(tx, ctx, "ENGAGEMENT_CREATED", "PRACTICE_ENGAGEMENT", id, clientId, { clientId, reference: String(rows[0]!.reference) }, "engagement.created");
    return response({ item: rows[0] }, 201);
  });
}

async function engagementItem(request: Request, env: Env, actorId: string, engagementId: string) {
  uuid(engagementId, "Engagement");
  const input = request.method === "PATCH" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "engagements.view" : "engagements.manage", "practice.work", async (tx, ctx) => {
    if (request.method === "GET") {
      const rows = await tx`select e.*,coalesce(json_agg(es.client_service_id) filter(where es.client_service_id is not null),'[]') client_service_ids from practice_engagement e left join practice_engagement_service es on es.tenant_id=e.tenant_id and es.engagement_id=e.id where e.tenant_id=${ctx.tenantId} and e.id=${engagementId} group by e.id`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Engagement not found");
      return response({ item: rows[0] });
    }
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    const map: Record<string, [string, number]> = { reference: ["reference", 100], name: ["name", 240], startDate: ["start_date", 10], endDate: ["end_date", 10], responsibleOwnerId: ["responsible_owner_id", 36], responsibleTeamId: ["responsible_team_id", 36] };
    for (const [key, [column, max]] of Object.entries(map)) { const value = optional(input!, key, max); if (value !== undefined) changes[column] = value; }
    if (Object.keys(changes).length === 2) throw new ApiError(400, "INVALID_REQUEST", "No supported changes were supplied");
    const columns = Object.keys(changes), rows = await tx`update practice_engagement set ${tx(changes, ...columns)} where tenant_id=${ctx.tenantId} and id=${engagementId} returning *`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Engagement not found");
    await recordMutation(tx, ctx, "ENGAGEMENT_UPDATED", "PRACTICE_ENGAGEMENT", engagementId, String(rows[0]!.client_id), { changedFields: columns });
    return response({ item: rows[0] });
  });
}

async function engagementStatus(request: Request, env: Env, actorId: string, engagementId: string) {
  uuid(engagementId, "Engagement"); const input = await body(request), status = enumValue(input, "status", ENGAGEMENT_STATUSES);
  return within(request, env, actorId, "engagements.manage", "practice.work", async (tx, ctx) => {
    const current = await tx`select * from practice_engagement where tenant_id=${ctx.tenantId} and id=${engagementId} for update`;
    if (!current.length) throw new ApiError(404, "NOT_FOUND", "Engagement not found");
    const from = String(current[0]!.status);
    if (from === status || !ENGAGEMENT_TRANSITIONS[from]?.has(status)) throw new ApiError(409, "INVALID_STATUS_TRANSITION", `Engagement cannot move from ${from} to ${status}`);
    const rows = await tx`update practice_engagement set status=${status},end_date=case when ${status} in ('completed','terminated') then coalesce(end_date,current_date) else end_date end,updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${engagementId} returning *`;
    const domainEvent = status === "active" ? "engagement.activated" : status === "completed" ? "engagement.completed" : undefined;
    await recordMutation(tx, ctx, "ENGAGEMENT_STATUS_CHANGED", "PRACTICE_ENGAGEMENT", engagementId, String(current[0]!.client_id), { fromStatus: from, toStatus: status }, domainEvent);
    return response({ item: rows[0] });
  });
}

async function workCollection(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "work.view" : "work.create", "practice.work", async (tx, ctx) => {
    if (request.method === "GET") {
      const url = new URL(request.url), clientId = url.searchParams.get("clientId"), status = url.searchParams.get("status"), dueBefore = url.searchParams.get("dueBefore"), assigned = url.searchParams.get("assignedMemberId");
      if (clientId) uuid(clientId, "Client"); if (assigned) uuid(assigned, "Member");
      if (status && !WORK_STATUSES.has(status)) throw new ApiError(400, "INVALID_REQUEST", "status is invalid");
      if (dueBefore && !validDate(dueBefore)) throw new ApiError(400, "INVALID_REQUEST", "dueBefore must be a valid ISO date");
      return response({ items: await tx`select w.*,o.display_name client_name,s.name service_name,am.display_name assigned_member_name,at.name assigned_team_name from work_item w join organisation o on o.tenant_id=w.tenant_id and o.id=w.client_id join client_service cs on cs.tenant_id=w.tenant_id and cs.id=w.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id left join tenant_member am on am.tenant_id=w.tenant_id and am.id=w.assigned_member_id left join team at on at.tenant_id=w.tenant_id and at.id=w.assigned_team_id where w.tenant_id=${ctx.tenantId} and (${clientId}::uuid is null or w.client_id=${clientId}) and (${status}::text is null or w.status=${status}) and (${dueBefore}::date is null or w.due_date<=${dueBefore}) and (${assigned}::uuid is null or w.assigned_member_id=${assigned}) order by w.due_date nulls last,case w.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,w.created_at desc` });
    }
    const id = crypto.randomUUID(), clientId = uuid(required(input!, "clientId", 36), "Client"), clientServiceId = uuid(required(input!, "clientServiceId", 36), "Client service");
    const clientServices = await tx`select cs.*,s.required_entitlement_feature_key from client_service cs join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id where cs.tenant_id=${ctx.tenantId} and cs.id=${clientServiceId} and cs.client_id=${clientId} and cs.status='active'`;
    if (!clientServices.length) throw new ApiError(404, "NOT_FOUND", "Active client service not found");
    const moduleKey = optional(input!, "specialistModuleKey", 80) ?? (clientServices[0]!.specialist_module_key ? String(clientServices[0]!.specialist_module_key) : null);
    await requireEntitlementForModule(tx, moduleKey, clientServices[0]!.required_entitlement_feature_key ? String(clientServices[0]!.required_entitlement_feature_key) : null);
    const status = enumValue(input!, "status", WORK_STATUSES, "not_started");
    if (status === "completed") throw new ApiError(400, "INVALID_REQUEST", "Create work before completing it through the completion operation");
    const assignedMemberId = optional(input!, "assignedMemberId", 36) ?? null, assignedTeamId = optional(input!, "assignedTeamId", 36) ?? null;
    if (assignedMemberId || assignedTeamId) await assertPlatformPermission(tx, "work.assign");
    const specialistRecordReference = optional(input!, "specialistRecordReference", 200) ?? null;
    if (moduleKey === "ledgerly" && specialistRecordReference) throw new ApiError(400, "INVALID_LEDGERLY_LINK", "Link Ledgerly work through the validated Ledgerly link operation");
    const rows = await tx`insert into work_item(id,tenant_id,client_id,client_service_id,engagement_id,title,period_reference,status,priority,assigned_member_id,assigned_team_id,planned_start_date,due_date,specialist_module_key,specialist_record_reference,created_by,updated_by) values(${id},${ctx.tenantId},${clientId},${clientServiceId},${optional(input!, "engagementId", 36) ?? null},${required(input!, "title", 240)},${optional(input!, "periodReference", 100) ?? null},${status},${enumValue(input!, "priority", PRIORITIES, "normal")},${assignedMemberId},${assignedTeamId},${optional(input!, "plannedStartDate", 10) ?? null},${optional(input!, "dueDate", 10) ?? null},${moduleKey},${specialistRecordReference},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx, ctx, "WORK_CREATED", "WORK_ITEM", id, clientId, { clientId, clientServiceId, dueDate: rows[0]!.due_date as postgres.JSONValue }, "work.created");
    return response({ item: rows[0] }, 201);
  });
}

async function workItem(request: Request, env: Env, actorId: string, workId: string) {
  uuid(workId, "Work item"); const input = request.method === "PATCH" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "work.view" : "work.edit", "practice.work", async (tx, ctx) => {
    if (request.method === "GET") {
      await assertPlatformPermission(tx, "tasks.view");
      const rows = await tx`select w.*,l.ledgerly_engagement_id,l.required_feature_key,o.display_name client_name,s.name service_name,e.name engagement_name,am.display_name assigned_member_name,at.name assigned_team_name from work_item w left join work_item_ledgerly_link l on l.tenant_id=w.tenant_id and l.work_item_id=w.id join organisation o on o.tenant_id=w.tenant_id and o.id=w.client_id join client_service cs on cs.tenant_id=w.tenant_id and cs.id=w.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id left join practice_engagement e on e.tenant_id=w.tenant_id and e.id=w.engagement_id left join tenant_member am on am.tenant_id=w.tenant_id and am.id=w.assigned_member_id left join team at on at.tenant_id=w.tenant_id and at.id=w.assigned_team_id where w.tenant_id=${ctx.tenantId} and w.id=${workId}`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Work item not found");
      const tasks = await tx`select * from practice_task where tenant_id=${ctx.tenantId} and work_item_id=${workId} order by sequence,id`;
      return response({ item: { ...rows[0], tasks } });
    }
    const current = await tx`select specialist_module_key from work_item where tenant_id=${ctx.tenantId} and id=${workId}`;
    if (!current.length) throw new ApiError(404, "NOT_FOUND", "Work item not found");
    if ("specialistRecordReference" in input! && current[0]!.specialist_module_key === "ledgerly")
      throw new ApiError(400, "INVALID_LEDGERLY_LINK", "Change Ledgerly references through the validated Ledgerly link operation");
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    const map: Record<string, [string, number]> = { title: ["title", 240], periodReference: ["period_reference", 100], engagementId: ["engagement_id", 36], plannedStartDate: ["planned_start_date", 10], dueDate: ["due_date", 10], specialistRecordReference: ["specialist_record_reference", 200] };
    for (const [key, [column, max]] of Object.entries(map)) { const value = optional(input!, key, max); if (value !== undefined) changes[column] = value; }
    if ("priority" in input!) changes.priority = enumValue(input!, "priority", PRIORITIES);
    if (Object.keys(changes).length === 2) throw new ApiError(400, "INVALID_REQUEST", "No supported changes were supplied");
    const columns = Object.keys(changes), rows = await tx`update work_item set ${tx(changes, ...columns)} where tenant_id=${ctx.tenantId} and id=${workId} returning *`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Work item not found");
    await recordMutation(tx, ctx, "WORK_UPDATED", "WORK_ITEM", workId, String(rows[0]!.client_id), { changedFields: columns });
    return response({ item: rows[0] });
  });
}

async function workAction(request: Request, env: Env, actorId: string, workId: string, action: "assignment" | "status" | "complete") {
  uuid(workId, "Work item"); const input = action === "complete" ? ((request.headers.get("content-length") ?? "0") === "0" ? {} : await body(request)) : await body(request);
  const permission = action === "assignment" ? "work.assign" : action === "complete" ? "work.complete" : "work.edit";
  return within(request, env, actorId, permission, "practice.work", async (tx, ctx) => {
    const current = await tx`select * from work_item where tenant_id=${ctx.tenantId} and id=${workId} for update`;
    if (!current.length) throw new ApiError(404, "NOT_FOUND", "Work item not found");
    if (action === "assignment") {
      const member = optional(input, "assignedMemberId", 36) ?? null, team = optional(input, "assignedTeamId", 36) ?? null;
      const rows = await tx`update work_item set assigned_member_id=${member},assigned_team_id=${team},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${workId} returning *`;
      await recordMutation(tx, ctx, "WORK_ASSIGNED", "WORK_ITEM", workId, String(current[0]!.client_id), { assignedMemberId: member, assignedTeamId: team }, "work.assigned");
      return response({ item: rows[0] });
    }
    const status = action === "complete" ? "completed" : enumValue(input, "status", WORK_STATUSES), completedAt = status === "completed" ? new Date().toISOString() : null;
    if (status === "completed" && action !== "complete") await assertPlatformPermission(tx, "work.complete");
    if (String(current[0]!.status) === status) throw new ApiError(409, "INVALID_STATUS_TRANSITION", `Work is already ${status}`);
    if (String(current[0]!.status) === "completed") throw new ApiError(409, "INVALID_STATUS_TRANSITION", "Completed work cannot be reopened");
    const rows = await tx`update work_item set status=${status},completed_at=${completedAt},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${workId} returning *`;
    await recordMutation(tx, ctx, status === "completed" ? "WORK_COMPLETED" : "WORK_STATUS_CHANGED", "WORK_ITEM", workId, String(current[0]!.client_id), { fromStatus: String(current[0]!.status), toStatus: status, completedAt }, status === "completed" ? "work.completed" : "work.status_changed");
    return response({ item: rows[0] });
  });
}

async function workTasks(request: Request, env: Env, actorId: string, workId: string) {
  uuid(workId, "Work item"); const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "tasks.view" : "tasks.manage", "practice.workflow", async (tx, ctx) => {
    if (request.method === "GET") return response({ items: await tx`select * from practice_task where tenant_id=${ctx.tenantId} and work_item_id=${workId} order by sequence,id` });
    const id = crypto.randomUUID();
    const work = await tx`select client_id from work_item where tenant_id=${ctx.tenantId} and id=${workId}`;
    if (!work.length) throw new ApiError(404, "NOT_FOUND", "Work item not found");
    const sequence = input!.sequence;
    if (!Number.isInteger(sequence) || Number(sequence) < 1) throw new ApiError(400, "INVALID_REQUEST", "sequence must be a positive integer");
    const rows = await tx`insert into practice_task(id,tenant_id,work_item_id,title,description,status,assignee_member_id,team_id,sequence,due_date,reviewer_member_id,created_by,updated_by) values(${id},${ctx.tenantId},${workId},${required(input!, "title", 240)},${optional(input!, "description", 2000) ?? null},'not_started',${optional(input!, "assigneeMemberId", 36) ?? null},${optional(input!, "teamId", 36) ?? null},${Number(sequence)},${optional(input!, "dueDate", 10) ?? null},${optional(input!, "reviewerMemberId", 36) ?? null},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx, ctx, "TASK_CREATED", "PRACTICE_TASK", id, String(work[0]!.client_id), { workItemId: workId, sequence: Number(sequence) });
    return response({ item: rows[0] }, 201);
  });
}

async function taskAction(request: Request, env: Env, actorId: string, taskId: string, action: "patch" | "assignment" | "status" | "complete") {
  uuid(taskId, "Task"); const input = action === "complete" && (request.headers.get("content-length") ?? "0") === "0" ? {} : await body(request);
  return within(request, env, actorId, "tasks.manage", "practice.workflow", async (tx, ctx) => {
    const current = await tx`select t.*,w.client_id from practice_task t join work_item w on w.tenant_id=t.tenant_id and w.id=t.work_item_id where t.tenant_id=${ctx.tenantId} and t.id=${taskId} for update`;
    if (!current.length) throw new ApiError(404, "NOT_FOUND", "Task not found");
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    if (action === "patch") {
      const map: Record<string, [string, number]> = { title: ["title", 240], description: ["description", 2000], dueDate: ["due_date", 10], reviewerMemberId: ["reviewer_member_id", 36] };
      for (const [key, [column, max]] of Object.entries(map)) { const value = optional(input, key, max); if (value !== undefined) changes[column] = value; }
      if ("sequence" in input) { if (!Number.isInteger(input.sequence) || Number(input.sequence) < 1) throw new ApiError(400, "INVALID_REQUEST", "sequence must be a positive integer"); changes.sequence = Number(input.sequence); }
    } else if (action === "assignment") {
      changes.assignee_member_id = optional(input, "assigneeMemberId", 36) ?? null; changes.team_id = optional(input, "teamId", 36) ?? null;
    } else {
      const status = action === "complete" ? "completed" : enumValue(input, "status", TASK_STATUSES);
      if (String(current[0]!.status) === status) throw new ApiError(409, "INVALID_STATUS_TRANSITION", `Task is already ${status}`);
      changes.status = status; changes.completed_at = ["completed", "skipped"].includes(status) ? new Date().toISOString() : null;
    }
    if (Object.keys(changes).length === 2) throw new ApiError(400, "INVALID_REQUEST", "No supported changes were supplied");
    const columns = Object.keys(changes), rows = await tx`update practice_task set ${tx(changes, ...columns)} where tenant_id=${ctx.tenantId} and id=${taskId} returning *`;
    const completed = ["status", "complete"].includes(action) && current[0]!.status !== "completed" && rows[0]!.status === "completed";
    await recordMutation(tx, ctx, completed ? "TASK_COMPLETED" : action === "assignment" ? "TASK_ASSIGNED" : "TASK_UPDATED", "PRACTICE_TASK", taskId, String(current[0]!.client_id), { workItemId: String(current[0]!.work_item_id), changedFields: columns, status: String(rows[0]!.status) }, completed ? "task.completed" : undefined);
    return response({ item: rows[0] });
  });
}

async function templateCollection(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, "worktemplates.manage", "practice.workflow", async (tx, ctx) => {
    if (request.method === "GET") return response({ items: await tx`select wt.*,s.name service_name,coalesce(json_agg(wtt order by wtt.sequence) filter(where wtt.id is not null),'[]') tasks from work_template wt join practice_service s on s.tenant_id=wt.tenant_id and s.id=wt.service_id left join work_template_task wtt on wtt.tenant_id=wt.tenant_id and wtt.work_template_id=wt.id where wt.tenant_id=${ctx.tenantId} group by wt.id,s.name order by wt.name,wt.version desc` });
    const id = crypto.randomUUID(), serviceId = uuid(required(input!, "serviceId", 36), "Service");
    const version = input!.version ?? 1; if (!Number.isInteger(version) || Number(version) < 1) throw new ApiError(400, "INVALID_REQUEST", "version must be a positive integer");
    const rows = await tx`insert into work_template(id,tenant_id,name,service_id,status,version,template_family_id,created_by,updated_by) values(${id},${ctx.tenantId},${required(input!, "name", 180)},${serviceId},${enumValue(input!, "status", TEMPLATE_STATUSES, "draft")},${Number(version)},${optional(input!, "templateFamilyId", 36) ?? id},${ctx.actorId},${ctx.actorId}) returning *`;
    const definitions = input!.tasks ?? [];
    if (!Array.isArray(definitions)) throw new ApiError(400, "INVALID_REQUEST", "tasks must be an array");
    for (const [index, raw] of definitions.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, "INVALID_REQUEST", "Each template task must be an object");
      const item = raw as Record<string, unknown>, sequence = item.sequence ?? index + 1;
      if (!Number.isInteger(sequence) || Number(sequence) < 1) throw new ApiError(400, "INVALID_REQUEST", "Template task sequence is invalid");
      await tx`insert into work_template_task(id,tenant_id,work_template_id,title,description,sequence,default_assignee_role_id,default_team_id,due_date_offset_days,mandatory,created_by,updated_by) values(${crypto.randomUUID()},${ctx.tenantId},${id},${required(item, "title", 240)},${optional(item, "description", 2000) ?? null},${Number(sequence)},${optional(item, "defaultAssigneeRoleId", 36) ?? null},${optional(item, "defaultTeamId", 36) ?? null},${Number.isInteger(item.dueDateOffsetDays) ? Number(item.dueDateOffsetDays) : null},${item.mandatory !== false},${ctx.actorId},${ctx.actorId})`;
    }
    await recordMutation(tx, ctx, "WORK_TEMPLATE_CREATED", "WORK_TEMPLATE", id, null, { serviceId, version: Number(version), taskCount: definitions.length });
    return response({ item: rows[0] }, 201);
  });
}

async function templateItem(request: Request, env: Env, actorId: string, templateId: string) {
  uuid(templateId, "Work template"); const input = request.method === "PATCH" ? await body(request) : null;
  return within(request, env, actorId, "worktemplates.manage", "practice.workflow", async (tx, ctx) => {
    if (request.method === "GET") {
      const rows = await tx`select * from work_template where tenant_id=${ctx.tenantId} and id=${templateId}`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Work template not found");
      return response({ item: { ...rows[0], tasks: await tx`select * from work_template_task where tenant_id=${ctx.tenantId} and work_template_id=${templateId} order by sequence,id` } });
    }
    const existing = await tx`select status from work_template where tenant_id=${ctx.tenantId} and id=${templateId} for update`;
    if (!existing.length) throw new ApiError(404, "NOT_FOUND", "Work template not found");
    if (existing[0]!.status !== "draft") throw new ApiError(409, "TEMPLATE_VERSION_IMMUTABLE", "Published or used template versions are historical records");
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    if ("name" in input!) changes.name = required(input!, "name", 180);
    if ("status" in input!) {
      const status = enumValue(input!, "status", TEMPLATE_STATUSES);
      if (status !== "archived") throw new ApiError(409, "INVALID_TEMPLATE_LIFECYCLE", "Use the publish command to publish a template version");
      changes.status = status;
    }
    if (Object.keys(changes).length === 2) throw new ApiError(400, "INVALID_REQUEST", "No supported changes were supplied");
    const columns = Object.keys(changes), rows = await tx`update work_template set ${tx(changes, ...columns)} where tenant_id=${ctx.tenantId} and id=${templateId} returning *`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Work template not found");
    await recordMutation(tx, ctx, "WORK_TEMPLATE_UPDATED", "WORK_TEMPLATE", templateId, null, { changedFields: columns });
    return response({ item: rows[0] });
  });
}

async function publishTemplate(request: Request, env: Env, actorId: string, templateId: string) {
  uuid(templateId, "Work template");
  return within(request, env, actorId, "worktemplates.publish", "practice.workflow", async (tx, ctx) => {
    const rows = await tx`select * from work_template where tenant_id=${ctx.tenantId} and id=${templateId} for update`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Work template not found");
    if (rows[0]!.status !== "draft") throw new ApiError(409, "INVALID_TEMPLATE_LIFECYCLE", "Only draft template versions can be published");
    const tasks = await tx`select 1 from work_template_task where tenant_id=${ctx.tenantId} and work_template_id=${templateId} limit 1`;
    if (!tasks.length) throw new ApiError(409, "EMPTY_TEMPLATE", "A template requires at least one task before publication");
    await tx`update work_template set status='superseded',updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and template_family_id=${rows[0]!.template_family_id} and status='published'`;
    const published = await tx`update work_template set status='published',published_at=now(),updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${templateId} returning *`;
    await recordMutation(tx, ctx, "WORK_TEMPLATE_PUBLISHED", "WORK_TEMPLATE", templateId, null, { version: Number(rows[0]!.version) }, "work.template_published");
    return response({ item: published[0] });
  });
}

function objectValue(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "INVALID_REQUEST", `${key} must be an object`);
  return value as Record<string, unknown>;
}

async function deadlineRules(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "deadlines.view" : "recurrence.manage", "practice.workflow", async (tx, ctx) => {
    if (request.method === "GET") return response({ items: await tx`select * from deadline_rule where tenant_id=${ctx.tenantId} order by status,name` });
    const id = crypto.randomUUID(), type = required(input!, "ruleType", 60), configuration = objectValue(input!, "configuration");
    calculateDeadline({ type, ...configuration } as DeadlineRule, { periodEnd: "2028-01-31" });
    const rows = await tx`insert into deadline_rule(id,tenant_id,name,rule_type,configuration,created_by,updated_by) values(${id},${ctx.tenantId},${required(input!, "name", 180)},${type},${tx.json(configuration as postgres.JSONValue)},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx, ctx, "DEADLINE_RULE_CREATED", "DEADLINE_RULE", id, null, { ruleType: type });
    return response({ item: rows[0] }, 201);
  });
}

function scheduleHorizon(input: Record<string, unknown>): { type: string; value: number | null; date: string | null } {
  const type = optional(input, "generationHorizonType", 20) ?? "periods";
  if (!new Set(["periods","date","next"]).has(type)) throw new ApiError(400, "INVALID_REQUEST", "generationHorizonType is invalid");
  const value = type === "periods" ? Number(input.generationHorizonValue ?? 3) : null;
  if (type === "periods" && (!Number.isInteger(value) || value! < 1 || value! > 120)) throw new ApiError(400, "INVALID_REQUEST", "generationHorizonValue must be 1-120");
  const horizonDate = type === "date" ? required(input, "generationHorizonDate", 10) : null;
  return { type, value, date: horizonDate };
}

async function recurringSchedules(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "recurrence.view" : "recurrence.manage", "practice.workflow", async (tx, ctx) => {
    if (request.method === "GET") return response({ items: await tx`select r.*,o.display_name client_name,s.name service_name,wt.name template_name,tm.display_name owner_name,t.name team_name from recurring_work_schedule r join organisation o on o.tenant_id=r.tenant_id and o.id=r.client_id join client_service cs on cs.tenant_id=r.tenant_id and cs.id=r.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id join work_template wt on wt.tenant_id=r.tenant_id and wt.id=r.work_template_id left join tenant_member tm on tm.tenant_id=r.tenant_id and tm.id=r.default_assignee_member_id left join team t on t.tenant_id=r.tenant_id and t.id=r.default_team_id where r.tenant_id=${ctx.tenantId} order by r.status,r.next_occurrence_date nulls last,o.display_name` });
    const clientServiceId = uuid(required(input!, "clientServiceId", 36), "Client service"), templateId = uuid(required(input!, "workTemplateId", 36), "Work template");
    const scope = await tx`select cs.client_id,coalesce(cs.specialist_module_key,s.specialist_module_key) specialist_module_key,wt.status from client_service cs join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id join work_template wt on wt.tenant_id=cs.tenant_id and wt.id=${templateId} and wt.service_id=cs.service_id where cs.tenant_id=${ctx.tenantId} and cs.id=${clientServiceId} and cs.status='active'`;
    if (!scope.length || scope[0]!.status !== "published") throw new ApiError(404, "NOT_FOUND", "Active client service and published template combination not found");
    const recurrence = validateRecurrenceRule(objectValue(input!, "recurrenceRule") as unknown as RecurrenceRule), effectiveFrom = required(input!, "effectiveFrom", 10), horizon = scheduleHorizon(input!);
    const preview = evaluateRecurrence(recurrence, effectiveFrom, horizon.date ?? addMonths(effectiveFrom, horizon.type === "periods" ? horizon.value! : 120), optional(input!, "effectiveTo", 10), 1)[0];
    const id = crypto.randomUUID();
    const rows = await tx`insert into recurring_work_schedule(id,tenant_id,client_id,client_service_id,engagement_id,work_template_id,deadline_rule_id,recurrence_rule,effective_from,effective_to,generation_horizon_type,generation_horizon_value,generation_horizon_date,due_date_rule,default_assignee_member_id,default_team_id,specialist_module_key,next_occurrence_date,created_by,updated_by) values(${id},${ctx.tenantId},${scope[0]!.client_id},${clientServiceId},${optional(input!, "engagementId", 36) ?? null},${templateId},${optional(input!, "deadlineRuleId", 36) ?? null},${tx.json(recurrence as unknown as postgres.JSONValue)},${effectiveFrom},${optional(input!, "effectiveTo", 10) ?? null},${horizon.type},${horizon.value},${horizon.date},${tx.json((input!.dueDateRule ?? {}) as postgres.JSONValue)},${optional(input!, "defaultAssigneeMemberId", 36) ?? null},${optional(input!, "defaultTeamId", 36) ?? null},${scope[0]!.specialist_module_key ?? null},${preview?.occurrenceDate ?? null},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx, ctx, "RECURRING_SCHEDULE_CREATED", "RECURRING_SCHEDULE", id, String(scope[0]!.client_id), { clientServiceId, workTemplateId: templateId }, "recurring_schedule.created");
    return response({ item: rows[0] }, 201);
  });
}

async function instantiateOccurrence(tx: PlatformTX, ctx: PlatformContext, schedule: postgres.Row, occurrence: { occurrenceDate: string; periodStart: string; periodEnd: string }) {
  const idempotencyKey = `${ctx.tenantId}:${schedule.id}:${occurrence.occurrenceDate}`;
  const markerId = crypto.randomUUID();
  const markers = await tx`insert into recurrence_generation(id,tenant_id,recurring_schedule_id,occurrence_date,period_start,period_end,idempotency_key,status) values(${markerId},${ctx.tenantId},${schedule.id},${occurrence.occurrenceDate},${occurrence.periodStart},${occurrence.periodEnd},${idempotencyKey},'generated') on conflict(tenant_id,recurring_schedule_id,occurrence_date) do nothing returning id`;
  if (!markers.length) return null;
  const template = await tx`select * from work_template where tenant_id=${ctx.tenantId} and id=${schedule.work_template_id} and status in ('published','superseded')`;
  if (!template.length) throw new ApiError(409, "TEMPLATE_NOT_PUBLISHED", "Schedule template is not a historical published version");
  let deadline: ReturnType<typeof calculateDeadline> | null = null;
  if (schedule.deadline_rule_id) {
    const rules = await tx`select rule_type,configuration from deadline_rule where tenant_id=${ctx.tenantId} and id=${schedule.deadline_rule_id} and status='active'`;
    if (rules.length) deadline = calculateDeadline({ type: String(rules[0]!.rule_type), ...(rules[0]!.configuration as object) } as DeadlineRule, { periodEnd: occurrence.periodEnd });
  } else if (schedule.due_date_rule && Object.keys(schedule.due_date_rule as object).length) deadline = calculateDeadline(schedule.due_date_rule as unknown as DeadlineRule, { periodEnd: occurrence.periodEnd });
  const workId = crypto.randomUUID();
  await tx`insert into work_item(id,tenant_id,client_id,client_service_id,engagement_id,title,period_reference,period_start,period_end,status,assigned_member_id,assigned_team_id,due_date,calculated_due_date,due_date_rule_id,due_date_calculation,source_template_id,source_template_version,recurring_schedule_id,generation_id,specialist_module_key,created_by,updated_by) values(${workId},${ctx.tenantId},${schedule.client_id},${schedule.client_service_id},${schedule.engagement_id},${`${template[0]!.name} – period ended ${occurrence.periodEnd}`},${`Period ended ${occurrence.periodEnd}`},${occurrence.periodStart},${occurrence.periodEnd},'not_started',${schedule.default_assignee_member_id},${schedule.default_team_id},${deadline?.date ?? null},${deadline?.date ?? null},${schedule.deadline_rule_id},${tx.json((deadline?.provenance ?? {}) as postgres.JSONValue)},${template[0]!.id},${template[0]!.version},${schedule.id},${markerId},${schedule.specialist_module_key},${ctx.actorId},${ctx.actorId})`;
  const definitions = await tx`select * from work_template_task where tenant_id=${ctx.tenantId} and work_template_id=${template[0]!.id} order by sequence,id`;
  for (const definition of definitions) {
    let assignee = schedule.default_assignee_member_id;
    if (definition.default_assignee_role_id) {
      const resolved = await tx`select tm.id from tenant_member tm join tenant_member_role mr on mr.tenant_id=tm.tenant_id and mr.tenant_member_id=tm.id where tm.tenant_id=${ctx.tenantId} and mr.role_id=${definition.default_assignee_role_id} and tm.membership_status='ACTIVE' order by tm.created_at,tm.id limit 1`;
      assignee = resolved[0]?.id ?? assignee;
    }
    const taskId = crypto.randomUUID();
    await tx`insert into practice_task(id,tenant_id,work_item_id,title,description,status,assignee_member_id,team_id,sequence,due_date,source_template_task_id,mandatory,created_by,updated_by) values(${taskId},${ctx.tenantId},${workId},${definition.title},${definition.description},'not_started',${assignee},${definition.default_team_id ?? schedule.default_team_id},${definition.sequence},${definition.due_date_offset_days === null ? null : addDays(deadline?.date ?? occurrence.periodEnd, Number(definition.due_date_offset_days))},${definition.id},${definition.mandatory},${ctx.actorId},${ctx.actorId})`;
    await recordMutation(tx, ctx, "TASK_GENERATED", "PRACTICE_TASK", taskId, String(schedule.client_id), { workItemId: workId, templateTaskId: String(definition.id), sequence: Number(definition.sequence) }, "task.generated");
  }
  await tx`update recurrence_generation set work_item_id=${workId} where tenant_id=${ctx.tenantId} and id=${markerId}`;
  await recordMutation(tx, ctx, "WORK_TEMPLATE_INSTANTIATED", "WORK_ITEM", workId, String(schedule.client_id), { templateId: String(template[0]!.id), templateVersion: Number(template[0]!.version), taskCount: definitions.length }, "work.template_instantiated");
  await recordMutation(tx, ctx, "WORK_GENERATED", "WORK_ITEM", workId, String(schedule.client_id), { scheduleId: String(schedule.id), occurrenceDate: occurrence.occurrenceDate, deadline: deadline?.date }, "work.generated");
  if (deadline) await recordMutation(tx, ctx, "WORK_DEADLINE_CALCULATED", "WORK_ITEM", workId, String(schedule.client_id), { dueDate: deadline.date, ruleId: schedule.deadline_rule_id ? String(schedule.deadline_rule_id) : null }, "work.deadline_calculated");
  return workId;
}

async function generateSchedule(request: Request, env: Env, actorId: string, scheduleId: string) {
  uuid(scheduleId, "Recurring schedule");
  return within(request, env, actorId, "work.generate", "practice.workflow", async (tx, ctx) => {
    const rows = await tx`select r.*,s.required_entitlement_feature_key,tenant.timezone from recurring_work_schedule r join tenant on tenant.id=r.tenant_id join client_service cs on cs.tenant_id=r.tenant_id and cs.id=r.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id where r.tenant_id=${ctx.tenantId} and r.id=${scheduleId} for update of r`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Recurring schedule not found");
    const schedule = rows[0]!;
    if (schedule.status !== "active") throw new ApiError(409, "SCHEDULE_NOT_ACTIVE", "Recurring schedule is not active");
    if (schedule.specialist_module_key === "ledgerly") {
      try { await assertPlatformEntitled(tx, "ledgerly.enabled"); await assertPlatformEntitled(tx, String(schedule.required_entitlement_feature_key ?? "ledgerly.accounts")); }
      catch (error) {
        await tx`update recurring_work_schedule set status='blocked_entitlement',generation_block_reason='Required specialist-module entitlement is unavailable',updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${scheduleId}`;
        await recordMutation(tx, ctx, "RECURRING_GENERATION_BLOCKED", "RECURRING_SCHEDULE", scheduleId, String(schedule.client_id), { reason: "entitlement" }, "recurring_schedule.generation_blocked");
        return response({ generated: 0, blocked: true }, 409);
      }
    }
    const today = dateInTimeZone(new Date(), String(schedule.timezone)), limit = schedule.generation_horizon_type === "next" ? 1 : Number(schedule.generation_horizon_value ?? 120);
    const through = schedule.generation_horizon_type === "date" ? String(schedule.generation_horizon_date) : addMonths(today, schedule.generation_horizon_type === "next" ? 120 : limit);
    const occurrences = evaluateRecurrence(schedule.recurrence_rule as unknown as RecurrenceRule, String(schedule.effective_from), through, schedule.effective_to ? String(schedule.effective_to) : null, 120).filter((item) => !schedule.last_generated_occurrence || item.occurrenceDate > String(schedule.last_generated_occurrence)).slice(0, limit);
    const generated: string[] = [];
    for (const occurrence of occurrences) { const id = await instantiateOccurrence(tx, ctx, schedule, occurrence); if (id) generated.push(id); }
    const last = occurrences.at(-1), next = last ? evaluateRecurrence(schedule.recurrence_rule as unknown as RecurrenceRule, addDays(last.periodEnd, 1), addMonths(last.periodEnd, 24), schedule.effective_to ? String(schedule.effective_to) : null, 1)[0] : undefined;
    await tx`update recurring_work_schedule set last_generated_at=now(),last_generated_occurrence=${last?.occurrenceDate ?? schedule.last_generated_occurrence},next_occurrence_date=${next?.occurrenceDate ?? null},generation_block_reason=null,updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${scheduleId}`;
    return response({ generated: generated.length, workItemIds: generated });
  });
}

async function overrideDeadline(request: Request, env: Env, actorId: string, workId: string) {
  uuid(workId, "Work item"); const input = await body(request);
  return within(request, env, actorId, "deadlines.override", "practice.workflow", async (tx, ctx) => {
    const dueDate = required(input, "dueDate", 10), reason = required(input, "reason", 500);
    const rows = await tx`update work_item set due_date=${dueDate},due_date_overridden=true,due_date_override_reason=${reason},due_date_override_actor=${ctx.actorId},due_date_overridden_at=now(),updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${workId} returning *`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Work item not found");
    await recordMutation(tx, ctx, "WORK_DEADLINE_OVERRIDDEN", "WORK_ITEM", workId, String(rows[0]!.client_id), { calculatedDueDate: rows[0]!.calculated_due_date as postgres.JSONValue, effectiveDueDate: dueDate, reason }, "work.deadline_overridden");
    return response({ item: rows[0] });
  });
}

async function recalculateDeadline(request: Request, env: Env, actorId: string, workId: string) {
  uuid(workId, "Work item");
  return within(request, env, actorId, "work.generate", "practice.workflow", async (tx, ctx) => {
    const rows = await tx`select w.*,d.rule_type,d.configuration from work_item w join deadline_rule d on d.tenant_id=w.tenant_id and d.id=w.due_date_rule_id where w.tenant_id=${ctx.tenantId} and w.id=${workId} for update of w`;
    if (!rows.length || !rows[0]!.period_end) throw new ApiError(409, "DEADLINE_NOT_RECALCULABLE", "Work item has no period and deadline rule to recalculate");
    const calculated = calculateDeadline({ type: String(rows[0]!.rule_type), ...(rows[0]!.configuration as object) } as DeadlineRule, { periodEnd: String(rows[0]!.period_end) });
    const updated = await tx`update work_item set calculated_due_date=${calculated.date},due_date=case when due_date_overridden then due_date else ${calculated.date}::date end,due_date_calculation=${tx.json(calculated.provenance as unknown as postgres.JSONValue)},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${workId} returning *`;
    await recordMutation(tx, ctx, "WORK_DEADLINE_RECALCULATED", "WORK_ITEM", workId, String(rows[0]!.client_id), { calculatedDueDate: calculated.date, overridePreserved: Boolean(rows[0]!.due_date_overridden) }, "work.deadline_recalculated");
    return response({ item: updated[0] });
  });
}

async function linkLedgerly(request: Request, env: Env, actorId: string, workId: string) {
  uuid(workId, "Work item"); const input = await body(request), ledgerlyEngagementId = uuid(required(input, "ledgerlyEngagementId", 36), "Ledgerly engagement");
  return within(request, env, actorId, "work.edit", "practice.work", async (tx, ctx) => {
    const scope = await tx`select w.client_id,coalesce(s.required_entitlement_feature_key,'ledgerly.accounts') required_feature_key from work_item w join client_service cs on cs.tenant_id=w.tenant_id and cs.id=w.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id join engagement e on e.tenant_id=w.tenant_id and e.id=${ledgerlyEngagementId} and e.organisation_id=w.client_id where w.tenant_id=${ctx.tenantId} and w.id=${workId}`;
    if (!scope.length) throw new ApiError(404, "NOT_FOUND", "Compatible work item or Ledgerly engagement not found");
    const feature = String(scope[0]!.required_feature_key), requestedFeature = optional(input, "requiredFeatureKey", 100);
    if (!feature.startsWith("ledgerly.")) throw new ApiError(400, "INVALID_MODULE_FEATURE", "The service does not declare a Ledgerly entitlement feature");
    if (requestedFeature && requestedFeature !== feature) throw new ApiError(400, "INVALID_MODULE_FEATURE", "requiredFeatureKey must match the service entitlement");
    await assertPlatformEntitled(tx, "ledgerly.enabled"); await assertPlatformEntitled(tx, feature);
    await tx`update work_item set specialist_module_key='ledgerly',specialist_record_reference=null,updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${workId}`;
    const rows = await tx`insert into work_item_ledgerly_link(tenant_id,work_item_id,ledgerly_engagement_id,required_feature_key,created_by) values(${ctx.tenantId},${workId},${ledgerlyEngagementId},${feature},${ctx.actorId}) on conflict(tenant_id,work_item_id) do nothing returning *`;
    if (!rows.length) throw new ApiError(409, "LEDGERLY_LINK_EXISTS", "Work item already has a Ledgerly link");
    await tx`update work_item set specialist_module_key='ledgerly',specialist_record_reference=${ledgerlyEngagementId},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${workId}`;
    await recordMutation(tx, ctx, "WORK_LEDGERLY_LINKED", "WORK_ITEM", workId, String(scope[0]!.client_id), { ledgerlyEngagementId, requiredFeatureKey: feature });
    return response({ item: rows[0] }, 201);
  });
}

async function clientSummary(request: Request, env: Env, actorId: string, clientId: string) {
  uuid(clientId, "Client");
  return within(request, env, actorId, "work.view", "practice.work", async (tx, ctx) => {
    await assertPlatformPermission(tx, "services.view"); await assertPlatformPermission(tx, "engagements.view"); await assertPlatformPermission(tx, "tasks.view");
    const clients = await tx`select id,display_name,legal_name,lifecycle_status,responsible_member_id,responsible_team_id from organisation where tenant_id=${ctx.tenantId} and id=${clientId}`;
    if (!clients.length) throw new ApiError(404, "NOT_FOUND", "Client not found");
    const services = await tx`select cs.*,s.name service_name,s.category from client_service cs join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id where cs.tenant_id=${ctx.tenantId} and cs.client_id=${clientId} and cs.status='active' order by s.name`;
    const engagements = await tx`select * from practice_engagement where tenant_id=${ctx.tenantId} and client_id=${clientId} and status not in ('completed','terminated') order by start_date nulls last`;
    const workItems = await tx`select * from work_item where tenant_id=${ctx.tenantId} and client_id=${clientId} and status not in ('completed','cancelled') order by due_date nulls last`;
    const upcomingTasks = await tx`select t.* from practice_task t join work_item w on w.tenant_id=t.tenant_id and w.id=t.work_item_id where t.tenant_id=${ctx.tenantId} and w.client_id=${clientId} and t.status not in ('completed','skipped') order by t.due_date nulls last,t.sequence limit 50`;
    const recurringSchedules = await tx`select r.*,s.name service_name,wt.name template_name from recurring_work_schedule r join client_service cs on cs.tenant_id=r.tenant_id and cs.id=r.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id join work_template wt on wt.tenant_id=r.tenant_id and wt.id=r.work_template_id where r.tenant_id=${ctx.tenantId} and r.client_id=${clientId} and r.status<>'archived' order by r.next_occurrence_date nulls last`;
    return response({ item: { client: clients[0], services, engagements, workItems, upcomingTasks, recurringSchedules } });
  });
}

export async function handlePracticeManagementRoute(request: Request, env: Env, actorId: string): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/v1/practice/services" && ["GET", "POST"].includes(request.method)) return serviceCollection(request, env, actorId);
  let match = path.match(/^\/v1\/practice\/services\/([^/]+)$/);
  if (match && ["GET", "PATCH"].includes(request.method)) return serviceItem(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/clients\/([^/]+)\/services$/);
  if (match && ["GET", "POST"].includes(request.method)) return clientServices(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/client-services\/([^/]+)\/(activate|terminate)$/);
  if (match && request.method === "POST") return clientServiceLifecycle(request, env, actorId, match[1]!, match[2]! as "activate" | "terminate");
  if (path === "/v1/practice/engagements" && ["GET", "POST"].includes(request.method)) return engagementCollection(request, env, actorId);
  match = path.match(/^\/v1\/practice\/engagements\/([^/]+)$/);
  if (match && ["GET", "PATCH"].includes(request.method)) return engagementItem(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/engagements\/([^/]+)\/status$/);
  if (match && request.method === "POST") return engagementStatus(request, env, actorId, match[1]!);
  if (path === "/v1/practice/work" && ["GET", "POST"].includes(request.method)) return workCollection(request, env, actorId);
  match = path.match(/^\/v1\/practice\/work\/([^/]+)$/);
  if (match && ["GET", "PATCH"].includes(request.method)) return workItem(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/work\/([^/]+)\/(assignment|status|complete)$/);
  if (match && request.method === "POST") return workAction(request, env, actorId, match[1]!, match[2]! as "assignment" | "status" | "complete");
  match = path.match(/^\/v1\/practice\/work\/([^/]+)\/tasks$/);
  if (match && ["GET", "POST"].includes(request.method)) return workTasks(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/tasks\/([^/]+)$/);
  if (match && request.method === "PATCH") return taskAction(request, env, actorId, match[1]!, "patch");
  match = path.match(/^\/v1\/practice\/tasks\/([^/]+)\/(assignment|status|complete)$/);
  if (match && request.method === "POST") return taskAction(request, env, actorId, match[1]!, match[2]! as "assignment" | "status" | "complete");
  if (path === "/v1/practice/work-templates" && ["GET", "POST"].includes(request.method)) return templateCollection(request, env, actorId);
  if (path === "/v1/practice/deadline-rules" && ["GET", "POST"].includes(request.method)) return deadlineRules(request, env, actorId);
  if (path === "/v1/practice/recurring-schedules" && ["GET", "POST"].includes(request.method)) return recurringSchedules(request, env, actorId);
  match = path.match(/^\/v1\/practice\/recurring-schedules\/([^/]+)\/generate$/);
  if (match && request.method === "POST") return generateSchedule(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/work-templates\/([^/]+)$/);
  if (match && ["GET", "PATCH"].includes(request.method)) return templateItem(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/work-templates\/([^/]+)\/publish$/);
  if (match && request.method === "POST") return publishTemplate(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/work\/([^/]+)\/deadline-override$/);
  if (match && request.method === "POST") return overrideDeadline(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/work\/([^/]+)\/deadline-recalculate$/);
  if (match && request.method === "POST") return recalculateDeadline(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/work\/([^/]+)\/ledgerly-link$/);
  if (match && request.method === "PUT") return linkLedgerly(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/clients\/([^/]+)\/summary$/);
  if (match && request.method === "GET") return clientSummary(request, env, actorId, match[1]!);
  return null;
}

export async function runScheduledRecurringGeneration(env: Env): Promise<{ tenants: number; schedules: number }> {
  let contexts: unknown;
  try { contexts = JSON.parse(env.RECURRENCE_EXECUTION_CONTEXTS); } catch { throw new Error("RECURRENCE_EXECUTION_CONTEXTS must be valid JSON"); }
  if (!Array.isArray(contexts)) throw new Error("RECURRENCE_EXECUTION_CONTEXTS must be an array");
  let schedules = 0;
  for (const raw of contexts) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Each recurrence execution context must be an object");
    const item = raw as Record<string, unknown>, tenantId = String(item.tenantId ?? ""), actorId = String(item.actorId ?? "");
    if (!UUID.test(tenantId) || !actorId.trim()) throw new Error("Each recurrence execution context requires tenantId and actorId");
    const headers = { "x-tenant-id": tenantId, "x-correlation-id": crypto.randomUUID() };
    const listed = await recurringSchedules(new Request("https://scheduled.invalid/v1/practice/recurring-schedules", { headers }), env, actorId);
    if (!listed.ok) throw new Error(`Could not list schedules for tenant ${tenantId}`);
    const payload = await listed.json() as { items?: Array<{ id: string; status: string }> };
    for (const schedule of payload.items ?? []) if (schedule.status === "active") {
      const generated = await generateSchedule(new Request(`https://scheduled.invalid/v1/practice/recurring-schedules/${schedule.id}/generate`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" }), env, actorId, schedule.id);
      if (!generated.ok && generated.status !== 409) throw new Error(`Schedule generation failed for ${schedule.id}`);
      schedules++;
    }
  }
  return { tenants: contexts.length, schedules };
}
