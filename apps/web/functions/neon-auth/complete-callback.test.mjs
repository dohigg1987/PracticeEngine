import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost } from "./complete-callback.js";

const developmentAuthUrl =
  "https://dev-auth.example.test/neondb/auth";

test("exchanges a verifier through the environment-selected Auth endpoint and issues the app cookie", async (t) => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (request) => {
    forwarded = request;
    return new Response("{}", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": "__Secure-neon-auth.session_token=session-placeholder; Path=/; HttpOnly; Secure; SameSite=None",
      },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await onRequestPost({
    env: { ENVIRONMENT: "dev", NEON_AUTH_URL: developmentAuthUrl },
    request: new Request("https://practiceengine-dev.pages.dev/neon-auth/complete-callback", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "challenge=placeholder" },
      body: JSON.stringify({ verifier: "verifier-placeholder" }),
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  assert.equal(new URL(forwarded.url).origin + new URL(forwarded.url).pathname, `${developmentAuthUrl}/get-session`);
  assert.deepEqual([...new URL(forwarded.url).searchParams.keys()], ["neon_auth_session_verifier"]);
  assert.equal(forwarded.method, "GET");
  assert.equal(forwarded.headers.get("origin"), "https://practiceengine-dev.pages.dev");
  assert.match(response.headers.get("set-cookie"), /^ledgerly_session=/);
  assert.match(response.headers.get("set-cookie"), /Path=\/neon-auth/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=Lax/i);
  assert.match(response.headers.get("set-cookie"), /Secure/i);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
});

test("rejects a missing verifier without contacting Neon Auth", async (t) => {
  const originalFetch = globalThis.fetch;
  let contacted = false;
  globalThis.fetch = async () => { contacted = true; return new Response(); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestPost({
    env: { ENVIRONMENT: "dev", NEON_AUTH_URL: developmentAuthUrl },
    request: new Request("https://practiceengine-dev.pages.dev/neon-auth/complete-callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(contacted, false);
});
