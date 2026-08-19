import { describe, expect, it } from "vitest";
import { inboxEmptyMessage } from "./inboxState";

describe("inbox empty state", () => {
  it("does not blame a filter when the unfiltered inbox is empty", () => {
    expect(inboxEmptyMessage("")).toBe("No notifications yet.");
  });

  it("describes the selected status when a filtered inbox is empty", () => {
    expect(inboxEmptyMessage("UNREAD")).toBe("No unread notifications.");
    expect(inboxEmptyMessage("READ")).toBe("No read notifications.");
  });
});
