import { describe, expect, it } from "vitest";
import {
  workingPaperArea,
  workingPaperStatusSummary,
} from "./workingPaperGovernance";
import type { WorkingPaper } from "./api";

function paper(
  status: WorkingPaper["status"],
  applicability: WorkingPaper["applicability"] = "APPLICABLE",
): WorkingPaper {
  return {
    id: `${status}-${applicability}`,
    code: "A01",
    title: "Test paper",
    status,
    current_version: 1,
    applicability,
  };
}

describe("working-paper governance presentation", () => {
  it("groups every governed category into an accounting work area", () => {
    expect(workingPaperArea("ACCEPTANCE")).toBe("Engagement and planning");
    expect(workingPaperArea("ASSETS")).toBe("Records and balances");
    expect(workingPaperArea("COMPLETION")).toBe(
      "Reporting and completion",
    );
  });

  it("summarises review state without exposing actor subjects", () => {
    expect(
      workingPaperStatusSummary([
        paper("REVIEWED"),
        paper("PREPARED"),
        paper("IN_PROGRESS"),
        paper("NOT_STARTED", "NOT_APPLICABLE"),
      ]),
    ).toBe(
      "1 reviewed · 1 ready for review · 1 in preparation · 1 not applicable",
    );
  });
});
