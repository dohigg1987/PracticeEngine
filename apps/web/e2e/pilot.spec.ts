import { expect, test, type Page } from "@playwright/test";

async function openEngagementSection(page: Page, label: string) {
  const values: Record<string, string> = {
    "Source data": "data",
    Mapping: "mapping",
    Journals: "journals",
    Reconciliations: "reconciliations",
    "Draft accounts": "accounts",
    "Accounts versions": "versions",
    "Filing evidence": "filing",
    "Client portal": "portal",
  };
  const stages: Record<string, string> = {
    "Source data": "Source data",
    Mapping: "Source data",
    Journals: "Adjustments",
    Reconciliations: "Adjustments",
    "Draft accounts": "Accounts builder",
    "Accounts versions": "Review & approval",
    "Filing evidence": "Submission",
    "Client portal": "Submission",
  };
  const value = values[label];
  if (!value) throw new Error(`No engagement navigation value for ${label}`);
  const item = page
    .getByRole("navigation", { name: "Engagement sections" })
    .locator(`button[value="${value}"]`);
  if (!(await item.isVisible())) {
    await page
      .locator(".production-nav-stage-toggle")
      .filter({ hasText: stages[label] })
      .click();
  }
  await item.click();
}

test.beforeEach(async ({ page }, testInfo) => {
  if (
    testInfo.title ===
    "production boundary gives actionable auth configuration recovery"
  )
    return;
  await page.goto("/");
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

test("pilot preparation journey exposes source, mapping and adjustment evidence", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Statutory accounts document" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Northstar Community Foundation" }),
  ).toBeVisible();

  await openEngagementSection(page, "Source data");
  await expect(
    page.getByRole("heading", { name: "Trial balance" }),
  ).toBeVisible();
  await expect(
    page.getByText("Current account", { exact: true }),
  ).toBeVisible();

  await openEngagementSection(page, "Mapping");
  await expect(
    page.getByRole("heading", { name: "Account mapping" }),
  ).toBeVisible();
  await expect(page.getByText("All mapped", { exact: true })).toBeVisible();
  await expect(
    page
      .locator(".mapping-control-metric")
      .filter({ hasText: "Unmapped" })
      .getByText("0", { exact: true }),
  ).toBeVisible();

  await openEngagementSection(page, "Journals");
  await expect(page.getByRole("heading", { name: "Journals" })).toBeVisible();
  await expect(page.getByText("Accrued professional fees")).toBeVisible();

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
  await page.locator('button[value="clients"]').click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
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

  await page.locator('button[value="team"]').click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByText("Actor ID", { exact: false })).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Team location" })
    .getByRole("button", { name: "Workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Northstar Community Foundation" }),
  ).toBeVisible();
});

test("production boundary gives actionable auth configuration recovery", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:51874/");
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
    name: "Open practice navigation",
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

test("sidebar follows the accounts-production stages and exposes one workflow group at a time", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "Practice", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Accounts production", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Administration", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");

  const stageNames = [
    "Source data",
    "Adjustments",
    "Accounts builder",
    "Review & approval",
    "Submission",
  ];
  const stageButtons = page.locator(".production-nav-stage-toggle");
  await expect(stageButtons).toHaveCount(stageNames.length);
  await expect(stageButtons).toHaveText(
    stageNames.map((name) => new RegExp(name)),
  );
  await page
    .locator(".production-nav-stage-toggle")
    .filter({ hasText: "Submission" })
    .click();
  await expect(
    page.locator('.production-nav-stage-toggle[aria-expanded="true"]'),
  ).toHaveCount(1);
  const engagementNavigation = page.getByRole("navigation", {
    name: "Engagement sections",
  });
  await expect(
    engagementNavigation.locator('button[value="filing"]'),
  ).toBeVisible();
  await expect(
    engagementNavigation.locator('button[value="accounts"]'),
  ).toHaveCount(0);

  await page
    .locator(".production-spine")
    .getByRole("tab", { name: /Adjustments/ })
    .click();
  const adjustmentsMenu = page.getByRole("tablist", {
    name: "Adjustments sections",
  });
  await expect(adjustmentsMenu.getByRole("tab", { name: "Journals" })).toBeVisible();
  await adjustmentsMenu.getByRole("tab", { name: "Reconciliations" }).click();
  await expect(
    page.getByRole("heading", { name: "Reconciliations", exact: true }),
  ).toBeVisible();
});

test("commercial workspaces expose portal, imports, inbox, settings and comparatives", async ({
  page,
}) => {
  await page
    .locator(".production-nav-stage-toggle")
    .filter({ hasText: "Source data" })
    .click();
  await page.locator('button[value="integrations"]').click();
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

  await page.getByRole("button", { name: "Administration" }).click();
  await page.locator('button[value="inbox"]').click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByText("Bank statement received")).toBeVisible();
  await page.getByRole("button", { name: /Delivery capabilities/ }).click();
  await expect(
    page.getByRole("table", { name: "Notification delivery capabilities" }),
  ).toContainText("No public retry or DLQ action is exposed.");

  await page.locator('button[value="settings"]').click();
  await expect(
    page.getByRole("heading", { name: "Workspace settings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Data export requests" }),
  ).toContainText("Requested");

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
  await page.locator('button[value="team"]').click();
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
  await page
    .locator(".production-nav-stage-toggle")
    .filter({ hasText: "Source data" })
    .click();
  await page.locator('button[value="integrations"]').click();
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
