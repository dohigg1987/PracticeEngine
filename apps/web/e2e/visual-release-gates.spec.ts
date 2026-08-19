import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

type ViewportCase = {
  name: string;
  width: number;
  height: number;
  surface: "clients" | "data" | "accounts";
  heading: string;
  group?: string;
};

const viewportCases: ViewportCase[] = [
  { name: "desktop-1440", width: 1440, height: 900, surface: "accounts", heading: "Statutory accounts document", group: "Accounts builder" },
  { name: "desktop-1920", width: 1920, height: 1080, surface: "clients", heading: "Clients" },
  { name: "tablet-768", width: 768, height: 1024, surface: "data", heading: "Trial balance", group: "Source data" },
  { name: "mobile-390", width: 390, height: 844, surface: "clients", heading: "Clients" },
  { name: "reflow-400-percent", width: 320, height: 720, surface: "clients", heading: "Clients" },
];

async function waitForShowcase(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Showcase mode.*seeded data/)).toHaveCount(1);
  await expect(page.locator("main.content")).toBeVisible();
}

async function openNavigationIfNeeded(page: Page) {
  const toggle = page.getByRole("button", { name: "Open practice navigation" });
  if (await toggle.isVisible()) {
    await toggle.click();
  }
}

async function openSurface(page: Page, item: ViewportCase) {
  await openNavigationIfNeeded(page);
  const target = page.locator(`button[value="${item.surface}"]`).first();
  if (!(await target.isVisible()) && item.group) {
    await page.getByRole("button", { name: item.group, exact: true }).click();
  }
  await expect(target).toBeVisible();
  await target.click();
  await expect(page.getByRole("heading", { name: item.heading }).first()).toBeVisible();
}

async function assertNoRootOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.root, "documentElement must not overflow horizontally").toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, "body must not overflow horizontally").toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function assertMinimumTarget(locator: Locator, minimum: number) {
  const box = await locator.boundingBox();
  expect.soft(box, "touch target must have a rendered box").not.toBeNull();
  if (!box) return;
  expect.soft(box.width, "touch target width").toBeGreaterThanOrEqual(minimum);
  expect.soft(box.height, "touch target height").toBeGreaterThanOrEqual(minimum);
}

async function assertNoOverlap(left: Locator, right: Locator, description: string) {
  const [a, b] = await Promise.all([left.boundingBox(), right.boundingBox()]);
  expect(a, `${description}: first region must render`).not.toBeNull();
  expect(b, `${description}: second region must render`).not.toBeNull();
  const overlapWidth = Math.min(a!.x + a!.width, b!.x + b!.width) - Math.max(a!.x, b!.x);
  const overlapHeight = Math.min(a!.y + a!.height, b!.y + b!.height) - Math.max(a!.y, b!.y);
  expect(overlapWidth > 1 && overlapHeight > 1, description).toBe(false);
}

