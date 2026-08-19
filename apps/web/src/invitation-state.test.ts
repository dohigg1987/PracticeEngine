import { describe, expect, it } from "vitest";
import { invitationStatus } from "./invitationState";

describe("invitation status", () => {
  const now = Date.parse("2026-08-19T12:00:00Z");

  it("derives active and expired state from the current time", () => {
    expect(invitationStatus("2026-08-19T12:01:00Z", now)).toBe("ACTIVE");
    expect(invitationStatus("2026-08-19T12:00:00Z", now)).toBe("EXPIRED");
    expect(invitationStatus("2026-08-19T11:59:00Z", now)).toBe("EXPIRED");
  });

  it("does not present an invalid expiry as active", () => {
    expect(invitationStatus("not-a-date", now)).toBe("EXPIRED");
  });
});
