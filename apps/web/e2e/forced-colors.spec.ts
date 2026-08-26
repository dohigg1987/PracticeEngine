import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const surfaces = [
  { value: "clients", heading: "Clients" },
  { value: "accounts", heading: "Statutory accounts document", group: "Accounts builder" },
  { value: "settings", heading: "Workspace settings", group: "Administration" },
] as const;

// Cold Vite transformation plus forced-colors style evaluation can dominate
// the first navigation. Keep that one-time readiness work out of the ordinary
// 30-second budget used by the rest of the browser suite.
test.describe.configure({ timeout: 60_000 });

async function openSurface(page: Page, surface: (typeof surfaces)[number]) {
  const target = page.locator(`button[value="${surface.value}"]`).first();
  if (!(await target.isVisible()) && "group" in surface) {
    await page.getByRole("button", { name: surface.group, exact: true }).click();
  }
  await target.click();
  await expect(page.getByRole("heading", { name: surface.heading }).first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The banner is the app-level readiness signal: waiting for it prevents
  // media/focus checks from racing React hydration under parallel shards.
  await expect(page.getByText(/Showcase mode.*seeded data/)).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
});

for (const surface of surfaces) {
  test(`forced colors preserve semantics and visible focus: ${surface.value}`, async ({ page }) => {
    await openSurface(page, surface);

    const focusable = page.locator(
      'main :is(button, a[href], input:not([type="hidden"]), select, textarea):visible:not([disabled])',
    ).first();
    await expect(focusable).toBeVisible();
    // Establish keyboard modality before focusing the stable target. Tab then
    // Shift+Tab can land on Fluent's transient Tabster sentinels in busy runs.
    await page.keyboard.press("Tab");
    await focusable.focus();
    await expect(focusable).toBeFocused();
    await expect.poll(() => focusable.evaluate((element) => element.matches(":focus-visible"))).toBe(true);

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      // These geometry/contrast debts are held to exact node ceilings by the
      // main Axe audit. Here we retain the remaining semantic checks while the
      // browser is actually rendering in forced-colors mode.
      .disableRules(["color-contrast", "target-size"])
      .exclude("[data-tabster-dummy]")
      .analyze();
    expect(result.violations, `forced-colors accessibility violations on ${surface.value}`).toEqual([]);
  });
}

test("forced colors retain selected navigation and statutory page boundaries", async ({ page }) => {
  await openSurface(page, surfaces[1]);
  const selected = page.locator('[aria-selected="true"], [aria-current="page"]').first();
  await expect(selected).toBeVisible();
  const selectedStyle = await selected.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderWidth: Number.parseFloat(style.borderTopWidth),
      background: style.backgroundColor,
      foreground: style.color,
    };
  });
  expect(
    selectedStyle.borderWidth >= 2 ||
      !["transparent", "rgba(0, 0, 0, 0)"].includes(selectedStyle.background),
  ).toBe(true);
  expect(selectedStyle.background).not.toBe(selectedStyle.foreground);

  const statutoryPage = page.locator(".statutory-page").first();
  await expect(statutoryPage).toBeVisible();
  const statutoryBorder = await statutoryPage.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).borderTopWidth),
  );
  expect(statutoryBorder).toBeGreaterThanOrEqual(2);
});
