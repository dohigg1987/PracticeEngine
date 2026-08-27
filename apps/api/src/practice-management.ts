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
import { DEPENDENCY_TYPES, REVIEW_POINT_STATUSES, REVIEW_STATUSES, STAGE_STATUSES, STAGE_TYPES, OrchestrationError, assertAutomationChain, assertReviewPointTransition, assertReviewTransition, assertStageTransition, automationConditionsMatch, boundedReplayRange, evaluateStageGates, validateAutomationDefinition, wouldCreateDependencyCycle, type AutomationAction, type AutomationCondition } from "./practice-orchestration.js";

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

function orchestrate<T>(operation:()=>T):T { try{return operation();}catch(error){if(error instanceof OrchestrationError)throw new ApiError(error.status,error.code,error.message);throw error;} }

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

function optionalMinutes(input: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in input)) return undefined;
  if (input[key] === null || input[key] === "") return null;
  const value = Number(input[key]);
  if (!Number.isInteger(value) || value < 0 || value > 10_000_000)
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a non-negative whole number of minutes`);
  return value;
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
    const estimate = optionalMinutes(input!, "estimatedEffortMinutes") ?? null;
    const rows = await tx`insert into work_item(id,tenant_id,client_id,client_service_id,engagement_id,title,period_reference,status,priority,assigned_member_id,assigned_team_id,planned_start_date,planned_end_date,due_date,planned_effort_minutes,estimated_effort_minutes,remaining_effort_minutes,estimate_provenance,assignment_state,specialist_module_key,specialist_record_reference,created_by,updated_by) values(${id},${ctx.tenantId},${clientId},${clientServiceId},${optional(input!, "engagementId", 36) ?? null},${required(input!, "title", 240)},${optional(input!, "periodReference", 100) ?? null},${status},${enumValue(input!, "priority", PRIORITIES, "normal")},${assignedMemberId},${assignedTeamId},${optional(input!, "plannedStartDate", 10) ?? null},${optional(input!, "plannedEndDate", 10) ?? null},${optional(input!, "dueDate", 10) ?? null},${optionalMinutes(input!, "plannedEffortMinutes") ?? estimate},${estimate},${optionalMinutes(input!, "remainingEffortMinutes") ?? estimate},${estimate === null ? null : "manual_override"},${assignedMemberId || assignedTeamId ? "confirmed" : "proposed"},${moduleKey},${specialistRecordReference},${ctx.actorId},${ctx.actorId}) returning *`;
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
      const tasks = await tx`select t.*,coalesce(json_agg(json_build_object('predecessorTaskId',d.predecessor_task_id,'dependencyType',d.dependency_type,'blockingReason',d.blocking_reason,'resolvedAt',d.resolved_at)) filter(where d.predecessor_task_id is not null),'[]') blockers from practice_task t left join practice_task_dependency d on d.tenant_id=t.tenant_id and d.successor_task_id=t.id and d.resolved_at is null where t.tenant_id=${ctx.tenantId} and t.work_item_id=${workId} group by t.id order by t.sequence,t.id`;
      const stages = await tx`select * from work_stage where tenant_id=${ctx.tenantId} and work_item_id=${workId} order by sequence,id`;
      const reviews = await tx`select r.*,coalesce(json_agg(rp order by rp.created_at) filter(where rp.id is not null),'[]') review_points from practice_review r left join practice_review_point rp on rp.tenant_id=r.tenant_id and rp.review_id=r.id where r.tenant_id=${ctx.tenantId} and r.work_item_id=${workId} group by r.id order by r.requested_at desc`;
      return response({ item: { ...rows[0], tasks, stages, reviews } });
    }
    const current = await tx`select specialist_module_key from work_item where tenant_id=${ctx.tenantId} and id=${workId}`;
    if (!current.length) throw new ApiError(404, "NOT_FOUND", "Work item not found");
    if ("specialistRecordReference" in input! && current[0]!.specialist_module_key === "ledgerly")
      throw new ApiError(400, "INVALID_LEDGERLY_LINK", "Change Ledgerly references through the validated Ledgerly link operation");
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    const map: Record<string, [string, number]> = { title: ["title", 240], periodReference: ["period_reference", 100], engagementId: ["engagement_id", 36], plannedStartDate: ["planned_start_date", 10], plannedEndDate: ["planned_end_date", 10], dueDate: ["due_date", 10], specialistRecordReference: ["specialist_record_reference", 200] };
    for (const [key, [column, max]] of Object.entries(map)) { const value = optional(input!, key, max); if (value !== undefined) changes[column] = value; }
    if ("priority" in input!) changes.priority = enumValue(input!, "priority", PRIORITIES);
    for (const [key, column] of Object.entries({ plannedEffortMinutes: "planned_effort_minutes", estimatedEffortMinutes: "estimated_effort_minutes", remainingEffortMinutes: "remaining_effort_minutes" })) {
      const value = optionalMinutes(input!, key); if (value !== undefined) changes[column] = value;
    }
    if ("estimatedEffortMinutes" in input!) changes.estimate_provenance = "manual_override";
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
    if (status === "completed") {
      const openStages = await tx`select 1 from work_stage where tenant_id=${ctx.tenantId} and work_item_id=${workId} and status not in ('completed','skipped') limit 1`;
      const pendingReviews = await tx`select 1 from practice_review where tenant_id=${ctx.tenantId} and work_item_id=${workId} and status not in ('approved','completed') limit 1`;
      const missingReviews = await tx`select 1 from practice_task t where t.tenant_id=${ctx.tenantId} and t.work_item_id=${workId} and t.review_required and not exists(select 1 from practice_review r where r.tenant_id=t.tenant_id and r.practice_task_id=t.id and r.status in ('approved','completed')) limit 1`;
      if (openStages.length || pendingReviews.length || missingReviews.length) {
        const overrideReason = optional(input, "overrideReason", 500);
        if (!overrideReason) throw new ApiError(409, "WORK_APPROVAL_GATES_NOT_MET", "Workflow stages and required reviews must be complete before work completion");
        await assertPlatformPermission(tx, "review.override");
        await recordMutation(tx, ctx, "WORK_COMPLETION_OVERRIDDEN", "WORK_ITEM", workId, String(current[0]!.client_id), { reason: overrideReason, openStageGate: Boolean(openStages.length), pendingReviewGate: Boolean(pendingReviews.length), missingRequiredReviewGate:Boolean(missingReviews.length) }, "review.completion_overridden");
      }
    }
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
    const estimate = optionalMinutes(input!, "estimatedEffortMinutes") ?? null;
    const rows = await tx`insert into practice_task(id,tenant_id,work_item_id,title,description,status,assignee_member_id,team_id,sequence,due_date,reviewer_member_id,estimated_effort_minutes,remaining_effort_minutes,created_by,updated_by) values(${id},${ctx.tenantId},${workId},${required(input!, "title", 240)},${optional(input!, "description", 2000) ?? null},'not_started',${optional(input!, "assigneeMemberId", 36) ?? null},${optional(input!, "teamId", 36) ?? null},${Number(sequence)},${optional(input!, "dueDate", 10) ?? null},${optional(input!, "reviewerMemberId", 36) ?? null},${estimate},${optionalMinutes(input!, "remainingEffortMinutes") ?? estimate},${ctx.actorId},${ctx.actorId}) returning *`;
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
      for (const [key, column] of Object.entries({ estimatedEffortMinutes: "estimated_effort_minutes", remainingEffortMinutes: "remaining_effort_minutes" })) { const value = optionalMinutes(input, key); if (value !== undefined) changes[column] = value; }
    } else if (action === "assignment") {
      changes.assignee_member_id = optional(input, "assigneeMemberId", 36) ?? null; changes.team_id = optional(input, "teamId", 36) ?? null;
    } else {
      const status = action === "complete" ? "completed" : enumValue(input, "status", TASK_STATUSES);
      if (String(current[0]!.status) === status) throw new ApiError(409, "INVALID_STATUS_TRANSITION", `Task is already ${status}`);
      if (status === "in_progress") {
        const blockers = await tx`select d.dependency_type,p.status predecessor_status from practice_task_dependency d join practice_task p on p.tenant_id=d.tenant_id and p.id=d.predecessor_task_id where d.tenant_id=${ctx.tenantId} and d.successor_task_id=${taskId} and d.resolved_at is null and ((d.dependency_type in ('finish_to_start','blocks') and p.status not in ('completed','skipped')) or (d.dependency_type='start_to_start' and p.status='not_started'))`;
        if (blockers.length) throw new ApiError(409, "TASK_BLOCKED_BY_DEPENDENCY", "Task dependencies prevent work from starting");
      }
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
    if (request.method === "GET") return response({ items: await tx`select wt.*,s.name service_name,(select coalesce(json_agg(wtt order by wtt.sequence),'[]') from work_template_task wtt where wtt.tenant_id=wt.tenant_id and wtt.work_template_id=wt.id) tasks,(select coalesce(json_agg(wts order by wts.sequence),'[]') from work_template_stage wts where wts.tenant_id=wt.tenant_id and wts.work_template_id=wt.id) stages from work_template wt join practice_service s on s.tenant_id=wt.tenant_id and s.id=wt.service_id where wt.tenant_id=${ctx.tenantId} order by wt.name,wt.version desc` });
    const id = crypto.randomUUID(), serviceId = uuid(required(input!, "serviceId", 36), "Service");
    const version = input!.version ?? 1; if (!Number.isInteger(version) || Number(version) < 1) throw new ApiError(400, "INVALID_REQUEST", "version must be a positive integer");
    const templateEstimate = optionalMinutes(input!, "estimatedEffortMinutes") ?? null;
    const rows = await tx`insert into work_template(id,tenant_id,name,service_id,status,version,template_family_id,estimated_effort_minutes,estimate_provenance,created_by,updated_by) values(${id},${ctx.tenantId},${required(input!, "name", 180)},${serviceId},${enumValue(input!, "status", TEMPLATE_STATUSES, "draft")},${Number(version)},${optional(input!, "templateFamilyId", 36) ?? id},${templateEstimate},${templateEstimate === null ? null : "template"},${ctx.actorId},${ctx.actorId}) returning *`;
    const stageDefinitions = input!.stages ?? [];
    if (!Array.isArray(stageDefinitions)) throw new ApiError(400, "INVALID_REQUEST", "stages must be an array");
    const stageIds = new Map<number, string>();
    for (const [index, raw] of stageDefinitions.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, "INVALID_REQUEST", "Each workflow stage must be an object");
      const item = raw as Record<string, unknown>, sequence = item.sequence ?? index + 1, stageType = enumValue(item, "stageType", STAGE_TYPES);
      if (!Number.isInteger(sequence) || Number(sequence) < 1) throw new ApiError(400, "INVALID_REQUEST", "Workflow stage sequence is invalid");
      const stageId = crypto.randomUUID(); stageIds.set(Number(sequence), stageId);
      await tx`insert into work_template_stage(id,tenant_id,work_template_id,name,sequence,stage_type,default_assignee_role_id,default_reviewer_role_id,entry_criteria,completion_criteria,status,skippable,created_by,updated_by) values(${stageId},${ctx.tenantId},${id},${required(item,"name",180)},${Number(sequence)},${stageType},${optional(item,"defaultAssigneeRoleId",36) ?? null},${optional(item,"defaultReviewerRoleId",36) ?? null},${tx.json((item.entryCriteria ?? {}) as postgres.JSONValue)},${tx.json((item.completionCriteria ?? {}) as postgres.JSONValue)},'active',${item.skippable === true},${ctx.actorId},${ctx.actorId})`;
    }
    const definitions = input!.tasks ?? [];
    if (!Array.isArray(definitions)) throw new ApiError(400, "INVALID_REQUEST", "tasks must be an array");
    for (const [index, raw] of definitions.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, "INVALID_REQUEST", "Each template task must be an object");
      const item = raw as Record<string, unknown>, sequence = item.sequence ?? index + 1;
      if (!Number.isInteger(sequence) || Number(sequence) < 1) throw new ApiError(400, "INVALID_REQUEST", "Template task sequence is invalid");
      const stageSequence = item.stageSequence === undefined ? null : Number(item.stageSequence);
      if (stageSequence !== null && (!Number.isInteger(stageSequence) || !stageIds.has(stageSequence))) throw new ApiError(400, "INVALID_REQUEST", "Template task stageSequence is invalid");
      await tx`insert into work_template_task(id,tenant_id,work_template_id,title,description,sequence,default_assignee_role_id,default_team_id,due_date_offset_days,mandatory,work_template_stage_id,review_required,estimated_effort_minutes,created_by,updated_by) values(${crypto.randomUUID()},${ctx.tenantId},${id},${required(item, "title", 240)},${optional(item, "description", 2000) ?? null},${Number(sequence)},${optional(item, "defaultAssigneeRoleId", 36) ?? null},${optional(item, "defaultTeamId", 36) ?? null},${Number.isInteger(item.dueDateOffsetDays) ? Number(item.dueDateOffsetDays) : null},${item.mandatory !== false},${stageSequence === null ? null : stageIds.get(stageSequence) ?? null},${item.reviewRequired === true},${optionalMinutes(item, "estimatedEffortMinutes") ?? null},${ctx.actorId},${ctx.actorId})`;
    }
    await recordMutation(tx, ctx, "WORK_TEMPLATE_CREATED", "WORK_TEMPLATE", id, null, { serviceId, version: Number(version), taskCount: definitions.length, stageCount: stageDefinitions.length });
    return response({ item: rows[0] }, 201);
  });
}

async function templateItem(request: Request, env: Env, actorId: string, templateId: string) {
  uuid(templateId, "Work template"); const input = request.method === "PATCH" ? await body(request) : null;
  return within(request, env, actorId, "worktemplates.manage", "practice.workflow", async (tx, ctx) => {
    if (request.method === "GET") {
      const rows = await tx`select * from work_template where tenant_id=${ctx.tenantId} and id=${templateId}`;
      if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Work template not found");
      return response({ item: { ...rows[0], tasks: await tx`select * from work_template_task where tenant_id=${ctx.tenantId} and work_template_id=${templateId} order by sequence,id`, stages: await tx`select * from work_template_stage where tenant_id=${ctx.tenantId} and work_template_id=${templateId} order by sequence,id` } });
    }
    const existing = await tx`select status from work_template where tenant_id=${ctx.tenantId} and id=${templateId} for update`;
    if (!existing.length) throw new ApiError(404, "NOT_FOUND", "Work template not found");
    if (existing[0]!.status !== "draft") throw new ApiError(409, "TEMPLATE_VERSION_IMMUTABLE", "Published or used template versions are historical records");
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    if ("name" in input!) changes.name = required(input!, "name", 180);
    if ("estimatedEffortMinutes" in input!) { changes.estimated_effort_minutes = optionalMinutes(input!, "estimatedEffortMinutes"); changes.estimate_provenance = "manual_override"; }
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

function jsonArray(input: Record<string, unknown>, key: string): unknown[] {
  const value = input[key];
  if (!Array.isArray(value)) throw new ApiError(400, "INVALID_REQUEST", `${key} must be an array`);
  return value;
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
  await tx`insert into work_item(id,tenant_id,client_id,client_service_id,engagement_id,title,period_reference,period_start,period_end,status,assigned_member_id,assigned_team_id,due_date,calculated_due_date,due_date_rule_id,due_date_calculation,source_template_id,source_template_version,recurring_schedule_id,generation_id,planned_effort_minutes,estimated_effort_minutes,remaining_effort_minutes,estimate_provenance,assignment_state,specialist_module_key,created_by,updated_by) values(${workId},${ctx.tenantId},${schedule.client_id},${schedule.client_service_id},${schedule.engagement_id},${`${template[0]!.name} – period ended ${occurrence.periodEnd}`},${`Period ended ${occurrence.periodEnd}`},${occurrence.periodStart},${occurrence.periodEnd},'not_started',${schedule.default_assignee_member_id},${schedule.default_team_id},${deadline?.date ?? null},${deadline?.date ?? null},${schedule.deadline_rule_id},${tx.json((deadline?.provenance ?? {}) as postgres.JSONValue)},${template[0]!.id},${template[0]!.version},${schedule.id},${markerId},${template[0]!.estimated_effort_minutes},${template[0]!.estimated_effort_minutes},${template[0]!.estimated_effort_minutes},${template[0]!.estimated_effort_minutes === null ? null : "template"},${schedule.default_assignee_member_id || schedule.default_team_id ? "confirmed" : "proposed"},${schedule.specialist_module_key},${ctx.actorId},${ctx.actorId})`;
  const stageDefinitions = await tx`select * from work_template_stage where tenant_id=${ctx.tenantId} and work_template_id=${template[0]!.id} and status='active' order by sequence,id`;
  const stageInstances = new Map<string, string>();
  for (const definition of stageDefinitions) {
    const resolveRole = async (roleId: unknown) => {
      if (!roleId) return null;
      const members = await tx`select tm.id from tenant_member tm join tenant_member_role mr on mr.tenant_id=tm.tenant_id and mr.tenant_member_id=tm.id where tm.tenant_id=${ctx.tenantId} and mr.role_id=${String(roleId)} and tm.membership_status='ACTIVE' order by tm.created_at,tm.id limit 1`;
      return members[0]?.id ?? null;
    };
    const stageId = crypto.randomUUID(); stageInstances.set(String(definition.id), stageId);
    await tx`insert into work_stage(id,tenant_id,work_item_id,source_template_stage_id,source_template_id,source_template_version,name,sequence,stage_type,status,assignee_member_id,reviewer_member_id,entry_criteria,completion_criteria,skippable,created_by,updated_by) values(${stageId},${ctx.tenantId},${workId},${definition.id},${template[0]!.id},${template[0]!.version},${definition.name},${definition.sequence},${definition.stage_type},'not_started',${await resolveRole(definition.default_assignee_role_id)},${await resolveRole(definition.default_reviewer_role_id)},${tx.json(definition.entry_criteria as postgres.JSONValue)},${tx.json(definition.completion_criteria as postgres.JSONValue)},${definition.skippable},${ctx.actorId},${ctx.actorId})`;
  }
  const definitions = await tx`select * from work_template_task where tenant_id=${ctx.tenantId} and work_template_id=${template[0]!.id} order by sequence,id`;
  for (const definition of definitions) {
    let assignee = schedule.default_assignee_member_id;
    if (definition.default_assignee_role_id) {
      const resolved = await tx`select tm.id from tenant_member tm join tenant_member_role mr on mr.tenant_id=tm.tenant_id and mr.tenant_member_id=tm.id where tm.tenant_id=${ctx.tenantId} and mr.role_id=${definition.default_assignee_role_id} and tm.membership_status='ACTIVE' order by tm.created_at,tm.id limit 1`;
      assignee = resolved[0]?.id ?? assignee;
    }
    const taskId = crypto.randomUUID();
    await tx`insert into practice_task(id,tenant_id,work_item_id,title,description,status,assignee_member_id,team_id,sequence,due_date,source_template_task_id,mandatory,work_stage_id,review_required,estimated_effort_minutes,remaining_effort_minutes,created_by,updated_by) values(${taskId},${ctx.tenantId},${workId},${definition.title},${definition.description},'not_started',${assignee},${definition.default_team_id ?? schedule.default_team_id},${definition.sequence},${definition.due_date_offset_days === null ? null : addDays(deadline?.date ?? occurrence.periodEnd, Number(definition.due_date_offset_days))},${definition.id},${definition.mandatory},${definition.work_template_stage_id ? stageInstances.get(String(definition.work_template_stage_id)) ?? null : null},${definition.review_required},${definition.estimated_effort_minutes},${definition.estimated_effort_minutes},${ctx.actorId},${ctx.actorId})`;
    await recordMutation(tx, ctx, "TASK_GENERATED", "PRACTICE_TASK", taskId, String(schedule.client_id), { workItemId: workId, templateTaskId: String(definition.id), sequence: Number(definition.sequence) }, "task.generated");
  }
  await tx`update recurrence_generation set work_item_id=${workId} where tenant_id=${ctx.tenantId} and id=${markerId}`;
  await recordMutation(tx, ctx, "WORK_TEMPLATE_INSTANTIATED", "WORK_ITEM", workId, String(schedule.client_id), { templateId: String(template[0]!.id), templateVersion: Number(template[0]!.version), taskCount: definitions.length, stageCount: stageDefinitions.length }, "work.template_instantiated");
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
    const clients = await tx`select id,display_name,legal_name,lifecycle_status,responsible_member_id,responsible_team_id,originating_opportunity_id,originating_proposal_reference_id,converted_at from organisation where tenant_id=${ctx.tenantId} and id=${clientId}`;
    if (!clients.length) throw new ApiError(404, "NOT_FOUND", "Client not found");
    const services = await tx`select cs.*,s.name service_name,s.category from client_service cs join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id where cs.tenant_id=${ctx.tenantId} and cs.client_id=${clientId} and cs.status='active' order by s.name`;
    const engagements = await tx`select * from practice_engagement where tenant_id=${ctx.tenantId} and client_id=${clientId} and status not in ('completed','terminated') order by start_date nulls last`;
    const workItems = await tx`select * from work_item where tenant_id=${ctx.tenantId} and client_id=${clientId} and status not in ('completed','cancelled') order by due_date nulls last`;
    const upcomingTasks = await tx`select t.* from practice_task t join work_item w on w.tenant_id=t.tenant_id and w.id=t.work_item_id where t.tenant_id=${ctx.tenantId} and w.client_id=${clientId} and t.status not in ('completed','skipped') order by t.due_date nulls last,t.sequence limit 50`;
    const recurringSchedules = await tx`select r.*,s.name service_name,wt.name template_name from recurring_work_schedule r join client_service cs on cs.tenant_id=r.tenant_id and cs.id=r.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id join work_template wt on wt.tenant_id=r.tenant_id and wt.id=r.work_template_id where r.tenant_id=${ctx.tenantId} and r.client_id=${clientId} and r.status<>'archived' order by r.next_occurrence_date nulls last`;
    const onboarding = await tx`select id,status,mandatory_gates_complete,updated_at from onboarding_case where tenant_id=${ctx.tenantId} and client_id=${clientId} order by created_at desc limit 1`;
    return response({ item: { client: clients[0], services, engagements, workItems, upcomingTasks, recurringSchedules, onboarding: onboarding[0] ?? null } });
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
  match = path.match(/^\/v1\/practice\/tasks\/([^/]+)\/dependencies$/);
  if (match && ["GET","POST"].includes(request.method)) return taskDependencies(request,env,actorId,match[1]!);
  match = path.match(/^\/v1\/practice\/tasks\/([^/]+)\/dependencies\/([^/]+)\/resolve$/);
  if (match && request.method === "POST") return resolveDependency(request,env,actorId,match[1]!,match[2]!);
  match = path.match(/^\/v1\/practice\/work\/([^/]+)\/workflow$/);
  if (match && request.method === "GET") return workflowStages(request,env,actorId,match[1]!);
  match = path.match(/^\/v1\/practice\/workflow-stages\/([^/]+)\/advance$/);
  if (match && request.method === "POST") return advanceWorkflowStage(request,env,actorId,match[1]!);
  if (path === "/v1/practice/reviews" && ["GET","POST"].includes(request.method)) return reviews(request,env,actorId);
  match = path.match(/^\/v1\/practice\/reviews\/([^/]+)\/decision$/);
  if (match && request.method === "POST") return reviewDecision(request,env,actorId,match[1]!);
  match = path.match(/^\/v1\/practice\/reviews\/([^/]+)\/points$/);
  if (match && ["GET","POST"].includes(request.method)) return reviewPoints(request,env,actorId,match[1]!);
  match = path.match(/^\/v1\/practice\/review-points\/([^/]+)\/status$/);
  if (match && request.method === "POST") return reviewPointStatus(request,env,actorId,match[1]!);
  if (path === "/v1/practice/automation-rules" && ["GET","POST"].includes(request.method)) return automationRules(request,env,actorId);
  match = path.match(/^\/v1\/practice\/automation-rules\/([^/]+)$/);
  if (match && request.method === "PATCH") return automationRuleItem(request,env,actorId,match[1]!);
  match = path.match(/^\/v1\/practice\/automation-rules\/([^/]+)\/execute$/);
  if (match && request.method === "POST") return executeAutomation(request,env,actorId,match[1]!);
  if (path === "/v1/practice/recurrence-operations" && request.method === "GET") return recurrenceHistory(request,env,actorId);
  if (path === "/v1/practice/recurrence-operations/dry-run" && request.method === "POST") return recurrenceOperation(request,env,actorId,"dry_run");
  if (path === "/v1/practice/recurrence-operations/replay" && request.method === "POST") return recurrenceOperation(request,env,actorId,"replay");
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

async function workflowStages(request: Request, env: Env, actorId: string, workId: string) {
  uuid(workId, "Work item");
  return within(request, env, actorId, "work.view", "practice.workflow", async (tx, ctx) =>
    response({ items: await tx`select ws.*,coalesce((select json_agg(t order by t.sequence) from practice_task t where t.tenant_id=ws.tenant_id and t.work_stage_id=ws.id),'[]') tasks from work_stage ws where ws.tenant_id=${ctx.tenantId} and ws.work_item_id=${workId} order by ws.sequence,ws.id` }));
}

async function advanceWorkflowStage(request: Request, env: Env, actorId: string, stageId: string) {
  uuid(stageId, "Workflow stage"); const input = await body(request);
  return within(request, env, actorId, "workflow.advance", "practice.workflow", async (tx, ctx) => {
    const rows = await tx`select ws.*,w.client_id,w.specialist_record_reference from work_stage ws join work_item w on w.tenant_id=ws.tenant_id and w.id=ws.work_item_id where ws.tenant_id=${ctx.tenantId} and ws.id=${stageId} for update of ws`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Workflow stage not found");
    const stage = rows[0]!, next = enumValue(input, "status", STAGE_STATUSES);
    const mandatory = await tx`select count(*)::int remaining from practice_task where tenant_id=${ctx.tenantId} and work_stage_id=${stageId} and mandatory and status not in ('completed','skipped')`;
    const approvals = await tx`select count(*)::int approved from practice_review where tenant_id=${ctx.tenantId} and work_stage_id=${stageId} and status in ('approved','completed')`;
    const prior = await tx`select count(*)::int remaining from work_stage where tenant_id=${ctx.tenantId} and work_item_id=${stage.work_item_id} and sequence<${stage.sequence} and status not in ('completed','skipped')`;
    const criteria = (stage.completion_criteria ?? {}) as Record<string, unknown>;
    const failures = evaluateStageGates(criteria, {
      mandatoryTasksIncomplete: Number(mandatory[0]!.remaining), approvalRequired: stage.stage_type === "approval", approvalRecorded: Number(approvals[0]!.approved)>0,
      predecessorIncomplete: Number(prior[0]!.remaining)>0, specialistCompletionRequired: criteria.specialistCompletion === true,
      specialistCompletionRecorded: Boolean(stage.specialist_record_reference), manualReleaseRequired: criteria.manualRelease === true, manualReleaseGranted: input.manualRelease === true,
    });
    orchestrate(()=>assertStageTransition(String(stage.status), next, Boolean(stage.skippable), failures));
    const blockReason = next === "blocked" ? required(input, "reason", 500) : null;
    const updated = await tx`update work_stage set status=${next},block_reason=${blockReason},started_at=case when ${next}='active' then coalesce(started_at,now()) else started_at end,completed_at=case when ${next} in ('completed','skipped') then now() else null end,updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${stageId} returning *`;
    const event = next === "completed" ? "workflow.stage_completed" : next === "blocked" ? "workflow.blocked" : stage.status === "blocked" ? "workflow.unblocked" : next === "active" ? "workflow.stage_started" : undefined;
    await recordMutation(tx, ctx, `WORKFLOW_STAGE_${next.toUpperCase()}`, "WORK_STAGE", stageId, String(stage.client_id), { workItemId: String(stage.work_item_id), fromStatus: String(stage.status), toStatus: next, gateFailures: failures }, event);
    return response({ item: updated[0], gates: failures });
  });
}

async function taskDependencies(request: Request, env: Env, actorId: string, taskId: string) {
  uuid(taskId, "Task"); const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "tasks.view" : "workflow.manage", "practice.workflow", async (tx, ctx) => {
    if (request.method === "GET") return response({ items: await tx`select d.*,p.title predecessor_title,p.status predecessor_status from practice_task_dependency d join practice_task p on p.tenant_id=d.tenant_id and p.id=d.predecessor_task_id where d.tenant_id=${ctx.tenantId} and d.successor_task_id=${taskId} order by d.created_at` });
    const predecessor = uuid(required(input!, "predecessorTaskId", 36), "Predecessor task"), type = enumValue(input!, "dependencyType", DEPENDENCY_TYPES, "finish_to_start");
    const tasks = await tx`select id,work_item_id from practice_task where tenant_id=${ctx.tenantId} and id in (${predecessor},${taskId})`;
    if (tasks.length !== 2 || new Set(tasks.map((item) => String(item.work_item_id))).size !== 1) throw new ApiError(409, "INVALID_TASK_DEPENDENCY", "Task dependencies must remain within one work item");
    const edges = await tx`select predecessor_task_id,successor_task_id,resolved_at from practice_task_dependency where tenant_id=${ctx.tenantId} and predecessor_task_id in (select id from practice_task where tenant_id=${ctx.tenantId} and work_item_id=${tasks[0]!.work_item_id})`;
    if (wouldCreateDependencyCycle(edges.map((edge) => ({ predecessor:String(edge.predecessor_task_id), successor:String(edge.successor_task_id), resolved:Boolean(edge.resolved_at) })), predecessor, taskId)) throw new ApiError(409, "DEPENDENCY_CYCLE", "Task dependency would create a cycle");
    await tx`insert into practice_task_dependency(tenant_id,predecessor_task_id,successor_task_id,dependency_type,blocking_reason,created_by) values(${ctx.tenantId},${predecessor},${taskId},${type},${optional(input!,"blockingReason",500) ?? null},${ctx.actorId})`;
    await recordMutation(tx, ctx, "TASK_DEPENDENCY_CREATED", "PRACTICE_TASK", taskId, null, { predecessorTaskId: predecessor, dependencyType: type }, "workflow.blocked");
    return response({ predecessorTaskId: predecessor, successorTaskId: taskId, dependencyType: type }, 201);
  });
}

async function resolveDependency(request: Request, env: Env, actorId: string, taskId: string, predecessorId: string) {
  uuid(taskId,"Task"); uuid(predecessorId,"Predecessor task"); const input = await body(request);
  return within(request, env, actorId, "workflow.manage", "practice.workflow", async (tx, ctx) => {
    const reason = required(input,"reason",500);
    const rows = await tx`update practice_task_dependency set resolved_at=now(),resolved_by=${ctx.actorId},blocking_reason=coalesce(blocking_reason,'') || ${` | Resolved: ${reason}`} where tenant_id=${ctx.tenantId} and predecessor_task_id=${predecessorId} and successor_task_id=${taskId} and resolved_at is null returning *`;
    if (!rows.length) throw new ApiError(404,"NOT_FOUND","Active task dependency not found");
    await recordMutation(tx,ctx,"TASK_DEPENDENCY_RESOLVED","PRACTICE_TASK",taskId,null,{predecessorTaskId:predecessorId,reason},"workflow.unblocked");
    return response({item:rows[0]});
  });
}

async function reviews(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "review.perform" : "review.request", "practice.workflow", async (tx, ctx) => {
    if (request.method === "GET") {
      const status = new URL(request.url).searchParams.get("status"); if (status && !REVIEW_STATUSES.has(status)) throw new ApiError(400,"INVALID_REQUEST","status is invalid");
      return response({items:await tx`select r,w.title work_title,w.due_date,o.display_name client_name,s.name service_name,ws.name stage_name,pm.display_name preparer_name,rm.display_name reviewer_name,extract(epoch from(now()-r.requested_at))/3600 waiting_hours from practice_review r join work_item w on w.tenant_id=r.tenant_id and w.id=r.work_item_id join organisation o on o.tenant_id=w.tenant_id and o.id=w.client_id join client_service cs on cs.tenant_id=w.tenant_id and cs.id=w.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id left join work_stage ws on ws.tenant_id=r.tenant_id and ws.id=r.work_stage_id left join tenant_member pm on pm.tenant_id=r.tenant_id and pm.id=r.preparer_member_id left join tenant_member rm on rm.tenant_id=r.tenant_id and rm.id=r.reviewer_member_id where r.tenant_id=${ctx.tenantId} and (${status}::text is null or r.status=${status}) order by r.requested_at`});
    }
    const workId=uuid(required(input!,"workItemId",36),"Work item"), taskId=optional(input!,"taskId",36) ?? null, stageId=optional(input!,"stageId",36) ?? null;
    if (!taskId && !stageId) throw new ApiError(400,"INVALID_REQUEST","taskId or stageId is required");
    const work=await tx`select client_id from work_item where tenant_id=${ctx.tenantId} and id=${workId}`; if(!work.length) throw new ApiError(404,"NOT_FOUND","Work item not found");
    const id=crypto.randomUUID(), rows=await tx`insert into practice_review(id,tenant_id,work_item_id,practice_task_id,work_stage_id,preparer_member_id,reviewer_member_id,approver_member_id,segregation_required,requested_by) values(${id},${ctx.tenantId},${workId},${taskId},${stageId},${optional(input!,"preparerMemberId",36) ?? null},${optional(input!,"reviewerMemberId",36) ?? null},${optional(input!,"approverMemberId",36) ?? null},${input!.segregationRequired !== false},${ctx.actorId}) returning *`;
    await recordMutation(tx,ctx,"REVIEW_REQUESTED","PRACTICE_REVIEW",id,String(work[0]!.client_id),{workItemId:workId,taskId,stageId},"review.requested");
    return response({item:rows[0]},201);
  });
}

async function reviewDecision(request: Request, env: Env, actorId: string, reviewId: string) {
  uuid(reviewId,"Review"); const input=await body(request), status=enumValue(input,"status",REVIEW_STATUSES);
  const permission=status==="approved"?"review.approve":"review.perform";
  return within(request,env,actorId,permission,"practice.workflow",async(tx,ctx)=>{
    const rows=await tx`select r.*,w.client_id from practice_review r join work_item w on w.tenant_id=r.tenant_id and w.id=r.work_item_id where r.tenant_id=${ctx.tenantId} and r.id=${reviewId} for update of r`; if(!rows.length) throw new ApiError(404,"NOT_FOUND","Review not found");
    const review=rows[0]!, actor=await tx`select id from tenant_member where tenant_id=${ctx.tenantId} and actor_id=${ctx.actorId} and membership_status='ACTIVE'`;
    orchestrate(()=>assertReviewTransition(String(review.status),status));
    if(!actor.length)throw new ApiError(403,"ACTIVE_MEMBERSHIP_REQUIRED","An active tenant membership is required");
    if(status==="approved"&&review.approver_member_id&&String(review.approver_member_id)!==String(actor[0]!.id))throw new ApiError(403,"DESIGNATED_APPROVER_REQUIRED","Only the designated approver may approve this review");
    if(["in_progress","changes_requested"].includes(status)&&review.reviewer_member_id&&String(review.reviewer_member_id)!==String(actor[0]!.id))throw new ApiError(403,"DESIGNATED_REVIEWER_REQUIRED","Only the designated reviewer may perform this review");
    if(status==="approved" && review.segregation_required && actor[0]?.id && String(review.preparer_member_id)===String(actor[0].id)) throw new ApiError(403,"SELF_APPROVAL_PROHIBITED","The preparer cannot approve this review");
    if(status==="approved"){const open=await tx`select 1 from practice_review_point where tenant_id=${ctx.tenantId} and review_id=${reviewId} and status<>'cleared' limit 1`; if(open.length) throw new ApiError(409,"OPEN_REVIEW_POINTS","Review points must be cleared before approval");}
    const reason=status==="changes_requested"||status==="rejected"?required(input,"reason",2000):optional(input,"reason",2000)??null;
    const updated=await tx`update practice_review set status=${status},started_at=case when ${status}='in_progress' then coalesce(started_at,now()) else started_at end,decided_at=case when ${status} in ('approved','rejected','changes_requested') then now() else decided_at end,decision_by=case when ${status} in ('approved','rejected','changes_requested') then ${ctx.actorId} else decision_by end,decision_reason=${reason},updated_at=now() where tenant_id=${ctx.tenantId} and id=${reviewId} returning *`;
    const event=status==="approved"?"review.approved":status==="changes_requested"?"review.changes_requested":status==="reopened"?"review.reopened":undefined;
    await recordMutation(tx,ctx,`REVIEW_${status.toUpperCase()}`,"PRACTICE_REVIEW",reviewId,String(review.client_id),{fromStatus:String(review.status),toStatus:status,reason},event);
    return response({item:updated[0]});
  });
}

async function reviewPoints(request: Request,env:Env,actorId:string,reviewId:string){
  uuid(reviewId,"Review"); const input=request.method==="POST"?await body(request):null;
  return within(request,env,actorId,request.method==="GET"?"review.perform":"review.perform","practice.workflow",async(tx,ctx)=>{
    if(request.method==="GET") return response({items:await tx`select * from practice_review_point where tenant_id=${ctx.tenantId} and review_id=${reviewId} order by created_at`});
    const review=await tx`select work_item_id,practice_task_id,work_stage_id from practice_review where tenant_id=${ctx.tenantId} and id=${reviewId}`; if(!review.length) throw new ApiError(404,"NOT_FOUND","Review not found");
    const id=crypto.randomUUID(),rows=await tx`insert into practice_review_point(id,tenant_id,review_id,work_item_id,practice_task_id,work_stage_id,description,created_by,assigned_member_id,updated_by) values(${id},${ctx.tenantId},${reviewId},${review[0]!.work_item_id},${review[0]!.practice_task_id},${review[0]!.work_stage_id},${required(input!,"description",4000)},${ctx.actorId},${optional(input!,"assignedMemberId",36)??null},${ctx.actorId}) returning *`;
    await recordMutation(tx,ctx,"REVIEW_POINT_CREATED","PRACTICE_REVIEW_POINT",id,null,{reviewId},"review.point_created"); return response({item:rows[0]},201);
  });
}

async function reviewPointStatus(request:Request,env:Env,actorId:string,pointId:string){
  uuid(pointId,"Review point"); const input=await body(request),status=enumValue(input,"status",REVIEW_POINT_STATUSES);
  return within(request,env,actorId,"review.perform","practice.workflow",async(tx,ctx)=>{const current=await tx`select status from practice_review_point where tenant_id=${ctx.tenantId} and id=${pointId} for update`;if(!current.length)throw new ApiError(404,"NOT_FOUND","Review point not found");orchestrate(()=>assertReviewPointTransition(String(current[0]!.status),status));const resolution=status==="addressed"||status==="cleared"?required(input,"resolution",4000):optional(input,"resolution",4000)??null;const rows=await tx`update practice_review_point set status=${status},resolution=${resolution},addressed_at=case when ${status}='addressed' then now() else addressed_at end,cleared_at=case when ${status}='cleared' then now() else null end,updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${pointId} returning *`;await recordMutation(tx,ctx,`REVIEW_POINT_${status.toUpperCase()}`,"PRACTICE_REVIEW_POINT",pointId,null,{status});return response({item:rows[0]});});
}

async function automationRules(request:Request,env:Env,actorId:string){
  const input=request.method==="POST"?await body(request):null;
  return within(request,env,actorId,request.method==="GET"?"automation.view":"automation.manage","practice.automation",async(tx,ctx)=>{
    if(request.method==="GET") return response({items:await tx`select r.*,coalesce((select json_agg(e order by e.started_at desc) from (select * from automation_execution ae where ae.tenant_id=r.tenant_id and ae.automation_rule_id=r.id order by ae.started_at desc limit 10)e),'[]') recent_executions from automation_rule r where r.tenant_id=${ctx.tenantId} order by r.priority,r.name`});
    const definition=orchestrate(()=>validateAutomationDefinition(input!.triggerType,input!.conditions??[],input!.actions)),priority=Number(input!.priority??100);
    if(!Number.isInteger(priority)||priority<0||priority>1000)throw new ApiError(400,"INVALID_REQUEST","priority must be 0-1000");
    const id=crypto.randomUUID(),rows=await tx`insert into automation_rule(id,tenant_id,name,enabled,trigger_type,conditions,actions,priority,effective_from,effective_to,created_by,updated_by) values(${id},${ctx.tenantId},${required(input!,"name",180)},${input!.enabled===true},${String(input!.triggerType)},${tx.json(definition.conditions as unknown as postgres.JSONValue)},${tx.json(definition.actions as unknown as postgres.JSONValue)},${priority},${optional(input!,"effectiveFrom",35)??null},${optional(input!,"effectiveTo",35)??null},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx,ctx,"AUTOMATION_RULE_CREATED","AUTOMATION_RULE",id,null,{triggerType:String(input!.triggerType),enabled:input!.enabled===true});return response({item:rows[0]},201);
  });
}

