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
import {
  calculateCostSnapshot,
  calculateEconomicPosition,
} from "./resource-economics-core.js";
import { buildCapacityItems, loadCapacityRows } from "./resource-economics-capacity.js";
import { buildEconomicsOverviewItem, loadEconomicsOverviewRow, loadResourceListRows } from "./resource-economics-read.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESOURCE_STATUSES = new Set(["active", "inactive", "unavailable", "future_starter"]);
const ASSIGNMENT_STATES = new Set(["proposed", "confirmed", "completed", "cancelled"]);
const ADJUSTMENT_TYPES = new Set(["annual_leave", "training", "internal_commitment", "unavailable", "additional_capacity", "other"]);
const TIME_STATUSES = new Set(["draft", "submitted", "approved", "rejected"]);

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

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function databaseDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "application/json is required");
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new ApiError(400, "INVALID_JSON", "A valid JSON object is required"); }
}

function text(input: Record<string, unknown>, key: string, max = 500, optional = false): string | null {
  const raw = input[key];
  if ((raw === null || raw === undefined || raw === "") && optional) return null;
  if (typeof raw !== "string" || !raw.trim() || raw.trim().length > max || /[\u0000-\u001f\u007f]/.test(raw))
    throw new ApiError(400, "INVALID_REQUEST", `${key} is ${optional ? "invalid" : "required"}`);
  return raw.trim();
}

function id(input: Record<string, unknown>, key: string, optional = false): string | null {
  const value = text(input, key, 36, optional);
  if (value === null) return null;
  if (!UUID.test(value)) throw new ApiError(400, "INVALID_REQUEST", `${key} must be a valid identifier`);
  return value;
}

function date(input: Record<string, unknown>, key: string, optional = false): string | null {
  const value = text(input, key, 10, optional);
  if (value === null) return null;
  if (!validDate(value)) throw new ApiError(400, "INVALID_REQUEST", `${key} must be a valid ISO date`);
  return value;
}

function integer(input: Record<string, unknown>, key: string, min: number, max: number, optional = false): number | null {
  const value = input[key];
  if ((value === null || value === undefined) && optional) return null;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a whole number from ${min} to ${max}`);
  return Number(value);
}

function numberValue(input: Record<string, unknown>, key: string, min = 0, optional = false): number | null {
  const value = input[key];
  if ((value === null || value === undefined) && optional) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min)
    throw new ApiError(400, "INVALID_REQUEST", `${key} must be a number of at least ${min}`);
  return value;
}

function enumValue(input: Record<string, unknown>, key: string, allowed: ReadonlySet<string>, fallback?: string): string {
  const value = key in input ? text(input, key, 60)! .toLowerCase() : fallback;
  if (!value || !allowed.has(value)) throw new ApiError(400, "INVALID_REQUEST", `${key} is invalid`);
  return value;
}

async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function recordMutation(tx: PlatformTX, ctx: PlatformContext, eventType: string, objectType: string, objectId: string, clientId: string | null, metadata: Record<string, postgres.JSONValue | undefined>) {
  await tx`select id from tenant where id=${ctx.tenantId} for update`;
  const prior = await tx`select event_hash from audit_event where tenant_id=${ctx.tenantId} order by occurred_at_utc desc,event_id desc limit 1`;
  const eventId = crypto.randomUUID(), occurredAt = new Date().toISOString(), previousHash = prior.length ? String(prior[0]!.event_hash) : null;
  const eventHash = await hash(JSON.stringify({ eventId, occurredAt, tenantId: ctx.tenantId, actorId: ctx.actorId, eventType, objectType, objectId, previousHash, metadata }));
  await tx`insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,organisation_id,actor_type,actor_id,event_type,object_type,object_id,previous_hash,correlation_id,metadata,event_hash) values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${clientId},'USER',${ctx.actorId},${eventType},${objectType},${objectId},${previousHash},${ctx.correlationId},${tx.json(metadata)},${eventHash})`;
  await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key) values(${crypto.randomUUID()},${ctx.tenantId},${objectType},${objectId},${eventType.toLowerCase().replaceAll("_", ".")},${tx.json(metadata)},${ctx.correlationId},${`${ctx.correlationId}:${eventType}:${objectId}`})`;
}

async function within<T>(request: Request, env: Env, actorId: string, permission: string, entitlement: string, operation: (tx: PlatformTX, ctx: PlatformContext) => Promise<T>): Promise<T> {
  const ctx = platformContext(request, actorId), sql = platformDatabase(env);
  try {
    return await platformTransaction(sql, ctx, async (tx) => {
      await assertPlatformRouteAccess(tx, permission, "practice.enabled", entitlement);
      return operation(tx, ctx);
    });
  } finally { await sql.end(); }
}

