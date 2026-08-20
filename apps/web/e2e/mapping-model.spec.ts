import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "reflow-320", width: 320, height: 720 },
];

async function openMappingModel(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Showcase mode.*seeded data/)).toHaveCount(1);
  const navigationToggle = page.getByRole("button", {
    name: "Open practice navigation",
  });
  if (await navigationToggle.isVisible()) await navigationToggle.click();
  const mapping = page
    .getByRole("navigation", { name: "Engagement sections" })
    .locator('button[value="mapping"]');
  if (!(await mapping.isVisible())) {
    await page
      .locator(".production-nav-stage-toggle")
      .filter({ hasText: "Source data" })
      .click();
  }
  await mapping.click();
  await expect(page.getByRole("heading", { name: "Account mapping" })).toBeVisible();
  await page.getByRole("tab", { name: "Model" }).click();
  await expect(page.getByRole("heading", { name: "Canonical model" })).toBeVisible();
}

async function seedUnmappedAccount(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("accounts.demo.unmappedSource", "src-1000");
    localStorage.setItem("accounts.demo.largeCanonicalModel", "true");
  });
  await openMappingModel(page);
  await expect(page.getByRole("button", { name: /1000.*Current account/ })).toBeVisible();
}

async function assertReflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    modelClient: document.querySelector<HTMLElement>(".mapping-model")?.clientWidth ?? 0,
    modelScroll: document.querySelector<HTMLElement>(".mapping-model")?.scrollWidth ?? 0,
    modelRight:
      document.querySelector<HTMLElement>(".mapping-model")?.getBoundingClientRect().right ?? 0,
  }));
  expect(widths.root).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.modelScroll).toBeLessThanOrEqual(widths.modelClient + 1);
  expect(widths.modelRight).toBeLessThanOrEqual(widths.viewport + 1);
}

test("pointer drag assigns an unmapped source through the existing save flow", async ({ page }) => {
  await seedUnmappedAccount(page);
  const source = page.getByRole("button", { name: /1000.*Current account/ });
  const target = page.getByRole("button", { name: /Map to BS.CASH/ });

  await source.dragTo(target);

  await expect(page.getByText(/1000.*Current account was mapped/)).toBeVisible();
  await expect(page.getByText("All source accounts are mapped.")).toBeVisible();

  const filing = page
    .getByRole("navigation", { name: "Engagement sections" })
    .locator('button[value="filing"]');
  if (!(await filing.isVisible())) {
    await page
      .locator(".production-nav-stage-toggle")
      .filter({ hasText: "Submission" })
      .click();
  }
  await filing.click();
  await expect(page.getByRole("heading", { name: "Regulator filing record" })).toBeVisible();
  await expect(page.getByText(/1000.*Current account was mapped/)).toHaveCount(0);
});

test("large canonical model uses suggestions, search and collapsed report lines", async ({ page }) => {
  await seedUnmappedAccount(page);
  await expect(page.getByText("95 canonical", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Map to / })).toHaveCount(5);

  await page
    .getByRole("button", { name: "Test Report Line 10 3", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Map to TEST\.027/ }),
  ).toBeVisible();

  await page.getByLabel("Search canonical accounts").fill("TEST.094");
  await expect(
    page.getByRole("button", { name: /Map to TEST\.094/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Map to / })).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(/Â|Ã|â€¦|â‚¬/);
});

test("keyboard selection assigns the chosen source to a canonical target", async ({ page }) => {
  await seedUnmappedAccount(page);
  const source = page.getByRole("button", { name: /1000.*Current account/ });
  const target = page.getByRole("button", { name: /Map to BS.CASH/ });

  await source.focus();
  await page.keyboard.press("Enter");
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Choose a target for 1000/)).toBeVisible();
  await target.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText(/1000.*Current account was mapped/)).toBeVisible();
  await expect(page.getByText("All source accounts are mapped.")).toBeVisible();
});

test("select fallback remains available in model view", async ({ page }) => {
  await seedUnmappedAccount(page);
  await page
    .getByLabel("Canonical account for 1000 Current account")
    .selectOption("ca-income");
  await expect(page.getByText(/1000.*Current account was mapped/)).toBeVisible();
});

for (const viewport of viewports) {
  test(`canonical model reflows at ${viewport.name}`, async ({ page }, testInfo: TestInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await seedUnmappedAccount(page);
    await assertReflow(page);
    await expect(page.getByRole("button", { name: /Map to BS.CASH/ })).toBeVisible();
    await testInfo.attach(`mapping-model-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}

test("canonical model supports text spacing, forced colors, focus and axe", async ({ page }) => {
  await page.setViewportSize(viewports[3]);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("accounts.demo.unmappedSource", "src-1000");
    localStorage.setItem("accounts.demo.largeCanonicalModel", "true");
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = `
        * {
          line-height: 1.5 !important;
          letter-spacing: 0.12em !important;
          word-spacing: 0.16em !important;
        }
        p { margin-bottom: 2em !important; }
      `;
      document.head.append(style);
    });
  });
  await openMappingModel(page);
  await assertReflow(page);

  const source = page.getByRole("button", { name: /1000.*Current account/ });
  await page.getByLabel("Search unmapped source accounts").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(source).toBeFocused();
  await expect
    .poll(() =>
      source.evaluate((element) => element.matches(":focus-visible")),
    )
    .toBe(true);

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .disableRules(["color-contrast", "target-size"])
    .exclude("[data-tabster-dummy]")
    .analyze();
  expect(result.violations).toEqual([]);
});
