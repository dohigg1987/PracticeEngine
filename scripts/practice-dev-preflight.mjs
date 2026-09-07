import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const config = JSON.parse(readFileSync("apps/api/wrangler.dev.jsonc", "utf8"));
assert.equal(config.name, "practiceengine-api-dev");
assert.equal(config.vars.WEB_ORIGIN, "https://practiceengine-dev.pages.dev");
assert.equal(config.r2_buckets[0].bucket_name, "practiceengine-dev-artefacts");
const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
assert.ok(account && token, "Existing Cloudflare deployment credentials are required");
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/practiceengine-api-dev/settings`, { headers: { Authorization: `Bearer ${token}` } });
assert.ok(response.ok, `DEV Worker metadata could not be read (${response.status})`);
const payload = await response.json();
assert.equal(payload.success, true, "DEV Worker metadata returned an error");
const bindings = payload.result.bindings;
for (const [name, expected, property] of [
  ["WEB_ORIGIN", config.vars.WEB_ORIGIN, "text"],
  ["NEON_AUTH_URL", config.vars.NEON_AUTH_URL, "text"],
  ["ARTEFACTS", config.r2_buckets[0].bucket_name, "bucket_name"],
  ["HYPERDRIVE", config.hyperdrive[0].id, "id"],
]) {
  const actual = bindings.find(binding => binding.name === name);
  assert.ok(actual, `DEV binding ${name} is missing`);
  assert.equal(actual[property], expected, `DEV binding ${name} differs from the repository; deployment must stop`);
  console.log(`DEV binding ${name}: matches`);
}
const health = await fetch("https://practiceengine-api-dev.dennis-ohiggins.workers.dev/health");
console.log("DEV health HTTP status:", health.status);
if (health.ok) {
  const data = await health.json();
  console.log("DEV health:", JSON.stringify({ status: data.status, version: data.version }));
}
console.log("DEV preflight passed; no settings were changed.");
