import assert from "node:assert/strict";
import test from "node:test";

import { onRequest, resolveNeonAuthBase } from "./[[path]].js";

const productionAuthUrl =
  "https://ep-wispy-thunder-zatp3scz.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth";
const developmentAuthUrl =
  "https://ep-royal-dawn-axwaqz1u.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth";

test("uses the environment-scoped Neon Auth URL", () => {
  assert.equal(resolveNeonAuthBase({
    ENVIRONMENT: "dev",
    NEON_AUTH_URL: developmentAuthUrl,
  }), developmentAuthUrl);
});

test("preserves the existing production endpoint when no environment override exists", () => {
  assert.equal(resolveNeonAuthBase({}), productionAuthUrl);
});

test("explicit development deployments cannot fall back to production auth", () => {
  assert.throws(
    () => resolveNeonAuthBase({ ENVIRONMENT: "dev" }),
    /NEON_AUTH_URL is required/,
  );
  assert.throws(
    () => resolveNeonAuthBase({ CF_PAGES_BRANCH: "environment/dev-integrated" }),
    /NEON_AUTH_URL is required/,
  );
});

test("invalid environment overrides fail closed", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await onRequest({
      env: { ENVIRONMENT: "dev", NEON_AUTH_URL: "http://auth.example.test" },
      request: new Request("https://practiceengine-dev.pages.dev/neon-auth/session"),
      params: { path: "session" },
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.status, 503);
  assert.equal(await response.text(), "Authentication proxy is not configured.");
});

test("forwards Google social sign-in POST requests to Neon Auth", async (t) => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (request) => {
    forwarded = request;
    return Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth" });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await onRequest({
    env: { ENVIRONMENT: "dev", NEON_AUTH_URL: developmentAuthUrl },
    request: new Request(
      "https://practiceengine-dev.pages.dev/neon-auth/sign-in/social",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "https://practiceengine-dev.pages.dev",
        }),
      },
    ),
    params: { path: ["sign-in", "social"] },
  });

  assert.equal(response.status, 200);
  assert.equal(forwarded.method, "POST");
  assert.equal(forwarded.url, `${developmentAuthUrl}/sign-in/social`);
  assert.equal(forwarded.headers.get("origin"), "https://practiceengine-dev.pages.dev");
  assert.deepEqual(await forwarded.json(), {
    provider: "google",
    callbackURL: "https://practiceengine-dev.pages.dev",
  });
});
