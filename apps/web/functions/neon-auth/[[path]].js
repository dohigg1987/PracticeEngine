const PRODUCTION_NEON_AUTH_BASE = "https://ep-wispy-thunder-zatp3scz.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth";
const UPSTREAM_SESSION_COOKIE = "__Secure-neon-auth.session_token";
const APP_SESSION_COOKIE = "ledgerly_session";

function isExplicitDevelopment(environment) {
  const name = environment.ENVIRONMENT?.trim().toLowerCase();
  return name === "dev" || name === "development" ||
    environment.CF_PAGES_BRANCH === "environment/dev-integrated";
}

export function resolveNeonAuthBase(environment = {}) {
  const configured = environment.NEON_AUTH_URL?.trim();
  if (!configured) {
    if (isExplicitDevelopment(environment)) {
      throw new Error("NEON_AUTH_URL is required for the development Pages environment.");
    }
    return PRODUCTION_NEON_AUTH_BASE;
  }

  const url = new URL(configured);
  if (
    url.protocol !== "https:" || url.username || url.password || url.search ||
    url.hash || configured.endsWith("/")
  ) {
    throw new Error("NEON_AUTH_URL must be a canonical HTTPS URL.");
  }
  return configured;
}

function rewrittenCookie(cookie) {
  return cookie
    .replace(new RegExp(`^${UPSTREAM_SESSION_COOKIE}=`), `${APP_SESSION_COOKIE}=`)
    .replace(/;\s*Domain=[^;]+/gi, "")
    .replace(/;\s*Path=[^;]+/gi, "; Path=/neon-auth")
    .replace(/;\s*SameSite=[^;]+/gi, "; SameSite=Lax")
    .replace(/;\s*Partitioned/gi, "");
}

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  let authBase;
  try {
    authBase = resolveNeonAuthBase(context.env);
  } catch (error) {
    console.error("Neon Auth proxy configuration error", error);
    return new Response("Authentication proxy is not configured.", {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const path = Array.isArray(context.params.path)
    ? context.params.path.join("/")
    : context.params.path || "";
  const upstreamUrl = new URL(`${authBase}/${path}`);
  upstreamUrl.search = requestUrl.search;

  const headers = new Headers(context.request.headers);
  headers.delete("host");
  const browserCookies = headers.get("cookie");
  if (browserCookies) {
    headers.set(
      "cookie",
      browserCookies.replace(
        new RegExp(`(^|;\\s*)${APP_SESSION_COOKIE}=`, "g"),
        `$1${UPSTREAM_SESSION_COOKIE}=`,
      ),
    );
  }
  headers.set("origin", requestUrl.origin);
  headers.set("referer", `${requestUrl.origin}/`);

  const upstreamRequest = new Request(upstreamUrl, {
    method: context.request.method,
    headers,
    body: context.request.method === "GET" || context.request.method === "HEAD"
      ? undefined
      : await context.request.arrayBuffer(),
    redirect: "manual",
  });
  const upstream = await fetch(upstreamRequest);
  const responseHeaders = new Headers(upstream.headers);
  const cookies = typeof upstream.headers.getSetCookie === "function"
    ? upstream.headers.getSetCookie()
    : upstream.headers.get("set-cookie")
      ? [upstream.headers.get("set-cookie")]
      : [];
  responseHeaders.delete("set-cookie");
  for (const cookie of cookies) {
    if (cookie) responseHeaders.append("set-cookie", rewrittenCookie(cookie));
  }
  responseHeaders.delete("access-control-allow-origin");
  responseHeaders.delete("access-control-allow-credentials");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
