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
const REQUEST_TYPES = new Set(["information", "document", "confirmation", "approval", "questionnaire"]);
const RESPONSE_TYPES = new Set(["text", "document", "confirmation", "structured"]);
const ALLOWED_MEDIA = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const MAX_JSON = 65_536;
const MAX_DOCUMENT = 10 * 1024 * 1024;

const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "private, no-store" } });

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
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_JSON) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON body is too large");
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new ApiError(400, "INVALID_JSON", "A valid JSON object is required"); }
}

function identifier(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new ApiError(400, "INVALID_REQUEST", `${name} must be a valid identifier`);
  return value;
}

function text(input: Record<string, unknown>, field: string, maximum = 240): string {
  const value = input[field];
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw new ApiError(400, "INVALID_REQUEST", `${field} is required and must be at most ${maximum} characters`);
  return value.trim();
}

function optionalText(input: Record<string, unknown>, field: string, maximum = 2000): string | null {
  if (!(field in input) || input[field] === null || input[field] === "") return null;
  return text(input, field, maximum);
}

function optionalId(input: Record<string, unknown>, field: string): string | null {
  return input[field] === undefined || input[field] === null || input[field] === "" ? null : identifier(input[field], field);
}

function uniqueIds(input: Record<string, unknown>, field: string): string[] {
  const values = input[field];
  if (!Array.isArray(values) || values.length < 1 || values.length > 50) throw new ApiError(400, "INVALID_REQUEST", `${field} must contain 1 to 50 identifiers`);
  return [...new Set(values.map((value) => identifier(value, field)))];
}

async function hash(value: ArrayBuffer | string): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function invitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

async function record(
  tx: PlatformTX, ctx: PlatformContext, auditType: string, eventType: string,
  objectType: string, objectId: string, clientId: string,
  metadata: Record<string, postgres.JSONValue | undefined>, actorType: "USER" | "CLIENT" = "USER",
) {
  await tx`select id from tenant where id=${ctx.tenantId} for update`;
  const prior = await tx`select event_hash from audit_event where tenant_id=${ctx.tenantId} order by occurred_at_utc desc,event_id desc limit 1`;
  const eventId = crypto.randomUUID(), occurredAt = new Date().toISOString(), previousHash = prior.length ? String(prior[0]!.event_hash) : null;
  const eventHash = await hash(JSON.stringify({ eventId, occurredAt, tenantId: ctx.tenantId, actorId: ctx.actorId, auditType, objectType, objectId, previousHash, metadata }));
  await tx`insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,organisation_id,actor_type,actor_id,event_type,object_type,object_id,previous_hash,correlation_id,metadata,event_hash)
   values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${clientId},${actorType},${ctx.actorId},${auditType},${objectType},${objectId},${previousHash},${ctx.correlationId},${tx.json(metadata)},${eventHash})`;
  await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key)
   values(${crypto.randomUUID()},${ctx.tenantId},${objectType},${objectId},${eventType},${tx.json(metadata)},${ctx.correlationId},${`${ctx.correlationId}:${eventType}:${objectId}`}) on conflict(tenant_id,idempotency_key) do nothing`;
}

async function queueNotification(tx: PlatformTX, ctx: PlatformContext, recipientReference: string, templateCode: string, relatedType: string, relatedId: string, payload: Record<string, postgres.JSONValue>) {
  const outboxId=crypto.randomUUID(),notificationId=crypto.randomUUID(),idempotencyKey=`${ctx.correlationId}:notification:${templateCode}:${recipientReference}:${relatedId}`;
  const envelope={channel:"IN_APP",recipientReference,templateCode,relatedEntityType:relatedType,relatedEntityId:relatedId,payload,notificationId};
  const inserted=await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key,max_attempts)
   values(${outboxId},${ctx.tenantId},${relatedType},${relatedId},'notification.requested',${tx.json(envelope)},${ctx.correlationId},${idempotencyKey},8)
   on conflict(tenant_id,idempotency_key) do nothing returning id`;
  if(!inserted.length)return;
  await tx`insert into notification(id,tenant_id,outbox_event_id,channel,recipient_reference,template_code,payload,idempotency_key,created_by,related_entity_type,related_entity_id)
   values(${notificationId},${ctx.tenantId},${outboxId},'IN_APP',${recipientReference},${templateCode},${tx.json(payload)},${idempotencyKey},${ctx.actorId},${relatedType},${relatedId})`;
}

async function staff<T>(request: Request, env: Env, actorId: string, permission: string, feature: string, operation: (tx: PlatformTX, ctx: PlatformContext) => Promise<T>): Promise<T> {
  const ctx = platformContext(request, actorId), sql = platformDatabase(env);
  try { return await platformTransaction(sql, ctx, async (tx) => {
    await assertPlatformPermission(tx, permission);
    await assertPlatformEntitled(tx, "practice.enabled");
    await assertPlatformEntitled(tx, "practice.portal");
    if (feature !== "practice.portal") await assertPlatformEntitled(tx, feature);
    return operation(tx, ctx);
  }); } finally { await sql.end(); }
}

async function portal<T>(request: Request, env: Env, actorId: string, feature: string, operation: (tx: PlatformTX, ctx: PlatformContext, principalId: string) => Promise<T>): Promise<T> {
  const ctx = platformContext(request, actorId), sql = platformDatabase(env);
  try { return await platformTransaction(sql, ctx, async (tx) => {
    const entitled = await tx`select portal_tenant_feature_enabled(${feature}) enabled`;
    if (entitled[0]?.enabled !== true) throw new ApiError(403, "ENTITLEMENT_REQUIRED", "The portal capability is not enabled");
    const principals = await tx`select id from portal_principal where tenant_id=${ctx.tenantId} and auth_actor_id=${ctx.actorId} and status='active'`;
    if (!principals.length) throw new ApiError(403, "PORTAL_ACCESS_REQUIRED", "Active portal access is required");
    await tx`update portal_principal set last_access_at=now(),updated_at=now() where tenant_id=${ctx.tenantId} and id=${principals[0]!.id}`;
    return operation(tx, ctx, String(principals[0]!.id));
  }); } finally { await sql.end(); }
}

async function requireStaffClient(tx: PlatformTX, ctx: PlatformContext, clientId: string) {
  const rows = await tx`select id from organisation where tenant_id=${ctx.tenantId} and id=${clientId} and lifecycle_status='ACTIVE'`;
  if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Client not found");
}

