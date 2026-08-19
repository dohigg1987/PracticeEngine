import { describe, expect, it } from "vitest";
import type { FilingAttempt } from "./api";
import {
  blockingItemsLabel,
  blockingItemsMessage,
  engagementResponseIsCurrent,
  isOutstandingReviewPoint,
  reportBalanceLabel,
  submissionStageState,
} from "./workflowState";

function attempt(
  status: FilingAttempt["status"],
  attemptNo: number,
  createdAt: string,
): FilingAttempt {
  return {
    id: `attempt-${attemptNo}`,
    accounts_version_id: "version-1",
    regulator: "COMPANIES_HOUSE",
    attempt_no: attemptNo,
    status,
    payload_hash: "hash",
    created_at: createdAt,
  };
}

describe("submission stage state", () => {
  it("stays pending until a filing attempt exists", () => {
    expect(submissionStageState()).toBe("pending");
    expect(submissionStageState([])).toBe("pending");
  });

  it("requires attention while filing evidence is in progress or unsuccessful", () => {
    expect(submissionStageState([attempt("PREPARED", 1, "2026-01-01")])).toBe(
      "attention",
    );
    expect(submissionStageState([attempt("REJECTED", 1, "2026-01-01")])).toBe(
      "attention",
    );
  });

  it("uses the latest filing attempt rather than historical status counts", () => {
    expect(
      submissionStageState([
        attempt("ACCEPTED", 1, "2026-01-01T10:00:00Z"),
        attempt("REJECTED", 2, "2026-01-02T10:00:00Z"),
      ]),
    ).toBe("attention");
    expect(
      submissionStageState([
        attempt("REJECTED", 1, "2026-01-01T10:00:00Z"),
        attempt("ACCEPTED", 2, "2026-01-02T10:00:00Z"),
      ]),
    ).toBe("ready");
  });
});

describe("workflow truthfulness selectors", () => {
  it("rejects an operations response from a previously selected engagement", () => {
    expect(engagementResponseIsCurrent("engagement-a", "engagement-b")).toBe(
      false,
    );
    expect(engagementResponseIsCurrent("engagement-b", "engagement-b")).toBe(
      true,
    );
  });

  it("treats only cleared review points as complete", () => {
    expect(isOutstandingReviewPoint({ status: "OPEN" })).toBe(true);
    expect(isOutstandingReviewPoint({ status: "RESPONDED" })).toBe(true);
    expect(isOutstandingReviewPoint({ status: "REOPENED" })).toBe(true);
    expect(isOutstandingReviewPoint({ status: "CLEARED" })).toBe(false);
  });

  it("distinguishes an unknown blocker assessment from a verified zero", () => {
    expect(blockingItemsLabel(undefined)).toBe("Not assessed");
    expect(blockingItemsMessage(undefined)).toBe(
      "Blocking items have not been assessed.",
    );
    expect(blockingItemsLabel(0)).toBe("0 blocking");
    expect(blockingItemsMessage(0)).toBe(
      "No blocking items are currently reported.",
    );
  });

  it("never reports an uncomputed report balance as balanced", () => {
    expect(reportBalanceLabel(null)).toBe("Not assessed");
    expect(reportBalanceLabel(false)).toBe("Review required");
    expect(reportBalanceLabel(true)).toBe("Balanced");
  });
});
