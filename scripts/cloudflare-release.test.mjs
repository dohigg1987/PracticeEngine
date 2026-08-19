import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedWebApiOrigin,
  pagesDeploymentInvocation,
  productionConfigErrors,
  releaseContextErrors,
  webEnvironmentErrors,
  webReleaseConfigErrors,
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
    .some((error) => error.includes("Worker origin")));
  assert.ok(webEnvironmentErrors({ ...environment, VITE_DEMO_MODE: "true" }, config)
    .some((error) => error.includes("exactly false")));
});

test("allows the audited workers.dev origin for a web-only release", () => {
  const workersDevConfig = {
    ...config,
    workers_dev: true,
    routes: undefined,
    vars: {
      WEB_ORIGIN: "https://ledgerly-accounts.pages.dev",
      NEON_AUTH_URL: "https://ep-wispy-thunder-zatp3scz.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth",
    },
  };
  const environment = {
    WEB_ORIGIN: workersDevConfig.vars.WEB_ORIGIN,
    VITE_API_URL: "https://uk-accounts-api-production.dennis-ohiggins.workers.dev",
    VITE_NEON_AUTH_URL: workersDevConfig.vars.NEON_AUTH_URL,
    VITE_DEMO_MODE: "false",
  };
  assert.deepEqual(webReleaseConfigErrors(workersDevConfig), []);
  assert.equal(expectedWebApiOrigin(workersDevConfig), environment.VITE_API_URL);
  assert.deepEqual(webEnvironmentErrors(environment, workersDevConfig), []);
  assert.ok(webEnvironmentErrors({ ...environment, VITE_API_URL: "https://preview.invalid" }, workersDevConfig)
    .some((error) => error.includes("Worker origin")));
  assert.ok(webReleaseConfigErrors(config).some((error) => error.includes("audited production workers.dev")));
});

test("deploys Pages from apps/web so the Functions directory is discovered", () => {
  const invocation = pagesDeploymentInvocation(sha);
  assert.equal(invocation.cwd.replaceAll("\\", "/").endsWith("/apps/web"), true);
  assert.deepEqual(invocation.args.slice(0, 3), ["pages", "deploy", "dist"]);
  assert.equal(invocation.args[invocation.args.indexOf("--commit-hash") + 1], sha);
  assert.ok(invocation.args.includes("--commit-dirty=false"));
});
