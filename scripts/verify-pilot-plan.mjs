import { join } from "node:path";

export function planBrowserJobs({
  hasEdge,
  shardsPerBrowser = 2,
  totalWorkers = 4,
  artifactRoot,
  firstPort = 51873,
}) {
  const browsers = hasEdge ? ["chromium", "edge"] : ["chromium"];
  const jobs = browsers.flatMap((browser) =>
    Array.from({ length: shardsPerBrowser }, (_, shardIndex) => ({
      browser,
      shard: `${shardIndex + 1}/${shardsPerBrowser}`,
    })),
  );
  if (totalWorkers < jobs.length) {
    throw new Error(
      `PLAYWRIGHT_WORKERS (${totalWorkers}) must cover all ${jobs.length} browser shard jobs.`,
    );
  }
  const workersPerJob = Math.max(1, Math.floor(totalWorkers / jobs.length));
  return jobs.map((job, index) => {
    const id = `${job.browser}-${job.shard.replace("/", "-of-")}`;
    return {
      ...job,
      id,
      portBase: firstPort + index * 10,
      workers: workersPerJob,
      outputDir: join(artifactRoot, id, "test-results"),
      htmlOutputDir: join(artifactRoot, id, "html-report"),
    };
  });
}

export function planBrowserBatches(jobs, maxConcurrentJobs = 2) {
  if (!Number.isSafeInteger(maxConcurrentJobs) || maxConcurrentJobs < 1) {
    throw new Error("Browser job concurrency must be a positive integer.");
  }
  const batches = [];
  for (let index = 0; index < jobs.length; index += maxConcurrentJobs) {
    batches.push(jobs.slice(index, index + maxConcurrentJobs));
  }
  return batches;
}
