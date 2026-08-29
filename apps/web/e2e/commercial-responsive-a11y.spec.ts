import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

type Surface = {
  value: "clients" | "team" | "integrations" | "inbox" | "settings";
  heading: string;
  path: string;
};

const surfaces: Surface[] = [
  { value: "clients", heading: "Clients", path: "/practice/clients" },
  { value: "team", heading: "Users", path: "/settings/users" },
  { value: "integrations", heading: "Imports and integrations", path: "/ledgerly/integrations" },
  { value: "inbox", heading: "Notifications", path: "/settings/notifications" },
  { value: "settings", heading: "Organisation", path: "/settings/organisation" },
];

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "reflow-320", width: 320, height: 720 },
];

async function openNavigation(page: Page) {
  const toggle = page.getByRole("button", { name: "Open application navigation" });
  if (await toggle.isVisible()) await toggle.click();
}

async function openSurface(page: Page, surface: Surface) {
  await page.goto(surface.path);
  await expect(page.getByText(/Showcase mode.*seeded data/)).toHaveCount(1);
  await expect(page.locator("main.content")).toBeVisible();
  await expect(page.getByRole("heading", { name: surface.heading }).first()).toBeVisible();
}

async function assertPageReflows(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    content: document.querySelector("main.content")?.scrollWidth ?? 0,
  }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
}

async function attachSurface(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

for (const viewport of viewports) {
  test(`commercial and client surfaces reflow at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    for (const surface of surfaces) {
      await openSurface(page, surface);
      await assertPageReflows(page);
      if (surface.value === "team" || surface.value === "integrations") {
        await attachSurface(page, testInfo, `${viewport.name}-${surface.value}`);
      }
    }

    await openSurface(page, surfaces[0]);
    await page.locator(".client-name-button").first().click();
    await page.getByRole("tab", { name: "Contacts & permanent file" }).click();
    await expect(page.locator(".permanent-file")).toBeVisible();
    await assertPageReflows(page);
  });
}

test("owned surfaces tolerate WCAG text spacing at 320px", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(viewports[3]);
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = `
        * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
        p { margin-bottom: 2em !important; }
      `;
      document.head.append(style);
    });
  });

  for (const surface of surfaces) {
    await openSurface(page, surface);
    await assertPageReflows(page);
  }

  await openSurface(page, surfaces[0]);
  await page.locator(".client-name-button").first().click();
  await page.getByRole("tab", { name: "Contacts & permanent file" }).click();
  await expect(page.locator(".permanent-file")).toBeVisible();
  await assertPageReflows(page);
});

for (const surface of surfaces.filter(({ value }) => value !== "clients")) {
  test(`forced colors preserve focus and axe semantics on ${surface.value}`, async ({ page }) => {
    await page.setViewportSize(viewports[2]);
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await openSurface(page, surface);
    const focusable = page.locator(
      'main :is(button, a[href], input:not([type="hidden"]), select, textarea):visible:not([disabled])',
    ).first();
    await focusable.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(focusable).toBeFocused();
    await expect.poll(() => focusable.evaluate((element) => element.matches(":focus-visible"))).toBe(true);

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .disableRules(["color-contrast", "target-size"])
      .exclude("[data-tabster-dummy]")
      .analyze();
    expect(result.violations).toEqual([]);
  });
}

test("client permanent file preserves forced-color focus and axe semantics", async ({ page }) => {
  await page.setViewportSize(viewports[2]);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openSurface(page, surfaces[0]);
  await page.locator(".client-name-button").first().click();
  await page.getByRole("tab", { name: "Contacts & permanent file" }).click();
  await expect(page.locator(".permanent-file")).toBeVisible();
  const back = page.getByRole("button", { name: "Clients", exact: true });
  await back.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(back).toBeFocused();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .disableRules(["color-contrast", "target-size"])
    .exclude("[data-tabster-dummy]")
    .analyze();
  expect(result.violations).toEqual([]);
});
