import { expect, test, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Showcase mode.*seeded data/)).toHaveCount(1);
}

async function openNav(page: Page) {
  const toggle = page.getByRole("button", { name: "Open practice navigation" });
  if (await toggle.isVisible()) await toggle.click();
}

test("practice work supports operational filtering", async ({ page }) => {
  await start(page);
  await openNav(page);
  await page.locator('button[value="work"]').click();
  await expect(page.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Practice work" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search" }).fill("Annual accounts");
  await expect(page.getByText("1 work item", { exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /Northstar.*Annual accounts.*2026 Annual Accounts/ })).toBeVisible();
});

test("practice settings exposes service and template configuration at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await start(page);
  await openNav(page);
  await page.getByRole("button", { name: "Administration", exact: true }).click();
  await page.locator('button[value="practice-settings"]').click();
  await expect(page.getByRole("heading", { name: "Practice Management settings" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Service catalogue" })).toBeVisible();
  await page.getByRole("tab", { name: "Work templates" }).click();
  await expect(page.getByRole("table", { name: "Work templates" })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
});

test("recurring work exposes the operational schedule table", async ({ page }) => {
  await start(page);
  await openNav(page);
  await page.locator('button[value="work"]').click();
  await page.getByRole("tab", { name: "Recurring work" }).click();
  await expect(page.getByRole("heading", { name: "Recurring work" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Recurring work schedules" })).toContainText("Northstar Community Foundation");
  await expect(page.getByRole("table", { name: "Recurring work schedules" })).toContainText("Annually");
});