async function resources(request: Request, env: Env, actorId: string) {
  const input = request.method === "POST" ? await body(request) : null;
  return within(request, env, actorId, request.method === "GET" ? "resources.view" : "resources.manage", "practice.resources", async (tx, ctx) => {
    if (request.method === "GET") return response({ items: await loadResourceListRows(tx,ctx.tenantId) });
    const memberId = id(input!, "tenantMemberId")!, status = enumValue(input!, "status", RESOURCE_STATUSES, "active");
    const member = await tx`select id from tenant_member where tenant_id=${ctx.tenantId} and id=${memberId}`;
    if (!member.length) throw new ApiError(404, "NOT_FOUND", "Tenant member not found");
    const skills = input!.skills ?? [];
    if (!Array.isArray(skills) || skills.some((item) => typeof item !== "string" || item.length > 100)) throw new ApiError(400, "INVALID_REQUEST", "skills must be an array of labels");
    const rows = await tx`insert into resource_profile(tenant_id,tenant_member_id,job_title,resource_status,manager_member_id,location_code,skills,standard_capacity_minutes_week,utilisation_target,chargeability_target,effective_from,effective_to,created_by,updated_by)
      values(${ctx.tenantId},${memberId},${text(input!, "jobTitle", 160, true)},${status},${id(input!, "managerMemberId", true)},${text(input!, "locationCode", 100, true)},${tx.json(skills)},${integer(input!, "standardCapacityMinutesWeek", 0, 10080, true) ?? 2250},${numberValue(input!, "utilisationTarget", 0, true)},${numberValue(input!, "chargeabilityTarget", 0, true)},${date(input!, "effectiveFrom", true) ?? new Date().toISOString().slice(0,10)},${date(input!, "effectiveTo", true)},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx, ctx, "RESOURCE_PROFILE_CREATED", "RESOURCE_PROFILE", memberId, null, { memberId, status });
    return response({ item: rows[0] }, 201);
  });
}

async function patchResource(request: Request, env: Env, actorId: string, memberId: string) {
  if (!UUID.test(memberId)) throw new ApiError(404, "NOT_FOUND", "Resource not found");
  const input = await body(request);
  return within(request, env, actorId, "resources.manage", "practice.resources", async (tx, ctx) => {
    const changes: Record<string, unknown> = { updated_by: ctx.actorId, updated_at: new Date().toISOString() };
    if ("jobTitle" in input) changes.job_title = text(input, "jobTitle", 160, true);
    if ("status" in input) changes.resource_status = enumValue(input, "status", RESOURCE_STATUSES);
    if ("managerMemberId" in input) changes.manager_member_id = id(input, "managerMemberId", true);
    if ("locationCode" in input) changes.location_code = text(input, "locationCode", 100, true);
    if ("standardCapacityMinutesWeek" in input) changes.standard_capacity_minutes_week = integer(input, "standardCapacityMinutesWeek", 0, 10080);
    if ("utilisationTarget" in input) changes.utilisation_target = numberValue(input, "utilisationTarget", 0, true);
    if ("chargeabilityTarget" in input) changes.chargeability_target = numberValue(input, "chargeabilityTarget", 0, true);
    if ("effectiveTo" in input) changes.effective_to = date(input, "effectiveTo", true);
    if ("skills" in input) { if (!Array.isArray(input.skills)) throw new ApiError(400,"INVALID_REQUEST","skills must be an array"); changes.skills = input.skills; }
    if (Object.keys(changes).length === 2) throw new ApiError(400, "INVALID_REQUEST", "No supported resource changes were supplied");
    const columns = Object.keys(changes), rows = await tx`update resource_profile set ${tx(changes,...columns)} where tenant_id=${ctx.tenantId} and tenant_member_id=${memberId} returning *`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Resource not found");
    await recordMutation(tx,ctx,"RESOURCE_PROFILE_UPDATED","RESOURCE_PROFILE",memberId,null,{ changedFields: columns });
    return response({ item: rows[0] });
  });
}

async function workingPattern(request: Request, env: Env, actorId: string, memberId: string) {
  if (!UUID.test(memberId)) throw new ApiError(404,"NOT_FOUND","Resource not found");
  const input = await body(request);
  return within(request,env,actorId,"capacity.manage","practice.capacity",async(tx,ctx)=>{
    const starts = date(input,"effectiveFrom")!, ends = date(input,"effectiveTo",true);
    if (ends && ends < starts) throw new ApiError(400,"INVALID_REQUEST","effectiveTo must not precede effectiveFrom");
    const values = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map(day=>integer(input,`${day}Minutes`,0,1440,true) ?? (day === "saturday" || day === "sunday" ? 0 : 450));
    const patternId=crypto.randomUUID(), rows=await tx`insert into resource_working_pattern(id,tenant_id,tenant_member_id,name,effective_from,effective_to,monday_minutes,tuesday_minutes,wednesday_minutes,thursday_minutes,friday_minutes,saturday_minutes,sunday_minutes,created_by,updated_by) values(${patternId},${ctx.tenantId},${memberId},${text(input,"name",120)},${starts},${ends},${values[0]!},${values[1]!},${values[2]!},${values[3]!},${values[4]!},${values[5]!},${values[6]!},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx,ctx,"RESOURCE_PATTERN_CHANGED","RESOURCE_WORKING_PATTERN",patternId,null,{memberId,effectiveFrom:starts,effectiveTo:ends});
    return response({item:rows[0]},201);
  });
}

