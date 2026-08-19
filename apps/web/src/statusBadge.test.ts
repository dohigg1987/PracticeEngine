import { describe, expect, it } from "vitest";
import { statusBadgeProps } from "./statusBadge";

describe("statusBadgeProps", () => {
  it.each([
    ["ACTIVE", { appearance: "tint", color: "success" }],
    ["FAILED", { appearance: "tint", color: "danger" }],
    ["Restricted", { appearance: "tint", color: "warning" }],
    ["Not configured", { appearance: "outline", color: "subtle" }],
    ["PREPARATION", { appearance: "outline", color: "subtle" }],
  ] as const)("maps %s to its approved semantic treatment", (status, expected) => {
    expect(statusBadgeProps(status)).toEqual(expected);
  });

  it("uses an informative treatment for an unknown non-error status", () => {
    expect(statusBadgeProps("AWAITING_EXTERNAL_REVIEW")).toEqual({
      appearance: "tint",
      color: "informative",
    });
  });

  it("normalises whitespace and hyphens before mapping", () => {
    expect(statusBadgeProps(" reauth-required ")).toEqual({
      appearance: "tint",
      color: "warning",
    });
  });
});
