import { createAuthClient } from "@neondatabase/neon-js/auth";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim() ?? "";
export const demoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";

export const authConfigured = demoMode || Boolean(authUrl);
const browserOrigin = typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin;
export const authTransportUrl = import.meta.env.DEV
  ? `${browserOrigin}/neon-auth`
  : authUrl;
export const authClient = !demoMode && authUrl ? createAuthClient(authTransportUrl) : null;

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
  const result = await authClient.token();
  if (result.error || !result.data?.token) throw new AuthRequiredError();
  return result.data.token;
}