async function automationRuleItem(request:Request,env:Env,actorId:string,ruleId:string){
  uuid(ruleId,"Automation rule");const input=await body(request);
  return within(request,env,actorId,"automation.manage","practice.automation",async(tx,ctx)=>{
    const current=await tx`select * from automation_rule where tenant_id=${ctx.tenantId} and id=${ruleId} for update`;if(!current.length)throw new ApiError(404,"NOT_FOUND","Automation rule not found");
    const trigger=input.triggerType??current[0]!.trigger_type,conditions=input.conditions??current[0]!.conditions,actions=input.actions??current[0]!.actions,definition=orchestrate(()=>validateAutomationDefinition(trigger,conditions,actions));
    const priority=Number(input.priority??current[0]!.priority);if(!Number.isInteger(priority)||priority<0||priority>1000)throw new ApiError(400,"INVALID_REQUEST","priority must be 0-1000");
    const rows=await tx`update automation_rule set name=${input.name===undefined?current[0]!.name:required(input,"name",180)},enabled=${input.enabled===undefined?current[0]!.enabled:input.enabled===true},trigger_type=${String(trigger)},conditions=${tx.json(definition.conditions as unknown as postgres.JSONValue)},actions=${tx.json(definition.actions as unknown as postgres.JSONValue)},priority=${priority},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${ruleId} returning *`;
    await recordMutation(tx,ctx,"AUTOMATION_RULE_UPDATED","AUTOMATION_RULE",ruleId,null,{enabled:Boolean(rows[0]!.enabled),triggerType:String(rows[0]!.trigger_type)});return response({item:rows[0]});
  });
}

