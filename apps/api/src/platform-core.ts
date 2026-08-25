import postgres, { type Sql, type TransactionSql } from "postgres";
import { ApiError } from "./core.js";
type DB = Sql<Record<string, never>>;
type TX = TransactionSql<Record<string, never>>;
type Meta = Record<string, postgres.JSONValue | undefined>;
interface Ctx {
  tenantId: string;
  actorId: string;
  correlationId: string;
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_TYPES = new Set([
  "COMPANY",
  "PARTNERSHIP",
  "SOLE_TRADER",
  "INDIVIDUAL",
  "CHARITY",
  "TRUST",
  "OTHER",
]);
const RELATIONSHIP_TYPES = new Set([
  "DIRECTOR",
  "TRUSTEE",
  "OWNER",
  "PARTNER",
  "EMPLOYEE",
  "ADVISER",
  "PRIMARY_CONTACT",
  "BILLING_CONTACT",
  "OTHER",
]);
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
const db = (env: Env): DB =>
  postgres(env.HYPERDRIVE.connectionString, { prepare: false, max: 5 });
function context(request: Request, actorId: string): Ctx {
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
async function transaction<T>(
  sql: DB,
  ctx: Ctx,
  operation: (tx: TX) => Promise<T>,
): Promise<T> {
  const result = await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id',${ctx.tenantId},true),set_config('app.actor_id',${ctx.actorId},true)`;
    return { value: await operation(tx) };
  });
  return result.value;
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
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 65536)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON body is too large");
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "INVALID_REQUEST", "A JSON object is required");
  return value as Record<string, unknown>;
}
function required(
  input: Record<string, unknown>,
  key: string,
  max: number,
): string {
  const value = input[key];
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      `${key} is required and must be at most ${max} characters`,
    );
  return value.trim();
}
function optional(
  input: Record<string, unknown>,
  key: string,
  max: number,
): string | null | undefined {
  if (!(key in input)) return undefined;
  if (input[key] === null || input[key] === "") return null;
  if (
    typeof input[key] !== "string" ||
    !String(input[key]).trim() ||
    String(input[key]).trim().length > max
  )
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      `${key} must be at most ${max} characters`,
    );
  return String(input[key]).trim();
}
function id(value: string, label: string) {
  if (!UUID.test(value))
    throw new ApiError(404, "NOT_FOUND", `${label} not found`);
  return value;
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
async function audit(
  tx: TX,
  ctx: Ctx,
  eventType: string,
  objectType: string,
  objectId: string,
  organisationId: string | null,
  metadata: Meta,
) {
  await tx`select id from tenant where id=${ctx.tenantId} for update`;
  const prior =
    await tx`select event_hash from audit_event where tenant_id=${ctx.tenantId} order by occurred_at_utc desc,event_id desc limit 1`;
  const previousHash = prior.length ? String(prior[0]!.event_hash) : null,
    eventId = crypto.randomUUID(),
    occurredAt = new Date().toISOString();
  const eventHash = await hash(
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
  await tx`insert into audit_event(event_id,occurred_at_utc,recorded_at_utc,tenant_id,organisation_id,actor_type,actor_id,event_type,object_type,object_id,previous_hash,correlation_id,metadata,event_hash) values(${eventId},${occurredAt},${occurredAt},${ctx.tenantId},${organisationId},'USER',${ctx.actorId},${eventType},${objectType},${objectId},${previousHash},${ctx.correlationId},${tx.json(metadata)},${eventHash})`;
  await tx`insert into outbox_event(id,tenant_id,aggregate_type,aggregate_id,event_type,payload,correlation_id,idempotency_key) values(${crypto.randomUUID()},${ctx.tenantId},${objectType},${objectId},${eventType},${tx.json(metadata)},${ctx.correlationId},${`${ctx.correlationId}:${eventType}:${objectId}`})`;
}
async function permission(tx: TX, key: string) {
  const rows = await tx`select actor_has_permission(${key}::text) allowed`;
  if (!Boolean(rows[0]?.allowed))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Actor does not have permission for this operation",
    );
}
async function decision(tx: TX, featureKey: string) {
  const rows =
      await tx`select enabled,value,source,decision_id from tenant_feature_decision(${featureKey}::text)`,
    row = rows[0];
  return row
    ? {
        enabled: Boolean(row.enabled),
        value: row.value ?? null,
        source: String(row.source),
        decisionId: String(row.decision_id),
      }
    : { enabled: false, value: null, source: "NONE", decisionId: null };
}
async function entitled(tx: TX, key: string) {
  if (!(await decision(tx, key)).enabled)
    throw new ApiError(
      403,
      "FEATURE_NOT_ENTITLED",
      "This tenant is not entitled to the requested feature",
    );
}

async function getContext(request: Request, env: Env, actorId: string) {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await transaction(sql, ctx, async (tx) => {
      const members =
        await tx`select id,role_code,membership_status from tenant_member where tenant_id=${ctx.tenantId} and actor_id=${ctx.actorId}`;
      if (!members.length || members[0]!.membership_status !== "ACTIVE")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Actor is not an active tenant member",
        );
      const permissions =
        await tx`select distinct rp.permission_key from tenant_member tm join tenant_member_role mr on mr.tenant_id=tm.tenant_id and mr.tenant_member_id=tm.id join tenant_role_permission rp on rp.tenant_id=mr.tenant_id and rp.role_id=mr.role_id where tm.tenant_id=${ctx.tenantId} and tm.actor_id=${ctx.actorId} and tm.membership_status='ACTIVE' order by rp.permission_key`;
      const teams =
        await tx`select t.id,t.name from team t join team_member m on m.tenant_id=t.tenant_id and m.team_id=t.id where t.tenant_id=${ctx.tenantId} and m.tenant_member_id=${members[0]!.id} and t.status='ACTIVE' order by t.name`;
      return response({
        item: {
          tenantId: ctx.tenantId,
          membershipId: members[0]!.id,
          legacyRole: members[0]!.role_code,
          permissions: permissions.map((row) => row.permission_key),
          teams,
          entitlements: {
            "ledgerly.enabled": await decision(tx, "ledgerly.enabled"),
            "practice.clients": await decision(tx, "practice.clients"),
          },
        },
      });
    });
  } finally {
    await sql.end();
  }
}
const clientColumns =
  "id,display_name,legal_name,legal_form,entity_type,client_code,jurisdiction,lifecycle_status,responsible_member_id,responsible_team_id,primary_contact_id,primary_address_id,communication_preferences,version,created_at,updated_at";
