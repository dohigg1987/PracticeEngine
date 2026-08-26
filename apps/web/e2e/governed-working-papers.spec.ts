import { expect, test, type Page } from "@playwright/test";

async function openWorkingPapers(page: Page) {
  const navigationToggle = page.getByRole("button", {
    name: "Open practice navigation",
  });
  if (await navigationToggle.isVisible()) await navigationToggle.click();
  const item = page.locator('button[value="working-papers"]').first();
  if (!(await item.isVisible()))
    await page.getByRole("button", { name: "Accounts builder", exact: true }).click();
  await item.click();
  await expect(page.getByRole("heading", { name: "Working papers" })).toBeVisible({
    timeout: 15_000,
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Showcase mode · seeded data")).toBeVisible();
});

test("governed library is primary and one-off papers retain governance metadata", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkingPapers(page);

  await page.getByRole("button", { name: "Set up standard file" }).click();
  await expect(
    page.getByRole("heading", { name: "Accounts-production working papers" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Engagement and planning" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Source and version" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Requirement" })).toBeVisible();

  await page.getByRole("button", { name: "Engagement file" }).click();
  await expect(page.getByText("bank-confirmation.pdf", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Governance links/ })).toBeVisible();
  await page.getByRole("button", { name: "Add one-off paper" }).click();
  await page.getByLabel("Reference").fill("Z99");
  await page.getByLabel("Title").fill("Exceptional grant evidence");
  await page.getByLabel("Work area").selectOption("INCOME");
  await page
    .getByRole("textbox", { name: "Objective", exact: true })
    .fill("Corroborate the exceptional grant conditions and accounting treatment.");
  await page.getByRole("button", { name: "Create paper" }).click();

  await page
    .getByRole("button", { name: /Z99 Exceptional grant evidence/ })
    .click();
  await expect(page.getByRole("heading", { name: "Exceptional grant evidence" })).toBeVisible();
  await expect(page.getByText("One-off engagement paper", { exact: true })).toBeVisible();
  await expect(page.getByText("Corroborate the exceptional grant conditions and accounting treatment.")).toBeVisible();
  await page.getByLabel("Theme", { exact: true }).selectOption("INTERNAL_CONTROLS");
  await page.getByRole("checkbox", { name: "I have verified this governance link" }).check();
  await page.getByRole("button", { name: "Link theme" }).click();
  await expect(
    page.getByRole("region", { name: "Governance and evidence" }).getByRole("listitem").filter({ hasText: "Internal controls" }),
  ).toBeVisible();
  const linkedTheme = page
    .getByRole("region", { name: "Governance and evidence" })
    .getByRole("listitem")
    .filter({ hasText: "Internal controls" });
  await linkedTheme.getByRole("button", { name: "Correct" }).click();
  const correctionForm = page.getByRole("form", { name: /Correct Internal controls/ });
  await correctionForm.getByLabel("Replacement").selectOption("COMPLETENESS");
  await expect(correctionForm.getByRole("button", { name: "Replace link" })).toBeDisabled();
  await correctionForm.getByLabel("Correction reason").fill("Theme selected in error");
  await correctionForm.getByRole("button", { name: "Replace link" }).click();
  await expect(
    page.getByRole("region", { name: "Governance and evidence" }).getByRole("listitem").filter({ hasText: "Completeness" }),
  ).toBeVisible();
  const evidenceFile = page.getByLabel("Evidence file");
  if (!(await evidenceFile.isVisible())) {
    await page.getByRole("button", { name: /Evidence attachments/ }).click();
  }
  await evidenceFile.setInputFiles({
    name: "grant-agreement.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Evidence of grant terms"),
  });
  await page.getByRole("button", { name: "Upload evidence" }).click();
  await expect(page.getByText("grant-agreement.txt", { exact: true })).toBeVisible();
  await testInfo.attach("governed-working-paper-desktop", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("governed working-paper controls remain usable at narrow width", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkingPapers(page);
  await page.getByRole("button", { name: "Add one-off paper" }).click();
  await expect(page.getByLabel("Work area")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Objective", exact: true }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
  await testInfo.attach("governed-working-paper-narrow", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