async function availabilityAdjustment(request: Request,env: Env,actorId:string,memberId:string){
  if(!UUID.test(memberId))throw new ApiError(404,"NOT_FOUND","Resource not found");
  const input=await body(request);
  return within(request,env,actorId,"capacity.manage","practice.capacity",async(tx,ctx)=>{
    const starts=date(input,"startsOn")!,ends=date(input,"endsOn")!;if(ends<starts)throw new ApiError(400,"INVALID_REQUEST","endsOn must not precede startsOn");
    const adjustmentId=crypto.randomUUID(), adjustmentType=enumValue(input,"adjustmentType",ADJUSTMENT_TYPES), delta=integer(input,"capacityDeltaMinutes",-1440,1440)!;
    if(delta===0)throw new ApiError(400,"INVALID_REQUEST","capacityDeltaMinutes cannot be zero");
    const rows=await tx`insert into resource_availability_adjustment(id,tenant_id,tenant_member_id,adjustment_type,starts_on,ends_on,capacity_delta_minutes,description,created_by,updated_by) values(${adjustmentId},${ctx.tenantId},${memberId},${adjustmentType},${starts},${ends},${delta},${text(input,"description",500,true)},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx,ctx,"RESOURCE_AVAILABILITY_CHANGED","RESOURCE_AVAILABILITY_ADJUSTMENT",adjustmentId,null,{memberId,adjustmentType,startsOn:starts,endsOn:ends,capacityDeltaMinutes:delta});
    return response({item:rows[0]},201);
  });
}

async function capacity(request:Request,env:Env,actorId:string){
  const url=new URL(request.url),from=url.searchParams.get("from"),to=url.searchParams.get("to"),grain=url.searchParams.get("grain")??"week",filter=url.searchParams.get("resourceId");
  if(!from||!to||!validDate(from)||!validDate(to)||to<from)throw new ApiError(400,"INVALID_REQUEST","A valid from/to period is required");
  if(!["day","week","month"].includes(grain))throw new ApiError(400,"INVALID_REQUEST","grain must be day, week or month");
  if(filter&&!UUID.test(filter))throw new ApiError(400,"INVALID_REQUEST","resourceId is invalid");
  return within(request,env,actorId,"capacity.view","practice.capacity",async(tx,ctx)=>{
    const data=await loadCapacityRows(tx,ctx.tenantId,from,to,filter);
    const items=buildCapacityItems(data,from,to,grain as "day"|"week"|"month");
    return response({items,from,to,grain});
  });
}

async function workAllocations(request:Request,env:Env,actorId:string){
  const url=new URL(request.url),from=url.searchParams.get("from"),to=url.searchParams.get("to");
  if(!from||!to||!validDate(from)||!validDate(to))throw new ApiError(400,"INVALID_REQUEST","A valid from/to period is required");
  return within(request,env,actorId,"capacity.view","practice.capacity",async(tx,ctx)=>response({items:await tx`
    select w.id,w.title work_title,w.client_id,w.client_service_id,o.display_name client_name,ps.name service_name,
      tm.display_name resource_name,t.name team_name,w.assigned_member_id resource_id,w.assigned_team_id team_id,
      w.planned_start_date planned_start,w.planned_end_date planned_end,
      round(coalesce(w.planned_effort_minutes,w.estimated_effort_minutes,0)/60.0,2)::float8 planned_hours,
      case when w.remaining_effort_minutes is null then null else round(w.remaining_effort_minutes/60.0,2)::float8 end remaining_hours,
      w.due_date,w.status,w.assignment_state,w.priority
    from work_item w join organisation o on o.tenant_id=w.tenant_id and o.id=w.client_id
    join client_service cs on cs.tenant_id=w.tenant_id and cs.id=w.client_service_id
    join practice_service ps on ps.tenant_id=cs.tenant_id and ps.id=cs.service_id
    left join tenant_member tm on tm.tenant_id=w.tenant_id and tm.id=w.assigned_member_id
    left join team t on t.tenant_id=w.tenant_id and t.id=w.assigned_team_id
    where w.tenant_id=${ctx.tenantId} and w.status not in ('completed','cancelled') and coalesce(w.planned_start_date,w.due_date)<=${to} and coalesce(w.planned_end_date,w.due_date,w.planned_start_date)>=${from}
    order by coalesce(w.due_date,w.planned_end_date),w.priority desc,w.id`}));
}

async function reassignWork(request:Request,env:Env,actorId:string,workItemId:string){
  if(!UUID.test(workItemId))throw new ApiError(404,"NOT_FOUND","Work item not found");const input=await body(request);
  return within(request,env,actorId,"assignments.manage","practice.capacity",async(tx,ctx)=>{
    const current=await tx`select * from work_item where tenant_id=${ctx.tenantId} and id=${workItemId} for update`;if(!current.length)throw new ApiError(404,"NOT_FOUND","Work item not found");
    if (!("assignedMemberId" in input) && "resourceId" in input) input.assignedMemberId=input.resourceId;
    const memberId=id(input,"assignedMemberId",true),teamId=id(input,"assignedTeamId",true),reviewId=id(input,"reviewMemberId",true),state=enumValue(input,"assignmentState",ASSIGNMENT_STATES,"confirmed");
    if(memberId){const resource=await tx`select resource_status from resource_profile where tenant_id=${ctx.tenantId} and tenant_member_id=${memberId}`;if(!resource.length)throw new ApiError(400,"INVALID_RESOURCE","Assigned resource does not exist in this tenant");if(resource[0]!.resource_status!=="active")throw new ApiError(409,"RESOURCE_INACTIVE","Inactive or unavailable resources cannot receive new allocations");}
    if(teamId){const team=await tx`select id from team where tenant_id=${ctx.tenantId} and id=${teamId} and status='ACTIVE'`;if(!team.length)throw new ApiError(400,"INVALID_TEAM","Assigned team does not exist in this tenant");if(memberId){const membership=await tx`select 1 from team_member where tenant_id=${ctx.tenantId} and team_id=${teamId} and tenant_member_id=${memberId}`;if(!membership.length)throw new ApiError(400,"RESOURCE_OUTSIDE_TEAM","Assigned resource is not a member of the selected team");}}
    const plannedStart=date(input,"plannedStartDate",true)??(current[0]!.planned_start_date?String(current[0]!.planned_start_date):null),plannedEnd=date(input,"plannedEndDate",true)??(current[0]!.planned_end_date?String(current[0]!.planned_end_date):null);if(plannedStart&&plannedEnd&&plannedEnd<plannedStart)throw new ApiError(400,"INVALID_REQUEST","Planned end must not precede planned start");
    const effort=integer(input,"plannedEffortMinutes",0,10000000,true)??(current[0]!.planned_effort_minutes===null?null:Number(current[0]!.planned_effort_minutes));
    const rows=await tx`update work_item set assigned_member_id=${memberId},assigned_team_id=${teamId},review_member_id=${reviewId},planned_effort_minutes=${effort},planned_start_date=${plannedStart},planned_end_date=${plannedEnd},assignment_state=${state},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${workItemId} returning *`;
    const historyId=crypto.randomUUID();await tx`insert into work_assignment_history(id,tenant_id,work_item_id,previous_member_id,assigned_member_id,previous_team_id,assigned_team_id,review_member_id,planned_effort_minutes,planned_start_date,planned_end_date,assignment_state,change_reason,changed_by) values(${historyId},${ctx.tenantId},${workItemId},${current[0]!.assigned_member_id},${memberId},${current[0]!.assigned_team_id},${teamId},${reviewId},${effort},${plannedStart},${plannedEnd},${state},${text(input,"changeReason",1000,true)},${ctx.actorId})`;
    await recordMutation(tx,ctx,"WORK_REASSIGNED","WORK_ITEM",workItemId,String(current[0]!.client_id),{previousMemberId:current[0]!.assigned_member_id as postgres.JSONValue,assignedMemberId:memberId,previousTeamId:current[0]!.assigned_team_id as postgres.JSONValue,assignedTeamId:teamId,historyId});return response({item:rows[0],historyId});
  });
}

async function timeEntries(request:Request,env:Env,actorId:string){
  const input=request.method==="POST"?await body(request):null;
  return within(request,env,actorId,request.method==="GET"?"time.view":"time.enter","practice.time",async(tx,ctx)=>{
    if(request.method==="GET"){const url=new URL(request.url),from=url.searchParams.get("from"),to=url.searchParams.get("to");if(!from||!to||!validDate(from)||!validDate(to))throw new ApiError(400,"INVALID_REQUEST","A valid from/to period is required");return response({items:await tx`
      select te.id,tm.display_name resource_name,te.entry_date date,o.display_name client_name,ps.name service_name,w.title work_title,
        round(te.duration_minutes/60.0,2)::float8 duration_hours,(te.classification='billable') billable,te.status,te.narrative description,
        te.tenant_member_id resource_id,te.client_id,te.client_service_id,te.work_item_id,te.cost_amount_snapshot,te.currency
      from time_entry te join tenant_member tm on tm.tenant_id=te.tenant_id and tm.id=te.tenant_member_id
      join organisation o on o.tenant_id=te.tenant_id and o.id=te.client_id join client_service cs on cs.tenant_id=te.tenant_id and cs.id=te.client_service_id
      join practice_service ps on ps.tenant_id=cs.tenant_id and ps.id=cs.service_id join work_item w on w.tenant_id=te.tenant_id and w.id=te.work_item_id
      where te.tenant_id=${ctx.tenantId} and te.entry_date between ${from} and ${to} order by te.entry_date desc,te.created_at desc,te.id`});}
    if (!("tenantMemberId" in input!) && "resourceId" in input!) input!.tenantMemberId=input!.resourceId;
    if (!("entryDate" in input!) && "date" in input!) input!.entryDate=input!.date;
    if (!("narrative" in input!) && "description" in input!) input!.narrative=input!.description;
    if (!("classification" in input!) && typeof input!.billable==="boolean") input!.classification=input!.billable?"billable":"non_billable";
    if (!("durationMinutes" in input!) && typeof input!.durationHours==="number") input!.durationMinutes=Math.round(input!.durationHours*60);
    const memberId=id(input!,"tenantMemberId")!,entryDate=date(input!,"entryDate")!,workItemId=id(input!,"workItemId")!,engagementId=id(input!,"engagementId",true),taskId=id(input!,"practiceTaskId",true),duration=integer(input!,"durationMinutes",1,1440)!,classification=enumValue(input!,"classification",new Set(["billable","non_billable"])),status=enumValue(input!,"status",TIME_STATUSES,"draft");
    if(status==="approved")throw new ApiError(400,"INVALID_STATUS","Time must be approved through the approval route");
    const workContext=await tx`select w.client_id,w.client_service_id,w.engagement_id from work_item w where w.tenant_id=${ctx.tenantId} and w.id=${workItemId} and (${engagementId}::uuid is null or w.engagement_id=${engagementId}) and (${taskId}::uuid is null or exists(select 1 from practice_task pt where pt.tenant_id=w.tenant_id and pt.work_item_id=w.id and pt.id=${taskId}))`;if(!workContext.length)throw new ApiError(400,"INVALID_TIME_CONTEXT","Work and task must belong to an accessible tenant context");
    const clientId=id(input!,"clientId",true)??String(workContext[0]!.client_id),clientServiceId=id(input!,"clientServiceId",true)??String(workContext[0]!.client_service_id);
    if(clientId!==String(workContext[0]!.client_id)||clientServiceId!==String(workContext[0]!.client_service_id))throw new ApiError(400,"INVALID_TIME_CONTEXT","Client, service and work must belong to the same tenant context");
    const actorMember=await tx`select id from tenant_member where tenant_id=${ctx.tenantId} and id=${memberId} and actor_id=${ctx.actorId} and membership_status='ACTIVE'`;if(!actorMember.length)await assertPlatformPermission(tx,"time.manage");
    const rates=await tx`select id,internal_cost_rate,currency,rate_basis from resource_cost_rate where tenant_id=${ctx.tenantId} and tenant_member_id=${memberId} and effective_from<=${entryDate} and (effective_to is null or effective_to>=${entryDate}) order by effective_from desc limit 1`;
    const snapshot=rates.length?calculateCostSnapshot(duration,Number(rates[0]!.internal_cost_rate),String(rates[0]!.rate_basis) as "hourly"|"daily",String(rates[0]!.currency)):null,timeId=crypto.randomUUID();
    const rows=await tx`insert into time_entry(id,tenant_id,tenant_member_id,entry_date,client_id,engagement_id,client_service_id,work_item_id,practice_task_id,duration_minutes,narrative,classification,status,cost_rate_id,cost_rate_snapshot,cost_rate_basis,cost_amount_snapshot,currency,billable_value_snapshot,value_provenance,created_by,updated_by) values(${timeId},${ctx.tenantId},${memberId},${entryDate},${clientId},${engagementId},${clientServiceId},${workItemId},${taskId},${duration},${text(input!,"narrative",2000,true)},${classification},${status},${rates[0]?.id??null},${snapshot?.rate??null},${snapshot?.basis??null},${snapshot?.amount??null},${snapshot?.currency??null},${numberValue(input!,"billableValue",0,true)},${text(input!,"valueProvenance",200,true)},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx,ctx,"TIME_ENTRY_CREATED","TIME_ENTRY",timeId,clientId,{memberId,workItemId,durationMinutes:duration,costRateId:(rates[0]?.id??null) as postgres.JSONValue,costAmountSnapshot:snapshot?.amount??null});return response({item:rows[0]},201);
  });
}