async function requirePortalClient(tx: PlatformTX, ctx: PlatformContext, principalId: string, clientId: string, roles: string[] = ["viewer", "contributor", "approver"]) {
  const rows = await tx`select id,access_role from portal_client_access where tenant_id=${ctx.tenantId} and portal_principal_id=${principalId} and client_id=${clientId} and status='active' and access_role in ${tx(roles)}`;
  if (!rows.length) throw new ApiError(403, "PORTAL_RESOURCE_FORBIDDEN", "This portal identity is not authorised for the client resource");
  return String(rows[0]!.id);
}

async function portalAccessCollection(request: Request, env: Env, actorId: string, clientId: string): Promise<Response> {
  identifier(clientId,"clientId");
  if(request.method==="GET")return staff(request,env,actorId,"portal.manage","practice.portal",async(tx,ctx)=>{
    await requireStaffClient(tx,ctx,clientId);
    return response({items:await tx`select a.id,a.access_role,a.status,a.engagement_id,a.client_service_id,a.granted_at,a.revoked_at,
      p.id portal_principal_id,p.contact_id,p.auth_actor_id,p.status principal_status,p.activated_at,p.last_access_at,
      c.display_name,c.email_normalized,
      (select i.status from portal_invitation i where i.tenant_id=a.tenant_id and i.portal_client_access_id=a.id order by i.created_at desc limit 1) invitation_status
      from portal_client_access a join portal_principal p on p.tenant_id=a.tenant_id and p.id=a.portal_principal_id
      join contact c on c.tenant_id=p.tenant_id and c.id=p.contact_id where a.tenant_id=${ctx.tenantId} and a.client_id=${clientId}
      order by c.display_name,a.granted_at`});
  });
  const input=await body(request),contactId=identifier(input.contactId,"contactId"),accessRole=text(input,"accessRole",30).toLowerCase();
  if(!["viewer","contributor","approver"].includes(accessRole))throw new ApiError(400,"INVALID_REQUEST","accessRole is invalid");
  return staff(request,env,actorId,"portal.manage","practice.portal",async(tx,ctx)=>{
    await requireStaffClient(tx,ctx,clientId);
    const contacts=await tx`select id from contact where tenant_id=${ctx.tenantId} and id=${contactId} and status='ACTIVE'`;
    if(!contacts.length)throw new ApiError(404,"NOT_FOUND","Active contact not found");
    let principals=await tx`select id,status from portal_principal where tenant_id=${ctx.tenantId} and contact_id=${contactId}`;
    const principalId=principals.length?String(principals[0]!.id):crypto.randomUUID();
    if(!principals.length)await tx`insert into portal_principal(id,tenant_id,contact_id,status,created_by) values(${principalId},${ctx.tenantId},${contactId},'invited',${ctx.actorId})`;
    const accessId=crypto.randomUUID();
    const rows=await tx`insert into portal_client_access(id,tenant_id,portal_principal_id,client_id,engagement_id,client_service_id,access_role,status,granted_by)
      values(${accessId},${ctx.tenantId},${principalId},${clientId},${optionalId(input,"engagementId")},${optionalId(input,"clientServiceId")},${accessRole},${principals[0]?.status==='active'?"active":"invited"},${ctx.actorId}) returning *`;
    await record(tx,ctx,"PORTAL_ACCESS_CREATED","portal.access.created","PORTAL_CLIENT_ACCESS",accessId,clientId,{contactId,accessRole});
    return response({item:{...rows[0],portal_principal_id:principalId}},201);
  });
}

async function invitePortalAccess(request: Request,env:Env,actorId:string,accessId:string):Promise<Response>{
  identifier(accessId,"accessId"); const input=await body(request),expiresInHours=input.expiresInHours===undefined?72:Number(input.expiresInHours);
  if(!Number.isInteger(expiresInHours)||expiresInHours<1||expiresInHours>168)throw new ApiError(400,"INVALID_REQUEST","expiresInHours must be an integer from 1 to 168");
  const token=invitationToken(),tokenHash=await hash(token);
  return staff(request,env,actorId,"portal.invite","practice.portal",async(tx,ctx)=>{
    const rows=await tx`select a.*,p.auth_actor_id,c.email_normalized from portal_client_access a join portal_principal p on p.tenant_id=a.tenant_id and p.id=a.portal_principal_id join contact c on c.tenant_id=p.tenant_id and c.id=p.contact_id where a.tenant_id=${ctx.tenantId} and a.id=${accessId} and a.status in ('invited','suspended') for update of a`;
    if(!rows.length)throw new ApiError(404,"NOT_FOUND","Invitable portal access not found");
    await tx`update portal_invitation set status='revoked',revoked_at=now(),revoked_by=${ctx.actorId} where tenant_id=${ctx.tenantId} and portal_client_access_id=${accessId} and status='pending'`;
    const invitationId=crypto.randomUUID(),inserted=await tx`insert into portal_invitation(id,tenant_id,portal_client_access_id,token_hash,expires_at,created_by) values(${invitationId},${ctx.tenantId},${accessId},${tokenHash},now()+(${expiresInHours}::int*interval '1 hour'),${ctx.actorId}) returning id,status,created_at,expires_at`;
    await record(tx,ctx,"PORTAL_INVITATION_CREATED","portal.invitation.created","PORTAL_INVITATION",invitationId,String(rows[0]!.client_id),{accessId,expiresAt:String(inserted[0]!.expires_at)});
    await queueNotification(tx,ctx,String(rows[0]!.email_normalized),"portal.invitation","PORTAL_INVITATION",invitationId,{clientId:String(rows[0]!.client_id),expiresAt:String(inserted[0]!.expires_at)});
    const inviteUrl=new URL("/client-portal/activate",env.WEB_ORIGIN); inviteUrl.hash=`token=${token}`;
    return response({item:inserted[0],token,inviteUrl:inviteUrl.toString()},201);
  });
}

async function revokePortalAccess(request:Request,env:Env,actorId:string,accessId:string):Promise<Response>{
  identifier(accessId,"accessId"); const input=await body(request),reason=optionalText(input,"reason",1000);
  return staff(request,env,actorId,"portal.revoke","practice.portal",async(tx,ctx)=>{
    const rows=await tx`select * from portal_client_access where tenant_id=${ctx.tenantId} and id=${accessId} and status<>'revoked' for update`;
    if(!rows.length)throw new ApiError(404,"NOT_FOUND","Revocable portal access not found");
    const updated=await tx`update portal_client_access set status='revoked',revoked_at=now(),revoked_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${accessId} returning *`;
    await tx`update portal_invitation set status='revoked',revoked_at=now(),revoked_by=${ctx.actorId} where tenant_id=${ctx.tenantId} and portal_client_access_id=${accessId} and status='pending'`;
    await record(tx,ctx,"PORTAL_ACCESS_REVOKED","portal.access.revoked","PORTAL_CLIENT_ACCESS",accessId,String(rows[0]!.client_id),{reason});
    return response({item:updated[0]});
  });
}

