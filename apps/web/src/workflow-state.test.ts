import { describe, expect, it } from "vitest";
import { submissionStageState } from "./workflowState";

describe("submission stage state", () => {
  it("stays pending until a filing attempt exists", () => {
    expect(submissionStageState()).toBe("pending");
    expect(submissionStageState({ total: 0, byStatus: {} })).toBe("pending");
  });

  it("requires attention while filing evidence is in progress or unsuccessful", () => {
    expect(
      submissionStageState({ total: 1, byStatus: { PREPARED: 1 } }),
    ).toBe("attention");
    expect(
      submissionStageState({ total: 1, byStatus: { REJECTED: 1 } }),
    ).toBe("attention");
  });

  it("is ready only when an accepted filing is recorded", () => {
    expect(
      submissionStageState({
        total: 2,
        byStatus: { REJECTED: 1, ACCEPTED: 1 },
      }),
    ).toBe("ready");
  });
});
