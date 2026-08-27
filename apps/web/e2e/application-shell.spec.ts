import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

async function openApps(page: Page) {
  await page.getByRole("button", { name: "Open PracticeEngine application launcher" }).click();
}

test("suite branding and launcher expose only entitled applications", async ({ page }) => {
  await page.goto("/practice/home");
  await expect(page.getByRole("button", { name: "Open PracticeEngine application launcher" })).toBeVisible();
  await expect(page).toHaveTitle("Practice Management · PracticeEngine");
  await openApps(page);
  await expect(page.getByRole("menuitem", { name: /Practice Management/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Ledgerly/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /QuoteBench/ })).toHaveCount(0);
});

test("application switching changes navigation and preserves practice context", async ({ page }) => {
  await page.goto("/practice/home");
  await expect(page.getByRole("complementary").getByText("Northstar Accounts Demo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resources", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Trial balance", exact: true })).toHaveCount(0);

  await openApps(page);
  await page.getByRole("menuitem", { name: /Ledgerly/ }).click();
  await expect(page).toHaveURL(/\/ledgerly\/overview$/);
  await expect(page.getByRole("complementary").getByText("Northstar Accounts Demo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Trial balance", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resources", exact: true })).toHaveCount(0);
});

test("contextual Ledgerly switch retains canonical client and linked engagement", async ({ page }) => {
  await page.goto("/practice/work");
  await page.getByRole("button", { name: /2026 Annual Accounts/ }).click();
  await page.getByRole("button", { name: "Open in Ledgerly" }).click();
  await expect(page).toHaveURL(/\/ledgerly\/overview\?client=demo-org&engagement=demo-engagement$/);
  await expect(page.getByRole("heading", { name: "Northstar Community Foundation" })).toBeVisible();
});

test("contextual Ledgerly deep links survive refresh and browser history", async ({ page }) => {
  const deepLink = "/ledgerly/overview?client=demo-org-2&engagement=demo-company-engagement";
  await page.goto(deepLink);
  await expect(page.getByLabel("Engagement", { exact: true })).toHaveValue("demo-company-engagement");
  await expect(page.getByRole("heading", { name: "Harbour Trading Ltd" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${deepLink.replace(/[?]/g, "\\?")}$`));
  await expect(page.getByLabel("Engagement", { exact: true })).toHaveValue("demo-company-engagement");
  await expect(page.getByRole("heading", { name: "Harbour Trading Ltd" })).toBeVisible();

  await openApps(page);
  await page.getByRole("menuitem", { name: /Practice Management/ }).click();
  await expect(page).toHaveURL(/\/practice\/home$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${deepLink.replace(/[?]/g, "\\?")}$`));
  await expect(page.getByLabel("Engagement", { exact: true })).toHaveValue("demo-company-engagement");
  await expect(page.getByRole("heading", { name: "Harbour Trading Ltd" })).toBeVisible();
});

test("invalid or mismatched Ledgerly context is discarded", async ({ page }) => {
  await page.goto("/ledgerly/overview?client=demo-org&engagement=missing-engagement");
  await expect(page).toHaveURL(/\/ledgerly\/overview$/);
  await expect(page.getByLabel("Engagement", { exact: true })).toHaveValue("demo-engagement");
  await expect(page.getByRole("heading", { name: "Northstar Community Foundation" })).toBeVisible();

  await page.goto("/ledgerly/overview?client=demo-org-2&engagement=demo-engagement");
  await expect(page).toHaveURL(/\/ledgerly\/overview$/);
  await expect(page.getByLabel("Engagement", { exact: true })).toHaveValue("demo-engagement");
  await expect(page.getByRole("heading", { name: "Northstar Community Foundation" })).toBeVisible();
});

test("legacy routes redirect and unlicensed direct routes fail closed", async ({ page }) => {
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/practice\/clients$/);
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();

  await page.goto("/quotebench");
  await expect(page.getByRole("heading", { name: "QuoteBench is not available" })).toBeVisible();
});

test("global settings are outside application navigation", async ({ page }) => {
  await page.goto("/settings/organisation");
  await expect(page.getByText("PracticeEngine settings", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "PracticeEngine global settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Service catalogue", exact: true })).toHaveCount(0);
});
