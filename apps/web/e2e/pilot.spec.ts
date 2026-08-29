import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe.configure({ timeout: 60_000 });

async function openEngagementSection(page: Page, label: string) {
  const paths: Record<string, string> = {
    "Source data": "/ledgerly/trial-balance",
    Mapping: "/ledgerly/mapping",
    Journals: "/ledgerly/journals",
    Reconciliations: "/ledgerly/reconciliations",
    "Draft accounts": "/ledgerly/accounts",
    "Accounts versions": "/ledgerly/artefacts",
    "Filing evidence": "/ledgerly/filing",
    "Client portal": "/ledgerly/portal",
  };
  const path = paths[label];
  if (!path) throw new Error(`No engagement route for ${label}`);
  await page.goto(path);
}

test.beforeEach(async ({ page }, testInfo) => {
  if (
    testInfo.title ===
    "production boundary gives actionable auth configuration recovery"
  )
    return;
  await page.goto("/ledgerly/overview");
  await expect(page.getByText("Showcase mode · seeded data")).toBeVisible();
  await expect(page.getByLabel("Engagement", { exact: true })).toHaveValue(
    "demo-engagement",
  );
});

test("engagement setup prevents incompatible framework, sector and client combinations", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New engagement" }).click();
  const dialog = page.getByRole("dialog", { name: "Create accounts period" });
  await expect(dialog).toBeVisible();
  const framework = dialog.getByLabel("Reporting framework");
  const sector = dialog.getByLabel("Sector profile");
  const client = dialog.getByLabel("Client");

  await expect(
    framework.getByRole("option", { name: "FRS 102", exact: true }),
  ).toHaveCount(1);
  await expect(
    sector.getByRole("option", {
      name: "Charities SORP 2026",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(sector).toHaveValue("CHARITIES_SORP_2026");
  await expect(
    dialog.getByText("This client type requires this reporting profile."),
  ).toBeVisible();

  await client.selectOption("demo-org-2");
  await framework.selectOption("FRS_105");
  await expect(framework).toHaveValue("FRS_105");
  await expect(sector).toHaveValue("NONE");
  await expect(sector.locator("option")).toHaveText(["None"]);
});

test("pilot preparation opens the statutory accounts context", async ({ page }) => {
  await openEngagementSection(page, "Draft accounts");
  await expect(
    page.getByRole("heading", { name: "Statutory accounts document" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Northstar Community Foundation" }),
  ).toBeVisible();
});

test("pilot preparation exposes source data evidence", async ({ page }) => {
  await openEngagementSection(page, "Source data");
  await expect(
    page.getByRole("heading", { name: "Trial balance" }),
  ).toBeVisible();
  await expect(
    page.getByText("Current account", { exact: true }),
  ).toBeVisible();
});

test("pilot preparation exposes mapping evidence", async ({ page }) => {
  await openEngagementSection(page, "Mapping");
  await expect(
    page.getByRole("heading", { name: "Account mapping" }),
  ).toBeVisible();
  await expect(page.getByText("7 mapped", { exact: true })).toBeVisible();
  await expect(page.getByText("0 unmapped", { exact: true })).toBeVisible();
});

test("pilot preparation exposes journal evidence", async ({ page }) => {
  await openEngagementSection(page, "Journals");
  await expect(page.getByRole("heading", { name: "Journals" })).toBeVisible();
  await expect(page.getByText("Accrued professional fees")).toBeVisible();
});

test("pilot preparation exposes reconciliation evidence", async ({ page }) => {
  await openEngagementSection(page, "Reconciliations");
  await expect(
    page.getByRole("heading", { name: "Reconciliations" }),
  ).toBeVisible();
  await expect(page.getByText(/Current account/)).toBeVisible();
});

test("pilot production journey reaches accounts evidence and filing record", async ({
  page,
}) => {
  await openEngagementSection(page, "Accounts versions");
  await expect(
    page.getByRole("heading", { name: "Accounts versions" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Version 3 · Final Generated/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Release evidence bundle" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download evidence ZIP" }),
  ).toBeEnabled();

  await openEngagementSection(page, "Filing evidence");
  await expect(
    page.getByRole("heading", { name: "Regulator filing record" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Prepare manual filing payloads and retain evidence received from external portals. This page does not contact a regulator or retrieve a regulator decision.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Filing evidence attempts" }),
  ).toBeVisible();
  await expect(page.getByText("CH-DEMO-1042")).toBeVisible();
  await expect(page.getByText("server-managed")).toHaveCount(0);
});

test("accounts builder keeps the document inside a collapsible split workspace", async ({
  page,
}) => {
  await openEngagementSection(page, "Draft accounts");
  const canvas = page.locator(".page-canvas");
  const inspector = page.locator(".accounts-inspector");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(inspector).toBeVisible();

  const canvasBox = await canvas.boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(inspectorBox).not.toBeNull();
  expect(canvasBox!.x + canvasBox!.width).toBeLessThanOrEqual(
    inspectorBox!.x + 1,
  );

  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(inspector).toBeHidden();
  const expandedCanvasBox = await canvas.boundingBox();
  expect(expandedCanvasBox!.width).toBeGreaterThan(canvasBox!.width);

  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(inspector).toBeVisible();
  await page.getByRole("button", { name: "Outline" }).click();
  await expect(page.locator(".document-tree")).toBeHidden();
});

test("accounts preview opens versioned editors for narrative and disclosures", async ({
  page,
}) => {
  await openEngagementSection(page, "Draft accounts");
  await page
    .getByRole("treeitem", { name: /Trustees/ })
    .click();
  await page
    .getByRole("button", { name: /Northstar provides food support/ })
    .click();
  await expect(page.getByRole("tab", { name: "Edit" })).toBeVisible();
  const narrative = page.getByRole("textbox", { name: "Narrative" });
  await narrative.fill(
    "Northstar provides food support, mentoring and employment training across Bristol.",
  );
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(
    page.getByText(/Saved as a new version/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /employment training across Bristol/ }),
  ).toBeVisible();

  await page
    .locator(".document-tree")
    .getByText("Accounting policies", { exact: false })
    .click();
  await page
    .getByRole("button", { name: /accounts have been prepared under FRS 102/i })
    .click();
  await expect(page.getByRole("tab", { name: "Edit" })).toBeVisible();
  await expect(narrative).toHaveValue(/FRS 102/);
});

test("pilot workspace administration reaches clients and team without actor identifiers", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/practice/clients");
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  const clientsGrid = page.getByRole("grid", { name: "Clients" });
  await expect(clientsGrid).toContainText(
    "Northstar Community Foundation",
  );
  await expect(
    clientsGrid.locator(".fui-TableResizeHandle"),
  ).toHaveCount(4);
  await page
    .getByRole("button", { name: "Northstar Community Foundation" })
    .click();
  await page.getByRole("tab", { name: "Contacts & permanent file" }).click();
  await expect(
    page.getByRole("heading", { name: "Legal and registered details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Client officers" }),
  ).toContainText("Company Secretary");
  await expect(
    page.getByRole("table", { name: "Professional advisers" }),
  ).toContainText("Mason & Cole LLP");
  await expect(
    page.getByRole("table", { name: "Client engagement history" }),
  ).toContainText("31 Dec 2026");
  await page.getByRole("main").getByRole("button", { name: "Clients" }).click();

  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByText("Actor ID", { exact: false })).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Users location" })
    .getByRole("button", { name: "Workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
});

test("production boundary gives actionable auth configuration recovery", async ({
  page,
  baseURL,
}) => {
  const demoOrigin = new URL(baseURL ?? "http://127.0.0.1:51873");
  const productionOrigin = `${demoOrigin.protocol}//${demoOrigin.hostname}:${Number(demoOrigin.port) + 1}/`;
  await page.goto(productionOrigin);
  await expect(
    page.getByRole("heading", { name: "Connect Neon Auth" }),
  ).toBeVisible();
  await expect(
    page.getByText("VITE_NEON_AUTH_URL", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Showcase mode · seeded data")).toHaveCount(0);
});

test("narrow workspace keeps navigation and source controls operable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const navigationToggle = page.getByRole("button", {
    name: "Open application navigation",
  });
  await expect(navigationToggle).toBeVisible();
  await navigationToggle.click();
  await openEngagementSection(page, "Source data");
  await expect(
    page.getByRole("heading", { name: "Trial balance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "Accounts production stages" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
});

test("global search focuses from the command shortcut and opens a real section", async ({
  page,
}) => {
  await page.keyboard.press("Control+K");
  const search = page.getByRole("combobox", { name: "Search workspace" });
  await expect(search).toBeFocused();
  const results = page.getByRole("listbox", {
    name: "Workspace search results",
  });
  await expect(results).toBeVisible();
  await expect(results.locator(".global-search-group")).toHaveText([
    "Workspace",
    "Engagements",
    "Engagement sections",
  ]);
  await search.fill("Journals");
  await expect(results).toBeVisible();
  await expect(results.getByRole("option")).toHaveCount(1);
  await search.press("Enter");
  await expect(page.getByRole("heading", { name: "Journals" })).toBeVisible();

  await page.keyboard.press("Control+K");
  await search.fill("Northstar");
  await expect(results).toBeVisible();
  await search.press("Escape");
  await expect(results).toBeHidden();
});

test("Ledgerly navigation remains specialist and drives the production workspace", async ({
  page,
}) => {
  const navigation = page.getByRole("navigation", { name: "Ledgerly navigation" });
  await expect(navigation.getByRole("button", { name: "Trial balance", exact: true })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Journals", exact: true })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Resources", exact: true })).toHaveCount(0);

  await navigation.getByRole("button", { name: "Reconciliations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reconciliations", exact: true })).toBeVisible();
  await expect(page.locator(".production-spine").getByRole("tab", { name: /Adjustments/ })).toHaveAttribute("aria-selected", "true");
});
test("commercial workspace exposes imports", async ({ page }) => {
  await page.goto("/ledgerly/integrations");
  await expect(
    page.getByRole("heading", { name: "Imports and integrations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Saved import configurations" }),
  ).toContainText("Northstar nominal export");
  await expect(
    page.getByText(
      "Xero, Sage and QuickBooks Online connections will only appear here when enabled by an administrator.",
      { exact: false },
    ),
  ).toBeVisible();
});

test("commercial workspace exposes notification delivery state", async ({ page }) => {
  await page.goto("/settings/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByText("Bank statement received")).toBeVisible();
  await page.getByRole("button", { name: /Delivery capabilities/ }).click();
  await expect(
    page.getByRole("table", { name: "Notification delivery capabilities" }),
  ).toContainText("No public retry or DLQ action is exposed.");
});

test("commercial workspace exposes controlled exports", async ({ page }) => {
  await page.goto("/settings/organisation");
  await expect(
    page.getByRole("heading", { name: "Organisation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Data export requests" }),
  ).toContainText("Requested");
});

test("client portal evidence uses an application-owned rejection flow", async ({ page }) => {
  await openEngagementSection(page, "Client portal");
  await expect(
    page.getByRole("heading", { name: "Client portal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Client portal contacts" }),
  ).toContainText("Amelia Hart");
  await expect(
    page.getByRole("table", { name: "Client document requests" }),
  ).toContainText("current-account-december.pdf");

  let nativeDialogOpened = false;
  page.on("dialog", () => {
    nativeDialogOpened = true;
  });
  const respondedRequest = page
    .getByRole("table", { name: "Client document requests" })
    .getByRole("row")
    .filter({ hasText: "current-account-december.pdf" });
  await respondedRequest.getByRole("button", { name: "Reject" }).click();
  const rejectionDialog = page.getByRole("alertdialog", {
    name: "Reject submitted evidence?",
  });
  await expect(rejectionDialog).toBeVisible();
  await expect(
    rejectionDialog.getByRole("button", { name: "Reject evidence" }),
  ).toBeDisabled();
  await rejectionDialog
    .getByRole("textbox", { name: "Reason for rejection" })
    .fill("The statement does not cover the year end.");
  await rejectionDialog
    .getByRole("button", { name: "Reject evidence" })
    .click();
  await expect(rejectionDialog).not.toBeVisible();
  expect(nativeDialogOpened).toBe(false);
});

test("accounts versions expose comparative presentation", async ({ page }) => {
  await openEngagementSection(page, "Accounts versions");
  await page
    .getByRole("button", { name: /Version 3 · Final Generated/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Comparative presentation" }),
  ).toBeVisible();
  await expect(page.getByText("2025-01-01 to 2025-12-31")).toBeVisible();
  await expect(
    page.getByRole("table", { name: /comparative movements/ }),
  ).toContainText("£12,850.00");
});

test("team role changes and access removal persist in the workspace", async ({ page }) => {
  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  const members = page.getByRole("table", { name: "Workspace members" });
  const colleague = members.getByRole("row").filter({ hasText: "Team member" });
  const role = colleague.getByRole("combobox", { name: "Workspace role" });
  await role.selectOption("ADMIN");
  await colleague.getByRole("button", { name: "Save role" }).click();
  await expect(role).toHaveValue("ADMIN");
  await colleague.getByRole("button", { name: "Remove access" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Remove workspace access?",
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Remove access" }).click();
  await expect(members).not.toContainText("Team member");
});

test("CSV preview imports the selected file and opens source data", async ({ page }) => {
  await page.goto("/ledgerly/integrations");
  await expect(page.locator("#engagement")).not.toHaveValue("");
  await page.locator('input[type="file"]').setInputFiles({
    name: "balanced-trial-balance.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("account_code,account_name,debit,credit\n1000,Bank,100.00,\n4000,Income,,100.00\n"),
  });
  await page.getByRole("button", { name: "Preview file" }).click();
  await expect(page.getByText("2 rows detected")).toBeVisible();
  await page.getByRole("button", { name: "Import trial balance" }).click();
  await expect(page.getByRole("heading", { name: "Trial balance" })).toBeVisible();
});

test("CSV preview maps arbitrary headings before trial-balance import", async ({ page }) => {
  await page.goto("/ledgerly/integrations");
  await expect(page.locator("#engagement")).not.toHaveValue("");
  await page.locator('input[type="file"]').setInputFiles({
    name: "arbitrary-headings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Ref,Label,Left side,Right side\n1000,Bank,100,\n4000,Income,,100\n"),
  });
  await page.getByRole("button", { name: "Preview file" }).click();
  await expect(page.getByRole("table", { name: "Source CSV preview" })).toBeVisible();
  await page.getByLabel("Account code").selectOption("0");
  await page.getByLabel("Account name").selectOption("1");
  await page.getByLabel("Debit").selectOption("2");
  await page.getByLabel("Credit").selectOption("3");
  await page.getByRole("button", { name: "Apply column mapping" }).click();
  await expect(page.getByRole("table", { name: "Mapped trial balance preview" })).toContainText("Bank");
  await expect(page.getByText("Debit 100.00 · Credit 100.00 · Balanced")).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .include(".import-preview")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Import trial balance" }).click();
  await expect(page.getByRole("heading", { name: "Trial balance" })).toBeVisible();
});

test("draft accounts downloads produce non-empty PDF and Word files", async ({ page }) => {
  await openEngagementSection(page, "Draft accounts");
  const fs = await import("node:fs/promises");
  const pdfEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const pdf = await pdfEvent;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/i);
  const pdfPath = await pdf.path();
  expect(pdfPath).not.toBeNull();
  expect((await fs.stat(pdfPath!)).size).toBeGreaterThan(1000);
  const wordEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Word" }).click();
  const word = await wordEvent;
  expect(word.suggestedFilename()).toMatch(/\.docx$/i);
  const wordPath = await word.path();
  expect(wordPath).not.toBeNull();
  expect((await fs.stat(wordPath!)).size).toBeGreaterThan(1000);
});
