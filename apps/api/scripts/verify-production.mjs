import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const configPath = resolve(
  argumentValue("--config") ?? "wrangler.production.jsonc",
);
const allowPlaceholders = args.has("--allow-placeholders");
const remote = args.has("--remote");
const expectedHyperdriveId = "a07d1364c5c74e558ef127d515cdce92";
const expectedAuthUrl =
  "https://ep-wispy-thunder-zatp3scz.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth";
const temporaryWorkersDevApiOrigin =
  "https://uk-accounts-api-production.dennis-ohiggins.workers.dev";
const temporaryWorkersDevWebOrigin = "https://ledgerly-accounts.pages.dev";

let config;
try {
  config = JSON.parse(await readFile(configPath, "utf8"));
} catch (error) {
  throw new Error(
    `Cannot read production config ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

const failures = [];
const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};
const route = config.routes?.[0];
const webOrigin = config.vars?.WEB_ORIGIN;
const routePattern = route?.pattern;
const temporaryWorkersDev = config.name === "uk-accounts-api-production" &&
  config.workers_dev === true &&
  !config.routes?.length;
const customDomain = config.workers_dev === false &&
  config.routes?.length === 1 &&
  route?.custom_domain === true;
const placeholders = JSON.stringify(config).match(/<[^>]+>/g) ?? [];

requireValue(config.name === "uk-accounts-api-production", "Worker name must be uk-accounts-api-production");
requireValue(config.preview_urls === false, "preview_urls must be false");
requireValue(config.observability?.enabled === true, "Workers observability must be enabled");
requireValue(config.observability?.logs?.head_sampling_rate > 0, "Log sampling must be enabled");
requireValue(config.observability?.traces?.enabled === true, "Trace collection must be enabled");
requireValue(config.observability?.traces?.head_sampling_rate > 0, "Trace sampling must be enabled");
requireValue(config.r2_buckets?.length === 1, "Exactly one production R2 binding is required");
requireValue(config.r2_buckets?.[0]?.binding === "ARTEFACTS", "R2 binding must be ARTEFACTS");
requireValue(config.r2_buckets?.[0]?.bucket_name === "uk-accounts-prod-artefacts", "Production must use uk-accounts-prod-artefacts");
requireValue(config.hyperdrive?.length === 1 && config.hyperdrive[0]?.id === expectedHyperdriveId, `Hyperdrive must use the reviewed production binding ${expectedHyperdriveId}`);
requireValue(customDomain || temporaryWorkersDev, "Production must use one exact custom domain or the approved temporary workers.dev Worker");
requireValue(config.vars?.NEON_AUTH_URL === expectedAuthUrl, "NEON_AUTH_URL must match the provisioned production auth service");
if (temporaryWorkersDev)
  requireValue(webOrigin === temporaryWorkersDevWebOrigin, `Temporary workers.dev production must use WEB_ORIGIN ${temporaryWorkersDevWebOrigin}`);
const compatibilityTime = Date.parse(`${config.compatibility_date}T00:00:00Z`);
const compatibilityAgeDays = (Date.now() - compatibilityTime) / 86_400_000;
requireValue(Number.isFinite(compatibilityTime) && compatibilityAgeDays >= 0 && compatibilityAgeDays <= 45, "compatibility_date must be valid, not future-dated, and no older than 45 days");

if (!allowPlaceholders) {
  requireValue(placeholders.length === 0, `Unresolved placeholders: ${placeholders.join(", ")}`);
  try {
    const origin = new URL(webOrigin);
    requireValue(origin.protocol === "https:" && origin.origin === webOrigin, "WEB_ORIGIN must be an exact HTTPS origin with no path or trailing slash");
  } catch {
    failures.push("WEB_ORIGIN must be a valid HTTPS origin");
  }
  if (customDomain) requireValue(
    typeof routePattern === "string" &&
      !routePattern.includes("/") &&
      !routePattern.includes("*") &&
      routePattern.includes("."),
    "The custom-domain route must be one exact hostname",
  );
}

if (failures.length) {
  throw new Error(`Production preflight failed:\n- ${failures.join("\n- ")}`);
}

process.stdout.write(`Production config preflight passed: ${configPath}\n`);

if (!remote) process.exit(0);

const apiBaseValue = process.env.PILOT_API_BASE;
const accessToken = process.env.PILOT_ACCESS_TOKEN;
if (!apiBaseValue || !accessToken)
  throw new Error("--remote requires PILOT_API_BASE and PILOT_ACCESS_TOKEN environment variables");
const apiBase = new URL(apiBaseValue);
const expectedApiHostname = temporaryWorkersDev
  ? new URL(temporaryWorkersDevApiOrigin).hostname
  : routePattern;
requireValue(apiBase.protocol === "https:", "PILOT_API_BASE must use HTTPS");
requireValue(apiBase.origin === apiBase.href.replace(/\/$/, ""), "PILOT_API_BASE must be an origin with no path");
requireValue(apiBase.hostname === expectedApiHostname, "PILOT_API_BASE must match the configured production Worker origin");
if (failures.length) throw new Error(`Remote target validation failed:\n- ${failures.join("\n- ")}`);

const request = async (path, init = {}) => {
  const response = await fetch(new URL(path, `${apiBase.origin}/`), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status >= 300 && response.status < 400)
    throw new Error(`${path} unexpectedly redirected (${response.status})`);
  return response;
};
const responseJson = async (response, label) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
};

const healthResponse = await request("/health");
const health = await responseJson(healthResponse, "health");
requireValue(healthResponse.status === 200 && health.status === "ok", "GET /health must report ok");

const readyResponse = await request("/ready");
const ready = await responseJson(readyResponse, "readiness");
requireValue(readyResponse.status === 200 && ready.status === "ready", "GET /ready must report all dependencies ready");

const preflightResponse = await request("/v1/me/tenants", {
  method: "OPTIONS",
  headers: {
    Origin: webOrigin,
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "authorization,content-type",
  },
});
requireValue(preflightResponse.status === 204, "CORS preflight must return 204");
requireValue(preflightResponse.headers.get("access-control-allow-origin") === webOrigin, "CORS must allow only the configured web origin");

const tenantResponse = await request("/v1/me/tenants", {
  headers: { Authorization: `Bearer ${accessToken}`, Origin: webOrigin },
});
const tenants = await responseJson(tenantResponse, "tenant discovery");
requireValue(tenantResponse.status === 200 && Array.isArray(tenants.items), "Authenticated tenant discovery must return items");
requireValue(tenantResponse.headers.get("access-control-allow-origin") === webOrigin, "Authenticated response must include the exact CORS origin");

const hostileOrigin = "https://untrusted.invalid";
const hostileResponse = await request("/health", { headers: { Origin: hostileOrigin } });
requireValue(!hostileResponse.headers.has("access-control-allow-origin"), "Untrusted origins must not receive CORS access");

if (failures.length) throw new Error(`Remote pilot verification failed:\n- ${failures.join("\n- ")}`);
process.stdout.write("Remote pilot verification passed: health, dependencies, authentication and exact-origin CORS\n");
