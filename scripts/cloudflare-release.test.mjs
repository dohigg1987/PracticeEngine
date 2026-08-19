import assert from "node:assert/strict";
import test from "node:test";
import {
  productionConfigErrors,
  releaseContextErrors,
  webEnvironmentErrors,
} from "./cloudflare-release.mjs";

const sha = "a".repeat(40);
const config = {
  name: "uk-accounts-api-production",
  workers_dev: false,
  preview_urls: false,
  routes: [{ pattern: "api.ledgerly.co.uk", custom_domain: true }],
  vars: {
    WEB_ORIGIN: "https://ledgerly.co.uk",
    NEON_AUTH_URL: "https://auth.ledgerly.co.uk/neondb/auth",
  },
  r2_buckets: [{ binding: "ARTEFACTS", bucket_name: "uk-accounts-prod-artefacts" }],
  hyperdrive: [{ binding: "HYPERDRIVE", id: "reviewed-id" }],
};

test("requires a clean main worktree at the exact origin/main SHA", () => {
  assert.deepEqual(releaseContextErrors({ status: "", branch: "main", sha, originSha: sha }), []);
  const errors = releaseContextErrors({
    status: " M apps/api/src/index.ts\n?? release.tmp", branch: "feature", sha, originSha: "b".repeat(40),
  });
  assert.ok(errors.some((error) => error.includes("dirty")));
  assert.ok(errors.some((error) => error.includes("main")));
  assert.ok(errors.some((error) => error.includes("origin/main")));
  assert.ok(releaseContextErrors({ status: "", branch: "main", sha, originSha: undefined })
    .some((error) => error.includes("unavailable")));
});

test("requires a hardened exact-domain Worker configuration", () => {
  assert.deepEqual(productionConfigErrors(config), []);
  const errors = productionConfigErrors({ ...config, workers_dev: true, routes: [] });
  assert.ok(errors.includes("workers_dev must be false"));
  assert.ok(errors.includes("Exactly one custom-domain route is required"));
});

test("locks the web build origins to the API production configuration", () => {
  const environment = {
    WEB_ORIGIN: "https://ledgerly.co.uk",
    VITE_API_URL: "https://api.ledgerly.co.uk",
    VITE_NEON_AUTH_URL: "https://auth.ledgerly.co.uk/neondb/auth",
    VITE_DEMO_MODE: "false",
  };
  assert.deepEqual(webEnvironmentErrors(environment, config), []);
  assert.ok(webEnvironmentErrors({ ...environment, VITE_API_URL: "https://preview.invalid" }, config)
    .some((error) => error.includes("custom domain")));
  assert.ok(webEnvironmentErrors({ ...environment, VITE_DEMO_MODE: "true" }, config)
    .some((error) => error.includes("exactly false")));
});