async function listClients(request: Request, env: Env, actorId: string) {
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await transaction(sql, ctx, async (tx) => {
      await permission(tx, "clients.view");
      await entitled(tx, "practice.clients");
      const raw = new URL(request.url).searchParams.get("includeArchived");
      if (raw !== null && raw !== "true" && raw !== "false")
        throw new ApiError(
          400,
          "INVALID_REQUEST",
          "includeArchived must be true or false",
        );
      const include = raw === "true";
      if (include) await permission(tx, "clients.archive");
      const items = await tx.unsafe(
        `select ${clientColumns} from organisation where tenant_id=$1 and ($2::boolean or lifecycle_status='ACTIVE') order by lifecycle_status,display_name,id`,
        [ctx.tenantId, include],
      );
      return response({ items });
    });
  } finally {
    await sql.end();
  }
}
async function createClient(request: Request, env: Env, actorId: string) {
  const ctx = context(request, actorId),
    input = await jsonBody(request),
    sql = db(env),
    displayName = required(input, "displayName", 255),
    legalName = optional(input, "legalName", 255) ?? displayName,
    entityType = required(input, "entityType", 30).toUpperCase();
  if (!CLIENT_TYPES.has(entityType))
    throw new ApiError(
      400,
      "INVALID_CLIENT_TYPE",
      "Select a valid client entity type",
    );
  const legalForm = optional(input, "legalForm", 80) ?? entityType,
    jurisdiction = optional(input, "jurisdiction", 80) ?? "UK",
    clientCode = optional(input, "clientCode", 80) ?? null,
    clientId = crypto.randomUUID();
  try {
    const item = await transaction(sql, ctx, async (tx) => {
      await permission(tx, "clients.create");
      await entitled(tx, "practice.clients");
      const rows =
        await tx`insert into organisation(id,tenant_id,display_name,legal_name,legal_form,entity_type,client_code,jurisdiction,created_by,updated_by) values(${clientId},${ctx.tenantId},${displayName},${legalName},${legalForm},${entityType},${clientCode},${jurisdiction},${ctx.actorId},${ctx.actorId}) returning *`;
      await audit(tx, ctx, "CLIENT_CREATED", "CLIENT", clientId, clientId, {
        displayName,
        entityType,
        clientCode,
      });
      return rows[0]!;
    });
    return response({ item }, 201);
  } finally {
    await sql.end();
  }
}
async function patchClient(
  request: Request,
  env: Env,
  actorId: string,
  clientId: string,
) {
  id(clientId, "Client");
  const ctx = context(request, actorId),
    input = await jsonBody(request),
    sql = db(env),
    changes: Record<string, unknown> = {
      updated_by: ctx.actorId,
      updated_at: new Date().toISOString(),
    };
  const map: Record<string, string> = {
    displayName: "display_name",
    legalName: "legal_name",
    legalForm: "legal_form",
    clientCode: "client_code",
    responsibleMemberId: "responsible_member_id",
    responsibleTeamId: "responsible_team_id",
    primaryContactId: "primary_contact_id",
    primaryAddressId: "primary_address_id",
  };
  for (const [key, column] of Object.entries(map)) {
    const value = optional(input, key, 255);
    if (value !== undefined) changes[column] = value;
  }
  if ("entityType" in input) {
    const value = required(input, "entityType", 30).toUpperCase();
    if (!CLIENT_TYPES.has(value))
      throw new ApiError(
        400,
        "INVALID_CLIENT_TYPE",
        "Select a valid client entity type",
      );
    changes.entity_type = value;
  }
  if ("communicationPreferences" in input) {
    if (
      !input.communicationPreferences ||
      typeof input.communicationPreferences !== "object" ||
      Array.isArray(input.communicationPreferences)
    )
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "communicationPreferences must be an object",
      );
    changes.communication_preferences = input.communicationPreferences;
  }
  if (Object.keys(changes).length === 2)
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "No supported client changes were supplied",
    );
  try {
    const item = await transaction(sql, ctx, async (tx) => {
      await permission(tx, "clients.edit");
      await entitled(tx, "practice.clients");
      const current =
        await tx`select id from organisation where tenant_id=${ctx.tenantId} and id=${clientId} and lifecycle_status='ACTIVE'`;
      if (!current.length)
        throw new ApiError(404, "NOT_FOUND", "Client not found");
      if (changes.primary_contact_id) {
        const related =
          await tx`select 1 from client_contact_relationship where tenant_id=${ctx.tenantId} and client_id=${clientId} and contact_id=${changes.primary_contact_id as string} and status='ACTIVE'`;
        if (!related.length)
          throw new ApiError(
            400,
            "INVALID_PRIMARY_CONTACT",
            "Primary contact must have an active relationship with the client",
          );
      }
      const columns = Object.keys(changes),
        rows =
          await tx`update organisation set ${tx(changes, ...columns)},version=version+1 where tenant_id=${ctx.tenantId} and id=${clientId} returning *`;
      await audit(tx, ctx, "CLIENT_UPDATED", "CLIENT", clientId, clientId, {
        changedFields: columns.filter(
          (key) => !key.endsWith("_by") && !key.endsWith("_at"),
        ),
      });
      return rows[0]!;
    });
    return response({ item });
  } finally {
    await sql.end();
  }
}
async function archiveClient(
  request: Request,
  env: Env,
  actorId: string,
  clientId: string,
) {
  id(clientId, "Client");
  const ctx = context(request, actorId),
    input = await jsonBody(request),
    reason = required(input, "reason", 1000),
    sql = db(env);
  try {
    const result = await transaction(sql, ctx, async (tx) => {
      await permission(tx, "clients.archive");
      await entitled(tx, "practice.clients");
      const rows =
        await tx`select * from archive_authenticated_organisation(${clientId}::uuid,${reason}::text)`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Client not found");
      const changed = Boolean(rows[0]!.changed);
      if (changed)
        await audit(tx, ctx, "CLIENT_ARCHIVED", "CLIENT", clientId, clientId, {
          reason,
          fromStatus: "ACTIVE",
          toStatus: "ARCHIVED",
        });
      return { item: rows[0], changed };
    });
    return response(result);
  } finally {
    await sql.end();
  }
}

