const NEON_AUTH_BASE = "https://ep-wispy-thunder-zatp3scz.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth";
const UPSTREAM_SESSION_COOKIE = "__Secure-neon-auth.session_token";
const APP_SESSION_COOKIE = "ledgerly_session";

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
  const path = Array.isArray(context.params.path)
    ? context.params.path.join("/")
    : context.params.path || "";
  const upstreamUrl = new URL(`${NEON_AUTH_BASE}/${path}`);
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
      : context.request.body,
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
