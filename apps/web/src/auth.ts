import { createAuthClient } from "@neondatabase/neon-js/auth";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim() ?? "";
const progressPreview =
  import.meta.env.VITE_PM_PROGRESS_PREVIEW === "true" &&
  typeof window !== "undefined" &&
  window.location.hostname === "pm-002-progress.ledgerly-accounts.pages.dev";
export const demoMode =
  progressPreview ||
  (import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true");

export const authConfigured = demoMode || Boolean(authUrl);
const browserOrigin = typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin;
// Keep the browser session first-party in every environment. Production
// Pages proxies this path to Neon Auth and rewrites the session cookie onto
// the application origin; Vite provides the equivalent development proxy.
export const authTransportUrl = `${browserOrigin}/neon-auth`;
export const authClient = !demoMode && authUrl ? createAuthClient(authTransportUrl) : null;
const socialVerifierParameter = "neon_auth_session_verifier";
let socialCallbackCompletion: Promise<boolean> | null = null;

export function completeSocialCallback(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const current = new URL(window.location.href);
  const verifier = current.searchParams.get(socialVerifierParameter);
  if (!verifier) return socialCallbackCompletion ?? Promise.resolve(false);

  current.searchParams.delete(socialVerifierParameter);
  window.history.replaceState(window.history.state, "", current.href);
  socialCallbackCompletion = (async () => {
    const response = await fetch(`${authTransportUrl}/complete-callback`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verifier }),
    });
    const result = await response.json().catch(() => null) as { authenticated?: boolean } | null;
    if (!response.ok || result?.authenticated !== true) {
      throw new AuthRequiredError("Google sign-in could not establish a session. Try again.");
    }
    return true;
  })();
  return socialCallbackCompletion;
}

export function authFailureMessage(error: unknown, development = import.meta.env.DEV): string {
  const actionable = authActionErrorMessage(error);
  if (actionable) return actionable;
  if (error instanceof DOMException && error.name === "AbortError") return "The authentication request timed out. Check your connection and try again.";
  if (error instanceof TypeError) return development
    ? "The authentication request could not reach Neon Auth. Confirm VITE_NEON_AUTH_URL is set, restart Vite, and retry through the local /neon-auth proxy."
    : "The authentication service could not be reached. Check your connection and try again.";
  if (error && typeof error === "object") {
    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    if (code === "RATE_LIMITED" || code === "TOO_MANY_REQUESTS") return "Too many authentication attempts. Wait briefly and try again.";
  }
  return "Authentication could not be completed. Try again; if the problem continues, contact your administrator.";
}

export function authActionErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = "code" in error && typeof error.code === "string"
    ? error.code.toUpperCase()
    : "";
  const rawStatus = "status" in error ? error.status : 0;
  const status = typeof rawStatus === "number"
    ? rawStatus
    : typeof rawStatus === "string" && /^\d{3}$/.test(rawStatus)
      ? Number(rawStatus)
      : 0;
  const message = error instanceof Error
    ? error.message
    : "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  if (code === "ACCOUNT_NOT_LINKED" || code === "ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER") return socialSignInError(code);

  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_CREDENTIALS" || status === 401) {
    return "The email address or password is incorrect.";
  }
  if (
    code === "USER_ALREADY_EXISTS" ||
    code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
    /already exists|already registered/i.test(message)
  ) {
    return "An account already exists for this email address. Sign in instead.";
  }
  if (code === "EMAIL_NOT_VERIFIED" || /verify your email|email.*not verified/i.test(message)) {
    return "Verify your email address, then sign in again.";
  }
  if (code === "RATE_LIMITED" || code === "TOO_MANY_REQUESTS" || status === 429) {
    return "Too many authentication attempts. Wait briefly and try again.";
  }
  if (status >= 400 && status < 500 && message && !/origin/i.test(message)) {
    return message.slice(0, 240);
  }
  return "";
}

export function authFailureDiagnostic(error: unknown): Record<string, string> {
  if (!error || typeof error !== "object") return { type: typeof error };
  return {
    type: error.constructor?.name ?? "Error",
    ...(error instanceof Error && error.name ? { name: error.name } : {}),
    ...(error instanceof Error && error.message ? { message: error.message.slice(0, 300) } : {}),
    ...("code" in error && typeof error.code === "string" ? { code: error.code.slice(0, 100) } : {}),
    ...("status" in error && (typeof error.status === "string" || typeof error.status === "number")
      ? { status: String(error.status) }
      : {}),
  };
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};

export class AuthRequiredError extends Error {
  constructor(message = "Your session has expired. Sign in again to continue.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export async function freshAuthToken(): Promise<string> {
  if (demoMode) return "demo-mode";
  if (!authClient) throw new AuthRequiredError("Neon Auth is not configured.");
  // Neon Auth returns the API JWT on the authenticated session response.
  // Reading it explicitly avoids the beta client's token cache returning an
  // absent/stale value immediately after a successful sign-in.
  const session = await fetch(`${authTransportUrl}/get-session`, {
    credentials: "include",
    headers: { "x-force-fetch": "true" },
    cache: "no-store",
  });
  const token = session.headers.get("set-auth-jwt");
  if (!session.ok || !token) throw new AuthRequiredError();
  return token;
}

const socialErrorMessages: Record<string, string> = {
  account_not_linked: "This Google account is not connected to your existing account. Sign in with your email and password, then verify your email in Sign-in methods and try Google again. If you forgot your password, use Forgot your password.",
  account_already_linked_to_different_user: "This Google account is connected to another account. Choose the Google account with the same email as your current account.",
  email_doesnt_match: "Choose the Google account with the same email as your current account.",
  "email_doesn't_match": "Choose the Google account with the same email as your current account.",
  access_denied: "Google sign-in was cancelled. You can try again or sign in with your email and password.",
  state_not_found: "The Google sign-in request expired. Start again from this page.",
  state_mismatch: "The Google sign-in request could not be verified. Start again from this page.",
};

export function socialSignInError(code: string): string {
  const key = code.toLowerCase();
  return Object.hasOwn(socialErrorMessages, key) ? socialErrorMessages[key] :
    "Google sign-in could not be completed. Try again or sign in with your email and password.";
}

export function authRedirectError(search: string): string {
  const code = new URLSearchParams(search).get("error");
  return code ? socialSignInError(code) : "";
}

export function clearAuthRedirectError(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("error")) return;
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState(window.history.state, "", url.href);
}
