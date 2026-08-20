import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionConfigPath = path.join(root, "apps", "api", "wrangler.production.jsonc");
const pagesProject = "ledgerly-accounts";
const releaseBranch = "main";
const currentProductionWebOrigin = "https://ledgerly-accounts.pages.dev";
const currentWorkersDevApiOrigin = "https://uk-accounts-api-production.dennis-ohiggins.workers.dev";
const currentNeonAuthUrl =
  "https://ep-wispy-thunder-zatp3scz.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth";

export function isTemporaryWorkersDevProduction(config) {
  return config.name === "uk-accounts-api-production" &&
    config.workers_dev === true &&
    !config.routes?.length;
}

export function exactHttpsOrigin(value, name) {
  if (typeof value !== "string" || !value.trim()) return `${name} is required`;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== value ||
      url.username ||
      url.password
    ) return `${name} must be one exact HTTPS origin`;
  } catch {
    return `${name} must be one exact HTTPS origin`;
  }
  return undefined;
}

export function secureHttpsUrl(value, name) {
  if (typeof value !== "string" || !value.trim()) return `${name} is required`;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      value.endsWith("/")
    ) return `${name} must be a canonical HTTPS URL without credentials, query, fragment or trailing slash`;
  } catch {
    return `${name} must be a canonical HTTPS URL without credentials, query, fragment or trailing slash`;
  }
  return undefined;
}

export function releaseContextErrors({ status, branch, sha, originSha }) {
  const errors = [];
  if (status.trim()) errors.push("Git worktree is dirty; commit or remove every tracked and untracked change before release");
  if (!/^[0-9a-f]{40}$/.test(sha)) errors.push("HEAD is not an exact 40-character Git SHA");
  if (branch !== releaseBranch) errors.push(`Production releases must run from ${releaseBranch}, not ${branch || "a detached HEAD"}`);
  if (!originSha) errors.push("The origin/main tracking commit is unavailable");
  else if (sha !== originSha) errors.push("HEAD does not match the locally known origin/main commit");
  return errors;
}

export function productionConfigErrors(config) {
  const errors = [];
  if (config.name !== "uk-accounts-api-production") errors.push("Production Worker name is invalid");
  if (config.preview_urls !== false) errors.push("preview_urls must be false");
  const temporaryWorkersDev = isTemporaryWorkersDevProduction(config);
  const customDomain = config.workers_dev === false &&
    config.routes?.length === 1 &&
    config.routes[0]?.custom_domain === true;
  if (!temporaryWorkersDev && !customDomain)
    errors.push("Production must use one exact custom domain or the approved temporary workers.dev Worker");
  const routePattern = config.routes?.[0]?.pattern;
  if (customDomain && (typeof routePattern !== "string" || routePattern.includes("/") || routePattern.includes("*") || !routePattern.includes(".")))
    errors.push("The production route must be one exact hostname");
  if (config.r2_buckets?.length !== 1 || config.r2_buckets[0]?.bucket_name !== "uk-accounts-prod-artefacts")
    errors.push("Production must bind only uk-accounts-prod-artefacts");
  if (config.hyperdrive?.length !== 1 || !config.hyperdrive[0]?.id)
    errors.push("Exactly one reviewed production Hyperdrive binding is required");
  const webOriginError = exactHttpsOrigin(config.vars?.WEB_ORIGIN, "WEB_ORIGIN");
  if (webOriginError) errors.push(webOriginError);
  const authUrlError = secureHttpsUrl(config.vars?.NEON_AUTH_URL, "NEON_AUTH_URL");
  if (authUrlError) errors.push(authUrlError);
  if (temporaryWorkersDev && config.vars?.WEB_ORIGIN !== currentProductionWebOrigin)
    errors.push(`Temporary workers.dev production must use WEB_ORIGIN ${currentProductionWebOrigin}`);
  if (temporaryWorkersDev && config.vars?.NEON_AUTH_URL !== currentNeonAuthUrl)
    errors.push("Temporary workers.dev production must use the provisioned production auth service");
  if (/[<>]|PLACEHOLDER|REPLACE|\.example\b/i.test(JSON.stringify(config)))
    errors.push("Production config contains an unresolved placeholder");
  return errors;
}

export function webReleaseConfigErrors(config) {
  const errors = [];
  if (config.name !== "uk-accounts-api-production") errors.push("Production Worker name is invalid");
  if (config.preview_urls !== false) errors.push("preview_urls must be false");
  if (config.vars?.WEB_ORIGIN !== currentProductionWebOrigin)
    errors.push(`WEB_ORIGIN must be ${currentProductionWebOrigin}`);
  if (config.vars?.NEON_AUTH_URL !== currentNeonAuthUrl)
    errors.push("NEON_AUTH_URL must match the provisioned production auth service");
  if (/[<>]|PLACEHOLDER|REPLACE|\.example\b/i.test(JSON.stringify(config)))
    errors.push("Production config contains an unresolved placeholder");

  if (config.workers_dev !== true || config.routes?.length)
    errors.push("Web-only release must use the audited production workers.dev endpoint until API custom-domain promotion");
  return errors;
}