async function patchTimeEntry(request:Request,env:Env,actorId:string,timeId:string){
  if(!UUID.test(timeId))throw new ApiError(404,"NOT_FOUND","Time entry not found");const input=await body(request);
  return within(request,env,actorId,"time.manage","practice.time",async(tx,ctx)=>{const current=await tx`select * from time_entry where tenant_id=${ctx.tenantId} and id=${timeId} for update`;if(!current.length)throw new ApiError(404,"NOT_FOUND","Time entry not found");if(current[0]!.status==="approved")throw new ApiError(409,"APPROVED_TIME_IMMUTABLE","Approved time entries cannot be edited");const changes:Record<string,unknown>={updated_by:ctx.actorId,updated_at:new Date().toISOString()};if("durationMinutes" in input){const duration=integer(input,"durationMinutes",1,1440)!;changes.duration_minutes=duration;if(current[0]!.cost_rate_snapshot!==null){changes.cost_amount_snapshot=calculateCostSnapshot(duration,Number(current[0]!.cost_rate_snapshot),String(current[0]!.cost_rate_basis) as "hourly"|"daily",String(current[0]!.currency)).amount;}}if("narrative" in input)changes.narrative=text(input,"narrative",2000,true);if("classification" in input)changes.classification=enumValue(input,"classification",new Set(["billable","non_billable"]));if("status" in input){const status=enumValue(input,"status",TIME_STATUSES);if(status==="approved")throw new ApiError(400,"INVALID_STATUS","Use the approval route");changes.status=status;}const columns=Object.keys(changes),rows=await tx`update time_entry set ${tx(changes,...columns)} where tenant_id=${ctx.tenantId} and id=${timeId} returning *`;await recordMutation(tx,ctx,"TIME_ENTRY_UPDATED","TIME_ENTRY",timeId,String(current[0]!.client_id),{changedFields:columns});return response({item:rows[0]});});
}

