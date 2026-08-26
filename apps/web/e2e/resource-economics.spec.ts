import { expect, test, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Showcase mode.*seeded data/)).toBeVisible();
}

async function open(page: Page, value: string, heading: string) {
  const toggle = page.getByRole("button", { name: "Open practice navigation" });
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(`button[value="${value}"]`).click();
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
}

test("resources, capacity and allocation support planning decisions", async ({ page }) => {
  await start(page);
  await open(page, "resources", "Resources");
  await expect(page.getByRole("grid", { name: "Practice resources" })).toContainText("Demo Partner");
  await expect(page.getByRole("grid", { name: "Practice resources" })).toContainText("83%");

  await open(page, "capacity", "Capacity");
  const capacity = page.getByRole("table", { name: "Resource capacity by period" });
  await expect(capacity).toContainText("Over capacity by 2.5h");
  await expect(capacity).toContainText("forecast");

  await open(page, "allocation", "Work allocation");
  const allocation = page.getByRole("table", { name: "Upcoming work allocation" });
  await expect(allocation).toContainText("2026 Annual Accounts");
  await page.getByRole("combobox", { name: "Resource for Q3 VAT Return" }).selectOption("member-reviewer");
  await page.getByRole("row", { name: /Q3 VAT Return/ }).getByRole("button", { name: "Assign" }).click();
  await expect(page.getByRole("row", { name: /Q3 VAT Return/ })).toContainText("Review Manager");
});

test("time capture and economics preserve known and unavailable values", async ({ page }) => {
  await start(page);
  await open(page, "time", "Time");
  await page.getByRole("combobox", { name: "Resource" }).selectOption("member-demo");
  await page.getByRole("combobox", { name: "Work item" }).selectOption("work-accounts-2026");
  await page.getByRole("spinbutton", { name: "Duration (hours)" }).fill("1.5");
  await page.getByRole("textbox", { name: "Narrative" }).fill("Prepared supporting schedules");
  await page.getByRole("button", { name: "Add time" }).click();
  await expect(page.getByRole("table", { name: "Time entries" })).toContainText("1.5h");

  await open(page, "portfolio", "Portfolio economics");
  const portfolio = page.getByRole("table", { name: "Client portfolio economics" });
  await expect(portfolio).toContainText("£5,200");
  await expect(portfolio).toContainText("Unavailable");

  await open(page, "management", "Practice overview");
  await expect(page.getByText("Economic exceptions")).toBeVisible();
  await expect(page.getByText("No reliable billing source")).toBeVisible();
});

test("resource planning remains usable in forced-colors mode", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await start(page);
  await open(page, "capacity", "Capacity");
  await expect.poll(() => page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  const firstControl = page.locator("main input:visible").first();
  await firstControl.focus();
  await expect(firstControl).toBeFocused();
  await expect.poll(() => firstControl.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport + 1);
});
