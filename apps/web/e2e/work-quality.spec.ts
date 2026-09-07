import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("full work details survive refresh, history and switching work sections", async ({ page }) => {
  await page.goto("/practice/work?view=all&q=annual&selected=work-accounts-2026");
  const inspector = page.getByRole("complementary", { name: "Selected record inspector" });
  await inspector.getByRole("button", { name: "Open work", exact: true }).click();
  await expect(page).toHaveURL(/work=work-accounts-2026/);
  await expect(page.getByRole("heading", { name: "2026 Annual Accounts", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "2026 Annual Accounts", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue("annual");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "2026 Annual Accounts", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Practice Management navigation" });
  await navigation.getByRole("button", { name: "Work", exact: true }).click();
  await navigation.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review queue", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review queue", exact: true })).toBeVisible();
});

test("Add work creates a record directly from the queue", async ({ page }) => {
  await page.goto("/practice/work?view=all");
  await page.getByRole("button", { name: "Add work", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add work" });
  await dialog.getByRole("combobox", { name: /^Client/ }).selectOption("demo-org");
  await expect(dialog.getByRole("combobox", { name: /^Service/ })).toBeEnabled();
  await dialog.getByLabel("Work title").fill("Quality review follow-up");
  await dialog.getByLabel("Due date").fill("2027-10-15");
  await dialog.getByRole("button", { name: "Add work", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Selected record inspector" }).getByRole("heading", { name: "Quality review follow-up" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Practice work" })).toContainText("Quality review follow-up");
});

test("saved views use Fluent tab selection and keyboard navigation", async ({ page }) => {
  await page.goto("/practice/work?view=all");
  const tabs = page.getByRole("tablist", { name: "Saved views" });
  await expect(tabs.getByRole("tab", { name: /All work/ })).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: /All work/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: /Due this week/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=this-week/);
});

test("failed work selection cannot retain another record's actions", async ({ page }) => {
  await page.goto("/practice/work?view=all&selected=missing-work");
  await expect(page.getByText("The selected work item could not be found.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reschedule", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).not.toHaveURL(/selected=/);
  await expect(page.getByRole("grid", { name: "Practice work" })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`mobile Fluent navigation traps focus, dismisses and reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/practice/work?view=all");
    const trigger = page.getByRole("button", { name: "Open application navigation", exact: true });
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "Application navigation" });
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const widths = await page.evaluate(() => ({ available: document.documentElement.clientWidth, actual: document.documentElement.scrollWidth }));
    expect(widths.actual).toBeLessThanOrEqual(widths.available + 1);
    const results = await new AxeBuilder({ page }).exclude("[data-tabster-dummy]").analyze();
    expect(results.violations).toEqual([]);
  });
}

test("neutral work status remains readable on the light surface", async ({ page }) => {
  await page.goto("/practice/work?view=all");
  const badge = page.getByRole("grid", { name: "Practice work" }).getByText("In Progress", { exact: true });
  await expect(badge).toBeVisible();
  const contrast = await badge.evaluate(element => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (value: string) => rgb(value).map(channel => {
      const scaled = channel / 255;
      return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    let background = "rgb(255, 255, 255)";
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const candidate = getComputedStyle(ancestor).backgroundColor;
      if (candidate !== "transparent" && !candidate.endsWith(", 0)")) { background = candidate; break; }
    }
    const foreground = luminance(getComputedStyle(element).color);
    const surface = luminance(background);
    return (Math.max(foreground, surface) + 0.05) / (Math.min(foreground, surface) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
});

test("capture the updated work queue and Fluent creation dialog", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/practice/work?view=all&selected=work-accounts-2026");
  await expect(page.getByRole("complementary", { name: "Selected record inspector" }).getByRole("heading", { name: "2026 Annual Accounts" })).toBeVisible();
  await testInfo.attach("work-queue-desktop", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await page.getByRole("button", { name: "Add work", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add work" })).toBeVisible();
  await testInfo.attach("create-work-dialog", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  if (process.env.PRACTICE_REVIEW_INLINE_EVIDENCE === "true") {
    const dialogImage = await page.screenshot({ type: "jpeg", quality: 70, fullPage: true });
    console.log("PRACTICE_REVIEW_IMAGE=" + JSON.stringify({ name: "Create work dialog", data: dialogImage.toString("base64") }));
    await page.getByRole("dialog", { name: "Add work" }).getByRole("button", { name: "Cancel", exact: true }).click();
    const queueImage = await page.screenshot({ type: "jpeg", quality: 70, fullPage: true });
    console.log("PRACTICE_REVIEW_IMAGE=" + JSON.stringify({ name: "Work queue", data: queueImage.toString("base64") }));
  }
});
