import { onRequest as proxyNeonAuth } from "./[[path]].js";

const APP_SESSION_COOKIE = "ledgerly_session";
const VERIFIER_PARAMETER = "neon_auth_session_verifier";

function json(authenticated, status, cookies = []) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify({ authenticated }), { status, headers });
}

export async function onRequestPost(context) {
  let verifier = "";
  try {
    verifier = String((await context.request.json())?.verifier || "");
  } catch { /* Invalid JSON is handled by the validation below. */ }
  if (!verifier || verifier.length > 4096 || /[\u0000-\u001f]/.test(verifier)) {
    return json(false, 400);
  }

  const incoming = new URL(context.request.url);
  const completion = new URL("/neon-auth/get-session", incoming.origin);
  completion.searchParams.set(VERIFIER_PARAMETER, verifier);
  const proxied = await proxyNeonAuth({
    ...context,
    request: new Request(completion, {
      method: "GET",
      headers: context.request.headers,
    }),
    params: { path: ["get-session"] },
  });
  await proxied.arrayBuffer();
  const cookies = typeof proxied.headers.getSetCookie === "function"
    ? proxied.headers.getSetCookie()
    : proxied.headers.get("set-cookie")
      ? [proxied.headers.get("set-cookie")]
      : [];
  const sessionIssued = cookies.some((cookie) =>
    cookie?.startsWith(`${APP_SESSION_COOKIE}=`) &&
    !cookie.startsWith(`${APP_SESSION_COOKIE}=;`),
  );
  return json(proxied.ok && sessionIssued, proxied.ok && sessionIssued ? 200 : 401, cookies);
}

export function onRequest() {
  return json(false, 405);
}
