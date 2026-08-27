import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe.configure({ mode: "serial" });

test("opportunity detail is directly addressable and follows browser history", async ({ page }) => {
  await page.goto("/practice/crm/opportunities/opportunity-1");
  await expect(
    page.getByRole("heading", { name: "Finance function and annual accounts" }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/practice\/crm\/opportunities\/opportunity-1$/);
  await expect(
    page.getByRole("heading", { name: "Finance function and annual accounts" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back to opportunities" }).click();
  await expect(page).toHaveURL(/\/practice\/crm\/opportunities$/);
  await expect(page.getByRole("grid", { name: "CRM opportunities" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/practice\/crm\/opportunities\/opportunity-1$/);
  await expect(
    page.getByRole("heading", { name: "Finance function and annual accounts" }),
  ).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/practice\/crm\/opportunities$/);
  await expect(page.getByRole("grid", { name: "CRM opportunities" })).toBeVisible();
});

test("prospect context opens the canonical create route with the prospect retained", async ({ page }) => {
  await page.goto("/practice/crm/prospects/prospect-1");
  await expect(page.getByRole("heading", { name: "Cedar Advisory Group" })).toBeVisible();

  await page.getByRole("button", { name: "Create opportunity" }).click();
  await expect(page).toHaveURL(
    /\/practice\/crm\/opportunities\/new\?prospect=prospect-1$/,
  );
  await expect(page.getByLabel("Prospect")).toHaveValue("prospect-1");
});

test("opportunity list supports search, stage, owner and lifecycle recovery", async ({ page }) => {
  await page.goto("/practice/crm/opportunities");
  await expect(page.getByRole("grid", { name: "CRM opportunities" })).toBeVisible();
  const filters = page.getByLabel("Opportunity filters");
  await page.getByRole("searchbox", { name: "Search", exact: true }).fill("no matching relationship");
  await expect(page.getByRole("heading", { name: "No matching opportunities" })).toBeVisible();
  await filters.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("button", { name: "Finance function and annual accounts" })).toBeVisible();
  await page.getByLabel("Stage").selectOption("proposal");
  await page.getByLabel("Owner or team").selectOption("unassigned");
  await expect(page.getByRole("heading", { name: "No matching opportunities" })).toBeVisible();
  await page.getByLabel("Lifecycle").selectOption("all");
  await filters.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("columnheader", { name: "Expected close" }).click();
  await expect(page.getByText("1 opportunity")).toBeVisible();
});

test("contextual create keeps known prospect and persists complete commercial fields", async ({ page }) => {
  await page.goto("/practice/crm/opportunities/new?prospect=prospect-1");
  await page.getByLabel("Opportunity name").fill("Cedar VAT and advisory expansion");
  await page.getByLabel("Owner").selectOption("member-reviewer");
  await page.getByLabel("Team").selectOption("team-advisory");
  await page.getByLabel("Expected close").fill("2027-06-30");
  await page.getByLabel("Probability").fill("70");
  await page.getByLabel("Estimated value").fill("18000");
  await page.getByRole("checkbox", { name: "VAT returns" }).check();
  await page.getByRole("checkbox", { name: "Advisory" }).check();
  await page.getByRole("button", { name: "Create opportunity" }).click();
  await expect(page).toHaveURL(/\/practice\/crm\/opportunities\/opportunity-/);
  await expect(page.getByRole("heading", { name: "Cedar VAT and advisory expansion" })).toBeVisible();
  await expect(page.getByText("GBP 18000")).toBeVisible();
  await expect(page.getByText("Review Manager · Advisory")).toBeVisible();
});

test("opportunity edit persists ownership, value and proposed services", async ({ page }) => {
  await page.goto("/practice/crm/opportunities/opportunity-1");
  await page.getByRole("button", { name: "Edit opportunity" }).click();
  await page.getByLabel("Opportunity name").fill("Finance function renewal");
  await page.getByLabel("Owner").selectOption("member-reviewer");
  await page.getByLabel("Team").selectOption("team-accounts");
  await page.getByLabel("Estimated value").fill("15000");
  await page.getByRole("checkbox", { name: "Advisory" }).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Opportunity changes saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Finance function renewal" })).toBeVisible();
  await expect(page.getByText("Review Manager · Accounts")).toBeVisible();
  await expect(page.getByText("GBP 15000")).toBeVisible();
});

test("QuoteBench and functional permission prerequisites are explicit", async ({ page }) => {
  await page.goto("/practice/crm/opportunities/opportunity-1?permission=view");
  await expect(page.getByText(/need the opportunity edit permission/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit opportunity" })).toBeDisabled();
  await expect(page.getByText(/QuoteBench proposals are not enabled/i)).toBeVisible();
  await expect(page.getByLabel("Proposal reference", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View entitlements" })).toBeVisible();
});

test("lost outcome requires a reason and current stage is not an actionable transition", async ({ page }) => {
  await page.goto("/practice/crm/opportunities/opportunity-1");
  const stage = page.getByLabel("Move from current stage");
  await expect(stage.locator('option[value="proposal"]')).toHaveCount(0);
  await stage.selectOption("lost");
  await expect(page.getByRole("button", { name: "Mark lost" })).toBeDisabled();
  await page.getByLabel("Loss reason").fill("Prospect deferred the programme");
  await page.getByRole("button", { name: "Mark lost" }).click();
  await expect(page.getByText("Opportunity marked lost.")).toBeVisible();
  await expect(page.getByText(/Lost — Prospect deferred the programme/)).toBeVisible();
  await expect(page.getByText("Stage changed from proposal to lost")).toBeVisible();
});

test("opportunity journey remains keyboard-operable and accessible at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/practice/crm/opportunities");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await expect(page.getByRole("button", { name: "New opportunity" })).toBeVisible();
  const results = await new AxeBuilder({ page }).exclude("[data-tabster-dummy]").analyze();
  expect(results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact || ""))).toEqual([]);
});
