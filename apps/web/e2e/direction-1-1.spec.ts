import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { join } from "node:path";

test.describe.configure({ mode: "serial", timeout: 90_000 });

const captureDir = process.env.DIRECTION11_SCREENSHOTS_DIR;

async function ready(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByText(/Showcase mode.*seeded data/)).toBeVisible();
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
}

async function noOverflow(page: Page) {
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
}

test("six-destination shell and Clients & CRM local navigation", async ({ page }) => {
  await ready(page, "/practice/home", "Home");
  const nav = page.getByRole("navigation", { name: "Practice Management navigation" });
  for (const label of ["Home", "Clients & CRM", "Work", "Team", "Collaboration", "Insights"]) await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Automation", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Practice Management settings", exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "Clients & CRM", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Prospects" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Opportunities" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Clients", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Onboarding" })).toBeVisible();
});

test("Work saved views and delivery actions preserve queue state", async ({ page }) => {
  await ready(page, "/practice/work?view=all&q=annual&selected=work-accounts-2026", "Work");
  const inspector = page.getByRole("complementary", { name: "Selected record inspector" });
  await expect(inspector.getByRole("heading", { name: "2026 Annual Accounts" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Practice work" })).toContainText("Northstar Community Foundation");
  await inspector.getByRole("button", { name: "Open work", exact: true }).click();
  await expect(page).toHaveURL(/work=work-accounts-2026/);
  await expect(page).toHaveURL(/q=annual/);

  await page.getByRole("combobox", { name: "Work owner", exact: true }).selectOption("member-reviewer");
  await expect(page.getByText("Owner updated.", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Work owner", exact: true })).toHaveValue("member-reviewer");
  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Due date/).fill("2027-10-15");
  await dialog.getByRole("textbox", { name: /Reason \/ notes/ }).fill("Client agreed the revised delivery date.");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("15 Oct 2027", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /^Workflow/ }).click();
  await page.getByRole("combobox", { name: "Progress Preparation", exact: true }).selectOption("blocked");
  await dialog.getByRole("textbox", { name: /Reason \/ notes/ }).fill("Waiting for the supporting funding schedule.");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("table", { name: "Operational workflow stages" })).toContainText("Waiting for the supporting funding schedule.");
  await expect(page.getByRole("region", { name: "Next action" })).toContainText("Resolve the blocker");
  await page.getByRole("tab", { name: /^Reviews/ }).click();
  await expect(page.getByLabel("Work operational reviews")).toContainText("Confirm the operational delivery checklist");

  await page.getByRole("button", { name: "Request from client", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Request from client" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Back to work", exact: true }).click();
  await expect(page).toHaveURL(/view=all/);
  await expect(page).toHaveURL(/q=annual/);
  await expect(inspector.getByRole("heading", { name: "2026 Annual Accounts" })).toBeVisible();
  await inspector.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).not.toHaveURL(/selected=/);
  await page.goBack();
  await expect(page).toHaveURL(/selected=work-accounts-2026/);
  await page.goForward();
  await expect(page).not.toHaveURL(/selected=/);
});

test("Client frame keeps identity and selected Work inspector in place", async ({ page }) => {
  await ready(page, "/practice/clients?client=demo-org&area=delivery&selected=work-accounts-2026", "Northstar Community Foundation");
  const clientNavigation = page.getByRole("navigation", { name: "Client workspace areas" });
  await expect(clientNavigation).toBeVisible();
  for (const label of ["Overview", "Delivery", "Services", "Collaboration", "Documents", "Economics", "Activity", "Details"]) await expect(clientNavigation.getByRole("button", { name: label, exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Client context" }).getByRole("heading", { name: "2026 Annual Accounts" })).toBeVisible();
  await clientNavigation.getByRole("button", { name: "Services", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Northstar Community Foundation", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Client services" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("complementary", { name: "Client context" })).toBeVisible();
});

test("focused Direction 1.1 routes reflow and pass accessibility checks", async ({ page }) => {
  for (const path of ["/practice/home", "/practice/clients?client=demo-org&area=delivery&selected=work-accounts-2026", "/practice/work?view=all&selected=work-accounts-2026"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await noOverflow(page);
    const results = await new AxeBuilder({ page }).exclude(".global-search-results").exclude("[data-tabster-dummy]").analyze();
    expect(results.violations).toEqual([]);
  }
});

test("capture populated desktop and narrow visual acceptance set", async ({ page }, testInfo) => {
  test.skip(!captureDir, "Screenshot output directory not requested");
  const cases = [
    ["home", "/practice/home", "Home", "Home priority work"],
    ["client-default", "/practice/clients?client=demo-org", "Northstar Community Foundation", "Current commitments"],
    ["client-selected", "/practice/clients?client=demo-org&area=delivery&selected=work-accounts-2026", "Northstar Community Foundation", "Selected record inspector"],
    ["work-default", "/practice/work?view=all", "Work", "Practice work"],
    ["work-selected", "/practice/work?view=all&selected=work-accounts-2026", "Work", "Selected record inspector"],
  ] as const;
  for (const [name, path, heading, readyName] of cases) {
    for (const [size, viewport] of [["desktop", { width: 1440, height: 1000 }], ["narrow", { width: 390, height: 844 }]] as const) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 15_000 });
      if (readyName === "Home priority work" || readyName === "Practice work") await expect(page.getByRole("grid", { name: readyName })).toBeVisible();
      else if (readyName === "Selected record inspector") await expect(page.locator(".pe-working-inspector")).toBeVisible({ timeout: 15_000 });
      else await expect(page.getByRole("heading", { name: readyName })).toBeVisible();
      await page.screenshot({ path: join(captureDir!, `${name}-${size}-${testInfo.project.name}.png`), fullPage: true });
    }
  }
});