for (const viewport of viewportCases) {
  test(`release viewport: ${viewport.name} has no root overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await waitForShowcase(page);
    await openSurface(page, viewport);
    await assertNoRootOverflow(page);
    await testInfo.attach(viewport.name, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`clients create form remains coherent at ${viewport.name} width`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await waitForShowcase(page);
    await openSurface(page, { ...viewportCases[1], width: viewport.width, height: viewport.height });

    await page.getByRole("button", { name: "New client" }).click();
    const form = page.locator(".client-form");
    await expect(form.getByRole("heading", { name: "Add legal entity" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add first client" })).toHaveCount(0);
    await expect(form.getByLabel("Jurisdiction")).toBeVisible();
    await assertNoRootOverflow(page);
    await testInfo.attach(`clients-create-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}

for (const width of [1440, 1920]) {
  test(`desktop accounts panes remain distinct at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 });
    await waitForShowcase(page);
    await openSurface(page, viewportCases[0]);

    const outline = page.locator(".document-tree");
    const canvas = page.locator(".page-canvas");
    const inspector = page.locator(".accounts-inspector");
    if (!(await outline.isVisible())) {
      await page.locator(".builder-pane-actions").getByRole("button", { name: "Outline", exact: true }).click();
    }
    if (!(await inspector.isVisible())) {
      await page.locator(".builder-pane-actions").getByRole("button", { name: "Review", exact: true }).click();
    }
    await expect(outline).toBeVisible();
    await expect(canvas).toBeVisible();
    await expect(inspector).toBeVisible();
    await assertNoOverlap(outline, canvas, `${width}px outline must not cover the document`);
    await assertNoOverlap(canvas, inspector, `${width}px inspector must not cover the document`);
  });
}

for (const viewport of [
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} accounts panes open one at a time with an explicit close`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await waitForShowcase(page);
    await openSurface(page, viewportCases[0]);

    const outlineTrigger = page.getByRole("button", { name: "Document outline" });
    const inspectorTrigger = page.getByRole("button", { name: "Review inspector" });

    await outlineTrigger.click();
    const outline = page.locator(".document-tree.mobile-panel-open");
    await expect(outline).toBeVisible();
    await expect(page.locator(".mobile-panel-open")).toHaveCount(1);
    const closeOutline = outline.getByRole("button", { name: "Close outline" });
    await expect(closeOutline).toBeVisible();
    await closeOutline.click();
    await expect(page.locator(".mobile-panel-open")).toHaveCount(0);

    await inspectorTrigger.click();
    const inspector = page.locator(".accounts-inspector.mobile-panel-open");
    await expect(inspector).toBeVisible();
    await expect(page.locator(".mobile-panel-open")).toHaveCount(1);
    const closeInspector = inspector.getByRole("button", { name: "Close inspector" });
    await expect(closeInspector).toBeVisible();
    await closeInspector.press("Enter");
    await expect(page.locator(".mobile-panel-open")).toHaveCount(0);
    await assertNoRootOverflow(page);
  });
}

test("repeated production-stage controls align within two pixels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForShowcase(page);
  const positions = await page.locator(".production-nav-stage-toggle:visible").evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { left: box.left, right: box.right };
    }),
  );
  expect(positions.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...positions.map(({ left }) => left)) - Math.min(...positions.map(({ left }) => left))).toBeLessThanOrEqual(2);
  expect(Math.max(...positions.map(({ right }) => right)) - Math.min(...positions.map(({ right }) => right))).toBeLessThanOrEqual(2);
});

test("narrow navigation and pane controls meet the 44px touch-target gate", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForShowcase(page);

  const navigation = page.getByRole("button", { name: "Open practice navigation" });
  await assertMinimumTarget(navigation, 44);
  await navigation.click();
  const builderGroup = page.getByRole("button", { name: "Accounts builder", exact: true });
  await assertMinimumTarget(builderGroup, 44);
  await builderGroup.click();
  const accounts = page.locator('button[value="accounts"]').first();
  await assertMinimumTarget(accounts, 44);
  await accounts.click();
  await expect(page.getByRole("heading", { name: "Statutory accounts document" })).toBeVisible();

  const outlineTrigger = page.getByRole("button", { name: "Document outline" });
  const inspectorTrigger = page.getByRole("button", { name: "Review inspector" });
  await assertMinimumTarget(outlineTrigger, 44);
  await assertMinimumTarget(inspectorTrigger, 44);
  await outlineTrigger.click();
  await assertMinimumTarget(page.getByRole("button", { name: "Close outline" }), 44);
});

test("keyboard navigation reaches a section and returns through the engagement breadcrumb", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForShowcase(page);

  const journalsGroup = page.getByRole("button", { name: "Adjustments", exact: true });
  await journalsGroup.focus();
  await expect(journalsGroup).toBeFocused();
  await journalsGroup.press("Enter");
  const journals = page.locator('button[value="journals"]').first();
  await journals.focus();
  await expect(journals).toBeFocused();
  await journals.press("Enter");
  await expect(page.getByRole("heading", { name: "Journals" })).toBeVisible();

  const workspaceCrumb = page
    .getByRole("navigation", { name: "Current engagement" })
    .getByRole("button")
    .first();
  await workspaceCrumb.focus();
  await expect(workspaceCrumb).toBeFocused();
  await workspaceCrumb.press("Enter");
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
});

test("WCAG text-spacing override preserves content and actions", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await waitForShowcase(page);
  await openSurface(page, viewportCases[0]);
  await page.addStyleTag({
    content: `
      * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
      p { margin-block-end: 2em !important; }
    `,
  });
  await expect(page.getByRole("heading", { name: "Statutory accounts document" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Document outline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review inspector" })).toBeVisible();
  await assertNoRootOverflow(page);
});