async function acceptPortalInvitation(request:Request,env:Env,actorId:string):Promise<Response>{
  const input=await body(request),token=text(input,"token",512),ctx=platformContext(request,actorId),sql=platformDatabase(env);
  try{return await platformTransaction(sql,ctx,async tx=>{
    const rows=await tx`select * from accept_portal_invitation(${await hash(token)})`;
    if(!rows.length)throw new ApiError(409,"PORTAL_INVITATION_INVALID","The portal invitation is invalid, expired, revoked, or belongs to another identity");
    const item=rows[0]!;
    await record(tx,ctx,"PORTAL_INVITATION_ACCEPTED","portal.invitation.accepted","PORTAL_INVITATION",String(item.invitation_id),String(item.client_id),{portalPrincipalId:String(item.portal_principal_id),firstAcceptance:item.accepted===true},"CLIENT");
    return response({item});
  });}finally{await sql.end();}
}

async function requestCollection(request: Request, env: Env, actorId: string): Promise<Response> {
  if (request.method === "GET") return staff(request, env, actorId, "client_requests.view", "practice.portal.requests", async (tx, ctx) => response({ items: await tx`
    select r.*,coalesce(o.display_name,o.legal_name) client_name,e.name engagement_name,w.title work_title,
     (select count(*)::int from client_request_response x where x.tenant_id=r.tenant_id and x.client_request_id=r.id) response_count,
     (select max(x.submitted_at) from client_request_response x where x.tenant_id=r.tenant_id and x.client_request_id=r.id) last_response_at
    from client_request r join organisation o on o.tenant_id=r.tenant_id and o.id=r.client_id
    left join practice_engagement e on e.tenant_id=r.tenant_id and e.id=r.engagement_id
    left join work_item w on w.tenant_id=r.tenant_id and w.id=r.work_item_id
    where r.tenant_id=${ctx.tenantId} order by r.due_at nulls last,r.created_at desc` }));
  const input = await body(request), clientId = identifier(input.clientId, "clientId"), recipients = uniqueIds(input, "recipientAccessIds");
  const requestType = text(input, "requestType", 40).toLowerCase();
  if (!REQUEST_TYPES.has(requestType)) throw new ApiError(400, "INVALID_REQUEST", "requestType is invalid");
  return staff(request, env, actorId, "client_requests.manage", "practice.portal.requests", async (tx, ctx) => {
    await requireStaffClient(tx, ctx, clientId);
    const access = await tx`select id from portal_client_access where tenant_id=${ctx.tenantId} and client_id=${clientId} and id in ${tx(recipients)} and status in ('invited','active')`;
    if (access.length !== recipients.length) throw new ApiError(400, "INVALID_RECIPIENT", "Every recipient must have explicit access to this client");
    const id = crypto.randomUUID(), status = input.send === true ? "open" : "draft", dueAt = optionalText(input, "dueAt", 40);
    const rows = await tx`insert into client_request(id,tenant_id,client_id,engagement_id,work_item_id,task_id,request_type,title,description,due_at,priority,status,completion_mode,response_requirements,reminder_configuration,created_by,updated_by)
      values(${id},${ctx.tenantId},${clientId},${optionalId(input,"engagementId")},${optionalId(input,"workItemId")},${optionalId(input,"taskId")},${requestType},${text(input,"title")},${optionalText(input,"description")},${dueAt},${optionalText(input,"priority",20) ?? "normal"},${status},${optionalText(input,"completionMode",20) ?? "manual"},${tx.json((input.responseRequirements ?? {}) as postgres.JSONValue)},${tx.json((input.reminderConfiguration ?? {}) as postgres.JSONValue)},${ctx.actorId},${ctx.actorId}) returning *`;
    for (const accessId of recipients) {
      await tx`insert into client_request_recipient(id,tenant_id,client_request_id,portal_client_access_id) values(${crypto.randomUUID()},${ctx.tenantId},${id},${accessId})`;
      const recipient=await tx`select coalesce(p.auth_actor_id,c.email_normalized) recipient from portal_client_access a join portal_principal p on p.tenant_id=a.tenant_id and p.id=a.portal_principal_id join contact c on c.tenant_id=p.tenant_id and c.id=p.contact_id where a.tenant_id=${ctx.tenantId} and a.id=${accessId}`;
      await queueNotification(tx,ctx,String(recipient[0]!.recipient),"client_request.created","CLIENT_REQUEST",id,{clientId,title:String(rows[0]!.title),dueAt:dueAt ?? null});
    }
    if (input.waitingOnClient === true && input.workItemId) await tx`update work_item set status='waiting_on_client',updated_at=now(),updated_by=${ctx.actorId} where tenant_id=${ctx.tenantId} and id=${identifier(input.workItemId,"workItemId")} and status not in ('completed','cancelled')`;
    await record(tx, ctx, "CLIENT_REQUEST_CREATED", "client_request.created", "CLIENT_REQUEST", id, clientId, { requestType, recipientCount: recipients.length, status, workItemId: optionalId(input,"workItemId") });
    return response({ item: rows[0] }, 201);
  });
}

async function requestDetail(request: Request, env: Env, actorId: string, requestId: string): Promise<Response> {
  identifier(requestId, "requestId");
  return staff(request, env, actorId, "client_requests.view", "practice.portal.requests", async (tx, ctx) => {
    const rows = await tx`select * from client_request where tenant_id=${ctx.tenantId} and id=${requestId}`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Client request not found");
    const recipients = await tx`select rr.*,p.contact_id,a.access_role from client_request_recipient rr join portal_client_access a on a.tenant_id=rr.tenant_id and a.id=rr.portal_client_access_id join portal_principal p on p.tenant_id=a.tenant_id and p.id=a.portal_principal_id where rr.tenant_id=${ctx.tenantId} and rr.client_request_id=${requestId}`;
    const responses = await tx`select * from client_request_response where tenant_id=${ctx.tenantId} and client_request_id=${requestId} order by submitted_at,id`;
    const documents = await tx`select d.*,v.id version_id,v.version,v.original_filename,v.media_type,v.byte_size,v.scan_status,v.created_at version_created_at from portal_document d left join lateral(select * from portal_document_version dv where dv.tenant_id=d.tenant_id and dv.portal_document_id=d.id order by dv.version desc limit 1)v on true where d.tenant_id=${ctx.tenantId} and d.client_request_id=${requestId}`;
    return response({ item: { ...rows[0], recipients, responses, documents } });
  });
}