async function contactCollection(request: Request, env: Env, actorId: string) {
  const ctx = context(request, actorId),
    sql = db(env),
    input = request.method === "POST" ? await jsonBody(request) : null;
  try {
    return await transaction(sql, ctx, async (tx) => {
      await entitled(tx, "practice.clients");
      if (request.method === "GET") {
        await permission(tx, "clients.view");
        return response({
          items:
            await tx`select * from contact where tenant_id=${ctx.tenantId} order by display_name,id`,
        });
      }
      await permission(tx, "contacts.manage");
      const displayName = required(input!, "displayName", 255),
        kind = (optional(input!, "contactKind", 30) ?? "PERSON").toUpperCase();
      if (!["PERSON", "ORGANISATION"].includes(kind))
        throw new ApiError(
          400,
          "INVALID_CONTACT_KIND",
          "Select a valid contact kind",
        );
      const contactId = crypto.randomUUID(),
        email = optional(input!, "email", 320)?.toLowerCase() ?? null,
        rows =
          await tx`insert into contact(id,tenant_id,contact_kind,display_name,given_name,family_name,email_normalized,telephone,created_by,updated_by) values(${contactId},${ctx.tenantId},${kind},${displayName},${optional(input!, "givenName", 100) ?? null},${optional(input!, "familyName", 100) ?? null},${email},${optional(input!, "telephone", 80) ?? null},${ctx.actorId},${ctx.actorId}) returning *`;
      await audit(tx, ctx, "CONTACT_CREATED", "CONTACT", contactId, null, {
        displayName,
        contactKind: kind,
      });
      return response({ item: rows[0] }, 201);
    });
  } finally {
    await sql.end();
  }
}
async function patchContact(
  request: Request,
  env: Env,
  actorId: string,
  contactId: string,
) {
  id(contactId, "Contact");
  const ctx = context(request, actorId),
    input = await jsonBody(request),
    sql = db(env),
    changes: Record<string, unknown> = {
      updated_by: ctx.actorId,
      updated_at: new Date().toISOString(),
    },
    map: Record<string, string> = {
      displayName: "display_name",
      givenName: "given_name",
      familyName: "family_name",
      email: "email_normalized",
      telephone: "telephone",
    };
  for (const [key, column] of Object.entries(map)) {
    let value = optional(input, key, key === "email" ? 320 : 255);
    if (key === "email" && value) value = value.toLowerCase();
    if (value !== undefined) changes[column] = value;
  }
  if ("status" in input) {
    const value = required(input, "status", 20).toUpperCase();
    if (!["ACTIVE", "INACTIVE"].includes(value))
      throw new ApiError(
        400,
        "INVALID_CONTACT_STATUS",
        "Select a valid contact status",
      );
    changes.status = value;
  }
  if (Object.keys(changes).length === 2)
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "No supported contact changes were supplied",
    );
  try {
    const item = await transaction(sql, ctx, async (tx) => {
      await permission(tx, "contacts.manage");
      await entitled(tx, "practice.clients");
      const columns = Object.keys(changes),
        rows =
          await tx`update contact set ${tx(changes, ...columns)} where tenant_id=${ctx.tenantId} and id=${contactId} returning *`;
      if (!rows.length)
        throw new ApiError(404, "NOT_FOUND", "Contact not found");
      await audit(tx, ctx, "CONTACT_UPDATED", "CONTACT", contactId, null, {
        changedFields: columns,
      });
      return rows[0]!;
    });
    return response({ item });
  } finally {
    await sql.end();
  }
}
async function createRelationship(
  request: Request,
  env: Env,
  actorId: string,
  clientId: string,
) {
  id(clientId, "Client");
  const ctx = context(request, actorId),
    input = await jsonBody(request),
    contactId = id(required(input, "contactId", 36), "Contact"),
    relationshipType = required(input, "relationshipType", 50).toUpperCase();
  if (!RELATIONSHIP_TYPES.has(relationshipType))
    throw new ApiError(
      400,
      "INVALID_RELATIONSHIP_TYPE",
      "Select a valid relationship type",
    );
  const customLabel =
      relationshipType === "OTHER"
        ? required(input, "customRelationshipLabel", 100)
        : null,
    startDate = optional(input, "startDate", 10) ?? null,
    endDate = optional(input, "endDate", 10) ?? null,
    isPrimary = input.isPrimary === true,
    relationshipId = crypto.randomUUID(),
    sql = db(env);
  try {
    const item = await transaction(sql, ctx, async (tx) => {
      await permission(tx, "contacts.manage");
      await entitled(tx, "practice.clients");
      const scope =
        await tx`select o.id from organisation o join contact c on c.tenant_id=o.tenant_id where o.tenant_id=${ctx.tenantId} and o.id=${clientId} and c.id=${contactId}`;
      if (!scope.length)
        throw new ApiError(404, "NOT_FOUND", "Client or contact not found");
      const rows =
        await tx`insert into client_contact_relationship(id,tenant_id,client_id,contact_id,relationship_type_key,custom_relationship_label,is_primary,start_date,end_date,status,created_by,updated_by) values(${relationshipId},${ctx.tenantId},${clientId},${contactId},${relationshipType},${customLabel},${isPrimary},${startDate},${endDate},${endDate ? "ENDED" : "ACTIVE"},${ctx.actorId},${ctx.actorId}) returning *`;
      if (isPrimary)
        await tx`update organisation set primary_contact_id=${contactId},updated_by=${ctx.actorId},updated_at=now(),version=version+1 where tenant_id=${ctx.tenantId} and id=${clientId}`;
      await audit(
        tx,
        ctx,
        "CLIENT_CONTACT_RELATIONSHIP_CHANGED",
        "CLIENT_CONTACT_RELATIONSHIP",
        relationshipId,
        clientId,
        { contactId, relationshipType, isPrimary, startDate, endDate },
      );
      return rows[0]!;
    });
    return response({ item }, 201);
  } finally {
    await sql.end();
  }
}

