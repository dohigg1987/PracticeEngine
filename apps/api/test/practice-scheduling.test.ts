import assert from "node:assert/strict";
import test from "node:test";
import { addMonths, calculateDeadline, dateInTimeZone, evaluateRecurrence } from "../src/practice-scheduling.ts";

test("monthly recurrence is deterministic and clamps month ends", () => {
  assert.equal(addMonths("2027-01-31", 1), "2027-02-28");
  assert.deepEqual(evaluateRecurrence({ frequency: "monthly" }, "2027-01-31", "2027-04-30").map((x) => x.occurrenceDate), ["2027-01-31","2027-02-28","2027-03-31","2027-04-30"]);
});
test("quarterly annual and custom interval honor boundaries and horizon", () => {
  assert.equal(evaluateRecurrence({ frequency: "quarterly" }, "2027-01-01", "2027-12-31").length, 4);
  assert.equal(evaluateRecurrence({ frequency: "annually" }, "2027-03-31", "2029-03-30").length, 2);
  assert.deepEqual(evaluateRecurrence({ frequency: "monthly", interval: 2 }, "2027-01-01", "2027-12-31", "2027-07-01", 2).map((x) => x.occurrenceDate), ["2027-01-01","2027-03-01"]);
});
test("deadline rules retain deterministic provenance", () => {
  assert.equal(calculateDeadline({ type: "days_after_period_end", days: 30 }, { periodEnd: "2027-01-31" }, "2027-02-01T00:00:00.000Z").date, "2027-03-02");
  assert.equal(calculateDeadline({ type: "months_plus_days", months: 9, days: 1 }, { periodEnd: "2027-02-28" }).date, "2027-11-29");
  assert.equal(calculateDeadline({ type: "fixed_calendar_day", day: 7 }, { periodEnd: "2027-03-31" }).date, "2027-04-07");
});
test("generation boundaries use the tenant-local business date", () => {
  const instant = new Date("2027-01-01T00:30:00.000Z");
  assert.equal(dateInTimeZone(instant, "Europe/London"), "2027-01-01");
  assert.equal(dateInTimeZone(instant, "America/New_York"), "2026-12-31");
});