async function completeRequest(request: Request, env: Env, actorId: string, requestId: string): Promise<Response> {
  identifier(requestId, "requestId");
  return staff(request, env, actorId, "client_requests.manage", "practice.portal.requests", async (tx, ctx) => {
    const rows = await tx`select * from client_request where tenant_id=${ctx.tenantId} and id=${requestId} for update`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Client request not found");
    if (["completed","cancelled"].includes(String(rows[0]!.status))) throw new ApiError(409, "REQUEST_TERMINAL", "The request is already terminal");
    const updated = await tx`update client_request set status='completed',completed_at=now(),updated_by=${ctx.actorId},updated_at=now() where tenant_id=${ctx.tenantId} and id=${requestId} returning *`;
    await record(tx, ctx, "CLIENT_REQUEST_COMPLETED", "client_request.completed", "CLIENT_REQUEST", requestId, String(rows[0]!.client_id), {});
    return response({ item: updated[0] });
  });
}

async function portalRequests(request: Request, env: Env, actorId: string): Promise<Response> {
  return portal(request, env, actorId, "practice.portal.requests", async (tx, ctx, principalId) => response({ items: await tx`
    select r.*,coalesce(o.display_name,o.legal_name) client_name,e.name engagement_name
    from client_request r join organisation o on o.tenant_id=r.tenant_id and o.id=r.client_id
    join client_request_recipient rr on rr.tenant_id=r.tenant_id and rr.client_request_id=r.id
    join portal_client_access a on a.tenant_id=rr.tenant_id and a.id=rr.portal_client_access_id
    left join practice_engagement e on e.tenant_id=r.tenant_id and e.id=r.engagement_id
    where r.tenant_id=${ctx.tenantId} and a.portal_principal_id=${principalId} and a.status='active' and r.status not in ('draft','cancelled')
    order by r.due_at nulls last,r.created_at desc` }));
}

async function portalRequestDetail(request: Request, env: Env, actorId: string, requestId: string): Promise<Response> {
  identifier(requestId, "requestId");
  return portal(request, env, actorId, "practice.portal.requests", async (tx, ctx, principalId) => {
    const rows = await tx`select r.* from client_request r join client_request_recipient rr on rr.tenant_id=r.tenant_id and rr.client_request_id=r.id join portal_client_access a on a.tenant_id=rr.tenant_id and a.id=rr.portal_client_access_id where r.tenant_id=${ctx.tenantId} and r.id=${requestId} and a.portal_principal_id=${principalId} and a.status='active'`;
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "Available client request not found");
    const responses = await tx`select * from client_request_response where tenant_id=${ctx.tenantId} and client_request_id=${requestId} order by submitted_at,id`;
    const documents = await tx`select d.*,v.id version_id,v.version,v.original_filename,v.media_type,v.byte_size,v.scan_status,v.created_at version_created_at from portal_document d left join lateral(select * from portal_document_version dv where dv.tenant_id=d.tenant_id and dv.portal_document_id=d.id order by dv.version desc limit 1)v on true where d.tenant_id=${ctx.tenantId} and d.client_request_id=${requestId} and d.visibility in ('shared_with_client','client_uploaded')`;
    return response({ item: { ...rows[0], responses, documents } });
  });
}

async function portalDocumentCollection(request: Request, env: Env, actorId: string): Promise<Response> {
  return portal(request, env, actorId, "practice.portal.documents", async (tx, ctx, principalId) => response({ items: await tx`
    select d.id,d.client_id,d.engagement_id,d.work_item_id,d.task_id,d.client_request_id,d.display_filename,d.visibility,d.current_version,d.created_at,
      v.id version_id,v.version,v.original_filename,v.media_type,v.byte_size,v.scan_status,v.created_at version_created_at
    from portal_document d
    join portal_client_access a on a.tenant_id=d.tenant_id and a.client_id=d.client_id and a.portal_principal_id=${principalId} and a.status='active'
      and (a.engagement_id is null or a.engagement_id=d.engagement_id)
    left join lateral(select * from portal_document_version x where x.tenant_id=d.tenant_id and x.portal_document_id=d.id order by x.version desc limit 1)v on true
    where d.tenant_id=${ctx.tenantId} and d.visibility in ('shared_with_client','client_uploaded') and d.archived_at is null
    order by coalesce(v.created_at,d.created_at) desc,d.id` }));
}

async function portalRequestResponse(request: Request, env: Env, actorId: string, requestId: string): Promise<Response> {
  identifier(requestId, "requestId"); const input = await body(request), responseType = text(input, "responseType", 30).toLowerCase();
  if (!RESPONSE_TYPES.has(responseType) || responseType === "document") throw new ApiError(400, "INVALID_REQUEST", "Use the document upload endpoint for document responses");
  return portal(request, env, actorId, "practice.portal.requests", async (tx, ctx, principalId) => {
    const requests = await tx`select r.* from client_request r join client_request_recipient rr on rr.tenant_id=r.tenant_id and rr.client_request_id=r.id join portal_client_access a on a.tenant_id=rr.tenant_id and a.id=rr.portal_client_access_id where r.tenant_id=${ctx.tenantId} and r.id=${requestId} and a.portal_principal_id=${principalId} and a.status='active' and r.status in ('open','viewed','responded','partially_complete') for update of r`;
    if (!requests.length) throw new ApiError(404, "NOT_FOUND", "Available client request not found");
    const item = requests[0]!, id = crypto.randomUUID(), idempotency = text(input, "idempotencyKey", 160);
    const textResponse = responseType === "text" ? text(input, "text", 20000) : null;
    const structured = responseType === "structured" ? input.value : null;
    const confirmation = responseType === "confirmation" && typeof input.value === "boolean" ? input.value : null;
    if (responseType === "structured" && (!structured || typeof structured !== "object" || Array.isArray(structured))) throw new ApiError(400, "INVALID_REQUEST", "value must be an object");
    if (responseType === "confirmation" && confirmation === null) throw new ApiError(400, "INVALID_REQUEST", "value must be boolean");
    const rows = await tx`insert into client_request_response(id,tenant_id,client_request_id,portal_principal_id,request_version,response_type,text_response,structured_response,confirmation_value,idempotency_key)
      values(${id},${ctx.tenantId},${requestId},${principalId},${item.version},${responseType},${textResponse},${structured ? tx.json(structured as postgres.JSONValue) : null},${confirmation},${idempotency})
      on conflict(tenant_id,client_request_id,idempotency_key) do update set id=client_request_response.id returning *`;
    const automatic = String(item.completion_mode) === "automatic";
    await tx`update client_request set status=${automatic ? "completed" : "responded"},completed_at=case when ${automatic} then now() else completed_at end,updated_at=now() where tenant_id=${ctx.tenantId} and id=${requestId}`;
    await record(tx, ctx, "CLIENT_REQUEST_RESPONDED", "client_request.responded", "CLIENT_REQUEST_RESPONSE", String(rows[0]!.id), String(item.client_id), { requestId, responseType, requestVersion: Number(item.version) }, "CLIENT");
    return response({ item: rows[0], requestStatus: automatic ? "completed" : "responded" }, 201);
  });
}

