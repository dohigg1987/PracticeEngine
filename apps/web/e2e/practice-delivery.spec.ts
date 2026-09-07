import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("work moves through task delivery, review points and completion", async ({ page }) => {
  await page.goto("/practice/work?work=work-advisory");
  await page.getByRole("button", { name: "Start work", exact: true }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Task title" }).fill("Check the funding assumptions");
  await dialog.getByRole("combobox", { name: "Assignee" }).selectOption("member-demo");
  await dialog.getByRole("button", { name: "Add task", exact: true }).click();
  const row = page.getByRole("row", { name: /Check the funding assumptions/ });
  await expect(row).toContainText("Not Started");
  await expect(page.getByRole("region", { name: "Next action" })).toContainText("1 task remaining");
  await row.getByRole("button", { name: "Start", exact: true }).click();
  await row.getByRole("button", { name: "Complete task", exact: true }).click();
  await expect(row).toContainText("Completed");
  await page.getByRole("tab", { name: /^Reviews/ }).click();
  await page.getByRole("button", { name: "Request review", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Task or stage" }).selectOption({ label: "Task · Check the funding assumptions" });
  await dialog.getByRole("combobox", { name: "Reviewer" }).selectOption("member-reviewer");
  await dialog.getByRole("button", { name: "Request review", exact: true }).click();
  await expect(page.getByRole("region", { name: "Next action" })).toContainText("Review the work");
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await page.getByRole("button", { name: "Add review point", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Review point", exact: true }).fill("Explain the growth assumption");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve review", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Address point", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Resolution / reason" }).fill("Evidence and assumptions documented");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Clear point", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Resolution / reason" }).fill("Reviewed the supporting evidence");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Approve review", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Complete work", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Complete work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Delivery complete", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add task", exact: true })).toHaveCount(0);
});

test("rescheduling requires a changed date and a real reason", async ({ page }) => {
  await page.goto("/practice/work?work=work-advisory");
  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await dialog.getByLabel("Due date", { exact: true }).fill("2027-05-01");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Reason / notes" }).fill("Client agreed a revised delivery date");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".pd-facts")).toContainText("1 May 2027");
});

test("client requests use canonical access recipients without requiring an engagement", async ({ page }) => {
  await page.goto("/practice/work?work=work-advisory");
  await page.getByRole("button", { name: "Request from client", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Send request", exact: true })).toBeDisabled();
  await dialog.getByRole("combobox", { name: "Recipient", exact: true }).selectOption("portal-access-client-1");
  await dialog.getByRole("textbox", { name: "Request", exact: true }).fill("Confirm the funding assumptions");
  await dialog.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Waiting on your client", exact: true })).toBeVisible();
});

test("client service activation is available before planning work", async ({ page }) => {
  await page.goto("/practice/clients?client=demo-org-2&area=services");
  await page.getByRole("button", { name: "Add service", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Service", exact: true }).selectOption("service-advisory");
  await dialog.getByRole("button", { name: "Add service", exact: true }).click();
  await expect(page.getByRole("table", { name: "Client services" })).toContainText("Advisory");
  await page.getByRole("button", { name: "Add work", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("combobox", { name: "Service", exact: true })).toContainText("Advisory");
});

test("delivery record and dialogs remain accessible at 320px and restore focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/practice/work?work=work-accounts-2026");
  const add = page.getByRole("button", { name: "Add task", exact: true });
  await add.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();
  for (const name of [/^Tasks/, /^Workflow/, /^Reviews/]) {
    await page.getByRole("tab", { name }).click();
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
});

test("delivery review images", async ({ page }) => {
  test.skip(process.env.PRACTICE_REVIEW_INLINE_EVIDENCE !== "true", "Optional visual evidence for review");
  for (const shot of [
    { name: "delivery-desktop", width: 1440, height: 1000, path: "/practice/work?work=work-accounts-2026", reviews: false },
    { name: "delivery-reviews-mobile", width: 390, height: 1000, path: "/practice/work?work=work-accounts-2026", reviews: true },
    { name: "delivery-home", width: 1440, height: 1000, path: "/practice/home", reviews: false },
  ]) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(shot.path);
    await expect(page.getByRole("heading", { name: shot.name === "delivery-home" ? "Home" : "2026 Annual Accounts", exact: true })).toBeVisible();
    if (shot.reviews) await page.getByRole("tab", { name: /^Reviews/ }).click();
    console.log("PRACTICE_DELIVERY_IMAGE=" + JSON.stringify({ name: shot.name, data: (await page.screenshot({ type: "jpeg", quality: 65, fullPage: true })).toString("base64") }));
  }
});
