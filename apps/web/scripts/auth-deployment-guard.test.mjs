import assert from "node:assert/strict";
import test from "node:test";

import { authDeploymentErrors, expectedHostedAuthHost } from "./auth-deployment-guard.mjs";

const valid = {
  routes: { version: 1, include: ["/neon-auth/*"], exclude: [] },
  functionFiles: ["[[path]].js", "complete-callback.js"],
  clientSource: "completeSocialCallback fetch('/complete-callback')",
};

test("accepts the complete hosted Auth contract", () => {
  assert.deepEqual(authDeploymentErrors(valid), []);
});

test("detects omitted routing, Function and client callback completion", () => {
  const errors = authDeploymentErrors({ routes: { include: [] }, functionFiles: [], clientSource: "" });
  assert.equal(errors.length, 5);
});

test("derives the exact hosted Auth host for a sanitized deployment probe", () => {
  assert.equal(
    expectedHostedAuthHost("https://auth.example.test/neondb/auth"),
    "auth.example.test",
  );
  assert.throws(() => expectedHostedAuthHost("http://auth.example.test/neondb/auth"));
});