function safeFilename(value: string): string {
  const cleaned = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim().slice(0, 255);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "document";
}

function sniffMedia(bytes: Uint8Array, declared: string): string {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137,80,78,71,13,10,26,10][index])) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (declared === "text/plain" || declared === "text/csv") return declared;
  if (declared.includes("officedocument")) return declared;
  throw new ApiError(415, "FILE_TYPE_NOT_ALLOWED", "The file content type is not allowed");
}

async function documentUpload(request: Request, env: Env, actorId: string, requestId: string): Promise<Response> {
  identifier(requestId, "requestId");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "multipart/form-data is required");
  const form = await new Response(await boundedBytes(request, MAX_DOCUMENT + 65_536, "Document upload"), { headers: { "content-type": contentType } }).formData();
  const file = form.get("file"), idempotency = form.get("idempotencyKey");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_DOCUMENT) throw new ApiError(400, "FILE_REQUIRED", "A file up to 10 MiB is required");
  if (typeof idempotency !== "string" || !idempotency.trim() || idempotency.length > 160) throw new ApiError(400, "INVALID_REQUEST", "idempotencyKey is required");
  const bytes = await file.arrayBuffer(), mediaType = sniffMedia(new Uint8Array(bytes), file.type.toLowerCase()), contentHash = await hash(bytes), filename = safeFilename(file.name);
  if (!ALLOWED_MEDIA.has(mediaType)) throw new ApiError(415, "FILE_TYPE_NOT_ALLOWED", "The file content type is not allowed");
  let uploadedKey: string | null = null;
  try {
    return await portal(request, env, actorId, "practice.portal.documents", async (tx, ctx, principalId) => {
      const requests = await tx`select r.* from client_request r join client_request_recipient rr on rr.tenant_id=r.tenant_id and rr.client_request_id=r.id join portal_client_access a on a.tenant_id=rr.tenant_id and a.id=rr.portal_client_access_id where r.tenant_id=${ctx.tenantId} and r.id=${requestId} and a.portal_principal_id=${principalId} and a.status='active' and a.access_role in ('contributor','approver') and r.status in ('open','viewed','responded','partially_complete') for update of r`;
      if (!requests.length) throw new ApiError(404, "NOT_FOUND", "Available document request not found");
      const item = requests[0]!, documentId = crypto.randomUUID(), versionId = crypto.randomUUID();
      uploadedKey = `tenants/${ctx.tenantId}/clients/${item.client_id}/portal-documents/${documentId}/v1-${crypto.randomUUID()}`;
      await env.ARTEFACTS.put(uploadedKey, bytes, { httpMetadata: { contentType: mediaType, contentDisposition: `attachment; filename="${filename.replace(/["\\]/g, "_")}"` }, customMetadata: { sha256: contentHash, tenantId: ctx.tenantId, clientId: String(item.client_id), scanStatus: "pending" } });
      await tx`insert into portal_document(id,tenant_id,client_id,engagement_id,work_item_id,task_id,client_request_id,display_filename,visibility,current_version,created_by) values(${documentId},${ctx.tenantId},${item.client_id},${item.engagement_id},${item.work_item_id},${item.task_id},${requestId},${filename},'client_uploaded',1,${ctx.actorId})`;
      await tx`insert into portal_document_version(id,tenant_id,portal_document_id,version,object_key,original_filename,media_type,byte_size,content_hash,uploader_context,uploader_actor_id) values(${versionId},${ctx.tenantId},${documentId},1,${uploadedKey},${filename},${mediaType},${file.size},${contentHash},'portal',${ctx.actorId})`;
      await tx`insert into client_request_response(id,tenant_id,client_request_id,portal_principal_id,request_version,response_type,structured_response,idempotency_key) values(${crypto.randomUUID()},${ctx.tenantId},${requestId},${principalId},${item.version},'document',${tx.json({ documentId, versionId } as postgres.JSONValue)},${idempotency})`;
      await tx`update client_request set status='responded',updated_at=now() where tenant_id=${ctx.tenantId} and id=${requestId}`;
      await record(tx, ctx, "DOCUMENT_UPLOADED", "document.uploaded", "PORTAL_DOCUMENT", documentId, String(item.client_id), { requestId, version: 1, byteSize: file.size, mediaType, scanStatus: "pending" }, "CLIENT");
      uploadedKey = null;
      return response({ item: { id: documentId, versionId, filename, mediaType, byteSize: file.size, scanStatus: "pending" } }, 201);
    });
  } finally {
    if (uploadedKey) try { await env.ARTEFACTS.delete(uploadedKey); } catch (error) { console.error(JSON.stringify({ event: "portal_document_orphan_cleanup_failed", error: error instanceof Error ? error.message : String(error) })); }
  }
}

