import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "reflow-320", width: 320, height: 720 },
];

async function openMappingModel(page: Page) {
  await page.goto("/ledgerly/mapping");
  await expect(page.getByText(/Showcase mode.*seeded data/)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Account mapping" })).toBeVisible();
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

test("mapping opens the searchable model by default and retains the table fallback", async ({
  page,
}) => {
  await openMappingModel(page);

  await expect(page.getByRole("tab", { name: "Model" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Search canonical accounts")).toBeVisible();

  await page.getByRole("tab", { name: "Table" }).click();
  await expect(page.getByRole("table", { name: "Account mapping" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Table" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("pointer drag assigns an unmapped source through the existing save flow", async ({ page }) => {
  await seedUnmappedAccount(page);
  const source = page.getByRole("button", { name: /1000.*Current account/ });
  const target = page.getByRole("button", { name: /Map to BS.CASH/ });

  await source.dragTo(target);

  await expect(page.getByText(/1000.*Current account was mapped/)).toBeVisible();
  await expect(page.getByText("All source accounts are mapped.")).toBeVisible();

  await page.goto("/ledgerly/filing");
  await expect(page.getByRole("heading", { name: "Regulator filing record" })).toBeVisible();
  await expect(page.getByText(/1000.*Current account was mapped/)).toHaveCount(0);
});

test("large canonical model uses suggestions, search and collapsed report lines", async ({ page }) => {
  await seedUnmappedAccount(page);
  await expect(page.getByText("95 canonical", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Map to / })).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: /^Map to / }).first(),
  ).toHaveAccessibleName(/BS\.CASH.*Cash at bank and in hand/);

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

test("multi-select bulk mapping advances through the compact unmapped queue", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "accounts.demo.unmappedSources",
      "src-1000,src-1100",
    );
    localStorage.setItem("accounts.demo.largeCanonicalModel", "true");
  });
  await openMappingModel(page);

  await page
    .getByRole("checkbox", { name: /Include 1100 Fixtures and equipment/ })
    .check();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.getByLabel("Search canonical accounts").fill("BS.CASH");
  await page
    .getByRole("button", { name: /Map 2 accounts to BS\.CASH/ })
    .click();

  await expect(page.getByText("All source accounts are mapped.")).toBeVisible();
});

test("touch pointer drag exposes the active target and maps on release", async ({ page }) => {
  await seedUnmappedAccount(page);
  const source = page.getByRole("button", { name: /1000.*Current account/ });
  const target = page.getByRole("button", { name: /Map to BS.CASH/ });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  await source.dispatchEvent("pointerdown", {
    pointerId: 7,
    pointerType: "touch",
    isPrimary: true,
    buttons: 1,
    clientX: sourceBox!.x + sourceBox!.width / 2,
    clientY: sourceBox!.y + sourceBox!.height / 2,
  });
  await source.dispatchEvent("pointermove", {
    pointerId: 7,
    pointerType: "touch",
    isPrimary: true,
    buttons: 1,
    clientX: targetBox!.x + targetBox!.width / 2,
    clientY: targetBox!.y + targetBox!.height / 2,
  });
  await expect(target).toHaveClass(/is-active-drop/);
  await source.dispatchEvent("pointerup", {
    pointerId: 7,
    pointerType: "touch",
    isPrimary: true,
    buttons: 0,
    clientX: targetBox!.x + targetBox!.width / 2,
    clientY: targetBox!.y + targetBox!.height / 2,
  });

  await expect(page.getByText(/1000.*Current account was mapped/)).toBeVisible();
});

test("dragging near the visible model edge requests automatic scrolling", async ({ page }) => {
  await seedUnmappedAccount(page);
  await page.evaluate(() => {
    (window as typeof window & { mappingScrollCalls?: number }).mappingScrollCalls = 0;
    window.scrollBy = () => {
      (window as typeof window & { mappingScrollCalls?: number }).mappingScrollCalls! += 1;
    };
  });

  await page.locator(".mapping-canonical-model").dispatchEvent("dragover", {
    clientY: page.viewportSize()!.height - 1,
  });

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { mappingScrollCalls?: number })
            .mappingScrollCalls ?? 0,
      ),
    )
    .toBeGreaterThan(0);
});

test("undo restores the previous target for a reversible table remap", async ({ page }) => {
  await openMappingModel(page);
  await page.getByRole("tab", { name: "Table" }).click();

  await page
    .getByLabel("Canonical account for 1000 Current account")
    .selectOption("ca-income");
  const undo = page.getByRole("button", { name: "Undo last mapping" });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toHaveCount(0);
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
  for (let step = 0; step < 6; step += 1) {
    if (await source.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
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
