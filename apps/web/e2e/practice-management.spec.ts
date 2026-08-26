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

test("CRM pipeline and onboarding stay operational at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await openNav(page);
  await page.locator('button[value="crm-prospects"]').click();
  await expect(page.getByRole("heading", { name: "Prospects", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "CRM prospects" })).toContainText("Cedar Advisory Group");
  await openNav(page);
  await page.locator('button[value="crm-opportunities"]').click();
  await expect(page.getByRole("table", { name: "CRM opportunities" })).toBeVisible();
  await page.getByRole("button", { name: "Finance function and annual accounts" }).click();
  await expect(page.getByRole("table", { name: "Opportunity proposed services" })).toBeVisible();
  await openNav(page);
  await page.locator('button[value="onboarding"]').click();
  await expect(page.getByRole("table", { name: "Onboarding work" })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, root: document.documentElement.scrollWidth }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
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

test("workflow detail exposes stages blockers and operational review points",async({page})=>{
  await start(page);await openNav(page);await page.locator('button[value="work"]').click();
  await page.getByRole("button",{name:/2026 Annual Accounts/}).click();
  await expect(page.getByRole("table",{name:"Operational workflow stages"})).toContainText("Partner review");
  await expect(page.getByRole("table",{name:"Work tasks"})).toContainText("Review");
  await expect(page.getByRole("table",{name:"Work operational reviews"})).toContainText("Confirm the operational delivery checklist");
});

test("review queue and recurrence operations provide practical controls",async({page})=>{
  await start(page);await openNav(page);await page.locator('button[value="work"]').click();
  await page.getByRole("tab",{name:"Review queue"}).click();await expect(page.getByRole("table",{name:"Practice review queue"})).toContainText("Review Partner");
  await page.getByRole("tab",{name:"Generation operations"}).click();await expect(page.getByRole("table",{name:"Recurrence execution history"})).toBeVisible();
  await page.getByRole("button",{name:"Dry run"}).click();await expect(page.getByRole("table",{name:"Recurrence execution history"})).toContainText("Dry Run");
});

test("automation settings use constrained table controls",async({page})=>{
  await start(page);await openNav(page);await page.getByRole("button",{name:"Administration",exact:true}).click();await page.locator('button[value="practice-settings"]').click();
  await page.getByRole("tab",{name:"Automation"}).click();const table=page.getByRole("table",{name:"Practice automation rules"});await expect(table).toContainText("Assign urgent work to service team");await expect(table).toContainText("Assign Team");
});
