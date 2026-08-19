import { describe, expect, it } from "vitest";
import {
  actorDisplayLabel,
  formatDate,
  formatDateTime,
  formatPeriodYear,
  mappingSummaryLabel,
  normalizeDisplayText,
} from "./displayFormat";

describe("safe display formatting", () => {
  it("formats date-only periods consistently in UTC", () => {
    expect(formatDate("2026-08-31")).toBe("31 Aug 2026");
    expect(formatPeriodYear("2026-08-31")).toBe("2026");
  });

  it("contains invalid upstream dates instead of throwing RangeError", () => {
    expect(() => formatDateTime("not-a-date")).not.toThrow();
    expect(formatDateTime("not-a-date")).toBe("Not recorded");
    expect(formatDate("", "Date unavailable")).toBe("Date unavailable");
  });

  it("never exposes opaque actor identifiers", () => {
    expect(actorDisplayLabel("702c2769-a5b1-4fb7-82ce-3306b355f213")).toBe("Team member");
    expect(actorDisplayLabel("SYSTEM_IMPORT")).toBe("System process");
  });

  it("does not report an empty import as fully mapped", () => {
    expect(mappingSummaryLabel(0, 0)).toBe("No accounts imported");
    expect(mappingSummaryLabel(4, 0)).toBe("All mapped");
    expect(mappingSummaryLabel(4, 2)).toBe("2 to review");
  });

  it("repairs known UTF-8 mojibake without changing valid report titles", () => {
    expect(normalizeDisplayText("Trusteesâ€™ or directorsâ€™ report")).toBe(
      "Trustees’ or directors’ report",
    );
    expect(normalizeDisplayText("Trustees’ report")).toBe("Trustees’ report");
  });
});
