import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { webEnvironmentErrors, webReleaseConfigErrors, pagesDeploymentInvocation } from "./cloudflare-release.mjs";

export const baseline = "c8f37ead059ffda6b68c2c182f8a9836e20bdb1e";
export const hotfixBranch = "release/ledgerly-google-auth";
const allowed = new Set([
  "apps/web/src/App.tsx", "apps/web/src/auth.ts", "apps/web/src/auth.test.ts",
  "apps/web/src/SignInMethodsDialog.tsx", "apps/web/src/styles.css",
  "apps/web/functions/neon-auth/[[path]].js", "apps/web/functions/neon-auth/complete-callback.js",
  "apps/web/functions/neon-auth/complete-callback.test.mjs", "apps/web/functions/neon-auth/neon-auth-proxy.test.mjs",
  "apps/web/playwright.auth.config.ts", "apps/web/e2e-auth/google-recovery.spec.ts",
  "scripts/google-auth-hotfix.mjs", "scripts/google-auth-hotfix.test.mjs",
  ".github/workflows/ledgerly-google-auth-hotfix.yml", "docs/google-auth-hotfix.md",
]);
export function hotfixErrors({ branch, sha, originSha, eventSha, status, ancestor, changed, liveSha }) {
  const errors = [];
  if (branch !== hotfixBranch) errors.push("Unexpected hotfix branch");
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== originSha) errors.push("Commit must match the exact tracked release branch");
  if (sha !== eventSha) errors.push("Commit must match the verified workflow event");
  if (status.trim()) errors.push("Release checkout must be clean");
  if (!ancestor) errors.push("Release must descend from the observed production baseline");
  if (!changed.length || changed.some(file => !allowed.has(file))) errors.push("Changes exceed the reviewed Google authentication scope");
  if (liveSha !== baseline && liveSha !== sha) errors.push("Production changed since the hotfix was prepared");
  return errors;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function git(...args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, env: process.env, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error("Release command failed");
}
async function currentDeployment() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !/^[a-f0-9]{32}$/i.test(account || "")) throw new Error("Cloudflare connection unavailable");
  const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + account + "/pages/projects/ledgerly-accounts", {
    headers: { authorization: "Bearer " + token }, redirect: "error", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Cannot verify current production deployment");
  const data = await response.json();
  if (!data.success || data.result?.name !== "ledgerly-accounts" || data.result?.production_branch !== "main")
    throw new Error("Production project does not match the approved destination");
  return data.result.canonical_deployment?.deployment_trigger?.metadata?.commit_hash;
}
async function main() {
  const branch = git("branch", "--show-current");
  const sha = git("rev-parse", "HEAD");
  const originSha = git("rev-parse", "origin/" + hotfixBranch);
  const status = git("status", "--porcelain=v1", "--untracked-files=normal");
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", baseline, sha], { cwd: root }).status === 0;
  const changed = git("diff", "--name-only", baseline, sha).split("\n").filter(Boolean);
  const liveSha = await currentDeployment();
  const config = JSON.parse(readFileSync(path.join(root, "apps/api/wrangler.production.jsonc"), "utf8"));
  const errors = [
    ...hotfixErrors({ branch, sha, originSha, eventSha: process.env.GITHUB_SHA, status, ancestor, changed, liveSha }),
    ...webReleaseConfigErrors(config), ...webEnvironmentErrors(process.env, config),
  ];
  if (errors.length) throw new Error(errors.join("; "));
  console.log("Google auth hotfix guards passed for " + sha);
  if (liveSha === sha) { console.log("This exact hotfix is already live"); return; }
  if (!process.env.npm_execpath) throw new Error("Run the release through npm exec");
  run([process.env.npm_execpath, "run", "build:production", "--workspace", "apps/web"]);
  const finalErrors = hotfixErrors({
    branch: git("branch", "--show-current"), sha: git("rev-parse", "HEAD"),
    originSha: git("rev-parse", "origin/" + hotfixBranch), eventSha: process.env.GITHUB_SHA,
    status: git("status", "--porcelain=v1", "--untracked-files=normal"),
    ancestor, changed, liveSha: await currentDeployment(),
  });
  if (finalErrors.length) throw new Error(finalErrors.join("; "));
  const invocation = pagesDeploymentInvocation(sha);
  run([path.join(root, "node_modules/wrangler/bin/wrangler.js"), ...invocation.args], invocation.cwd);
  if (await currentDeployment() !== sha) throw new Error("Cloudflare did not promote the expected hotfix");
  console.log("LIVE_GOOGLE_AUTH_HOTFIX=" + sha);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error("Google auth hotfix release failed:", error instanceof Error ? error.message : "Unknown error"); process.exitCode = 1; });
