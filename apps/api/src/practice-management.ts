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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICE_STATUSES = new Set(["active", "inactive"]);
const CLIENT_SERVICE_STATUSES = new Set(["active", "inactive", "terminated"]);
const ENGAGEMENT_STATUSES = new Set(["draft", "proposed", "active", "suspended", "completed", "terminated"]);
const WORK_STATUSES = new Set(["not_started", "ready", "in_progress", "waiting_on_client", "waiting_internal", "review", "completed", "cancelled"]);
const TASK_STATUSES = new Set(["not_started", "in_progress", "blocked", "review", "completed", "skipped"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
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
    const rows = await tx`insert into client_service(id,tenant_id,client_id,service_id,status,start_date,frequency,responsible_member_id,responsible_team_id,specialist_module_key,configuration,created_by,updated_by) values(${id},${ctx.tenantId},${clientId},${serviceId},'active',${required(input!, "startDate", 10)},${optional(input!, "frequency", 80) ?? services[0]!.default_frequency ?? null},${optional(input!, "responsibleMemberId", 36) ?? null},${optional(input!, "responsibleTeamId", 36) ?? null},${moduleKey},${tx.json(jsonObject(input!, "configuration"))},${ctx.actorId},${ctx.actorId}) returning *`;
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
      return response({ items: await tx`select w.*,o.display_name client_name,s.name service_name,at.name assigned_team_name from work_item w join organisation o on o.tenant_id=w.tenant_id and o.id=w.client_id join client_service cs on cs.tenant_id=w.tenant_id and cs.id=w.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id left join team at on at.tenant_id=w.tenant_id and at.id=w.assigned_team_id where w.tenant_id=${ctx.tenantId} and (${clientId}::uuid is null or w.client_id=${clientId}) and (${status}::text is null or w.status=${status}) and (${dueBefore}::date is null or w.due_date<=${dueBefore}) and (${assigned}::uuid is null or w.assigned_member_id=${assigned}) order by w.due_date nulls last,case w.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,w.created_at desc` });
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
      const rows = await tx`select w.*,l.ledgerly_engagement_id,l.required_feature_key,o.display_name client_name,s.name service_name,e.name engagement_name,at.name assigned_team_name from work_item w left join work_item_ledgerly_link l on l.tenant_id=w.tenant_id and l.work_item_id=w.id join organisation o on o.tenant_id=w.tenant_id and o.id=w.client_id join client_service cs on cs.tenant_id=w.tenant_id and cs.id=w.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id left join practice_engagement e on e.tenant_id=w.tenant_id and e.id=w.engagement_id left join team at on at.tenant_id=w.tenant_id and at.id=w.assigned_team_id where w.tenant_id=${ctx.tenantId} and w.id=${workId}`;
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
    const rows = await tx`insert into work_template(id,tenant_id,name,service_id,status,version,created_by,updated_by) values(${id},${ctx.tenantId},${required(input!, "name", 180)},${serviceId},${enumValue(input!, "status", SERVICE_STATUSES, "active")},${Number(version)},${ctx.actorId},${ctx.actorId}) returning *`;
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
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    for (const [key, column] of Object.entries({ name: "name", status: "status" })) { if (key in input!) changes[column] = key === "status" ? enumValue(input!, key, SERVICE_STATUSES) : required(input!, key, 180); }
    if (Object.keys(changes).length === 2) throw new ApiError(400, "INVALID_REQUEST", "No supported changes were supplied");
    const columns = Object.keys(changes), rows = await tx`update work_template set ${tx(changes, ...columns)} where tenant_id=${ctx.tenantId} and id=${templateId} returning *`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Work template not found");
    await recordMutation(tx, ctx, "WORK_TEMPLATE_UPDATED", "WORK_TEMPLATE", templateId, null, { changedFields: columns });
    return response({ item: rows[0] });
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
    return response({ item: { client: clients[0], services, engagements, workItems, upcomingTasks } });
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
  match = path.match(/^\/v1\/practice\/work-templates\/([^/]+)$/);
  if (match && ["GET", "PATCH"].includes(request.method)) return templateItem(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/work\/([^/]+)\/ledgerly-link$/);
  if (match && request.method === "PUT") return linkLedgerly(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/practice\/clients\/([^/]+)\/summary$/);
  if (match && request.method === "GET") return clientSummary(request, env, actorId, match[1]!);
  return null;
}
