import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { planBrowserBatches, planBrowserJobs } from "./verify-pilot-plan.mjs";

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
const edgeInstalled = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].some(existsSync);

function positiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

async function runBrowserMatrix() {
  const shardsPerBrowser = positiveInteger(
    process.env.PLAYWRIGHT_SHARDS_PER_BROWSER,
    2,
    "PLAYWRIGHT_SHARDS_PER_BROWSER",
  );
  const totalWorkers = positiveInteger(
    process.env.PLAYWRIGHT_WORKERS,
    4,
    "PLAYWRIGHT_WORKERS",
  );
  const jobs = planBrowserJobs({
    hasEdge: edgeInstalled,
    shardsPerBrowser,
    totalWorkers,
    artifactRoot: fromRoot("apps/web/test-results/pilot"),
  });
  const jobConcurrency = positiveInteger(
    process.env.PLAYWRIGHT_BROWSER_JOB_CONCURRENCY,
    Math.min(2, jobs.length),
    "PLAYWRIGHT_BROWSER_JOB_CONCURRENCY",
  );
  const jobTimeoutMs = positiveInteger(
    process.env.PLAYWRIGHT_BROWSER_JOB_TIMEOUT_MS,
    30 * 60 * 1000,
    "PLAYWRIGHT_BROWSER_JOB_TIMEOUT_MS",
  );
  const batches = planBrowserBatches(jobs, jobConcurrency);

  console.log(
    `Running ${jobs.length} isolated Playwright jobs in ${batches.length} batch(es) ` +
      `(${shardsPerBrowser} shard(s) per browser, ${totalWorkers} total worker budget, ` +
      `${jobConcurrency} concurrent job(s), ${Math.round(jobTimeoutMs / 60_000)} minute watchdog).`,
  );
  const results = [];
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`--- browser batch ${batchIndex + 1}/${batches.length}: ${batch.map((job) => job.id).join(", ")} ---`);
    const batchResults = await Promise.all(
      batch.map((job) =>
      new Promise((resolveJob) => {
        console.log(`--- ${job.id}: port ${job.portBase}, ${job.workers} worker(s) ---`);
        const jobStarted = Date.now();
        const child = spawn(
          process.execPath,
          [
            fromRoot("node_modules/@playwright/test/cli.js"),
            "test",
            `--project=${job.browser}`,
            `--shard=${job.shard}`,
          ],
          {
            cwd: fromRoot("apps/web"),
            stdio: "inherit",
            shell: false,
            env: {
              ...process.env,
              CI: process.env.CI || "1",
              PLAYWRIGHT_WORKERS: String(job.workers),
              PLAYWRIGHT_PORT_BASE: String(job.portBase),
              PLAYWRIGHT_OUTPUT_DIR: job.outputDir,
              PLAYWRIGHT_HTML_OUTPUT_DIR: job.htmlOutputDir,
            },
            detached: process.platform !== "win32",
            windowsHide: true,
          },
        );
        let spawnError;
        let timedOut = false;
        const watchdog = setTimeout(() => {
          timedOut = true;
          console.error(`--- ${job.id}: watchdog expired after ${Math.round(jobTimeoutMs / 60_000)} minutes; terminating process tree ---`);
          if (!child.pid) return;
          if (process.platform === "win32") {
            spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
              stdio: "ignore",
              windowsHide: true,
            });
          } else {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }
        }, jobTimeoutMs);
        child.once("error", (error) => {
          spawnError = error;
        });
        child.once("close", (status) => {
          clearTimeout(watchdog);
          resolveJob({
            id: job.id,
            browser: job.browser,
            shard: job.shard,
            seconds: Number(((Date.now() - jobStarted) / 1000).toFixed(1)),
            status: timedOut ? 124 : status ?? 1,
            error: timedOut ? "browser job watchdog expired" : spawnError?.message,
          });
        });
      }),
      ),
    );
    results.push(...batchResults);
  }

  for (const result of results) {
    console.log(
      `--- ${result.id}: ${result.status === 0 ? "passed" : "failed"} in ${result.seconds.toFixed(1)}s ---`,
    );
    if (result.error) console.error(result.error);
  }
  return { results, jobConcurrency, jobTimeoutMs };
}

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
  ...(skipE2e ? [] : [["Controlled-pilot browser journeys", null, null]]),
  ...(production
    ? [["Materialised web security headers", fromRoot("apps/web"), ["scripts/security-headers.mjs"]]]
    : []),
  ["Production web build", fromRoot("apps/web"), [fromRoot("node_modules/vite/bin/vite.js"), "build"]],
];

for (const [label, cwd, args] of checks) {
  console.log(`\n=== ${label} ===`);
  const suiteStarted=Date.now();
  if (label === "Controlled-pilot browser journeys") {
    const browserMatrix = await runBrowserMatrix();
    const browserJobs = browserMatrix.results;
    const seconds=Number(((Date.now()-suiteStarted)/1000).toFixed(1));
    timings.push({label,seconds,jobs:browserJobs,jobConcurrency:browserMatrix.jobConcurrency,jobTimeoutMs:browserMatrix.jobTimeoutMs});
    if (browserJobs.some((job) => job.status !== 0)) {
      console.error(`Pilot verification stopped at: ${label}`);
      process.exit(1);
    }
    console.log(`--- ${label}: ${seconds.toFixed(1)}s ---`);
    continue;
  }
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