export function expectedWebApiOrigin(config) {
  if (isTemporaryWorkersDevProduction(config)) return currentWorkersDevApiOrigin;
  const route = config.routes?.[0];
  if (config.workers_dev === false && config.routes?.length === 1 && route?.custom_domain === true)
    return `https://${route.pattern}`;
  return undefined;
}

export function webEnvironmentErrors(environment, config) {
  const errors = [];
  for (const name of ["WEB_ORIGIN", "VITE_API_URL"]) {
    const error = exactHttpsOrigin(environment[name], name);
    if (error) errors.push(error);
  }
  const authUrlError = secureHttpsUrl(environment.VITE_NEON_AUTH_URL, "VITE_NEON_AUTH_URL");
  if (authUrlError) errors.push(authUrlError);
  if (environment.WEB_ORIGIN !== config.vars?.WEB_ORIGIN)
    errors.push("WEB_ORIGIN must match the API CORS origin");
  const expectedApiOrigin = expectedWebApiOrigin(config);
  if (environment.VITE_API_URL !== expectedApiOrigin)
    errors.push("VITE_API_URL must match the configured production Worker origin");
  if (environment.VITE_NEON_AUTH_URL !== config.vars?.NEON_AUTH_URL)
    errors.push("VITE_NEON_AUTH_URL must match the API Neon Auth URL");
  if (environment.VITE_DEMO_MODE !== "false") errors.push("VITE_DEMO_MODE must be exactly false");
  return errors;
}

function git(...args) {
  const windowsGit = "C:\\Program Files\\Git\\cmd\\git.exe";
  const executable = process.env.GIT_BINARY ||
    (process.platform === "win32" && existsSync(windowsGit) ? windowsGit : "git");
  return execFileSync(executable, args, { cwd: root, encoding: "utf8" }).trim();
}

function runNode(modulePath, args, cwd = root) {
  const result = spawnSync(process.execPath, [modulePath, ...args], {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runNpm(args) {
  if (process.env.npm_execpath) {
    runNode(process.env.npm_execpath, args);
    return;
  }
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(executable, args, { cwd: root, env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function fail(errors) {
  if (!errors.length) return;
  process.stderr.write(`Production release guard failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

function wrangler(args, cwd = root) {
  runNode(path.join(root, "node_modules", "wrangler", "bin", "wrangler.js"), args, cwd);
}

export function pagesDeploymentInvocation(sha) {
  return {
    cwd: path.join(root, "apps", "web"),
    args: [
      "pages", "deploy", "dist", "--project-name", pagesProject,
      "--branch", releaseBranch, "--commit-hash", sha,
      "--commit-message", `production release ${sha}`, "--commit-dirty=false",
    ],
  };
}

function main() {
  const target = process.argv[2];
  const checkOnly = process.argv.includes("--check-only");
  const dryRun = process.argv.includes("--dry-run");
  if (!new Set(["api", "web"]).has(target))
    throw new Error("Usage: node scripts/cloudflare-release.mjs <api|web> [--check-only|--dry-run]");

  const status = git("status", "--porcelain=v1", "--untracked-files=normal");
  const branch = git("branch", "--show-current");
  const sha = git("rev-parse", "HEAD");
  let originSha;
  try { originSha = git("rev-parse", "origin/main"); } catch { /* A fresh local-only repository has no tracking ref. */ }
  const config = JSON.parse(readFileSync(productionConfigPath, "utf8"));
  const errors = [
    ...releaseContextErrors({ status, branch, sha, originSha }),
    ...(target === "api" ? productionConfigErrors(config) : webReleaseConfigErrors(config)),
    ...(target === "web" ? webEnvironmentErrors(process.env, config) : []),
  ];
  fail(errors);

  process.stdout.write(`Release guard passed: target=${target} branch=${branch} gitSha=${sha}\n`);
  if (checkOnly) return;

  if (target === "api") {
    const args = [
      "deploy", "--config", "apps/api/wrangler.production.jsonc", "--strict",
      "--tag", `git-${sha}`, "--message", `production release ${sha}`,
    ];
    if (dryRun) args.push("--dry-run", "--outdir", "apps/api/.wrangler/production-dry-run");
    wrangler(args);
    return;
  }

  if (dryRun) throw new Error("Pages has no deployment dry-run; use web --check-only");
  runNpm(["run", "build:production", "--workspace", "apps/web"]);
  fail(releaseContextErrors({
    status: git("status", "--porcelain=v1", "--untracked-files=normal"), branch, sha, originSha,
  }));
  const deployment = pagesDeploymentInvocation(sha);
  wrangler(deployment.args, deployment.cwd);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