async function teamCollection(request: Request, env: Env, actorId: string) {
  const ctx = context(request, actorId),
    sql = db(env),
    input = request.method === "POST" ? await jsonBody(request) : null;
  try {
    return await transaction(sql, ctx, async (tx) => {
      if (request.method === "GET") {
        await permission(tx, "clients.view");
        return response({
          items:
            await tx`select t.id,t.name,t.status,count(tm.tenant_member_id)::int member_count from team t left join team_member tm on tm.tenant_id=t.tenant_id and tm.team_id=t.id where t.tenant_id=${ctx.tenantId} group by t.id order by t.name`,
        });
      }
      await permission(tx, "teams.manage");
      const name = required(input!, "name", 160),
        teamId = crypto.randomUUID(),
        rows =
          await tx`insert into team(id,tenant_id,name,created_by,updated_by) values(${teamId},${ctx.tenantId},${name},${ctx.actorId},${ctx.actorId}) returning *`;
      await audit(tx, ctx, "TEAM_CREATED", "TEAM", teamId, null, { name });
      return response({ item: rows[0] }, 201);
    });
  } finally {
    await sql.end();
  }
}
async function addTeamMember(
  request: Request,
  env: Env,
  actorId: string,
  teamId: string,
) {
  id(teamId, "Team");
  const ctx = context(request, actorId),
    input = await jsonBody(request),
    memberId = id(required(input, "tenantMemberId", 36), "Tenant member"),
    sql = db(env);
  try {
    const item = await transaction(sql, ctx, async (tx) => {
      await permission(tx, "teams.manage");
      const rows =
        await tx`insert into team_member(tenant_id,team_id,tenant_member_id,created_by) values(${ctx.tenantId},${teamId},${memberId},${ctx.actorId}) on conflict do nothing returning *`;
      if (!rows.length) {
        const existing =
          await tx`select * from team_member where tenant_id=${ctx.tenantId} and team_id=${teamId} and tenant_member_id=${memberId}`;
        if (!existing.length)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "Team or tenant member not found",
          );
        return existing[0]!;
      }
      await audit(
        tx,
        ctx,
        "TEAM_ASSIGNMENT_CHANGED",
        "TEAM_MEMBER",
        `${teamId}:${memberId}`,
        null,
        { teamId, memberId, assigned: true },
      );
      return rows[0]!;
    });
    return response({ item }, 201);
  } finally {
    await sql.end();
  }
}
async function sharedSetting(
  request: Request,
  env: Env,
  actorId: string,
  namespace: string,
  key: string,
) {
  if (
    !/^[a-z][a-z0-9_.]{1,79}$/.test(namespace) ||
    !/^[a-z][a-z0-9_.]{1,79}$/.test(key)
  )
    throw new ApiError(
      400,
      "INVALID_SETTING_KEY",
      "Setting namespace and key are invalid",
    );
  const ctx = context(request, actorId),
    sql = db(env),
    input = request.method === "PUT" ? await jsonBody(request) : null;
  try {
    return await transaction(sql, ctx, async (tx) => {
      await permission(tx, "settings.manage");
      if (request.method === "GET") {
        const rows =
          await tx`select namespace,setting_key,setting_value,updated_at from tenant_setting where tenant_id=${ctx.tenantId} and scope_type='TENANT' and scope_reference='' and namespace=${namespace} and setting_key=${key}`;
        if (!rows.length)
          throw new ApiError(404, "NOT_FOUND", "Setting not found");
        return response({ item: rows[0] });
      }
      if (!("value" in input!))
        throw new ApiError(400, "INVALID_REQUEST", "value is required");
      const rows =
        await tx`insert into tenant_setting(tenant_id,scope_type,scope_reference,namespace,setting_key,setting_value,created_by,updated_by) values(${ctx.tenantId},'TENANT','',${namespace},${key},${tx.json(input!.value as postgres.JSONValue)},${ctx.actorId},${ctx.actorId}) on conflict(tenant_id,scope_type,scope_reference,namespace,setting_key) do update set setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=now() returning namespace,setting_key,setting_value,updated_at`;
      await audit(
        tx,
        ctx,
        "SETTING_CHANGED",
        "TENANT_SETTING",
        `${namespace}.${key}`,
        null,
        { namespace, key },
      );
      return response({ item: rows[0] });
    });
  } finally {
    await sql.end();
  }
}
async function entitlementDecision(
  request: Request,
  env: Env,
  actorId: string,
  featureKey: string,
) {
  if (!/^[a-z][a-z0-9_.]{2,99}$/.test(featureKey))
    throw new ApiError(400, "INVALID_FEATURE_KEY", "Feature key is invalid");
  const ctx = context(request, actorId),
    sql = db(env);
  try {
    return await transaction(sql, ctx, async (tx) => {
      await permission(tx, "entitlements.view");
      return response({
        item: { featureKey, ...(await decision(tx, featureKey)) },
      });
    });
  } finally {
    await sql.end();
  }
}

