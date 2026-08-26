import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  freshAuthToken: vi.fn(),
  AuthRequiredError: class AuthRequiredError extends Error {},
}));
vi.mock("@fluentui/react-components", async () => {
  const { createRequire } = await vi.importActual<{ createRequire: (url: string) => (id: string) => Record<string, unknown> }>("node:module");
  return createRequire(import.meta.url)("@fluentui/react-components");
});

import ResourceEconomics, { capacityDescription, capacityTone, filterResources, formatEconomicValue } from "./ResourceEconomics";
import type { ResourceProfile } from "./api";

const resources: ResourceProfile[] = [
  { id: "r1", display_name: "Aisha Khan", team_name: "Accounts", role_title: "Manager", status: "active", weekly_capacity_hours: 35, assigned_hours: 30, available_hours: 5, utilisation_percentage: 86, overdue_work: 1 },
  { id: "r2", display_name: "Ben Morgan", team_name: "Tax", role_title: "Associate", status: "unavailable", weekly_capacity_hours: 21, assigned_hours: 12, available_hours: 0, utilisation_percentage: 57, overdue_work: 0 },
];

describe("resource economics UI contracts", () => {
  it("filters resources by human-readable operating context", () => {
    expect(filterResources(resources, "manager", "Accounts", "active").map((item) => item.id)).toEqual(["r1"]);
    expect(filterResources(resources, "ben", "", "unavailable").map((item) => item.id)).toEqual(["r2"]);
  });

  it("labels capacity pressure with numeric values instead of relying on colour", () => {
    expect(capacityTone(-4, 35)).toBe("overallocated");
    expect(capacityDescription(-4, 35)).toBe("Over capacity by 4h");
    expect(capacityDescription(2, 35)).toContain("Capacity pressure");
    expect(capacityDescription(20, 35)).toContain("Available");
  });

  it("does not represent unknown economics as zero", () => {
    expect(formatEconomicValue(undefined, "GBP", "unavailable")).toBe("Unavailable");
    expect(formatEconomicValue(0, "GBP", "known")).toBe("£0");
    expect(formatEconomicValue(1250, "GBP", "estimated")).toBe("£1,250");
  });

  it("announces loading for every resource and economics surface", () => {
    for (const view of ["resources", "capacity", "allocation", "time", "portfolio", "management"] as const) {
      const html = renderToStaticMarkup(<ResourceEconomics view={view} context={{ tenantId: "tenant-1" }} />);
      expect(html).toContain('role="status"');
      expect(html).toContain("Loading");
    }
  });
});
