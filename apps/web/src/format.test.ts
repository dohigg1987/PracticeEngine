import { describe, expect, it } from "vitest";
import { statutoryLabel } from "./format";

describe("statutoryLabel", () => {
  it.each([
    ["COMPANIES_HOUSE", "Companies House"],
    ["HMRC", "HM Revenue & Customs"],
    ["CCEW", "Charity Commission for England and Wales"],
    ["CCNI", "Charity Commission for Northern Ireland"],
    ["OSCR", "Scottish Charity Regulator (OSCR)"],
    ["DFE", "Department for Education"],
  ])("uses the professional regulator label for %s", (value, expected) => {
    expect(statutoryLabel(value)).toBe(expected);
  });

  it.each([
    ["CSV", "CSV upload"],
    ["XLSX", "Excel upload"],
    ["QUICKBOOKS", "QuickBooks Online"],
    ["FREEAGENT", "FreeAgent"],
  ])("uses the product label for connector %s", (value, expected) => {
    expect(statutoryLabel(value)).toBe(expected);
  });
});