async function executeAutomationAction(tx:PlatformTX,ctx:PlatformContext,work:postgres.Row,action:AutomationAction){
  const type=String(action.type);
  if(type==="assign_user"){const memberId=uuid(String(action.memberId??""),"Member");await tx`update work_item set assigned_member_id=${memberId},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${work.id}`;}
  else if(type==="assign_team"){const teamId=uuid(String(action.teamId??""),"Team");await tx`update work_item set assigned_team_id=${teamId},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${work.id}`;}
  else if(type==="update_status"){const status=String(action.status??"");if(!WORK_STATUSES.has(status)||status==="completed")throw new ApiError(400,"INVALID_AUTOMATION_ACTION","Automation cannot set this work status");await tx`update work_item set status=${status},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${work.id}`;}
  else if(type==="create_task"){const sequence=Number(action.sequence);if(!Number.isInteger(sequence)||sequence<1)throw new ApiError(400,"INVALID_AUTOMATION_ACTION","create_task requires a positive sequence");await tx`insert into practice_task(id,tenant_id,work_item_id,title,status,sequence,mandatory,created_by,updated_by) values(${crypto.randomUUID()},${ctx.tenantId},${work.id},${String(action.title??"Automation task").slice(0,240)},'not_started',${sequence},${action.mandatory!==false},${ctx.actorId},${ctx.actorId})`;}
  else if(type==="create_review_point"){const reviewId=uuid(String(action.reviewId??""),"Review");await tx`insert into practice_review_point(id,tenant_id,review_id,work_item_id,description,created_by,updated_by) values(${crypto.randomUUID()},${ctx.tenantId},${reviewId},${work.id},${String(action.description??"Automation review point").slice(0,4000)},${ctx.actorId},${ctx.actorId})`;}
  else if(type==="request_review"){const taskId=action.taskId?uuid(String(action.taskId),"Task"):null,stageId=action.stageId?uuid(String(action.stageId),"Stage"):null;if(!taskId&&!stageId)throw new ApiError(400,"INVALID_AUTOMATION_ACTION","request_review requires taskId or stageId");await tx`insert into practice_review(id,tenant_id,work_item_id,practice_task_id,work_stage_id,reviewer_member_id,requested_by) values(${crypto.randomUUID()},${ctx.tenantId},${work.id},${taskId},${stageId},${action.reviewerMemberId?uuid(String(action.reviewerMemberId),"Reviewer"):null},${ctx.actorId})`;}
  else if(type==="emit_notification_request"){await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key) values(${crypto.randomUUID()},${ctx.tenantId},'WORK_ITEM',${work.id},'notification.requested',${tx.json({message:String(action.message??"").slice(0,1000)})},${ctx.correlationId},${`${ctx.correlationId}:notification.requested:${work.id}`}) on conflict(idempotency_key) do nothing`;}
  else if(type==="mark_blocked"){await tx`update work_item set status='waiting_internal',updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${work.id}`;}
  else if(type==="unblock"){await tx`update work_item set status='in_progress',updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${work.id} and status in ('waiting_internal','waiting_on_client')`;}
}

async function executeAutomation(request:Request,env:Env,actorId:string,ruleId:string){
  uuid(ruleId,"Automation rule");const input=await body(request),aggregateId=uuid(required(input,"aggregateId",36),"Work item");
  return within(request,env,actorId,"automation.execute","practice.automation",async(tx,ctx)=>{
    const rules=await tx`select * from automation_rule where tenant_id=${ctx.tenantId} and id=${ruleId} and enabled and (effective_from is null or effective_from<=now()) and (effective_to is null or effective_to>=now()) for update`;if(!rules.length)throw new ApiError(409,"AUTOMATION_NOT_ACTIVE","Automation rule is not active");
    const rule=rules[0]!,chain=orchestrate(()=>assertAutomationChain(ruleId,input.causationChain??[])),eventId=optional(input,"eventId",36)??ctx.correlationId,idempotencyKey=`${ctx.tenantId}:${ruleId}:${eventId}:${aggregateId}`;
    const prior=await tx`select * from automation_execution where tenant_id=${ctx.tenantId} and idempotency_key=${idempotencyKey}`;if(prior.length)return response({item:prior[0],duplicate:true});
    const workRows=await tx`select w.*,cs.service_id,o.lifecycle_status client_lifecycle_status from work_item w join client_service cs on cs.tenant_id=w.tenant_id and cs.id=w.client_service_id join organisation o on o.tenant_id=w.tenant_id and o.id=w.client_id where w.tenant_id=${ctx.tenantId} and w.id=${aggregateId} for update of w`;if(!workRows.length)throw new ApiError(404,"NOT_FOUND","Work item not found");const work=workRows[0]!;
    const conditions=rule.conditions as unknown as AutomationCondition[],entitlementCondition=conditions.find(condition=>condition.field==="entitlement"&&typeof condition.value==="string"),stage=await tx`select stage_type from work_stage where tenant_id=${ctx.tenantId} and work_item_id=${aggregateId} and status in ('active','blocked','waiting','review') order by sequence limit 1`;
    let entitlement:string|null=null;if(entitlementCondition){const allowed=await tx`select tenant_feature_is_enabled(${ctx.tenantId},${String(entitlementCondition.value)}) enabled`;if(allowed[0]!.enabled)entitlement=String(entitlementCondition.value);}
    const executionId=crypto.randomUUID(),facts={serviceId:String(work.service_id),workStatus:String(work.status),stageType:stage[0]?.stage_type?String(stage[0].stage_type):null,teamId:work.assigned_team_id?String(work.assigned_team_id):null,assignedMemberId:work.assigned_member_id?String(work.assigned_member_id):null,specialistModuleKey:work.specialist_module_key?String(work.specialist_module_key):null,entitlement,dueWithinDays:work.due_date?Math.ceil((Date.parse(`${work.due_date}T00:00:00Z`)-Date.now())/86400000):null,clientLifecycleStatus:String(work.client_lifecycle_status)};
    const matches=automationConditionsMatch(rule.conditions as unknown as AutomationCondition[],facts),actions=rule.actions as unknown as AutomationAction[];
    await tx`insert into automation_execution(id,tenant_id,automation_rule_id,trigger_type,aggregate_type,aggregate_id,triggering_event_id,idempotency_key,causation_chain,status,actions_attempted) values(${executionId},${ctx.tenantId},${ruleId},${rule.trigger_type},'WORK_ITEM',${aggregateId},${UUID.test(String(eventId))?eventId:null},${idempotencyKey},${tx.json(chain)},${matches?'started':'skipped_condition'},${matches?actions.length:0})`;
    if(!matches){await tx`update automation_execution set completed_at=now() where tenant_id=${ctx.tenantId} and id=${executionId}`;return response({item:{id:executionId,status:"skipped_condition"}});}
    let completed=0;try{await tx.savepoint(async(actionTx)=>{for(const action of actions){await executeAutomationAction(actionTx,ctx,work,action);completed++;}});await tx`update automation_execution set status='succeeded',actions_completed=${completed},completed_at=now() where tenant_id=${ctx.tenantId} and id=${executionId}`;await tx`update automation_rule set last_executed_at=now() where tenant_id=${ctx.tenantId} and id=${ruleId}`;await recordMutation(tx,ctx,"AUTOMATION_EXECUTED","AUTOMATION_EXECUTION",executionId,String(work.client_id),{ruleId,aggregateId,actionsCompleted:completed,causationChain:chain},"automation.executed");return response({item:{id:executionId,status:"succeeded",actionsCompleted:completed}});}catch(error){completed=0;const code=error instanceof ApiError?error.code:"AUTOMATION_ACTION_FAILED";await tx`update automation_execution set status='failed',actions_completed=${completed},error_code=${code},error_summary=${String(error instanceof Error?error.message:error).slice(0,1000)},completed_at=now() where tenant_id=${ctx.tenantId} and id=${executionId}`;await tx`update automation_rule set last_failure_at=now(),last_failure_code=${code} where tenant_id=${ctx.tenantId} and id=${ruleId}`;await recordMutation(tx,ctx,"AUTOMATION_FAILED","AUTOMATION_EXECUTION",executionId,String(work.client_id),{ruleId,aggregateId,errorCode:code,actionsCompleted:completed},"automation.failed");return response({error:{code,message:"Automation execution failed"},executionId},422);}
  });
}

async function recurrenceHistory(request:Request,env:Env,actorId:string){return within(request,env,actorId,"recurrence.operations","practice.workflow",async(tx,ctx)=>response({items:await tx`select e.*,coalesce((select json_agg(i order by i.created_at) from recurrence_execution_item i where i.tenant_id=e.tenant_id and i.recurrence_execution_id=e.id),'[]') items from recurrence_execution e where e.tenant_id=${ctx.tenantId} order by e.started_at desc limit 100`}));}

async function recurrenceOperation(request:Request,env:Env,actorId:string,mode:"dry_run"|"replay"){
  const input=await body(request),range=orchestrate(()=>boundedReplayRange(input.from,input.to)),permission=mode==="replay"?"recurrence.replay":"recurrence.operations";
  return within(request,env,actorId,permission,"practice.workflow",async(tx,ctx)=>{
    const executionId=crypto.randomUUID();await tx`insert into recurrence_execution(id,tenant_id,trigger_type,status,range_from,range_to,actor_id,correlation_id) values(${executionId},${ctx.tenantId},${mode},'running',${range.from},${range.to},${ctx.actorId},${ctx.correlationId})`;
    if(mode==="replay")await recordMutation(tx,ctx,"RECURRENCE_REPLAY_STARTED","RECURRENCE_EXECUTION",executionId,null,{rangeFrom:range.from,rangeTo:range.to},"recurrence.replay_started");
    const schedules=await tx`select r.*,s.required_entitlement_feature_key from recurring_work_schedule r join client_service cs on cs.tenant_id=r.tenant_id and cs.id=r.client_service_id join practice_service s on s.tenant_id=cs.tenant_id and s.id=cs.service_id where r.tenant_id=${ctx.tenantId} and r.status in ('active','blocked_entitlement') order by r.id`;
    let generated=0,blocked=0,skipped=0,failures=0;const prospective:Array<Record<string,unknown>>=[];
    for(const schedule of schedules){
      let occurrences:ReturnType<typeof evaluateRecurrence>;
      try{occurrences=evaluateRecurrence(schedule.recurrence_rule as unknown as RecurrenceRule,String(schedule.effective_from),range.to,schedule.effective_to?String(schedule.effective_to):null,120).filter(item=>item.occurrenceDate>=range.from&&item.occurrenceDate<=range.to);}catch(error){failures++;const summary=String(error instanceof Error?error.message:error).slice(0,1000);await tx`insert into recurrence_execution_item(id,tenant_id,recurrence_execution_id,recurring_schedule_id,outcome,diagnostic_code,diagnostic_summary) values(${crypto.randomUUID()},${ctx.tenantId},${executionId},${schedule.id},'failed','INVALID_RECURRENCE_RULE',${summary})`;prospective.push({scheduleId:String(schedule.id),outcome:"failed",diagnosticSummary:summary});continue;}
      for(const occurrence of occurrences){
        const duplicate=await tx`select work_item_id from recurrence_generation where tenant_id=${ctx.tenantId} and recurring_schedule_id=${schedule.id} and occurrence_date=${occurrence.occurrenceDate}`;
        let outcome="prospective",workId:null|string=null,dueDate:null|string=null;
        if(schedule.deadline_rule_id){const rules=await tx`select rule_type,configuration from deadline_rule where tenant_id=${ctx.tenantId} and id=${schedule.deadline_rule_id}`;if(rules.length)dueDate=calculateDeadline({type:String(rules[0]!.rule_type),...(rules[0]!.configuration as object)} as DeadlineRule,{periodEnd:occurrence.periodEnd}).date;}
        if(duplicate.length){outcome="skipped_idempotent";skipped++;}
        else if(schedule.specialist_module_key==="ledgerly"){const entitlements=await tx`select tenant_feature_is_enabled(${ctx.tenantId},'ledgerly.enabled') module_enabled,tenant_feature_is_enabled(${ctx.tenantId},${String(schedule.required_entitlement_feature_key??"ledgerly.accounts")}) feature_enabled`;if(!entitlements[0]!.module_enabled||!entitlements[0]!.feature_enabled){outcome="blocked_entitlement";blocked++;}}
        if(mode==="replay"&&outcome==="prospective"){try{workId=await tx.savepoint(async(replayTx)=>instantiateOccurrence(replayTx,ctx,schedule,occurrence));if(workId){outcome="generated";generated++;}else{outcome="skipped_idempotent";skipped++;}}catch(error){outcome="failed";failures++;}}
        await tx`insert into recurrence_execution_item(id,tenant_id,recurrence_execution_id,recurring_schedule_id,occurrence_date,prospective_due_date,work_item_id,outcome) values(${crypto.randomUUID()},${ctx.tenantId},${executionId},${schedule.id},${occurrence.occurrenceDate},${dueDate},${workId},${outcome})`;
        prospective.push({scheduleId:String(schedule.id),occurrenceDate:occurrence.occurrenceDate,prospectiveDueDate:dueDate,outcome,workItemId:workId});
      }
    }
    const status=failures?generated?"partially_failed":"failed":"succeeded";await tx`update recurrence_execution set status=${status},schedules_evaluated=${schedules.length},work_generated=${generated},blocked_entitlement=${blocked},skipped_idempotent=${skipped},failures=${failures},completed_at=now() where tenant_id=${ctx.tenantId} and id=${executionId}`;
    const event=mode==="dry_run"?"recurrence.dry_run_completed":"recurrence.replay_completed";await recordMutation(tx,ctx,mode==="dry_run"?"RECURRENCE_DRY_RUN_COMPLETED":"RECURRENCE_REPLAY_COMPLETED","RECURRENCE_EXECUTION",executionId,null,{rangeFrom:range.from,rangeTo:range.to,schedulesEvaluated:schedules.length,generated,blocked,skipped,failures},event);
    return response({item:{id:executionId,status,mode,range,schedulesEvaluated:schedules.length,generated,blockedEntitlement:blocked,skippedIdempotent:skipped,failures,items:prospective}},mode==="replay"?201:200);
  });
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
    const correlationId=crypto.randomUUID(), executionId=crypto.randomUUID();
    const headers = { "x-tenant-id": tenantId, "x-correlation-id": correlationId };
    await within(new Request("https://scheduled.invalid/v1/practice/recurrence-operations",{headers}),env,actorId,"recurrence.operations","practice.workflow",async(tx,ctx)=>{await tx`insert into recurrence_execution(id,tenant_id,trigger_type,status,actor_id,correlation_id) values(${executionId},${ctx.tenantId},'scheduled','running',${ctx.actorId},${ctx.correlationId})`;});
    const listed = await recurringSchedules(new Request("https://scheduled.invalid/v1/practice/recurring-schedules", { headers }), env, actorId);
    if (!listed.ok){await within(new Request("https://scheduled.invalid/v1/practice/recurrence-operations",{headers}),env,actorId,"recurrence.operations","practice.workflow",async(tx,ctx)=>{await tx`update recurrence_execution set status='failed',failures=1,completed_at=now(),diagnostic_summary='Could not list tenant schedules' where tenant_id=${ctx.tenantId} and id=${executionId}`;await recordMutation(tx,ctx,"RECURRENCE_EXECUTION_FAILED","RECURRENCE_EXECUTION",executionId,null,{failureCount:1,errorCode:"SCHEDULE_LIST_FAILED"},"recurrence.execution_failed");});throw new Error(`Could not list schedules for tenant ${tenantId}`);}
    const payload = await listed.json() as { items?: Array<{ id: string; status: string }> };
    let generatedCount=0,blockedCount=0,failureCount=0;
    for (const schedule of payload.items ?? []) if (schedule.status === "active") {
      const generated = await generateSchedule(new Request(`https://scheduled.invalid/v1/practice/recurring-schedules/${schedule.id}/generate`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" }), env, actorId, schedule.id);
      if(generated.ok){const result=await generated.clone().json() as {generated?:number};generatedCount+=Number(result.generated??0);}else if(generated.status===409)blockedCount++;else failureCount++;
      schedules++;
    }
    await within(new Request("https://scheduled.invalid/v1/practice/recurrence-operations",{headers}),env,actorId,"recurrence.operations","practice.workflow",async(tx,ctx)=>{const status=failureCount?generatedCount?"partially_failed":"failed":"succeeded";await tx`update recurrence_execution set status=${status},schedules_evaluated=${(payload.items??[]).length},work_generated=${generatedCount},blocked_entitlement=${blockedCount},failures=${failureCount},completed_at=now(),diagnostic_summary=${failureCount?`${failureCount} schedule generation failures`:null} where tenant_id=${ctx.tenantId} and id=${executionId}`;if(failureCount)await recordMutation(tx,ctx,"RECURRENCE_EXECUTION_FAILED","RECURRENCE_EXECUTION",executionId,null,{failureCount,generatedCount},"recurrence.execution_failed");});
    if(failureCount)throw new Error(`Scheduled recurrence execution ${executionId} failed for ${failureCount} schedules`);
  }
  return { tenants: contexts.length, schedules };
}
