import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

type Surface = {
  name: string;
  value: string;
  heading: string;
  group?: string;
};

// Representative coverage spans the practice register, production status,
// editable accounting data, the statutory document, submission and admin.
const surfaces: Surface[] = [
  { name: "Clients", value: "clients", heading: "Clients" },
  { name: "Overview", value: "overview", heading: "Preparation overview" },
  { name: "Journals", value: "journals", heading: "Journals", group: "Adjustments" },
  { name: "Draft accounts", value: "accounts", heading: "Statutory accounts document", group: "Accounts builder" },
  { name: "Filing evidence", value: "filing", heading: "Regulator filing record", group: "Submission" },
  { name: "Workspace settings", value: "settings", heading: "Workspace settings", group: "Administration" },
];

// These rule IDs are pre-existing product debt found by the first real scan.
// Axe still runs them and their complete node evidence is attached. New rule
// categories fail immediately; product fixes should remove IDs from this set.
const knownViolationIds = new Set([
  "aria-allowed-attr",
  "aria-hidden-focus",
  "aria-progressbar-name",
  "color-contrast",
  "target-size",
]);

test.describe.configure({ timeout: 60_000 });

async function openSurface(page: Page, surface: Surface) {
  const target = page.locator(`button[value="${surface.value}"]`).first();
  if (!(await target.isVisible()) && surface.group) {
    await page.getByRole("button", { name: surface.group, exact: true }).click();
  }
  await expect(target).toBeVisible();
  await target.click();
  await expect(page.getByRole("heading", { name: surface.heading }).first()).toBeVisible();
}

async function scan(page: Page, testInfo: TestInfo, surface: Surface) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      failureSummary: node.failureSummary,
    })),
  }));
  await testInfo.attach(`${surface.value}-axe-violations`, {
    body: Buffer.from(JSON.stringify(violations, null, 2)),
    contentType: "application/json",
  });
  expect(result.passes.length, `axe must execute WCAG rules on ${surface.name}`).toBeGreaterThan(0);
  expect(
    violations.filter((violation) => !knownViolationIds.has(violation.id)),
    `Unexpected WCAG A/AA axe violations on ${surface.name}`,
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Showcase mode.*seeded data/)).toBeVisible({ timeout: 15_000 });
});

for (const surface of surfaces) {
  test(`axe gate: ${surface.name}`, async ({ page }, testInfo) => {
    await openSurface(page, surface);
    await scan(page, testInfo, surface);
  });
}
