import test from "node:test";
import assert from "node:assert/strict";
import { baseline, hotfixBranch, hotfixErrors } from "./google-auth-hotfix.mjs";
const sha = "a".repeat(40);
const context = { branch: hotfixBranch, sha, originSha: sha, eventSha: sha, status: "", ancestor: true, changed: ["apps/web/src/auth.ts"], liveSha: baseline };
test("allows the exact reviewed authentication hotfix and idempotent recheck", () => {
  assert.deepEqual(hotfixErrors(context), []);
  assert.deepEqual(hotfixErrors({ ...context, liveSha: sha }), []);
});
for (const [name, values] of Object.entries({
  dirty: { status: " M apps/web/src/auth.ts" }, wrongBranch: { branch: "main" },
  unverifiedEvent: { eventSha: "d".repeat(40) }, staleRef: { originSha: "b".repeat(40) }, unrelatedHistory: { ancestor: false },
  databaseChange: { changed: ["packages/database/migrations/0035_resource_capacity_time_economics.sql"] },
  releaseGuardChange: { changed: ["scripts/cloudflare-release.mjs"] },
  liveDrift: { liveSha: "c".repeat(40) }, unknownLive: { liveSha: undefined },
})) test("rejects " + name, () => assert.ok(hotfixErrors({ ...context, ...values }).length));
