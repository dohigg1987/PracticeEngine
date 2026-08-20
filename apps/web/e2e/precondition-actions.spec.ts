import { expect, test, type Page } from "@playwright/test";

async function openEngagementSection(
  page: Page,
  stage: string,
  value: string,
) {
  const item = page
    .getByRole("navigation", { name: "Engagement sections" })
    .locator(`button[value="${value}"]`);
  if (!(await item.isVisible())) {
    await page
      .locator(".production-nav-stage-toggle")
      .filter({ hasText: stage })
      .click();
  }
  await item.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Showcase mode.*seeded data/)).toBeVisible();
});

test("blocked import actions remain focusable and explain their preconditions", async ({
  page,
}) => {
  await openEngagementSection(page, "Source data", "integrations");

  const preview = page.getByRole("button", { name: "Preview file" });
  await expect(preview).toBeDisabled();
  await expect(preview).toHaveAttribute(
    "aria-describedby",
    "import-preview-reason",
  );
  await preview.focus();
  await expect(preview).toBeFocused();
  await expect(page.locator("#import-preview-reason")).toContainText(
    "Choose a CSV file",
  );

  const save = page.getByRole("button", { name: "Save configuration" });
  await expect(save).toBeDisabled();
  await save.focus();
  await expect(save).toBeFocused();
  await expect(page.locator("#save-configuration-reason")).toContainText(
    "Preview a CSV file",
  );

  const sync = page.getByRole("button", { name: "Run sync" }).first();
  await expect(sync).toBeDisabled();
  await sync.focus();
  await expect(sync).toBeFocused();
  const syncReason = await sync.getAttribute("aria-describedby");
  expect(syncReason).toBeTruthy();
  await expect(page.locator(`#${syncReason}`)).toContainText(
    "connector execution is enabled",
  );
});

test("filing evidence action remains focusable until evidence is selected", async ({
  page,
}) => {
  await openEngagementSection(page, "Submission", "filing");

  const record = page.getByRole("button", {
    name: "Record decision evidence",
  });
  await expect(record).toBeDisabled();
  await record.focus();
  await expect(record).toBeFocused();
  const reasonId = await record.getAttribute("aria-describedby");
  expect(reasonId).toBeTruthy();
  await expect(page.locator(`#${reasonId}`)).toContainText(
    "Choose a response evidence file",
  );
});

test("filing preparation fields align and reflow without clipping", async ({ page }) => {
  await openEngagementSection(page, "Submission", "filing");

  const accounts = page.locator(".filing-accounts-version-field select");
  const regulator = page.locator(".filing-regulator-field select");
  const action = page.getByRole("button", { name: "Prepare filing payload" });
  const [accountsBox, regulatorBox, actionBox] = await Promise.all([
    accounts.boundingBox(),
    regulator.boundingBox(),
    action.boundingBox(),
  ]);
  expect(accountsBox).not.toBeNull();
  expect(regulatorBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(Math.abs(accountsBox!.y - regulatorBox!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(accountsBox!.y - actionBox!.y)).toBeLessThanOrEqual(1);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const [accountsField, regulatorField, compactAction] = await Promise.all([
      page.locator(".filing-accounts-version-field").boundingBox(),
      page.locator(".filing-regulator-field").boundingBox(),
      action.boundingBox(),
    ]);
    expect(accountsField).not.toBeNull();
    expect(regulatorField).not.toBeNull();
    expect(compactAction).not.toBeNull();
    expect(Math.abs(accountsField!.x - regulatorField!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(accountsField!.width - regulatorField!.width)).toBeLessThanOrEqual(1);
    expect(regulatorField!.y).toBeGreaterThan(accountsField!.y + accountsField!.height);
    expect(compactAction!.y).toBeGreaterThan(regulatorField!.y + regulatorField!.height);
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      root: document.documentElement.scrollWidth,
    }));
    expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  }
});

test("terminal filing actions share hierarchy and retain distinct confirmations", async ({
  page,
}) => {
  await openEngagementSection(page, "Submission", "filing");

  const failed = page.getByRole("button", { name: "Mark failed" });
  const withdraw = page.getByRole("button", { name: "Withdraw" });
  const [failedStyle, withdrawStyle] = await Promise.all(
    [failed, withdraw].map((button) =>
      button.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderStyle: style.borderStyle,
          color: style.color,
          fontWeight: style.fontWeight,
        };
      }),
    ),
  );
  expect(withdrawStyle).toEqual(failedStyle);

  await failed.click();
  const failedDialog = page.getByRole("alertdialog", {
    name: "Mark filing attempt as failed?",
  });
  await expect(failedDialog).toContainText("unsuccessful external filing");
  await expect(failedDialog).toContainText("terminal status");
  await failedDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(failedDialog).not.toBeVisible();
  await expect(failed).toBeFocused();

  await withdraw.click();
  const withdrawDialog = page.getByRole("alertdialog", {
    name: "Withdraw filing attempt?",
  });
  await expect(withdrawDialog).toContainText("was withdrawn");
  await expect(withdrawDialog).toContainText("terminal status");
  await withdrawDialog.getByRole("button", { name: "Withdraw" }).click();
  await expect(withdrawDialog).not.toBeVisible();
});
