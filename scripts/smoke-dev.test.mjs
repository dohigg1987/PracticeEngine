import assert from "node:assert/strict";
import test from "node:test";
import { assertNonProduction, runSmoke, SmokeFailure } from "./smoke-dev.mjs";

const valid = {
  apiUrl: "https://practiceengine-api-dev.example.test",
  webUrl: "https://practiceengine-dev.example.test",
  tenantId: "11111111-1111-4111-8111-111111111111",
  token: "token",
  confirmNonProduction: "yes",
};

test("DEV smoke requires an explicit non-production confirmation", () => {
  assert.throws(() => assertNonProduction({ ...valid, confirmNonProduction: undefined }), SmokeFailure);
});

test("DEV smoke refuses an explicitly listed production hostname", () => {
  assert.throws(() => assertNonProduction({ ...valid, productionHostnames: "practiceengine-api-dev.example.test" }), /matches a hostname/);
});

test("DEV smoke refuses the repository production hosts and non-DEV hosts", () => {
  assert.throws(() => assertNonProduction({ ...valid, webUrl: "https://ledgerly-accounts.pages.dev" }), /hostname/);
  assert.throws(() => assertNonProduction({ ...valid, apiUrl: "https://api.example.com" }), /visibly DEV/);
});

test("DEV smoke accepts confirmed HTTP(S) DEV endpoints", () => {
  assert.doesNotThrow(() => assertNonProduction(valid));
});

test("DEV smoke rejects invalid tenant identifiers and missing tokens", () => {
  assert.throws(() => assertNonProduction({ ...valid, tenantId: "dev" }), /UUID/);
  assert.throws(() => assertNonProduction({ ...valid, token: "" }), /DEV_AUTH_TOKEN/);
});

test("read-only orchestration exercises the integration surface without mutations", async () => {
  const calls = [];
  const mockedFetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const method = init.method ?? "GET";
    calls.push(`${method} ${path}`);
    if (method === "OPTIONS") return new Response(null, { status: 204 });
    if (url === `${valid.webUrl}/`) return new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
    if (path === "/health") return Response.json({ status: "ok" });
    if (path === "/ready") return Response.json({ status: "ready" });
    if (path === "/v1/me/tenants" && !init.headers) return Response.json({ error: {} }, { status: 401 });
    if (path === "/v1/me/tenants") return Response.json({ items: [{ tenant_id: valid.tenantId }] });
    if (path === "/v1/platform/context" && init.headers?.["x-tenant-id"] !== valid.tenantId) return Response.json({ error: {} }, { status: 403 });
    if (path === "/v1/platform/context") return Response.json({ item: { tenantId: valid.tenantId } });
    if (path === "/v1/capabilities") return Response.json({ modules: ["ledgerly-work-link", "accounts-versions"] });
    if (path === "/v1/integrations/quotebench/events") return Response.json({ error: {} }, { status: 400 });
    return Response.json({ items: [] });
  };
  const results = await runSmoke(valid, mockedFetch);
  assert.ok(results.some((item) => item.name === "tenant/RLS denial" && item.status === "pass"));
  assert.ok(results.some((item) => item.name === "database read/write" && item.status === "skip"));
  assert.equal(calls.some((call) => call.startsWith("PATCH ") || call.startsWith("POST /v1/crm/prospects")), false);
});
