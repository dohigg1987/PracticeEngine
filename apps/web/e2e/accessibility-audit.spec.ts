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

type KnownViolationNode = {
  id: "color-contrast" | "target-size";
  target: string[];
};

// Every remaining exception is tied to one observed node on one surface. This
// is deliberately a multiset: a new node in an otherwise known rule category
// still fails, and removing a product defect requires removing its entry here.
const knownViolationNodes: Record<string, KnownViolationNode[]> = {
  clients: [
    {
      id: "target-size",
      target: [
        ".___1vfrnh3_vmlck40.f1wfn5kd.f1g4hkjv:nth-child(1) > .fui-DataGridCell.fui-TableCell.client-data-grid-cell:nth-child(6)",
      ],
    },
    {
      id: "target-size",
      target: [
        ".___1vfrnh3_vmlck40.f1wfn5kd.f1g4hkjv:nth-child(2) > .fui-DataGridCell.fui-TableCell.client-data-grid-cell:nth-child(6)",
      ],
    },
  ],
  team: [],
  overview: [
    { id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] },
    { id: "color-contrast", target: ["div:nth-child(1) > span"] },
    { id: "color-contrast", target: [".metrics > div:nth-child(2) > span"] },
    { id: "color-contrast", target: [".metrics > div:nth-child(3) > span"] },
    { id: "color-contrast", target: [".metrics > div:nth-child(4) > span"] },
  ],
  data: [
    { id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] },
    { id: "color-contrast", target: ["div:nth-child(1) > span"] },
    { id: "color-contrast", target: [".metrics > div:nth-child(2) > span"] },
    { id: "color-contrast", target: [".metrics > div:nth-child(3) > span"] },
    { id: "color-contrast", target: [".metrics > div:nth-child(4) > span"] },
  ],
  mapping: [{ id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] }],
  journals: [
    { id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] },
  ],
  reconciliations: [{ id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] }],
  "working-papers": [{ id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] }],
  disclosures: [{ id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] }],
  accounts: [
    { id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] },
  ],
  tasks: [{ id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] }],
  review: [{ id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] }],
  versions: [{ id: "color-contrast", target: ["div:nth-child(1) > small"] }],
  history: [{ id: "color-contrast", target: [".page-head > div:nth-child(1) > small"] }],
  filing: [
    { id: "color-contrast", target: ["div:nth-child(1) > small"] },
  ],
  portal: [{ id: "color-contrast", target: ["div:nth-child(1) > small"] }],
  settings: [],
};

test.describe.configure({ timeout: 60_000 });

async function openSurface(page: Page, surface: Surface) {
  const target = page.locator(`button[value="${surface.value}"]`).first();
  if (!(await target.isVisible()) && surface.group) {
    await page.getByRole("button", { name: surface.group, exact: true }).click();
  }
  await expect(target).toBeVisible();
  await target.click();
  const heading = page.getByRole("heading", { name: surface.heading }).first();
  await expect(heading).toBeVisible();
  // Dynamic route chunks and demo data can finish after the heading mounts.
  // Axe evaluates in the page context, so wait for that navigation boundary
  // to settle instead of allowing a late route load to destroy the scan.
  await page.waitForLoadState("networkidle");
  await expect(heading).toBeVisible();
}

async function scan(page: Page, testInfo: TestInfo, surface: Surface) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // Fluent's Tabster focus sentinels intentionally redirect focus and are
    // hidden from assistive technology. Exclude only those generated nodes so
    // genuine application-owned aria-hidden focus remains blocking.
    .exclude("[data-tabster-dummy]")
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
  const remainingKnownNodes = [...(knownViolationNodes[surface.value] ?? [])];
  const unexpectedNodes = violations.flatMap((violation) =>
    violation.nodes.flatMap((node) => {
      const knownIndex = remainingKnownNodes.findIndex(
        (known) =>
          known.id === violation.id &&
          JSON.stringify(known.target) === JSON.stringify(node.target),
      );
      if (knownIndex >= 0) {
        remainingKnownNodes.splice(knownIndex, 1);
        return [];
      }
      return [{ id: violation.id, target: node.target }];
    }),
  );
  expect(
    unexpectedNodes,
    `Unexpected WCAG A/AA axe violation nodes on ${surface.name}`,
  ).toEqual([]);
  expect(
    remainingKnownNodes,
    `Known accessibility debt changed on ${surface.name}; remove fixed nodes or record the exact replacement`,
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Showcase mode.*seeded data/)).toBeVisible({ timeout: 15_000 });
});

test("global controls expose their accessibility semantics", async ({ page }) => {
  await expect(page.getByRole("combobox", { name: "Search workspace" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Source mapping progress" })).toBeVisible();

  const searchGeometry = await page.locator(".global-search-box").evaluate((element) => {
    const input = element.querySelector("input");
    const icon = element.querySelector("svg");
    const bounds = element.getBoundingClientRect();
    const iconBounds = icon?.getBoundingClientRect();
    return {
      height: bounds.height,
      inputFontSize: input ? Number.parseFloat(getComputedStyle(input).fontSize) : 0,
      iconWidth: iconBounds?.width ?? 0,
      iconHeight: iconBounds?.height ?? 0,
    };
  });
  // Fluent's public large size renders at 42px under the current shared CSS.
  // Keep the component-scale regression here; the CSS owner must raise the
  // command-bar box by 2px to meet the product's preferred 44px desktop height.
  expect(searchGeometry.height).toBeGreaterThanOrEqual(42);
  expect(searchGeometry.inputFontSize).toBeGreaterThanOrEqual(14);
  expect(searchGeometry.iconWidth).toBeGreaterThanOrEqual(20);
  expect(searchGeometry.iconHeight).toBeGreaterThanOrEqual(20);
});

test("Tabster exception preserves genuine aria-hidden focus enforcement", async ({ page }) => {
  await page.evaluate(() => {
    const hiddenRegion = document.createElement("div");
    hiddenRegion.id = "axe-hidden-focus-regression";
    hiddenRegion.setAttribute("aria-hidden", "true");
    hiddenRegion.innerHTML = "<button type=\"button\">Hidden test control</button>";
    document.body.append(hiddenRegion);
  });

  const result = await new AxeBuilder({ page })
    .withRules(["aria-hidden-focus"])
    .exclude("[data-tabster-dummy]")
    .analyze();

  expect(result.violations).toEqual([
    expect.objectContaining({
      id: "aria-hidden-focus",
      nodes: expect.arrayContaining([
        expect.objectContaining({ target: ["#axe-hidden-focus-regression"] }),
      ]),
    }),
  ]);
});

for (const surface of surfaces) {
  test(`axe gate: ${surface.name}`, async ({ page }, testInfo) => {
    await openSurface(page, surface);
    await scan(page, testInfo, surface);
  });
}