export async function handlePlatformCoreRoute(
  request: Request,
  env: Env,
  actorId: string,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/v1/platform/context")
    return getContext(request, env, actorId);
  if (path === "/v1/clients" && request.method === "GET")
    return listClients(request, env, actorId);
  if (path === "/v1/clients" && request.method === "POST")
    return createClient(request, env, actorId);
  let match = path.match(/^\/v1\/clients\/([^/]+)$/);
  if (match && request.method === "PATCH")
    return patchClient(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/clients\/([^/]+)\/archive$/);
  if (match && request.method === "POST")
    return archiveClient(request, env, actorId, match[1]!);
  if (
    path === "/v1/contacts" &&
    (request.method === "GET" || request.method === "POST")
  )
    return contactCollection(request, env, actorId);
  match = path.match(/^\/v1\/contacts\/([^/]+)$/);
  if (match && request.method === "PATCH")
    return patchContact(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/clients\/([^/]+)\/relationships$/);
  if (match && request.method === "POST")
    return createRelationship(request, env, actorId, match[1]!);
  if (
    path === "/v1/platform/teams" &&
    (request.method === "GET" || request.method === "POST")
  )
    return teamCollection(request, env, actorId);
  match = path.match(/^\/v1\/platform\/teams\/([^/]+)\/members$/);
  if (match && request.method === "POST")
    return addTeamMember(request, env, actorId, match[1]!);
  match = path.match(/^\/v1\/platform\/settings\/([^/]+)\/([^/]+)$/);
  if (match && (request.method === "GET" || request.method === "PUT"))
    return sharedSetting(request, env, actorId, match[1]!, match[2]!);
  match = path.match(/^\/v1\/platform\/entitlements\/([^/]+)$/);
  if (match && request.method === "GET")
    return entitlementDecision(request, env, actorId, match[1]!);
  return null;
}