async function approveTime(request:Request,env:Env,actorId:string,timeId:string){
  if(!UUID.test(timeId))throw new ApiError(404,"NOT_FOUND","Time entry not found");const input=await body(request);
  return within(request,env,actorId,"time.approve","practice.time",async(tx,ctx)=>{const status=enumValue(input,"status",new Set(["approved","rejected"]));const rows=await tx`update time_entry set status=${status},approved_by=${status==="approved"?ctx.actorId:null},approved_at=${status==="approved"?new Date().toISOString():null},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${timeId} and status='submitted' returning *`;if(!rows.length)throw new ApiError(409,"INVALID_TIME_TRANSITION","Only submitted time can be approved or rejected");await recordMutation(tx,ctx,"TIME_ENTRY_STATUS_CHANGED","TIME_ENTRY",timeId,String(rows[0]!.client_id),{status});return response({item:rows[0]});});
}

async function costRates(request:Request,env:Env,actorId:string){
  const input=request.method==="POST"?await body(request):null;
  return within(request,env,actorId,request.method==="GET"?"costrates.view":"costrates.manage","practice.economics",async(tx,ctx)=>{if(request.method==="GET")return response({items:await tx`select * from resource_cost_rate where tenant_id=${ctx.tenantId} order by tenant_member_id,effective_from desc`});const rateId=crypto.randomUUID(),memberId=id(input!,"tenantMemberId")!,basis=enumValue(input!,"rateBasis",new Set(["hourly","daily"])),currency=text(input!,"currency",3)!.toUpperCase(),starts=date(input!,"effectiveFrom")!,ends=date(input!,"effectiveTo",true);if(!/^[A-Z]{3}$/.test(currency)||ends&&ends<starts)throw new ApiError(400,"INVALID_REQUEST","Currency or effective period is invalid");const rows=await tx`insert into resource_cost_rate(id,tenant_id,tenant_member_id,effective_from,effective_to,internal_cost_rate,currency,rate_basis,provenance,created_by,updated_by) values(${rateId},${ctx.tenantId},${memberId},${starts},${ends},${numberValue(input!,"internalCostRate")},${currency},${basis},${text(input!,"provenance",200)},${ctx.actorId},${ctx.actorId}) returning *`;await recordMutation(tx,ctx,"COST_RATE_CREATED","RESOURCE_COST_RATE",rateId,null,{memberId,effectiveFrom:starts,currency,rateBasis:basis});return response({item:rows[0]},201);});
}

