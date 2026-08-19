import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { WORKING_PAPER_CATEGORIES, enumValue } from "../src/workflow.ts";
import {
  MAX_WORKING_PAPER_EVIDENCE_BYTES,
  safeWorkingPaperEvidenceFilename,
  workingPaperEvidenceSignatureMatches,
} from "../src/working-paper-evidence.ts";
import { workingPaperReadinessBlocks } from "../src/working-paper-controls.ts";

test("governed working-paper categories have a single validated API vocabulary", () => {
  assert.deepEqual(WORKING_PAPER_CATEGORIES, [
    "ACCEPTANCE",
    "PLANNING",
    "RECORDS",
    "INCOME",
    "EXPENDITURE",
    "ASSETS",
    "LIABILITIES",
    "FUNDS",
    "REPORTING",
    "COMPLETION",
  ]);
  assert.equal(
    enumValue({ categoryCode: "PLANNING" }, "categoryCode", WORKING_PAPER_CATEGORIES),
    "PLANNING",
  );
  assert.throws(
    () => enumValue({ categoryCode: "THEME" }, "categoryCode", WORKING_PAPER_CATEGORIES),
    /categoryCode is invalid/,
  );
});

test("one-off working-paper creation persists governance metadata", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(source, /boundedRequiredString\(body, "objective", 2000\)/);
  assert.match(source, /"categoryCode",\s*WORKING_PAPER_CATEGORIES/);
  assert.match(
    source,
    /insert into working_paper\(id,tenant_id,engagement_id,code,title,report_line_id,category_code,objective\)/,
  );
  assert.match(source, /\$\{title\},null,\$\{categoryCode\},\$\{objective\}/);
  assert.match(source, /insert into working_paper_report_line_link/);
});

test("working-paper evidence accepts only bounded files with matching signatures", () => {
  assert.equal(MAX_WORKING_PAPER_EVIDENCE_BYTES, 10 * 1024 * 1024);
  assert.equal(safeWorkingPaperEvidenceFilename(" evidence.pdf "), "evidence.pdf");
  assert.throws(() => safeWorkingPaperEvidenceFilename("../evidence.pdf"), /INVALID_FILENAME/);
  assert.equal(
    workingPaperEvidenceSignatureMatches(
      "application/pdf",
      Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]).buffer,
    ),
    true,
  );
  assert.equal(
    workingPaperEvidenceSignatureMatches(
      "application/pdf",
      new TextEncoder().encode("not a pdf").buffer,
    ),
    false,
  );
  assert.equal(
    workingPaperEvidenceSignatureMatches(
      "text/csv",
      Uint8Array.from([0x61, 0x2c, 0x62, 0x0a]).buffer,
    ),
    true,
  );
  assert.equal(
    workingPaperEvidenceSignatureMatches(
      "text/csv",
      Uint8Array.from([0x61, 0x00, 0x62]).buffer,
    ),
    false,
  );
});

test("evidence storage is R2-first, tenant-prefixed, proxied and orphan-cleaned", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const put = source.indexOf("await env.ARTEFACTS.put(uploadedKey,upload.bytes");
  const insert = source.indexOf("insert into working_paper_attachment", put);
  assert.ok(put > 0 && insert > put);
  assert.match(source, /tenants\/\$\{ctx\.tenantId\}\/engagements\/\$\{engagementId\}\/working-papers/);
  assert.match(source, /deleteUploadedObject\(env,uploadedKey,"working paper evidence transaction failed"\)/);
  assert.match(source, /Stored evidence hash does not match its immutable record/);
  assert.doesNotMatch(source, /storageKey:String\(row\.storage_key\)/);
  assert.doesNotMatch(source, /insert into working_paper_(?:report_line|assertion|risk|theme)_link[^;]+on conflict/);
});

test("library selection excludes drafts and deterministically prefers effective approval", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(source, /select distinct on\(template_code\)/);
  assert.match(source, /governance_status='APPROVED' and effective_from<=/);
  assert.match(source, /governance_status='BASELINE' and provenance_label='REPOSITORY_BASELINE_NOT_CERTIFIED'/);
  assert.match(source, /case governance_status when 'APPROVED' then 0 else 1 end/);
  assert.doesNotMatch(source, /governance_status\s+in\s*\([^)]*DRAFT/i);
});

test("report-line catalogue and writes use the engagement pack-derived taxonomy", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(source, /async function workingPaperReportingScope/);
  assert.match(source, /statement_definition_line l[\s\S]+canonical_account a[\s\S]+canonical_report_line r/);
  assert.match(source, /REPORTING_TAXONOMY_AMBIGUOUS/);
  assert.match(source, /IMPERMISSIBLE_REPORT_LINE/);
  assert.match(source, /scope\.lines\.some\(line=>String\(line\.id\)===reportLineId\)/);
});

test("readiness fails closed only on core and explicitly configured requirements", () => {
  const base = {
    applicability: "APPLICABLE",
    objective: "Conclude on completeness",
    narrative: "Work performed and conclusion.",
    requirements: { reportLineRequired: false, assertionRequired: false, riskRequired: false, themeRequired: false, evidenceRequired: false },
    counts: { reportLines: 0, assertions: 0, risks: 0, themes: 0, evidence: 0 },
  };
  assert.deepEqual(workingPaperReadinessBlocks(base), []);
  assert.deepEqual(
    workingPaperReadinessBlocks({ ...base, objective: "", narrative: "", requirements: { ...base.requirements, evidenceRequired: true } }),
    ["OBJECTIVE_REQUIRED", "NARRATIVE_REQUIRED", "CURRENT_VERSION_EVIDENCE_REQUIRED"],
  );
  assert.deepEqual(
    workingPaperReadinessBlocks({ ...base, requirements: { reportLineRequired: true, assertionRequired: true, riskRequired: true, themeRequired: true, evidenceRequired: false } }),
    ["REPORT_LINE_REQUIRED", "ASSERTION_REQUIRED", "RISK_REQUIRED", "THEME_REQUIRED"],
  );
});

test("governance-link corrections are append-only, current-only and audited", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../../../packages/database/migrations/0026_governed_working_paper_evidence.sql", import.meta.url),
    "utf8",
  );
  assert.match(source, /async function replaceWorkingPaperGovernanceLink/);
  assert.match(source, /supersedes_link_id,supersession_reason,created_by/g);
  assert.match(source, /const linkPurpose=old\?String\(old\.link_purpose\):""/);
  assert.match(source, /const isPrimary=old\?Boolean\(old\.is_primary\):false/);
  assert.match(source, /not exists\(select 1 from working_paper_(?:report_line|assertion|risk|theme)_link successor/);
  assert.match(source, /WORKING_PAPER_REPORT_LINE_REPLACED/);
  assert.match(source, /WORKING_PAPER_ASSERTION_REPLACED/);
  assert.match(source, /WORKING_PAPER_RISK_REPLACED/);
  assert.match(source, /WORKING_PAPER_THEME_REPLACED/);
  assert.equal((source.match(/as is_current from working_paper_(?:report_line|assertion|risk|theme)_link/g) ?? []).length, 4);
  assert.equal((source.match(/LINK_TARGET_PREVIOUSLY_USED/g) ?? []).length, 8);
  assert.equal((migration.match(/supersedes_link_id uuid/g) ?? []).length, 4);
  assert.equal((migration.match(/supersession_reason text/g) ?? []).length, 4);
  assert.match(migration, /byte_size>0 AND byte_size<=10485760/);
});
