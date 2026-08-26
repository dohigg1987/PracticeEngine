import { expect, test, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Showcase mode.*seeded data/)).toHaveCount(1);
}

async function openNav(page: Page) {
  const toggle = page.getByRole("button", { name: "Open practice navigation" });
  if (await toggle.isVisible()) await toggle.click();
}

test("practice collaboration uses an operational request grid", async ({ page }) => {
  await start(page);
  await openNav(page);
  await page.locator('button[value="collaboration"]').click();
  await expect(page.getByRole("heading", { name: "Client requests" })).toBeVisible();
  const grid = page.getByRole("grid", { name: "Client requests" });
  await expect(grid).toContainText("Confirm trustee details");
  await expect(grid).toContainText("Upload quarterly bank statements");
  await page.getByRole("tab", { name: "Messages" }).click();
  await expect(page.getByText("Trustee information")).toBeVisible();
});

test("client portal prioritises actions and reflows at 320 pixels", async ({ page }) => {
  await start(page);
  await openNav(page);
  await page.locator('button[value="client-portal"]').click();
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole("heading", { name: "Client portal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Actions required" })).toBeVisible();
  await page.getByRole("tab", { name: "Requests" }).click();
  await page.getByRole("button", { name: /Confirm trustee details/ }).click();
  await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
});
