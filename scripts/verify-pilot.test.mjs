import assert from "node:assert/strict";
import test from "node:test";
import { planBrowserJobs } from "./verify-pilot-plan.mjs";

test("pilot browser plan covers Chromium and Edge with isolated resources", () => {
  const jobs = planBrowserJobs({
    hasEdge: true,
    shardsPerBrowser: 2,
    totalWorkers: 4,
    artifactRoot: "pilot-artifacts",
    firstPort: 52000,
  });

  assert.deepEqual(
    jobs.map(({ browser, shard, workers }) => ({ browser, shard, workers })),
    [
      { browser: "chromium", shard: "1/2", workers: 1 },
      { browser: "chromium", shard: "2/2", workers: 1 },
      { browser: "edge", shard: "1/2", workers: 1 },
      { browser: "edge", shard: "2/2", workers: 1 },
    ],
  );
  assert.equal(new Set(jobs.map((job) => job.portBase)).size, jobs.length);
  assert.equal(new Set(jobs.map((job) => job.outputDir)).size, jobs.length);
  assert.equal(new Set(jobs.map((job) => job.htmlOutputDir)).size, jobs.length);
});

test("pilot browser plan keeps the requested total concurrency when Edge is absent", () => {
  const jobs = planBrowserJobs({
    hasEdge: false,
    shardsPerBrowser: 2,
    totalWorkers: 4,
    artifactRoot: "pilot-artifacts",
  });

  assert.deepEqual(jobs.map((job) => job.browser), ["chromium", "chromium"]);
  assert.equal(jobs.reduce((total, job) => total + job.workers, 0), 4);
});

test("pilot browser plan rejects a worker budget smaller than the job matrix", () => {
  assert.throws(
    () =>
      planBrowserJobs({
        hasEdge: true,
        shardsPerBrowser: 2,
        totalWorkers: 3,
        artifactRoot: "pilot-artifacts",
      }),
    /must cover all 4 browser shard jobs/,
  );
});
