import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const production = process.argv.includes("--production");
const skipE2e = process.argv.includes("--skip-e2e");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const startedAt = Date.now();
const timings=[];

if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("Pilot verification requires Node.js 22 or later.");
  process.exit(1);
}

const fromRoot = (path) => resolve(root, path);
const checks = [
  ["Domain build", root, [fromRoot("node_modules/typescript/bin/tsc"), "-p", "tsconfig.core.json"]],
  ["Domain tests", root, ["--test", "dist/packages/domain/test/*.test.js"]],
  ["API tests", fromRoot("apps/api"), ["--test", "--experimental-strip-types", "test/*.test.ts"]],
  ["API typecheck", root, [fromRoot("node_modules/typescript/bin/tsc"), "-p", "apps/api/tsconfig.json", "--noEmit"]],
  ["Worker dry-run", root, [fromRoot("node_modules/wrangler/bin/wrangler.js"), "deploy", "--config", "apps/api/wrangler.jsonc", "--dry-run", "--outdir", "apps/api/.wrangler/dry-run"]],
  [
    production ? "Materialised production configuration" : "Production template configuration",
    fromRoot("apps/api"),
    ["scripts/verify-production.mjs", "--config", production ? "wrangler.production.jsonc" : "wrangler.production.example.jsonc", ...(production ? [] : ["--allow-placeholders"])],
  ],
  ["Web strict typecheck", root, [fromRoot("node_modules/typescript/bin/tsc"), "-p", "apps/web/tsconfig.json", "--noEmit"]],
  ["Web component and contract tests", fromRoot("apps/web"), [fromRoot("node_modules/vitest/vitest.mjs"), "run"]],
  ["Web security-header contract tests", fromRoot("apps/web"), ["--test", "scripts/security-headers.test.mjs"]],
  ...(
    skipE2e
      ? []
      : [["Controlled-pilot browser journeys", fromRoot("apps/web"), [fromRoot("node_modules/@playwright/test/cli.js"), "test"]]]
  ),
  ...(production
    ? [["Materialised web security headers", fromRoot("apps/web"), ["scripts/security-headers.mjs"]]]
    : []),
  ["Production web build", fromRoot("apps/web"), [fromRoot("node_modules/vite/bin/vite.js"), "build"]],
];

for (const [label, cwd, args] of checks) {
  console.log(`\n=== ${label} ===`);
  const suiteStarted=Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      CI: process.env.CI || "1",
      WRANGLER_SEND_METRICS: "false",
    },
  });
  if (result.error) {
    console.error(`Could not start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Pilot verification stopped at: ${label}`);
    process.exit(result.status ?? 1);
  }
  const seconds=Number(((Date.now()-suiteStarted)/1000).toFixed(1));
  timings.push({label,seconds});
  console.log(`--- ${label}: ${seconds.toFixed(1)}s ---`);
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\nPilot verification passed in ${elapsed}s.`);
console.log("Slowest pilot suites:");
for(const item of [...timings].sort((a,b)=>b.seconds-a.seconds).slice(0,5))console.log(`${item.seconds.toFixed(1)}s  ${item.label}`);
console.log(`VERIFY_TIMING_JSON=${JSON.stringify({tier:"pilot",seconds:Number(elapsed),suites:timings,playwrightWorkers:Number(process.env.PLAYWRIGHT_WORKERS||4),browsers:"chromium + Edge when installed"})}`);
console.log(
  production
    ? "The materialised configuration passed local gates. Run the documented remote smoke before go-live."
    : "The code and production template passed. Supply production origins and run with --production before deployment.",
);
