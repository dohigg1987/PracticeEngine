import test from "node:test";
import assert from "node:assert/strict";
import { productionOrigin, securityHeaders } from "./security-headers.mjs";

const valid = {
  webUrl: "https://accounts.ledgerly.co.uk",
  apiUrl: "https://api.ledgerly.co.uk/v1",
  authUrl: "https://auth.eu.neon.tech/neondb/auth",
};

test("generates exact production connect sources and hardened static headers", () => {
  const output = securityHeaders(valid);
  assert.match(
    output,
    /connect-src 'self' https:\/\/api\.ledgerly\.co\.uk https:\/\/auth\.eu\.neon\.tech;/,
  );
  assert.doesNotMatch(output, /connect-src[^;]*\*/);
  assert.match(output, /frame-ancestors 'none'/);
  assert.match(output, /\/assets\/\*[\s\S]*immutable/);
  assert.match(output, /\/index\.html[\s\S]*no-cache/);
});

test("normalises API and Auth paths to origins", () => {
  assert.equal(
    productionOrigin("VITE_API_URL", valid.apiUrl),
    "https://api.ledgerly.co.uk",
  );
  assert.equal(
    productionOrigin("VITE_NEON_AUTH_URL", valid.authUrl),
    "https://auth.eu.neon.tech",
  );
});

test("rejects placeholders, wildcards, local hosts, credentials and insecure URLs", () => {
  for (const value of [
    "https://api.example",
    "https://*.ledgerly.co.uk",
    "https://localhost",
    "https://user:secret@api.ledgerly.co.uk",
    "http://api.ledgerly.co.uk",
    "https://your-api-host",
  ]) {
    assert.throws(() => productionOrigin("VITE_API_URL", value));
  }
});

test("requires the public web URL to be an exact origin", () => {
  assert.throws(() =>
    productionOrigin("WEB_ORIGIN", "https://accounts.ledgerly.co.uk/app", {
      web: true,
    }),
  );
});
