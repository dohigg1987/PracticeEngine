import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: vi.fn(), getSession: vi.fn() }));
vi.mock("@neondatabase/neon-js/auth", () => ({
  createAuthClient: vi.fn(() => ({ token: mocks.token, getSession: mocks.getSession })),
}));

describe("Neon Auth session boundary", () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv("VITE_NEON_AUTH_URL", "https://auth.example.test/neondb/auth"); mocks.token.mockReset(); mocks.getSession.mockReset(); vi.unstubAllGlobals(); });

  it("returns the current JWT instead of caching an earlier token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "set-auth-jwt": "jwt-one" } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "set-auth-jwt": "jwt-two" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { authTransportUrl, freshAuthToken } = await import("./auth");
    expect(authTransportUrl).toMatch(/^http:\/\/127\.0\.0\.1(?::\d+)?\/neon-auth$/);
    await expect(freshAuthToken()).resolves.toBe("jwt-one");
    await expect(freshAuthToken()).resolves.toBe("jwt-two");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/neon-auth\/get-session$/), expect.objectContaining({ credentials: "include" }));
  });

  it("diagnoses local network failures without reflecting sensitive exception text", async () => {
    const { authFailureMessage } = await import("./auth");
    const message = authFailureMessage(new TypeError("fetch failed for https://secret.example/?token=secret"), true);
    expect(message).toContain("/neon-auth proxy");
    expect(message).not.toContain("secret.example");
    expect(message).not.toContain("token=secret");
    expect(authFailureMessage(new TypeError("failed"), false)).not.toContain("VITE_NEON_AUTH_URL");
  });

  it("surfaces actionable Neon Auth failures instead of an administrator error", async () => {
    const { authFailureMessage } = await import("./auth");
    expect(authFailureMessage(Object.assign(new Error("Invalid email or password"), {
      code: "INVALID_EMAIL_OR_PASSWORD",
      status: 401,
    }), false)).toBe("The email address or password is incorrect.");
    expect(authFailureMessage({
      code: "invalid_credentials",
      status: "401",
      message: "Invalid email or password",
    }, false)).toBe("The email address or password is incorrect.");
    expect(authFailureMessage(Object.assign(new Error("User already exists"), {
      code: "USER_ALREADY_EXISTS",
      status: 422,
    }), false)).toBe("An account already exists for this email address. Sign in instead.");
  });

  it("turns an expired or missing token into an authentication-required error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const { AuthRequiredError, freshAuthToken } = await import("./auth");
    await expect(freshAuthToken()).rejects.toBeInstanceOf(AuthRequiredError);
  });
});
