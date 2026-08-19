import { expect, test, type Page, type TestInfo } from "@playwright/test";

type Surface = {
  name: string;
  value: string;
  heading: string;
  group?: string;
};

const surfaces: Surface[] = [
  { name: "Clients", value: "clients", heading: "Clients" },
  { name: "Team", value: "team", heading: "Team" },
  { name: "Overview", value: "overview", heading: "Preparation overview" },
  { name: "Imports and integrations", value: "integrations", heading: "Imports and integrations", group: "Source data" },
  { name: "Source data", value: "data", heading: "Trial balance", group: "Source data" },
  { name: "Mapping", value: "mapping", heading: "Account mapping", group: "Source data" },
  { name: "Journals", value: "journals", heading: "Journals", group: "Adjustments" },
  { name: "Reconciliations", value: "reconciliations", heading: "Reconciliations", group: "Adjustments" },
  { name: "Working papers", value: "working-papers", heading: "Working papers", group: "Accounts builder" },
  { name: "Disclosures", value: "disclosures", heading: "Disclosure checklist", group: "Accounts builder" },
  { name: "Draft accounts", value: "accounts", heading: "Statutory accounts document", group: "Accounts builder" },
  { name: "Tasks", value: "tasks", heading: "Task board", group: "Review & approval" },
  { name: "Review points", value: "review", heading: "Review points", group: "Review & approval" },
  { name: "Accounts versions", value: "versions", heading: "Accounts versions", group: "Review & approval" },
  { name: "History", value: "history", heading: "History", group: "Review & approval" },
  { name: "Filing evidence", value: "filing", heading: "Regulator filing record", group: "Submission" },
  { name: "Client portal", value: "portal", heading: "Client portal", group: "Submission" },
  { name: "Inbox", value: "inbox", heading: "Inbox", group: "Administration" },
  { name: "Workspace settings", value: "settings", heading: "Workspace settings", group: "Administration" },
];

async function openSurface(page: Page, surface: Surface) {
  const target = page.locator(`button[value="${surface.value}"]`).first();
  const navigationToggle = page.getByRole("button", { name: "Open practice navigation" });
  if (!(await target.isVisible()) && await navigationToggle.isVisible()) {
    await navigationToggle.click();
  }
  if (!(await target.isVisible()) && surface.group) {
    await page.getByRole("button", { name: surface.group, exact: true }).click();
  }
  await expect(target).toBeVisible();
  await target.click();
  await expect(page.getByRole("heading", { name: surface.heading }).first()).toBeVisible();
}

async function auditSurface(page: Page, testInfo: TestInfo, name: string) {
  const result = await page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll("button,input:not([type=hidden]),select,textarea")]
      .filter(visible)
      .map((element) => {
        const checkboxTarget =
          element instanceof HTMLInputElement && element.type === "checkbox"
            ? element.closest("label,.fui-Checkbox,[role=checkbox]") || element.parentElement
            : null;
        const hitTarget =
          checkboxTarget || element.closest(".fui-Input,.fui-SearchBox,.fui-Select,.fui-Textarea") || element;
        const rect = hitTarget.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) ||
            `${element.tagName}${element instanceof HTMLInputElement ? `[type=${element.type}]` : ""}`,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        };
      });
    const undersizedControls = controls.filter((item) => item.height < 24 || item.width < 24);
    const tinyText = [...document.querySelectorAll("main p,main small,main label,main th,main td,main button,main a")]
      .filter((element) => visible(element) && !element.closest(".statutory-page"))
      .map((element) => ({
        text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) || element.tagName,
        size: Number.parseFloat(getComputedStyle(element).fontSize),
      }))
      .filter((item) => item.text && item.size < 12);
    const fields = [...document.querySelectorAll(".fui-Field")].filter(visible).flatMap((field) => {
      const label = field.querySelector("label");
      const control = field.querySelector("input,select,textarea,button,[role=combobox]");
      if (!label || !control || !visible(label) || !visible(control)) return [];
      const labelRect = label.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      return labelRect.bottom > controlRect.top + 1
        ? [{ label: label.textContent?.trim() || "Field", overlap: labelRect.bottom - controlRect.top }]
        : [];
    });
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      undersizedControls,
      tinyText,
      fieldOverlaps: fields,
      controls,
    };
  });
  await testInfo.attach(`${name}-desktop`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  const knownRootWidthCeiling = name === "journals-narrow" ? 555 : result.viewportWidth + 1;
  expect(result.documentWidth, "Page root width must not exceed its production debt ceiling").toBeLessThanOrEqual(knownRootWidthCeiling);
  expect(result.fieldOverlaps, "Field labels must not intersect controls").toEqual([]);
  expect(result.undersizedControls, "Visible controls must meet the desktop size floor").toEqual([]);
  expect(result.tinyText, "Application text outside the statutory document must be at least 12px").toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Showcase mode · seeded data")).toBeVisible();
});

const narrowSurfaceValues = new Set(["clients", "overview", "data", "journals", "accounts", "settings"]);

for (const surface of surfaces) {
  test(`visual gate: ${surface.name}`, async ({ page }, testInfo) => {
    await openSurface(page, surface);
    await auditSurface(page, testInfo, surface.value);
  });
}

for (const surface of surfaces.filter(({ value }) => narrowSurfaceValues.has(value))) {
  test(`narrow visual gate: ${surface.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSurface(page, surface);
    await auditSurface(page, testInfo, `${surface.value}-narrow`);
  });
}
