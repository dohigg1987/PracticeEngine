import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SmokeFailure extends Error {}

export function assertNonProduction(config) {
  if (config.confirmNonProduction !== "yes") {
    throw new SmokeFailure("Set DEV_SMOKE_CONFIRM_NON_PRODUCTION=yes after verifying every configured resource is DEV-only.");
  }
  const blocked = new Set((config.productionHostnames ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  blocked.add("ledgerly-accounts.pages.dev");
  blocked.add("uk-accounts-api-production.dennis-ohiggins.workers.dev");
  for (const [label, value] of [["DEV_API_URL", config.apiUrl], ["DEV_WEB_URL", config.webUrl]]) {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new SmokeFailure(`${label} must use HTTP(S)`);
    if (blocked.has(url.hostname.toLowerCase())) throw new SmokeFailure(`${label} matches a hostname listed in DEV_SMOKE_PRODUCTION_HOSTNAMES`);
    const visiblyDev = /(^|[.-])(dev|development|test|localhost|127\.0\.0\.1)([.-]|$)/i.test(url.hostname);
    if (!visiblyDev || /(^|[.-])(prod|production)([.-]|$)/i.test(url.hostname)) throw new SmokeFailure(`${label} must use a visibly DEV hostname`);
  }
  if (!UUID.test(config.tenantId)) throw new SmokeFailure("DEV_TENANT_ID must be a UUID");
  if (!config.token?.trim()) throw new SmokeFailure("DEV_AUTH_TOKEN is required");
}

function today(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function jsonHeaders(token, tenantId) {
  return {
    authorization: `Bearer ${token}`,
    ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    "content-type": "application/json",
    "x-correlation-id": crypto.randomUUID(),
  };
}

async function responsePayload(response) {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("json")) return response.json();
  return response.text();
}

export async function runSmoke(config, fetchImpl = fetch) {
  assertNonProduction(config);
  const results = [];
  const apiUrl = config.apiUrl.replace(/\/$/, "");
  const webUrl = config.webUrl.replace(/\/$/, "");
  const tenantHeaders = jsonHeaders(config.token, config.tenantId);

  async function check(name, path, options = {}) {
    const target = options.absolute ? path : `${apiUrl}${path}`;
    const response = await fetchImpl(target, options.init);
    const payload = await responsePayload(response);
    const accepted = options.statuses ?? [200];
    if (!accepted.includes(response.status)) {
      throw new SmokeFailure(`${name}: HTTP ${response.status} from ${target}: ${JSON.stringify(payload).slice(0, 500)}`);
    }
    if (options.assert) options.assert(payload, response);
    results.push({ name, status: "pass", httpStatus: response.status });
    return payload;
  }

  function skip(name, reason) {
    results.push({ name, status: "skip", reason });
  }

  await check("web application", `${webUrl}/`, {
    absolute: true,
    init: { headers: { accept: "text/html" } },
    assert: (_body, response) => {
      if (!(response.headers.get("content-type") ?? "").includes("text/html")) throw new SmokeFailure("web application did not return HTML");
    },
  });
  await check("API health", "/health", { assert: (body) => { if (body?.status !== "ok") throw new SmokeFailure("health payload is not ok"); } });
  await check("API readiness/database connectivity", "/ready", { assert: (body) => { if (body?.status !== "ready") throw new SmokeFailure("ready payload is not ready"); } });
  await check("web to API CORS", "/health", { statuses: [204], init: { method: "OPTIONS", headers: { origin: new URL(webUrl).origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization,x-tenant-id" } } });
  await check("unauthenticated API denial", "/v1/me/tenants", { statuses: [401] });
  await check("authenticated tenant membership", "/v1/me/tenants", { init: { headers: jsonHeaders(config.token) }, assert: (body) => {
    if (!Array.isArray(body?.items) || !body.items.some((item) => item.tenant_id === config.tenantId)) throw new SmokeFailure("authenticated identity is not a member of DEV_TENANT_ID");
  } });
  await check("authenticated web to API context", "/v1/platform/context", { init: { headers: tenantHeaders }, assert: (body) => {
    const resolved = body?.item?.tenantId ?? body?.item?.tenant_id;
    if (resolved !== config.tenantId) throw new SmokeFailure("platform context returned a different tenant");
  } });
  await check("tenant/RLS denial", "/v1/platform/context", { statuses: [403], init: { headers: jsonHeaders(config.token, crypto.randomUUID()) } });
  await check("capability and Ledgerly seam", "/v1/capabilities", { init: { headers: tenantHeaders }, assert: (body) => {
    const modules = body?.modules ?? [];
    if (!modules.includes("ledgerly-work-link") || !modules.includes("accounts-versions")) throw new SmokeFailure("Ledgerly capability seam is absent");
  } });

  let resourcesPayload;
  const reads = [
    ["CRM prospects", "/v1/crm/prospects"], ["CRM opportunities", "/v1/crm/opportunities"],
    ["clients", "/v1/clients"], ["practice services", "/v1/practice/services"],
    ["client/workflow work", "/v1/practice/work"], ["workflow review", "/v1/practice/reviews"],
    ["workflow automation", "/v1/practice/automation-rules"], ["recurring work", "/v1/practice/recurring-schedules"],
    ["recurrence operations", "/v1/practice/recurrence-operations"], ["portal requests (staff)", "/v1/client-requests"],
    ["portal messaging (staff)", "/v1/portal-threads"], ["portal documents (staff)", "/v1/portal-documents"],
    ["resources", "/v1/practice/resources"], ["capacity", `/v1/practice/capacity?from=${today()}&to=${today(28)}&grain=week`],
    ["time", `/v1/practice/time-entries?from=${today(-28)}&to=${today()}`], ["portfolio economics", "/v1/practice/portfolio-economics"],
    ["practice economics", "/v1/practice/economics/overview"], ["notifications safe state", "/v1/notifications/delivery"],
    ["Ledgerly engagements", "/v1/engagements"],
  ];
  for (const [name, path] of reads) {
    const payload = await check(name, path, { init: { headers: tenantHeaders } });
    if (name === "resources") resourcesPayload = payload;
  }

  await check("QuoteBench unsigned request denial", "/v1/integrations/quotebench/events", {
    statuses: [400, 401, 403],
    init: { method: "POST", headers: { "content-type": "application/json", "x-tenant-id": config.tenantId }, body: "{}" },
  });

  if (config.mutate) {
    const marker = `DEV smoke ${new Date().toISOString()} ${crypto.randomUUID().slice(0, 8)}`;
    const created = await check("database/API write", "/v1/crm/prospects", { statuses: [201], init: { method: "POST", headers: tenantHeaders, body: JSON.stringify({ displayName: marker, entityType: "OTHER", source: "DEV_SMOKE" }) } });
    const prospectId = created?.item?.id;
    if (!UUID.test(prospectId ?? "")) throw new SmokeFailure("database/API write did not return a prospect UUID");
    await check("database/API read-after-write", `/v1/crm/prospects/${prospectId}`, { init: { headers: tenantHeaders }, assert: (body) => {
      if (body?.item?.display_name !== marker) throw new SmokeFailure("read-after-write value did not match");
    } });
    await check("database/API smoke record archive", `/v1/crm/prospects/${prospectId}`, { init: { method: "PATCH", headers: tenantHeaders, body: JSON.stringify({ status: "archived" }) } });
    const resource = resourcesPayload?.items?.[0];
    if (!UUID.test(resource?.id ?? "")) throw new SmokeFailure("resource write requires at least one seeded DEV resource profile");
    await check("resource write (state-preserving)", `/v1/practice/resources/${resource.id}`, { init: { method: "PATCH", headers: tenantHeaders, body: JSON.stringify({ jobTitle: resource.role_title ?? null }) } });
    await check("recurrence dry-run", "/v1/practice/recurrence-operations/dry-run", { init: { method: "POST", headers: tenantHeaders, body: JSON.stringify({ from: today(), to: today(31) }) }, assert: (body) => {
      if (body?.item?.mode !== "dry_run" || Number(body?.item?.generated) !== 0) throw new SmokeFailure("recurrence was not a non-generating dry-run");
    } });
  } else {
    skip("database read/write", "rerun with --mutate");
    skip("resource write", "rerun with --mutate");
    skip("recurrence dry-run", "rerun with --mutate; dry-run records an auditable execution but generates no work");
  }

  if (config.portalToken && config.portalTenantId) {
    const portalHeaders = jsonHeaders(config.portalToken, config.portalTenantId);
    await check("portal identity and isolation", "/v1/portal/requests", { init: { headers: portalHeaders } });
    await check("portal document listing", "/v1/portal/documents", { init: { headers: portalHeaders } });
    if (config.portalDocumentId) {
      await check("R2 authorised document download", `/v1/portal/documents/${encodeURIComponent(config.portalDocumentId)}/content`, { init: { headers: portalHeaders } });
    } else skip("R2 authorised document download", "set DEV_PORTAL_DOCUMENT_ID to an accepted/scanned portal document");
    if (config.mutate && config.portalRequestId) {
      const form = new FormData();
      form.set("file", new File([`PracticeEngine DEV R2 smoke ${new Date().toISOString()}\n`], "practiceengine-dev-smoke.txt", { type: "text/plain" }));
      form.set("idempotencyKey", `dev-smoke-${crypto.randomUUID()}`);
      await check("R2 portal upload safe state", `/v1/portal/requests/${encodeURIComponent(config.portalRequestId)}/documents`, { statuses: [201], init: { method: "POST", headers: { authorization: `Bearer ${config.portalToken}`, "x-tenant-id": config.portalTenantId, "x-correlation-id": crypto.randomUUID() }, body: form }, assert: (body) => {
        if (body?.item?.scanStatus !== "pending") throw new SmokeFailure("uploaded document was not held in pending scan state");
      } });
    } else skip("R2 portal upload safe state", "requires --mutate and DEV_PORTAL_REQUEST_ID");
  } else {
    skip("portal identity and R2", "set DEV_PORTAL_TOKEN and DEV_PORTAL_TENANT_ID");
  }

  if (config.requireComplete) {
    const skipped = results.filter((item) => item.status === "skip");
    if (skipped.length) throw new SmokeFailure(`complete smoke required, but ${skipped.map((item) => item.name).join(", ")} skipped`);
  }
  return results;
}

export function configFromEnv(env = process.env, argv = process.argv.slice(2)) {
  return {
    apiUrl: env.DEV_API_URL ?? "",
    webUrl: env.DEV_WEB_URL ?? "",
    token: env.DEV_AUTH_TOKEN ?? "",
    tenantId: env.DEV_TENANT_ID ?? "",
    confirmNonProduction: env.DEV_SMOKE_CONFIRM_NON_PRODUCTION,
    productionHostnames: env.DEV_SMOKE_PRODUCTION_HOSTNAMES,
    portalToken: env.DEV_PORTAL_TOKEN,
    portalTenantId: env.DEV_PORTAL_TENANT_ID,
    portalRequestId: env.DEV_PORTAL_REQUEST_ID,
    portalDocumentId: env.DEV_PORTAL_DOCUMENT_ID,
    mutate: argv.includes("--mutate"),
    requireComplete: argv.includes("--require-complete"),
  };
}

async function main() {
  try {
    const results = await runSmoke(configFromEnv());
    for (const result of results) console.log(`${result.status === "pass" ? "PASS" : "SKIP"} ${result.name}${result.httpStatus ? ` (${result.httpStatus})` : `: ${result.reason}`}`);
    console.log(JSON.stringify({ status: "passed", passed: results.filter((item) => item.status === "pass").length, skipped: results.filter((item) => item.status === "skip").length }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