async function documentContent(request: Request, env: Env, actorId: string, documentId: string): Promise<Response> {
  identifier(documentId, "documentId");
  const item = await portal(request, env, actorId, "practice.portal.documents", async (tx, ctx, principalId) => {
    const rows = await tx`select d.client_id,d.visibility,v.object_key,v.original_filename,v.media_type,v.byte_size,v.content_hash,v.scan_status from portal_document d join lateral(select * from portal_document_version x where x.tenant_id=d.tenant_id and x.portal_document_id=d.id order by x.version desc limit 1)v on true where d.tenant_id=${ctx.tenantId} and d.id=${documentId}`;
    if (!rows.length || !["shared_with_client","client_uploaded"].includes(String(rows[0]!.visibility))) throw new ApiError(404, "NOT_FOUND", "Document not found");
    await requirePortalClient(tx, ctx, principalId, String(rows[0]!.client_id));
    if (String(rows[0]!.scan_status) !== "accepted") throw new ApiError(423, "DOCUMENT_NOT_RELEASED", "The document is pending security review");
    return rows[0]!;
  });
  const key = String(item.object_key), prefix = `tenants/${platformContext(request, actorId).tenantId}/clients/${item.client_id}/portal-documents/`;
  if (!key.startsWith(prefix)) throw new ApiError(503, "DOCUMENT_INTEGRITY_FAILED", "Document storage scope is invalid");
  const object = await env.ARTEFACTS.get(key);
  if (!object || object.size !== Number(item.byte_size) || object.customMetadata?.sha256 !== String(item.content_hash)) throw new ApiError(503, "DOCUMENT_INTEGRITY_FAILED", "Stored document metadata did not verify");
  const filename = safeFilename(String(item.original_filename));
  return new Response(object.body, { headers: { "content-type": String(item.media_type), "content-length": String(object.size), "content-disposition": `attachment; filename="${filename.replace(/["\\]/g,"_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", etag: object.httpEtag } });
}

async function threadCollection(request: Request, env: Env, actorId: string): Promise<Response> {
  if (request.method === "GET") return staff(request, env, actorId, "portal_messages.view", "practice.portal.messaging", async (tx, ctx) => response({ items: await tx`
    select t.*,coalesce(o.display_name,o.legal_name) client_name,(select max(m.sent_at) from portal_message m where m.tenant_id=t.tenant_id and m.portal_thread_id=t.id) last_message_at
    from portal_thread t join organisation o on o.tenant_id=t.tenant_id and o.id=t.client_id where t.tenant_id=${ctx.tenantId} order by last_message_at desc nulls last,t.created_at desc` }));
  const input = await body(request), clientId = identifier(input.clientId,"clientId"), portalPrincipalIds = uniqueIds(input,"portalPrincipalIds");
  return staff(request, env, actorId, "portal_messages.send", "practice.portal.messaging", async (tx, ctx) => {
    await requireStaffClient(tx, ctx, clientId);
    const authorised = await tx`select distinct portal_principal_id from portal_client_access where tenant_id=${ctx.tenantId} and client_id=${clientId} and portal_principal_id in ${tx(portalPrincipalIds)} and status='active'`;
    if (authorised.length !== portalPrincipalIds.length) throw new ApiError(400,"INVALID_PARTICIPANT","Every portal participant must have explicit client access");
    const member = await tx`select id from tenant_member where tenant_id=${ctx.tenantId} and actor_id=${ctx.actorId} and membership_status='ACTIVE'`;
    const threadId = crypto.randomUUID();
    const rows = await tx`insert into portal_thread(id,tenant_id,client_id,engagement_id,work_item_id,client_request_id,subject,created_by_context,created_by) values(${threadId},${ctx.tenantId},${clientId},${optionalId(input,"engagementId")},${optionalId(input,"workItemId")},${optionalId(input,"clientRequestId")},${text(input,"subject")},'practice',${ctx.actorId}) returning *`;
    await tx`insert into portal_thread_participant(id,tenant_id,portal_thread_id,participant_context,tenant_member_id,added_by) values(${crypto.randomUUID()},${ctx.tenantId},${threadId},'practice',${member[0]!.id},${ctx.actorId})`;
    for (const principalId of portalPrincipalIds) await tx`insert into portal_thread_participant(id,tenant_id,portal_thread_id,participant_context,portal_principal_id,added_by) values(${crypto.randomUUID()},${ctx.tenantId},${threadId},'portal',${principalId},${ctx.actorId})`;
    await record(tx,ctx,"PORTAL_THREAD_CREATED","portal.thread.created","PORTAL_THREAD",threadId,clientId,{ participantCount: portalPrincipalIds.length + 1 });
    return response({ item: rows[0] },201);
  });
}

async function staffThreadMessages(request:Request,env:Env,actorId:string,threadId:string):Promise<Response>{
  identifier(threadId,"threadId"); const input=request.method==="POST"?await body(request):null;
  return staff(request,env,actorId,request.method==="GET"?"portal_messages.view":"portal_messages.send","practice.portal.messaging",async(tx,ctx)=>{
    const threads=await tx`select t.* from portal_thread t join portal_thread_participant p on p.tenant_id=t.tenant_id and p.portal_thread_id=t.id join tenant_member m on m.tenant_id=p.tenant_id and m.id=p.tenant_member_id where t.tenant_id=${ctx.tenantId} and t.id=${threadId} and p.removed_at is null and m.actor_id=${ctx.actorId} and m.membership_status='ACTIVE'`;
    if(!threads.length)throw new ApiError(404,"NOT_FOUND","Message thread not found or the actor is not a participant");
    if(request.method==="GET")return response({item:threads[0],messages:await tx`select id,sender_context,sender_actor_id,body,reply_to_message_id,sent_at from portal_message where tenant_id=${ctx.tenantId} and portal_thread_id=${threadId} order by sent_at,id`});
    if(String(threads[0]!.status)!=="open")throw new ApiError(409,"THREAD_CLOSED","The message thread is closed");
    const messageId=crypto.randomUUID(),idempotency=text(input!,"idempotencyKey",160);
    const rows=await tx`insert into portal_message(id,tenant_id,portal_thread_id,sender_context,sender_actor_id,body,reply_to_message_id,idempotency_key) values(${messageId},${ctx.tenantId},${threadId},'practice',${ctx.actorId},${text(input!,"body",20000)},${optionalId(input!,"replyToMessageId")},${idempotency}) on conflict(tenant_id,portal_thread_id,idempotency_key) do update set id=portal_message.id returning *`;
    await tx`update portal_thread set updated_at=now() where tenant_id=${ctx.tenantId} and id=${threadId}`;
    const recipients=await tx`select p.auth_actor_id,c.email_normalized from portal_thread_participant participant join portal_principal p on p.tenant_id=participant.tenant_id and p.id=participant.portal_principal_id join contact c on c.tenant_id=p.tenant_id and c.id=p.contact_id where participant.tenant_id=${ctx.tenantId} and participant.portal_thread_id=${threadId} and participant.removed_at is null`;
    for(const recipient of recipients)await queueNotification(tx,ctx,String(recipient.auth_actor_id ?? recipient.email_normalized),"portal.message","PORTAL_MESSAGE",String(rows[0]!.id),{threadId,clientId:String(threads[0]!.client_id)});
    await record(tx,ctx,"PORTAL_MESSAGE_SENT","message.sent","PORTAL_MESSAGE",String(rows[0]!.id),String(threads[0]!.client_id),{threadId});
    return response({item:rows[0]},201);
  });
}

async function documentCollection(request:Request,env:Env,actorId:string):Promise<Response>{
  return staff(request,env,actorId,"client_requests.view","practice.portal.documents",async(tx,ctx)=>response({items:await tx`
    select d.id,d.client_id,coalesce(o.display_name,o.legal_name) client_name,d.engagement_id,d.work_item_id,d.client_request_id,d.display_filename,d.visibility,d.current_version,d.archived_at,d.updated_at,
      v.media_type,v.byte_size,v.scan_status,v.created_at version_created_at
    from portal_document d join organisation o on o.tenant_id=d.tenant_id and o.id=d.client_id
    left join lateral(select * from portal_document_version x where x.tenant_id=d.tenant_id and x.portal_document_id=d.id order by x.version desc limit 1)v on true
    where d.tenant_id=${ctx.tenantId} order by d.updated_at desc,d.id`}));
}

async function shareDocument(request:Request,env:Env,actorId:string,documentId:string):Promise<Response>{
  identifier(documentId,"documentId");
  return staff(request,env,actorId,"documents.share","practice.portal.documents",async(tx,ctx)=>{
    const rows=await tx`select d.*,v.scan_status from portal_document d join lateral(select scan_status from portal_document_version x where x.tenant_id=d.tenant_id and x.portal_document_id=d.id order by x.version desc limit 1)v on true where d.tenant_id=${ctx.tenantId} and d.id=${documentId} for update of d`;
    if(!rows.length)throw new ApiError(404,"NOT_FOUND","Document not found");
    if(String(rows[0]!.scan_status)!=="accepted")throw new ApiError(409,"DOCUMENT_SCAN_REQUIRED","Only an accepted document version can be shared");
    const updated=await tx`update portal_document set visibility='shared_with_client',updated_at=now() where tenant_id=${ctx.tenantId} and id=${documentId} returning *`;
    const recipients=await tx`select distinct p.auth_actor_id,c.email_normalized from portal_client_access a join portal_principal p on p.tenant_id=a.tenant_id and p.id=a.portal_principal_id join contact c on c.tenant_id=p.tenant_id and c.id=p.contact_id where a.tenant_id=${ctx.tenantId} and a.client_id=${rows[0]!.client_id} and a.status='active' and p.status='active'`;
    for(const recipient of recipients)await queueNotification(tx,ctx,String(recipient.auth_actor_id ?? recipient.email_normalized),"portal.document_shared","PORTAL_DOCUMENT",documentId,{clientId:String(rows[0]!.client_id),filename:String(rows[0]!.display_filename)});
    await record(tx,ctx,"DOCUMENT_SHARED","document.shared","PORTAL_DOCUMENT",documentId,String(rows[0]!.client_id),{visibility:"shared_with_client"});
    return response({item:updated[0]});
  });
}

async function confirmationCollection(request:Request,env:Env,actorId:string):Promise<Response>{
  if(request.method==="GET")return staff(request,env,actorId,"client_requests.view","practice.portal.requests",async(tx,ctx)=>response({items:await tx`select c.*,coalesce(o.display_name,o.legal_name) client_name from client_confirmation c join organisation o on o.tenant_id=c.tenant_id and o.id=c.client_id where c.tenant_id=${ctx.tenantId} order by c.requested_at desc`}));
  const input=await body(request),clientId=identifier(input.clientId,"clientId"),accessId=identifier(input.portalClientAccessId,"portalClientAccessId");
  return staff(request,env,actorId,"confirmations.request","practice.portal.requests",async(tx,ctx)=>{
    const access=await tx`select a.*,p.auth_actor_id,c.email_normalized from portal_client_access a join portal_principal p on p.tenant_id=a.tenant_id and p.id=a.portal_principal_id join contact c on c.tenant_id=p.tenant_id and c.id=p.contact_id where a.tenant_id=${ctx.tenantId} and a.id=${accessId} and a.client_id=${clientId} and a.status='active' and a.access_role='approver'`;
    if(!access.length)throw new ApiError(400,"INVALID_RECIPIENT","The confirmation recipient must have active approver access to the client");
    const confirmationId=crypto.randomUUID(),rows=await tx`insert into client_confirmation(id,tenant_id,client_id,portal_client_access_id,client_request_id,resource_type,resource_id,confirmation_text,confirmation_version,requested_by,expires_at)
      values(${confirmationId},${ctx.tenantId},${clientId},${accessId},${optionalId(input,"clientRequestId")},${text(input,"resourceType",80)},${text(input,"resourceId",240)},${text(input,"confirmationText",10000)},${input.confirmationVersion===undefined?1:Number(input.confirmationVersion)},${ctx.actorId},${optionalText(input,"expiresAt",40)}) returning *`;
    await record(tx,ctx,"CLIENT_CONFIRMATION_REQUESTED","client_confirmation.requested","CLIENT_CONFIRMATION",confirmationId,clientId,{accessId,confirmationVersion:Number(rows[0]!.confirmation_version)});
    await queueNotification(tx,ctx,String(access[0]!.auth_actor_id ?? access[0]!.email_normalized),"client_confirmation.requested","CLIENT_CONFIRMATION",confirmationId,{clientId,resourceType:String(rows[0]!.resource_type)});
    return response({item:rows[0]},201);
  });
}

async function portalThreads(request: Request, env: Env, actorId: string): Promise<Response> {
  return portal(request,env,actorId,"practice.portal.messaging",async(tx,ctx,principalId)=>response({items:await tx`
    select t.*,coalesce(o.display_name,o.legal_name) client_name,(select max(m.sent_at) from portal_message m where m.tenant_id=t.tenant_id and m.portal_thread_id=t.id) last_message_at
    from portal_thread t join organisation o on o.tenant_id=t.tenant_id and o.id=t.client_id join portal_thread_participant p on p.tenant_id=t.tenant_id and p.portal_thread_id=t.id
    where t.tenant_id=${ctx.tenantId} and p.portal_principal_id=${principalId} and p.removed_at is null order by last_message_at desc nulls last,t.created_at desc`}));
}

async function portalMessages(request: Request, env: Env, actorId: string, threadId: string): Promise<Response> {
  identifier(threadId,"threadId"); const input = request.method === "POST" ? await body(request) : null;
  return portal(request,env,actorId,"practice.portal.messaging",async(tx,ctx,principalId)=>{
    const threads=await tx`select t.* from portal_thread t join portal_thread_participant p on p.tenant_id=t.tenant_id and p.portal_thread_id=t.id where t.tenant_id=${ctx.tenantId} and t.id=${threadId} and p.portal_principal_id=${principalId} and p.removed_at is null`;
    if(!threads.length)throw new ApiError(404,"NOT_FOUND","Message thread not found");
    if(request.method==="GET")return response({item:threads[0],messages:await tx`select id,sender_context,sender_actor_id,body,reply_to_message_id,sent_at from portal_message where tenant_id=${ctx.tenantId} and portal_thread_id=${threadId} order by sent_at,id`});
    if(String(threads[0]!.status)!=="open")throw new ApiError(409,"THREAD_CLOSED","The message thread is closed");
    await requirePortalClient(tx,ctx,principalId,String(threads[0]!.client_id),["contributor","approver"]);
    const messageId=crypto.randomUUID(),idempotency=text(input!,"idempotencyKey",160);
    const rows=await tx`insert into portal_message(id,tenant_id,portal_thread_id,sender_context,sender_actor_id,body,reply_to_message_id,idempotency_key) values(${messageId},${ctx.tenantId},${threadId},'portal',${ctx.actorId},${text(input!,"body",20000)},${optionalId(input!,"replyToMessageId")},${idempotency}) on conflict(tenant_id,portal_thread_id,idempotency_key) do update set id=portal_message.id returning *`;
    await tx`update portal_thread set updated_at=now() where tenant_id=${ctx.tenantId} and id=${threadId}`;
    await record(tx,ctx,"PORTAL_MESSAGE_SENT","message.sent","PORTAL_MESSAGE",String(rows[0]!.id),String(threads[0]!.client_id),{threadId},"CLIENT");
    return response({item:rows[0]},201);
  });
}

async function confirmationResponse(request: Request, env: Env, actorId: string, confirmationId: string): Promise<Response> {
  identifier(confirmationId,"confirmationId"); const input=await body(request);
  if(typeof input.response!=="boolean")throw new ApiError(400,"INVALID_REQUEST","response must be boolean");
  const confirmationValue = input.response;
  return portal(request,env,actorId,"practice.portal.requests",async(tx,ctx,principalId)=>{
    const rows=await tx`select * from client_confirmation where tenant_id=${ctx.tenantId} and id=${confirmationId} and responded_at is null for update`;
    if(!rows.length)throw new ApiError(404,"NOT_FOUND","Open confirmation not found");
    await requirePortalClient(tx,ctx,principalId,String(rows[0]!.client_id),["approver"]);
    const idempotency=text(input,"idempotencyKey",160),status=confirmationValue?"confirmed":"declined";
    const updated=await tx`update client_confirmation set status=${status},response=${confirmationValue},response_text=${optionalText(input,"responseText",2000)},responded_by_principal_id=${principalId},responded_at=now(),idempotency_key=${idempotency} where tenant_id=${ctx.tenantId} and id=${confirmationId} returning *`;
    await record(tx,ctx,"CLIENT_CONFIRMATION_COMPLETED","client_confirmation.completed","CLIENT_CONFIRMATION",confirmationId,String(rows[0]!.client_id),{response:confirmationValue,confirmationVersion:Number(rows[0]!.confirmation_version)},"CLIENT");
    return response({item:updated[0]});
  });
}

export async function handleClientCollaborationRoute(request: Request, env: Env, actorId: string): Promise<Response | null> {
  const path=new URL(request.url).pathname;
  let match=path.match(/^\/v1\/clients\/([^/]+)\/portal-access$/);
  if(match&&["GET","POST"].includes(request.method))return portalAccessCollection(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/portal-access\/([^/]+)\/invitations$/);
  if(match&&request.method==="POST")return invitePortalAccess(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/portal-access\/([^/]+)\/revoke$/);
  if(match&&request.method==="POST")return revokePortalAccess(request,env,actorId,match[1]!);
  if(path==="/v1/portal/invitations/accept"&&request.method==="POST")return acceptPortalInvitation(request,env,actorId);
  if(path==="/v1/client-requests"&&["GET","POST"].includes(request.method))return requestCollection(request,env,actorId);
  match=path.match(/^\/v1\/client-requests\/([^/]+)$/);
  if(match&&request.method==="GET")return requestDetail(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/client-requests\/([^/]+)\/complete$/);
  if(match&&request.method==="POST")return completeRequest(request,env,actorId,match[1]!);
  if(path==="/v1/portal/requests"&&request.method==="GET")return portalRequests(request,env,actorId);
  match=path.match(/^\/v1\/portal\/requests\/([^/]+)$/);
  if(match&&request.method==="GET")return portalRequestDetail(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/portal\/requests\/([^/]+)\/responses$/);
  if(match&&request.method==="POST")return portalRequestResponse(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/portal\/requests\/([^/]+)\/documents$/);
  if(match&&request.method==="POST")return documentUpload(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/portal\/documents\/([^/]+)\/content$/);
  if(match&&request.method==="GET")return documentContent(request,env,actorId,match[1]!);
  if(path==="/v1/portal/documents"&&request.method==="GET")return portalDocumentCollection(request,env,actorId);
  if(path==="/v1/portal-threads"&&["GET","POST"].includes(request.method))return threadCollection(request,env,actorId);
  match=path.match(/^\/v1\/portal-threads\/([^/]+)\/messages$/);
  if(match&&["GET","POST"].includes(request.method))return staffThreadMessages(request,env,actorId,match[1]!);
  if(path==="/v1/portal-documents"&&request.method==="GET")return documentCollection(request,env,actorId);
  match=path.match(/^\/v1\/portal-documents\/([^/]+)\/share$/);
  if(match&&request.method==="POST")return shareDocument(request,env,actorId,match[1]!);
  if(path==="/v1/client-confirmations"&&["GET","POST"].includes(request.method))return confirmationCollection(request,env,actorId);
  if(path==="/v1/portal/messages"&&request.method==="GET")return portalThreads(request,env,actorId);
  match=path.match(/^\/v1\/portal\/messages\/([^/]+)$/);
  if(match&&["GET","POST"].includes(request.method))return portalMessages(request,env,actorId,match[1]!);
  match=path.match(/^\/v1\/portal\/confirmations\/([^/]+)\/response$/);
  if(match&&request.method==="POST")return confirmationResponse(request,env,actorId,match[1]!);
  return null;
}
