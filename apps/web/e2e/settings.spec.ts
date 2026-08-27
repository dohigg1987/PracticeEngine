import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

const globalRoutes = [
  ["/settings/organisation", "Organisation"],
  ["/settings/users", "Users"],
  ["/settings/teams", "Teams"],
  ["/settings/security", "Security"],
  ["/settings/branding", "Branding"],
  ["/settings/integrations", "Imports and integrations"],
  ["/settings/subscription", "Subscription"],
  ["/settings/apps-entitlements", "Apps & entitlements"],
  ["/settings/notifications", "Notifications"],
] as const;

const practiceRoutes = [
  ["/practice/settings/services", "Service catalogue"],
  ["/practice/settings/work-templates", "Work templates"],
  ["/practice/settings/automation", "Workflow & automation"],
  ["/practice/settings/resources", "Resources & economics"],
  ["/practice/settings/collaboration", "Portal & collaboration"],
] as const;

const ledgerlyRoutes = [
  ["/ledgerly/settings/accounting", "Accounting configuration"],
  ["/ledgerly/settings/accounts", "Accounts & filing"],
] as const;

async function expectRoute(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
}

for (const [path, heading] of globalRoutes) {
  test(`global Settings deep link ${path} renders ${heading}`, async ({ page }) => {
    await expectRoute(page, path, heading);
    if (path === "/settings/notifications") await expect(page.getByText(/User delivery preferences are not implemented/)).toBeVisible();
  });
}

for (const [path, heading] of practiceRoutes) {
  test(`Practice Settings deep link ${path} renders ${heading}`, async ({ page }) => {
    await expectRoute(page, path, heading);
    if (path.endsWith("/collaboration")) await expect(page.getByText(/no practice-wide collaboration settings contract is implemented/i)).toBeVisible();
  });
}

for (const [path, heading] of ledgerlyRoutes) {
  test(`Ledgerly Settings deep link ${path} renders ${heading}`, async ({ page }) => {
    await expectRoute(page, path, heading);
    await expect(page.getByText(/no application-wide controls are implemented/i)).toBeVisible();
  });
}

test("Settings refresh and browser Back and Forward preserve the canonical section", async ({ page }) => {
  await expectRoute(page, "/practice/settings/work-templates", "Work templates");
  await page.reload();
  await expect(page).toHaveURL(/\/practice\/settings\/work-templates$/);
  await expect(page.getByRole("heading", { name: "Work templates", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Workflow & automation", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/settings\/automation$/);
  await expect(page.getByRole("heading", { name: "Workflow & automation", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/practice\/settings\/work-templates$/);
  await expect(page.getByRole("heading", { name: "Work templates", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/practice\/settings\/automation$/);
});

test("existing team, entitlement and resource configuration is exposed", async ({ page }) => {
  await expectRoute(page, "/settings/teams", "Teams");
  await expect(page.getByRole("table", { name: "Workspace teams" })).toContainText("Accounts");
  await page.getByRole("textbox", { name: "Team name" }).fill("Tax delivery");
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByRole("table", { name: "Workspace teams" })).toContainText("Tax delivery");

  await expectRoute(page, "/settings/apps-entitlements", "Apps & entitlements");
  const entitlements = page.getByRole("table", { name: "Application entitlements" });
  await expect(entitlements).toContainText("Practice Management");
  await expect(entitlements).toContainText("Ledgerly");
  await expect(entitlements).toContainText("QuoteBench");

  await expectRoute(page, "/practice/settings/resources", "Resources & economics");
  const resource = page.getByRole("row").filter({ hasText: "Demo Partner" });
  await resource.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Job title" }).fill("Senior Partner");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Resource settings saved.")).toBeVisible();
  await expect(resource).toContainText("Senior Partner");
});

test("Settings remain operable by keyboard at a narrow viewport and pass axe", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await expectRoute(page, "/settings/security", "Security");
  const toggle = page.getByRole("button", { name: "Open application navigation" });
  await toggle.click();
  const branding = page.getByRole("button", { name: "Branding", exact: true });
  await branding.focus();
  await expect(branding).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\/branding$/);
  await expect(page.getByRole("heading", { name: "Branding", exact: true })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, root: document.documentElement.scrollWidth }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