async function closeCostRate(request:Request,env:Env,actorId:string,rateId:string){
  if(!UUID.test(rateId))throw new ApiError(404,"NOT_FOUND","Cost rate not found");const input=await body(request);
  return within(request,env,actorId,"costrates.manage","practice.economics",async(tx,ctx)=>{const effectiveTo=date(input,"effectiveTo")!;const rows=await tx`update resource_cost_rate set effective_to=${effectiveTo},updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${rateId} and effective_from<=${effectiveTo} returning *`;if(!rows.length)throw new ApiError(404,"NOT_FOUND","Cost rate not found or effective date is invalid");await recordMutation(tx,ctx,"COST_RATE_CLOSED","RESOURCE_COST_RATE",rateId,null,{effectiveTo});return response({item:rows[0]});});
}

async function commercialContexts(request:Request,env:Env,actorId:string){
  const input=request.method==="POST"?await body(request):null;
  return within(request,env,actorId,request.method==="GET"?"economics.view":"economics.manage","practice.economics",async(tx,ctx)=>{
    if(request.method==="GET")return response({items:await tx`select * from work_commercial_context where tenant_id=${ctx.tenantId} order by effective_from desc,id`});
    const contextId=crypto.randomUUID(),clientId=id(input!,"clientId")!,clientServiceId=id(input!,"clientServiceId")!,workItemId=id(input!,"workItemId",true),engagementId=id(input!,"engagementId",true),proposalId=id(input!,"proposalReferenceId",true),sourceType=enumValue(input!,"sourceType",new Set(["quotebench_accepted_proposal","manual_authorised","external_billing"])),currency=text(input!,"currency",3)!.toUpperCase(),starts=date(input!,"effectiveFrom")!,ends=date(input!,"effectiveTo",true);
    if(sourceType==="quotebench_accepted_proposal"&&!proposalId)throw new ApiError(400,"PROPOSAL_PROVENANCE_REQUIRED","Accepted QuoteBench context requires proposalReferenceId");if(!/^[A-Z]{3}$/.test(currency)||ends&&ends<starts)throw new ApiError(400,"INVALID_REQUEST","Currency or effective period is invalid");
    const rows=await tx`insert into work_commercial_context(id,tenant_id,client_id,client_service_id,engagement_id,work_item_id,proposal_reference_id,agreed_value,currency,billing_model,billing_frequency,value_status,source_type,source_version,effective_from,effective_to,created_by,updated_by) values(${contextId},${ctx.tenantId},${clientId},${clientServiceId},${engagementId},${workItemId},${proposalId},${numberValue(input!,"agreedValue")},${currency},${enumValue(input!,"billingModel",new Set(["fixed_fee","time_and_materials","subscription","retainer","other"]))},${text(input!,"billingFrequency",80,true)},${enumValue(input!,"valueStatus",new Set(["known","estimated"]),"known")},${sourceType},${text(input!,"sourceVersion",100,true)},${starts},${ends},${ctx.actorId},${ctx.actorId}) returning *`;
    await recordMutation(tx,ctx,"COMMERCIAL_CONTEXT_CREATED","WORK_COMMERCIAL_CONTEXT",contextId,clientId,{clientServiceId,workItemId,proposalReferenceId:proposalId,sourceType,sourceVersion:text(input!,"sourceVersion",100,true)});return response({item:rows[0]},201);
  });
}

