import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const unsafeHost =
  /(^localhost$)|(^127\.)|(^0\.)|(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2\d|3[01])\.)|(^\[?::1\]?$)|(^example\.)|(\.example$)|(\.invalid$)|(\.test$)/i;
const placeholder = /[<>{}*]|your[-_. ]|placeholder|change[-_. ]?me/i;

export function productionOrigin(name, value, { web = false } = {}) {
  const input = value?.trim();
  if (!input) throw new Error(`${name} is required.`);
  if (placeholder.test(input))
    throw new Error(`${name} contains a placeholder or wildcard.`);
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  if (url.username || url.password)
    throw new Error(`${name} must not contain credentials.`);
  if (url.search || url.hash)
    throw new Error(`${name} must not contain a query or fragment.`);
  if (unsafeHost.test(url.hostname))
    throw new Error(`${name} must use a production hostname.`);
  if (web && url.pathname !== "/")
    throw new Error(`${name} must be an origin without a path.`);
  return url.origin;
}

export function securityHeaders({ webUrl, apiUrl, authUrl }) {
  const webOrigin = productionOrigin("WEB_ORIGIN", webUrl, { web: true });
  const apiOrigin = productionOrigin("VITE_API_URL", apiUrl);
  const authOrigin = productionOrigin("VITE_NEON_AUTH_URL", authUrl);
  const connections = [...new Set([apiOrigin, authOrigin])]
    .filter((origin) => origin !== webOrigin)
    .join(" ");
  const connectSrc = ["'self'", connections].filter(Boolean).join(" ");
  if (connectSrc.includes("*"))
    throw new Error("connect-src must not contain a wildcard.");

  return `/*
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src ${connectSrc}; worker-src 'self' blob:
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache
`;
}

export async function writeSecurityHeaders(environment = process.env) {
  const contents = securityHeaders({
    webUrl: environment.WEB_ORIGIN,
    apiUrl: environment.VITE_API_URL,
    authUrl: environment.VITE_NEON_AUTH_URL,
  });
  const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
  await mkdir(publicDirectory, { recursive: true });
  const output = fileURLToPath(new URL("../public/_headers", import.meta.url));
  await writeFile(output, contents, "utf8");
  return output;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const contents = securityHeaders({
      webUrl: process.env.WEB_ORIGIN,
      apiUrl: process.env.VITE_API_URL,
      authUrl: process.env.VITE_NEON_AUTH_URL,
    });
    if (process.argv.includes("--check")) {
      process.stdout.write("Security header inputs are valid.\n");
    } else {
      const output = await writeSecurityHeaders();
      process.stdout.write(`Generated ${output}\n`);
    }
    if (contents.includes("connect-src *")) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
