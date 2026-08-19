import { describe, expect, it } from "vitest";
import {
  permittedSectorProfiles,
  reportingRegimeError,
} from "./reporting-regime";

describe("reporting regime compatibility", () => {
  it("allows sector-neutral accounts under every supported framework", () => {
    for (const framework of ["FRS_101", "FRS_102", "FRS_102_1A", "FRS_105"])
      expect(reportingRegimeError(framework, "NONE", "Private limited company")).toBeNull();
  });

  it("allows each sector profile only with FRS 102 and a compatible entity", () => {
    expect(reportingRegimeError("FRS_102", "CHARITIES_SORP_2026", "Charitable company")).toBeNull();
    expect(reportingRegimeError("FRS_102", "ACADEMIES_2026", "Academy trust")).toBeNull();
    expect(reportingRegimeError("FRS_102", "LLP_SORP_2026", "Limited liability partnership")).toBeNull();
    expect(reportingRegimeError("FRS_105", "LLP_SORP_2026", "Limited liability partnership")).toMatch(/only available with FRS 102/);
    expect(reportingRegimeError("FRS_102", "LLP_SORP_2026", "Charitable company")).toMatch(/require the Charities SORP 2026 profile/);
  });

  it("filters the setup choices instead of presenting invalid combinations", () => {
    expect(permittedSectorProfiles("FRS_105", "Private limited company").map((item) => item.value)).toEqual(["NONE"]);
    expect(permittedSectorProfiles("FRS_102", "Private limited company").map((item) => item.value)).toEqual([
      "NONE",
      "CHARITIES_SORP_2026",
      "ACADEMIES_2026",
    ]);
    expect(permittedSectorProfiles("FRS_102", "Charitable company").map((item) => item.value)).toEqual(["CHARITIES_SORP_2026"]);
    expect(reportingRegimeError("FRS_102", "NONE", "Charitable company")).toMatch(/require the Charities SORP 2026 profile/);
  });

  it("keeps sector classification separate from a corporate legal form", () => {
    expect(reportingRegimeError("FRS_102", "CHARITIES_SORP_2026", "Private limited company")).toBeNull();
    expect(reportingRegimeError("FRS_102", "ACADEMIES_2026", "Private limited company")).toBeNull();
    expect(reportingRegimeError("FRS_102", "LLP_SORP_2026", "Private limited company")).toMatch(/limited liability partnership/);
  });
});
