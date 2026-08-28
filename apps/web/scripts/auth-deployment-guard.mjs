import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function authDeploymentErrors({ routes, functionFiles, clientSource }) {
  const errors = [];
  if (!routes?.include?.includes("/neon-auth/*")) errors.push("_routes.json must include /neon-auth/*");
  if (!functionFiles.includes("[[path]].js")) errors.push("Neon Auth proxy Function is missing");
  if (!functionFiles.includes("complete-callback.js")) errors.push("OAuth verifier completion Function is missing");
  if (!clientSource.includes("completeSocialCallback")) errors.push("Client verifier completion is missing");
  if (!clientSource.includes("/complete-callback")) errors.push("Client completion route is missing");
  return errors;
}

export function expectedHostedAuthHost(authUrl) {
  const url = new URL(authUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Hosted Auth URL must be a canonical HTTPS URL");
  }
  return url.host;
}

export function verifyAuthDeployment(root = webRoot) {
  const routesPath = path.join(root, "dist", "_routes.json");
  const functionsPath = path.join(root, "functions", "neon-auth");
  const clientPath = path.join(root, "src", "auth.ts");
  const routes = existsSync(routesPath) ? JSON.parse(readFileSync(routesPath, "utf8")) : null;
  const functionFiles = ["[[path]].js", "complete-callback.js"].filter((name) =>
    existsSync(path.join(functionsPath, name)));
  const clientSource = existsSync(clientPath) ? readFileSync(clientPath, "utf8") : "";
  const errors = authDeploymentErrors({ routes, functionFiles, clientSource });
  if (errors.length) throw new Error(`Auth deployment guard failed:\n- ${errors.join("\n- ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyAuthDeployment();
  process.stdout.write("Auth deployment guard passed.\n");
}
