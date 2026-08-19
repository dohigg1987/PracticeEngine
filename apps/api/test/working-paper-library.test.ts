import test from "node:test";
import assert from "node:assert/strict";
import {
  incompatibleRequestedTemplateCodes,
  workingPaperTemplateMatches,
} from "../src/working-paper-library.ts";

const core = { legal_forms: [], framework_codes: [], sector_codes: [] };
const charity = { legal_forms: [], framework_codes: [], sector_codes: ["CHARITIES_SORP_2026"] };
const section1A = { legal_forms: [], framework_codes: ["FRS_102_1A"], sector_codes: [] };
const company = { legal_forms: ["PRIVATE_LIMITED_COMPANY"], framework_codes: [], sector_codes: [] };

test("layers compose only for a compatible accounts-production profile", () => {
  const ordinary = { legalForm: "PRIVATE_LIMITED_COMPANY", framework: "FRS_102", sector: null };
  assert.equal(workingPaperTemplateMatches(core, ordinary), true);
  assert.equal(workingPaperTemplateMatches(company, ordinary), true);
  assert.equal(workingPaperTemplateMatches(charity, ordinary), false);
  assert.equal(workingPaperTemplateMatches(section1A, ordinary), false);

  const charityEngagement = { legalForm: "CHARITABLE_COMPANY", framework: "FRS_102", sector: "CHARITIES_SORP_2026" };
  assert.equal(workingPaperTemplateMatches(core, charityEngagement), true);
  assert.equal(workingPaperTemplateMatches(charity, charityEngagement), true);
  assert.equal(workingPaperTemplateMatches(company, charityEngagement), false);
});

test("an impermissible requested deployment is rejected rather than skipped", () => {
  assert.deepEqual(
    incompatibleRequestedTemplateCodes(new Set(["A01", "H01", "K02"]), ["A01", "K02"]),
    ["H01"],
  );
});