async function recoveries(request:Request,env:Env,actorId:string){
  const input=request.method==="POST"?await body(request):null;
  return within(request,env,actorId,request.method==="GET"?"economics.view":"economics.manage","practice.economics",async(tx,ctx)=>{
    if(request.method==="GET")return response({items:await tx`select * from billing_recovery where tenant_id=${ctx.tenantId} order by recovery_date desc,id`});
    const recoveryId=crypto.randomUUID(),clientId=id(input!,"clientId")!,clientServiceId=id(input!,"clientServiceId")!,currency=text(input!,"currency",3)!.toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new ApiError(400,"INVALID_REQUEST","currency must be an uppercase ISO-style code");
    const rows=await tx`insert into billing_recovery(id,tenant_id,client_id,client_service_id,engagement_id,work_item_id,recovery_date,amount,currency,recovery_type,source_reference,provenance,created_by) values(${recoveryId},${ctx.tenantId},${clientId},${clientServiceId},${id(input!,"engagementId",true)},${id(input!,"workItemId",true)},${date(input!,"recoveryDate")},${numberValue(input!,"amount")},${currency},${enumValue(input!,"recoveryType",new Set(["billed","recovered","credit","write_off"]))},${text(input!,"sourceReference",300)},${text(input!,"provenance",200)},${ctx.actorId}) returning *`;
    await recordMutation(tx,ctx,"BILLING_RECOVERY_RECORDED","BILLING_RECOVERY",recoveryId,clientId,{clientServiceId,recoveryType:String(rows[0]!.recovery_type),amount:Number(rows[0]!.amount),currency});return response({item:rows[0]},201);
  });
}

