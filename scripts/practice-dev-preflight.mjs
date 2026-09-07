import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const config = JSON.parse(readFileSync("apps/api/wrangler.dev.jsonc", "utf8"));
assert.equal(config.name, "practiceengine-api-dev");
assert.equal(config.vars.WEB_ORIGIN, "https://practiceengine-dev.pages.dev");
assert.equal(config.r2_buckets[0].bucket_name, "practiceengine-dev-artefacts");
assert.equal(config.hyperdrive[0].id, "f155446f8013477db4bf22d597a0ec38");
const api = "https://practiceengine-api-dev.dennis-ohiggins.workers.dev";

// Metadata verification is an explicit deployment check. CI's Pages credential
// cannot read Worker metadata; public readiness must not pretend to prove bindings.
if (process.env.DEV_REQUIRE_METADATA === "true") {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  assert.ok(account && token, "Worker metadata credentials are required");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/practiceengine-api-dev/settings`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `DEV Worker metadata could not be read (${response.status})`);
  const payload = await response.json();
  assert.equal(payload.success, true, "DEV Worker metadata returned an error");
  for (const [name, expected, property] of [
    ["WEB_ORIGIN", config.vars.WEB_ORIGIN, "text"],
    ["NEON_AUTH_URL", config.vars.NEON_AUTH_URL, "text"],
    ["ARTEFACTS", config.r2_buckets[0].bucket_name, "bucket_name"],
    ["HYPERDRIVE", config.hyperdrive[0].id, "id"],
  ]) {
    const actual = payload.result.bindings.find(binding => binding.name === name);
    assert.equal(actual?.[property], expected, `DEV binding ${name} differs from the repository`);
  }
  console.log("DEV Worker metadata: bindings match.");
}

const release = process.argv.includes("--release") ? process.env.EXPECTED_RELEASE_SHA : undefined;
if (process.argv.includes("--release")) assert.match(release || "", /^[a-f0-9]{40}$/, "A release commit is required");
const waitSeconds = Math.max(0, Math.min(600, Number(process.env.MAX_WAIT_SECONDS || 0)));
assert.ok(Number.isFinite(waitSeconds), "MAX_WAIT_SECONDS must be numeric");
const deadline = Date.now() + waitSeconds * 1000;
let health;
do {
  const response = await fetch(api + "/health", { signal: AbortSignal.timeout(15000), cache: "no-store" });
  assert.equal(response.status, 200, "DEV health failed");
  health = await response.json();
  assert.equal(health.status, "ok", "DEV health is not ok");
  if (!release || health.version === release) break;
  if (Date.now() >= deadline) break;
  console.log("Waiting for the matching DEV backend release.");
  await delay(15000);
} while (true);
if (release) assert.equal(health.version, release, "Website publication stopped: DEV backend is on another release");
const readyResponse = await fetch(api + "/ready", { signal: AbortSignal.timeout(15000), cache: "no-store" });
assert.equal(readyResponse.status, 200, "DEV readiness failed");
const ready = await readyResponse.json();
assert.equal(ready.status, "ready", "DEV backend dependencies are not ready");
console.log(JSON.stringify({ check: release ? "release readiness" : "public readiness", version: health.version, status: ready.status }));
