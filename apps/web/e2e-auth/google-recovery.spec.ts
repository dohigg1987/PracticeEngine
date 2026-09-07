import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const testUser = { id: "11111111-1111-4111-8111-111111111111", name: "Existing account", email: "existing@example.test", emailVerified: false };
async function mockAuth(page: Page, options: { signedIn?: boolean; connected?: boolean; listFailure?: boolean; linkError?: string } = {}) {
  let signedIn = Boolean(options.signedIn);
  let connected = Boolean(options.connected);
  let listFailure = Boolean(options.listFailure);
  const links: Record<string, unknown>[] = [];
  const completions: unknown[] = [];
  await page.route("**/test-api/**", route => route.fulfill({ json: { items: [] } }));
  await page.route("**/neon-auth/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const session = signedIn ? {
      user: testUser,
      session: { id: "test-session", userId: testUser.id, token: "test-session-token", expiresAt: "2030-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    } : { user: null, session: null };
    if (path.endsWith("/get-session")) return route.fulfill({ json: session, headers: signedIn ? { "set-auth-jwt": "test-only-jwt" } : {} });
    if (path.endsWith("/sign-in/email")) {
      expect(route.request().postDataJSON().email).toBe(testUser.email);
      signedIn = true;
      return route.fulfill({ json: { user: testUser, token: "test-session-token", redirect: false } });
    }
    if (path.endsWith("/list-accounts")) {
      if (!signedIn) return route.fulfill({ status: 401, json: { code: "UNAUTHORIZED" } });
      if (listFailure) {
        listFailure = false;
        return route.fulfill({ status: 503, json: { message: "Temporarily unavailable" } });
      }
      return route.fulfill({ json: [{ id: "credential-account", providerId: "credential", accountId: testUser.id, userId: testUser.id }, ...(connected ? [{ id: "google-account", providerId: "google", accountId: "test-google-id", userId: testUser.id }] : [])] });
    }
    if (path.endsWith("/link-social")) {
      expect(signedIn).toBe(true);
      const body = route.request().postDataJSON();
      links.push(body);
      if (options.linkError) {
        const callback = new URL(String(body.errorCallbackURL));
        callback.searchParams.set("error", options.linkError);
        return route.fulfill({ json: { url: callback.href, redirect: true } });
      }
      connected = true;
      return route.fulfill({ json: { url: body.callbackURL, redirect: true } });
    }
    if (path.endsWith("/complete-callback")) {
      completions.push(route.request().postDataJSON());
      signedIn = true;
      connected = true;
      return route.fulfill({ json: { authenticated: true } });
    }
    return route.fulfill({ status: 404, json: { code: "UNEXPECTED_TEST_AUTH_ROUTE" } });
  });
  return { links, completions };
}

for (const width of [320, 390, 1440]) {
  test(`recovers account_not_linked through authenticated Google linking at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await mockAuth(page);
    await page.goto("/?error=account_not_linked&error_description=do-not-display");
    await expect(page.getByText(/This Google account is not connected/)).toBeVisible();
    await expect(page).not.toHaveURL(/error=/);
    await expect(page.getByText("do-not-display")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(calls.links).toHaveLength(0);
    await page.getByRole("textbox", { name: /^Email address/ }).fill(testUser.email);
    await page.getByLabel(/^Password/).fill("Example-password-for-test-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Sign-in methods" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Account: ${testUser.email}`)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Connect Google", exact: true })).toBeEnabled();
    const dimensions = await page.evaluate(() => ({ available: document.documentElement.clientWidth, actual: document.documentElement.scrollWidth }));
    expect(dimensions.actual).toBeLessThanOrEqual(dimensions.available + 1);
    const scan = await new AxeBuilder({ page }).exclude("[data-tabster-dummy]").analyze();
    expect(scan.violations).toEqual([]);
    await testInfo.attach(`google-link-${width}px`, { body: await page.screenshot(), contentType: "image/png" });
    await dialog.getByRole("button", { name: "Connect Google", exact: true }).click();
    await expect.poll(() => calls.links.length).toBe(1);
    expect(calls.links[0].provider).toBe("google");
    expect(calls.links[0].errorCallbackURL).toBe(calls.links[0].callbackURL);
    expect(new URL(String(calls.links[0].callbackURL)).searchParams.get("sign_in_methods")).toBe("1");
    await expect(page.getByText("Google is connected.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect Google", exact: true })).toHaveCount(0);
  });
}

test("account loading errors can retry without starting OAuth", async ({ page }) => {
  const calls = await mockAuth(page, { signedIn: true, listFailure: true });
  await page.goto("/?sign_in_methods=1");
  const dialog = page.getByRole("dialog", { name: "Sign-in methods" });
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Connect Google", exact: true })).toBeEnabled();
  expect(calls.links).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/sign_in_methods=/);
});

test("completes the returned verifier once before restoring the session", async ({ page }) => {
  const calls = await mockAuth(page);
  await page.goto("/?sign_in_methods=1&neon_auth_session_verifier=test-only-proof");
  await expect(page.getByText("Google is connected.", { exact: false })).toBeVisible();
  await expect(page).not.toHaveURL(/neon_auth_session_verifier/);
  expect(calls.completions).toEqual([{ verifier: "test-only-proof" }]);
});

test("unknown callback errors show a safe actionable message", async ({ page }) => {
  await mockAuth(page);
  await page.goto("/?error=constructor&error_description=do-not-display");
  await expect(page.getByText(/Google sign-in could not be completed/)).toBeVisible();
  await expect(page.getByText("do-not-display")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Forgot your password?" })).toBeVisible();
});

for (const [code, message] of [
  ["access_denied", "Google sign-in was cancelled"],
  ["email_doesn't_match", "Choose the Google account with the same email"],
]) {
  test(`a rejected Google connection remains recoverable: ${code}`, async ({ page }) => {
    const calls = await mockAuth(page, { signedIn: true, linkError: code });
    await page.goto("/?sign_in_methods=1");
    await page.getByRole("button", { name: "Connect Google", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Sign-in methods" });
    await expect(dialog.getByText(message, { exact: false })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Connect Google", exact: true })).toBeEnabled();
    await expect(page.getByText("Google is connected.", { exact: false })).toHaveCount(0);
    await expect(page).not.toHaveURL(/error=/);
    expect(calls.links).toHaveLength(1);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
  });
}