async function economicsRows(request:Request,env:Env,actorId:string,portfolio:boolean){
  return within(request,env,actorId,portfolio?"portfolio.view":"economics.view",portfolio?"practice.reporting":"practice.economics",async(tx,ctx)=>{
    if(portfolio)await assertPlatformPermission(tx,"economics.view");
    if(!portfolio){
      const rows=await loadEconomicsOverviewRow(tx,ctx.tenantId),overview=rows[0];
      return response({item:buildEconomicsOverviewItem(overview)});
    }
    const rows=await tx`
      with work_stats as(select tenant_id,client_service_id,count(*)::int work_count,
          count(*) filter(where due_date<current_date and status not in ('completed','cancelled'))::int overdue_work,
          coalesce(sum(coalesce(remaining_effort_minutes,planned_effort_minutes,estimated_effort_minutes,0)) filter(where status not in ('completed','cancelled')),0)::bigint workload_minutes
        from work_item where tenant_id=${ctx.tenantId} group by tenant_id,client_service_id),
      time_stats as(select tenant_id,client_service_id,coalesce(sum(duration_minutes),0)::bigint actual_minutes,
          case when count(*) filter(where cost_amount_snapshot is null)>0 then null else coalesce(sum(cost_amount_snapshot),0) end internal_cost,
          case when count(*) filter(where classification='billable' and billable_value_snapshot is null)>0 then null else sum(billable_value_snapshot) end billable_value,
          max(currency) currency from time_entry where tenant_id=${ctx.tenantId} and status<>'rejected' group by tenant_id,client_service_id),
      commercial_stats as(select tenant_id,client_service_id,sum(agreed_value) accepted_revenue,max(currency) currency,
          bool_or(value_status='estimated') has_estimate from work_commercial_context where tenant_id=${ctx.tenantId} and effective_from<=current_date and (effective_to is null or effective_to>=current_date) group by tenant_id,client_service_id),
      recovery_stats as(select tenant_id,client_service_id,sum(amount) filter(where recovery_type='billed') billed_amount,
          sum(amount) filter(where recovery_type='recovered') recovered_amount,max(currency) currency from billing_recovery where tenant_id=${ctx.tenantId} group by tenant_id,client_service_id)
      select o.id client_id,o.display_name client_name,cs.id client_service_id,ps.id service_id,ps.name service_name,
        owner.display_name owner_name,t.name team_name,coalesce(ws.work_count,0) work_count,coalesce(ws.overdue_work,0) overdue_work,
        coalesce(ws.workload_minutes,0) workload_minutes,coalesce(ts.actual_minutes,0) actual_minutes,ts.internal_cost,ts.billable_value,
        cms.accepted_revenue,rs.billed_amount,rs.recovered_amount,coalesce(ts.currency,cms.currency,rs.currency,'GBP') currency,cms.has_estimate
      from organisation o join client_service cs on cs.tenant_id=o.tenant_id and cs.client_id=o.id
      join practice_service ps on ps.tenant_id=cs.tenant_id and ps.id=cs.service_id
      left join tenant_member owner on owner.tenant_id=cs.tenant_id and owner.id=cs.responsible_member_id
      left join team t on t.tenant_id=cs.tenant_id and t.id=cs.responsible_team_id
      left join work_stats ws on ws.tenant_id=cs.tenant_id and ws.client_service_id=cs.id
      left join time_stats ts on ts.tenant_id=cs.tenant_id and ts.client_service_id=cs.id
      left join commercial_stats cms on cms.tenant_id=cs.tenant_id and cms.client_service_id=cs.id
      left join recovery_stats rs on rs.tenant_id=cs.tenant_id and rs.client_service_id=cs.id
      where o.tenant_id=${ctx.tenantId} order by o.display_name,ps.name`;
    const positions=rows.map(row=>({row,position:calculateEconomicPosition({actualMinutes:Number(row.actual_minutes),internalCost:row.internal_cost===null?null:Number(row.internal_cost),billableValue:row.billable_value===null?null:Number(row.billable_value),acceptedRevenue:row.accepted_revenue===null?null:Number(row.accepted_revenue),billedAmount:row.billed_amount===null?null:Number(row.billed_amount),recoveredAmount:row.recovered_amount===null?null:Number(row.recovered_amount)})}));
    return response({items:positions.map(({row,position})=>({id:String(row.client_service_id),client_id:String(row.client_id),client_name:String(row.client_name),owner_name:row.owner_name?String(row.owner_name):null,team_name:row.team_name?String(row.team_name):null,service_name:String(row.service_name),workload_hours:Number((Number(row.workload_minutes)/60).toFixed(2)),overdue_work:Number(row.overdue_work),capacity_pressure:Number(row.overdue_work)>0?"attention":"normal",wip_amount:position.wipBalance,revenue_amount:position.acceptedRevenue,cost_amount:position.internalCost,contribution_amount:position.contribution,margin_percentage:position.marginPercent,currency:String(row.currency),commercial_value_state:position.status.revenue==="unavailable"?"unavailable":row.has_estimate?"estimated":"known"}))});
  });
}

export async function handleResourceEconomicsRoute(request:Request,env:Env,actorId:string):Promise<Response|null>{
  const path=new URL(request.url).pathname;
  if(path==="/v1/practice/resources"&&(request.method==="GET"||request.method==="POST"))return resources(request,env,actorId);
  let match=path.match(/^\/v1\/practice\/resources\/([^/]+)$/);if(match&&request.method==="PATCH")return patchResource(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/practice\/resources\/([^/]+)\/working-patterns$/);if(match&&request.method==="POST")return workingPattern(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/practice\/resources\/([^/]+)\/availability-adjustments$/);if(match&&request.method==="POST")return availabilityAdjustment(request,env,actorId,match[1]!);
  if(path==="/v1/practice/capacity"&&request.method==="GET")return capacity(request,env,actorId);
  if(path==="/v1/practice/work-allocations"&&request.method==="GET")return workAllocations(request,env,actorId);
  match=path.match(/^\/v1\/practice\/work\/([^/]+)\/resource-assignment$/);if(match&&request.method==="POST")return reassignWork(request,env,actorId,match[1]!);
  if(path==="/v1/practice/time-entries"&&(request.method==="GET"||request.method==="POST"))return timeEntries(request,env,actorId);
  match=path.match(/^\/v1\/practice\/time-entries\/([^/]+)$/);if(match&&request.method==="PATCH")return patchTimeEntry(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/practice\/time-entries\/([^/]+)\/decision$/);if(match&&request.method==="POST")return approveTime(request,env,actorId,match[1]!);
  if(path==="/v1/practice/cost-rates"&&(request.method==="GET"||request.method==="POST"))return costRates(request,env,actorId);
  match=path.match(/^\/v1\/practice\/cost-rates\/([^/]+)$/);if(match&&request.method==="PATCH")return closeCostRate(request,env,actorId,match[1]!);
  if(path==="/v1/practice/commercial-contexts"&&(request.method==="GET"||request.method==="POST"))return commercialContexts(request,env,actorId);
  if(path==="/v1/practice/recoveries"&&(request.method==="GET"||request.method==="POST"))return recoveries(request,env,actorId);
  if(path==="/v1/practice/portfolio-economics"&&request.method==="GET")return economicsRows(request,env,actorId,true);
  if(path==="/v1/practice/economics/overview"&&request.method==="GET")return economicsRows(request,env,actorId,false);
  return null;
}
