import { describe, expect, it } from "vitest";
import type { Disclosure } from "./api";
import { scopeDisclosureChecklist } from "./disclosureScope";

const input = (existing: Disclosure[] = []) => ({
  framework: "FRS_102",
  sectorProfile: "NONE",
  periodStart: "2025-01-01",
  periodEnd: "2025-12-31",
  report: [],
  trialBalance: [],
  existing,
});

describe("disclosure requirement scoping", () => {
  it("does not present inferred requirements as saved open disclosures", () => {
    const { items } = scopeDisclosureChecklist(input());

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.record_state === "NOT_RECORDED")).toBe(true);
    expect(items.every((item) => item.status === "NOT_RECORDED")).toBe(true);
    expect(items.every((item) => item.id.startsWith("requirement:"))).toBe(true);
  });

  it("preserves the lifecycle of an actual saved disclosure", () => {
    const saved: Disclosure = {
      id: "disclosure-1",
      disclosure_code: "ACCOUNTING_POLICIES",
      applicability: "REQUIRED",
      status: "COMPLETE",
      current_version: 2,
      answer: { answer: "Recorded policy" },
    };

    const scoped = scopeDisclosureChecklist(input([saved]));
    const item = scoped.items.find(
      (candidate) => candidate.disclosure_code === saved.disclosure_code,
    );

    expect(item).toMatchObject({
      id: saved.id,
      record_state: "SAVED",
      status: "COMPLETE",
      current_version: 2,
    });
  });
});
