import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";
import {
  ApiError,
  decodeTrialBalanceCsv,
  inspectTrialBalanceCsv,
  parseTrialBalanceCsv,
  regulatorEvidenceContentType,
  regulatorEvidenceFilename,
  regulatorEvidenceStatus,
  reportingRegimeError,
  requiredString,
  teamInvitationDatabaseError,
  teamInvitationExpiryHours,
  teamInvitationRole,
  teamInvitationToken,
  trialBalanceReadiness,
  workspaceName,
  workspaceOnboardingDatabaseError,
} from "../src/core.ts";

test("does not report an empty trial balance as balanced or fully mapped", () => {
  assert.deepEqual(trialBalanceReadiness(0, 0, "0", "0"), {
    balanced: false,
    fullyMapped: false,
  });
  assert.deepEqual(trialBalanceReadiness(2, 0, "125.00", "125.00"), {
    balanced: true,
    fullyMapped: true,
  });
  assert.deepEqual(trialBalanceReadiness(2, 1, "125.00", "125.00"), {
    balanced: true,
    fullyMapped: false,
  });
});

test("rejects incompatible reporting framework, sector and entity combinations", () => {
  assert.equal(reportingRegimeError("FRS_105", "NONE", "Private limited company"), null);
  assert.equal(reportingRegimeError("FRS_102", "CHARITIES_SORP_2026", "Charitable company"), null);
  assert.equal(reportingRegimeError("FRS_102", "ACADEMIES_2026", "Academy trust"), null);
  assert.equal(reportingRegimeError("FRS_102", "LLP_SORP_2026", "LLP"), null);
  assert.equal(reportingRegimeError("FRS_102", "CHARITIES_SORP_2026", "Private limited company"), null);
  assert.equal(reportingRegimeError("FRS_102", "ACADEMIES_2026", "Private limited company"), null);
  assert.match(reportingRegimeError("FRS_105", "LLP_SORP_2026", "LLP")!, /only available with FRS 102/);
  assert.match(reportingRegimeError("FRS_102", "LLP_SORP_2026", "Charitable company")!, /matching sector reporting profile/);
  assert.match(reportingRegimeError("FRS_102", "NONE", "Charitable company")!, /matching sector reporting profile/);
});
import { authenticateRequest } from "../src/auth.ts";
import {
  readinessReport,
  requestCorrelationId,
} from "../src/operations.ts";
import {
  renderAccountsHtml,
  type AccountsHtmlInput,
} from "../src/artefacts.ts";
import {
  ACCOUNTS_PDF_RENDERER_VERSION,
  renderAccountsPdf,
} from "../src/pdf-artefacts.ts";
import {
  deterministicEvidenceZip,
  evidenceJson,
} from "../src/evidence-bundle.ts";
import {
  assertAccountsVersionTransition,
  assertFilingTransition,
  assertJournalTransition,
  assertReconciliationTransition,
  assertReviewPointTransition,
  assertTaskTransition,
  assertWorkingPaperTransition,
  canonicalJson,
  journalLines,
} from "../src/workflow.ts";
import {
  adviserCreateCommand,
  adviserPatchCommand,
  officerCreateCommand,
  officerPatchCommand,
  permanentProfileCommand,
} from "../src/permanent-file-contracts.ts";

test("validates and normalises permanent-file profile fields", () => {
  assert.deepEqual(
    permanentProfileCommand({
      companyRegistrationNumber: " 01234567 ",
      registeredOfficeLine1: "1 High Street",
      registeredOfficeCountryCode: "gb",
      accountingReferenceMonth: 12,
      accountingReferenceDay: 31,
      website: "https://example.test",
    }),
    {
      companyRegistrationNumber: "01234567",
      registeredOfficeLine1: "1 High Street",
      registeredOfficeCountryCode: "GB",
      accountingReferenceMonth: 12,
      accountingReferenceDay: 31,
      website: "https://example.test",
    },
  );
  assert.throws(
    () => permanentProfileCommand({ accountingReferenceMonth: 12 }),
    /must be supplied together/,
  );
  assert.throws(
    () => permanentProfileCommand({ website: "javascript:alert(1)" }),
    /http or https/,
  );
});

test("validates officer creation and end-date updates", () => {
  const created = officerCreateCommand({
    officerType: "TRUSTEE",
    displayName: " Alex Morgan ",
    appointedOn: "2025-01-01",
    email: "ALEX@EXAMPLE.TEST",
    serviceAddressLine1: "1 High Street",
    serviceAddressCountryCode: "gb",
  });
  assert.equal(created.displayName, "Alex Morgan");
  assert.equal(created.email, "alex@example.test");
  assert.equal(created.serviceAddressCountryCode, "GB");
  assert.deepEqual(officerPatchCommand({ resignedOn: "2026-08-18" }), {
    resignedOn: "2026-08-18",
  });
  assert.throws(
    () => officerCreateCommand({ officerType: "DIRECTOR", displayName: "A", appointedOn: "2026-02-31" }),
    /ISO date/,
  );
});

test("requires adviser start dates and supports ending without deletion", () => {
  assert.deepEqual(
    adviserCreateCommand({ adviserType: "AUDITOR", firmName: " Example LLP ", activeFrom: "2026-01-01" }),
    {
      adviserType: "AUDITOR",
      firmName: "Example LLP",
      professionalBody: null,
      reportStyle: "GENERIC",
      activeFrom: "2026-01-01",
      activeTo: null,
    },
  );
  assert.deepEqual(adviserPatchCommand({ activeTo: "2026-12-31" }), {
    activeTo: "2026-12-31",
  });
  assert.throws(
    () => adviserCreateCommand({ adviserType: "AUDITOR", firmName: "Example LLP" }),
    /activeFrom is required/,
  );
});

test("parses a balanced trial balance and preserves raw values", () => {
  const result = parseTrialBalanceCsv(
    'Account Code,Account Name,Debit,Credit\n1000,Bank,"1,250.00",0\n4000,Income,0,1250',
  );
  assert.equal(result.balanced, true);
  assert.equal(result.debitTotal, "1250.00");
  assert.deepEqual(result.rows[0]?.rawRow, {
    "Account Code": "1000",
    "Account Name": "Bank",
    Debit: "1,250.00",
    Credit: "0",
  });
});

test("rejects invalid double-sided rows", () => {
  assert.throws(
    () => parseTrialBalanceCsv("Code,Name,Debit,Credit\n1000,Bank,10,10"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 422 &&
      error.code === "INVALID_CSV",
  );
});

test("auto-detects common trial-balance aliases regardless of punctuation or case", () => {
  const csv = "G/L CODE,Account.Description,DR Amount,CR-Amount\n1000,Bank,25,\n4000,Sales,,25";
  const inspection = inspectTrialBalanceCsv(csv);
  assert.deepEqual(inspection.suggestedMapping, {
    accountCode: 0,
    accountName: 1,
    debit: 2,
    credit: 3,
  });
  assert.equal(parseTrialBalanceCsv(csv).balanced, true);
});

test("parses arbitrary headings with an explicit column mapping", () => {
  const csv = "Ref,Label,Left side,Right side\n1000,Bank,100,\n4000,Income,,100";
  assert.throws(
    () => parseTrialBalanceCsv(csv),
    (error: unknown) => error instanceof ApiError && error.code === "CSV_MAPPING_REQUIRED",
  );
  const result = parseTrialBalanceCsv(csv, {
    accountCode: 0,
    accountName: 1,
    debit: 2,
    credit: 3,
  });
  assert.equal(result.balanced, true);
  assert.equal(result.rows[0]?.accountName, "Bank");
});

test("decodes UTF-8 BOM, UTF-16 LE/BE and Windows-1252 trial balances", () => {
  const csv = "Code,Name,Debit,Credit\n1000,Café,10,\n4000,Sales,,10";
  const utf8 = new TextEncoder().encode(csv);
  const utf8Bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]);
  assert.equal(decodeTrialBalanceCsv(utf8Bom).encoding, "UTF-8");

  const utf16leBody = new Uint8Array(csv.length * 2);
  for (let index = 0; index < csv.length; index++) {
    const code = csv.charCodeAt(index);
    utf16leBody[index * 2] = code & 0xff;
    utf16leBody[index * 2 + 1] = code >> 8;
  }
  const utf16le = Uint8Array.from([0xff, 0xfe, ...utf16leBody]);
  assert.equal(decodeTrialBalanceCsv(utf16le).encoding, "UTF-16 LE");
  assert.equal(parseTrialBalanceCsv(decodeTrialBalanceCsv(utf16le).text).balanced, true);

  const utf16beBody = Uint8Array.from(utf16leBody);
  for (let index = 0; index < utf16beBody.length; index += 2)
    [utf16beBody[index], utf16beBody[index + 1]] = [utf16beBody[index + 1]!, utf16beBody[index]!];
  const utf16be = Uint8Array.from([0xfe, 0xff, ...utf16beBody]);
  assert.equal(decodeTrialBalanceCsv(utf16be).encoding, "UTF-16 BE");

  const windowsText = "Code,Name,Debit,Credit\r\n1000,Director’s loan,£10,\r\n4000,Sales,,10";
  const windows1252 = Uint8Array.from(
    [...windowsText].map((character) =>
      character === "’" ? 0x92 : character === "£" ? 0xa3 : character.charCodeAt(0),
    ),
  );
  const decoded = decodeTrialBalanceCsv(windows1252);
  assert.equal(decoded.encoding, "Windows-1252");
  assert.equal(parseTrialBalanceCsv(decoded.text).rows[0]?.accountName, "Director’s loan");
});

test("rejects binary data instead of treating it as Windows-1252 CSV", () => {
  assert.throws(
    () => decodeTrialBalanceCsv(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3])),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 422 &&
      error.code === "INVALID_CSV_BINARY" &&
      /binary/.test(error.message),
  );
  assert.throws(
    () => decodeTrialBalanceCsv(Uint8Array.from([0xff, 0xfe, 0x41])),
    (error: unknown) =>
      error instanceof ApiError && error.code === "INVALID_CSV_ENCODING",
  );
});

test("rejects duplicate manual column assignments", () => {
  assert.throws(
    () => parseTrialBalanceCsv(
      "Ref,Label,Left,Right\n1000,Bank,10,\n4000,Sales,,10",
      { accountCode: 0, accountName: 0, debit: 2, credit: 3 },
    ),
    (error: unknown) =>
      error instanceof ApiError && error.code === "INVALID_CSV_MAPPING",
  );
});

test("validates required command fields", () => {
  assert.equal(
    requiredString({ framework: " FRS102 " }, "framework"),
    "FRS102",
  );
  assert.throws(() => requiredString({}, "framework"), /framework is required/);
});

test("normalises correlation identifiers without reflecting unsafe input", () => {
  assert.equal(requestCorrelationId("pilot-check:123"), "pilot-check:123");
  const generated = requestCorrelationId("unsafe header value\nsecond-line");
  assert.match(
    generated,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test("reports dependency readiness without exposing failure details", async () => {
  const ready = await readinessReport(
    {
      database: async () => undefined,
      artefactStorage: async () => undefined,
    },
    new Date("2026-08-18T12:00:00.000Z"),
  );
  assert.equal(ready.status, "ready");
  assert.equal(ready.checkedAt, "2026-08-18T12:00:00.000Z");

  const degraded = await readinessReport({
    database: async () => {
      throw new Error("postgres://secret@private-host/database");
    },
    artefactStorage: async () => undefined,
  });
  assert.deepEqual(degraded.components.database, { status: "unavailable" });
  assert.equal(JSON.stringify(degraded).includes("private-host"), false);
});

test("validates regulator response evidence metadata", () => {
  assert.equal(regulatorEvidenceStatus("ACCEPTED"), "ACCEPTED");
  assert.equal(regulatorEvidenceStatus("REJECTED"), "REJECTED");
  assert.throws(
    () => regulatorEvidenceStatus("SUBMITTED"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 400 &&
      error.code === "INVALID_REQUEST",
  );
  assert.equal(
    regulatorEvidenceContentType("Application/PDF; charset=binary"),
    "application/pdf",
  );
  assert.throws(
    () => regulatorEvidenceContentType("application/x-msdownload"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 415 &&
      error.code === "UNSUPPORTED_EVIDENCE_TYPE",
  );
  assert.equal(
    regulatorEvidenceFilename(" companies-house-response.pdf "),
    "companies-house-response.pdf",
  );
  assert.throws(
    () => regulatorEvidenceFilename("../response.pdf"),
    (error: unknown) =>
      error instanceof ApiError && error.code === "INVALID_EVIDENCE_FILENAME",
  );
});

test("validates bounded team invitation commands", () => {
  assert.equal(teamInvitationRole({ role: "ADMIN" }), "ADMIN");
  assert.equal(teamInvitationRole({ role: "MEMBER" }), "MEMBER");
  assert.throws(() => teamInvitationRole({ role: "OWNER" }), /ADMIN or MEMBER/);
  assert.equal(teamInvitationExpiryHours({}), 72);
  assert.equal(teamInvitationExpiryHours({ expiresInHours: 168 }), 168);
  assert.throws(
    () => teamInvitationExpiryHours({ expiresInHours: 0 }),
    /integer from 1 to 168/,
  );
  assert.throws(
    () => teamInvitationExpiryHours({ expiresInHours: 1.5 }),
    /integer from 1 to 168/,
  );
  const token = "A".repeat(43);
  assert.equal(teamInvitationToken({ token }), token);
  assert.throws(() => teamInvitationToken({ token: "not a token" }), /valid/);
});

test("maps only stable team invitation acceptance database errors", () => {
  const invalid = teamInvitationDatabaseError({
    code: "23514",
    constraint_name: "invitation_token_hash_valid_ck",
  });
  assert.equal(invalid?.status, 400);
  assert.equal(invalid?.code, "INVALID_INVITATION_REQUEST");
  const contextFailure = teamInvitationDatabaseError({
    code: "23514",
    constraint_name: "invitation_tenant_context_absent_ck",
  });
  assert.equal(contextFailure?.status, 500);
  assert.equal(
    teamInvitationDatabaseError({
      code: "23514",
      constraint_name: "unrelated_constraint",
    }),
    null,
  );
});

test("normalises and bounds self-service workspace names", () => {
  assert.equal(workspaceName({ name: "  North   Region  " }), "North Region");
  assert.throws(
    () => workspaceName({ name: "x".repeat(161) }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 400 &&
      error.code === "INVALID_REQUEST",
  );
});

test("maps stable workspace provisioning database errors", () => {
  const invalid = workspaceOnboardingDatabaseError({
    code: "23514",
    constraint_name: "onboarding_actor_id_valid_ck",
    message: "authenticated actor context is required",
  });
  assert.equal(invalid?.code, "WORKSPACE_ONBOARDING_INVALID");
  assert.equal(invalid?.status, 400);
  const conflict = workspaceOnboardingDatabaseError({ code: "23505" });
  assert.equal(conflict?.code, "WORKSPACE_CONFLICT");
  assert.equal(conflict?.status, 409);
  assert.equal(
    workspaceOnboardingDatabaseError({
      code: "23514",
      constraint_name: "unrelated_business_check",
    }),
    null,
  );
  assert.equal(workspaceOnboardingDatabaseError(new Error("network")), null);
});

test("requires a Bearer access token", async () => {
  await assert.rejects(
    authenticateRequest(
      new Request("https://api.example.test/v1/engagements"),
      async () => ({ sub: "unused" }),
    ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === "AUTHORIZATION_REQUIRED",
  );
});

test("rejects an invalid access token", async () => {
  const request = new Request("https://api.example.test/v1/engagements", {
    headers: { authorization: "Bearer invalid" },
  });
  await assert.rejects(
    authenticateRequest(request, async () => {
      throw new Error("invalid signature");
    }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === "INVALID_TOKEN",
  );
});

test("derives the actor exclusively from the verified subject", async () => {
  const request = new Request("https://api.example.test/v1/engagements", {
    headers: {
      authorization: "Bearer valid-token",
      "x-actor-id": "spoofed-actor",
    },
  });
  let verifiedToken = "";
  const actorId = await authenticateRequest(request, async (token) => {
    verifiedToken = token;
    return { sub: "neon-user-123" };
  });
  assert.equal(verifiedToken, "valid-token");
  assert.equal(actorId, "neon-user-123");
});

test("enforces balanced journals and preparer/approver segregation", () => {
  assert.throws(
    () =>
      assertJournalTransition(
        "DRAFT",
        "PREPARED",
        "preparer",
        "preparer",
        false,
      ),
    /must balance/,
  );
  assert.doesNotThrow(() =>
    assertJournalTransition("DRAFT", "PREPARED", "preparer", "preparer", true),
  );
  assert.throws(
    () =>
      assertJournalTransition(
        "PREPARED",
        "APPROVED",
        "preparer",
        "preparer",
        true,
      ),
    /differ from preparer/,
  );
});

test("validates journal line accounting sides", () => {
  const parsed = journalLines({
    lines: [
      { canonicalAccountId: "a", debit: "10.00", credit: "0" },
      { canonicalAccountId: "b", debit: "0", credit: "10" },
    ],
  });
  assert.equal(parsed.balanced, true);
  assert.throws(
    () =>
      journalLines({
        lines: [
          { canonicalAccountId: "a", debit: "1", credit: "1" },
          { canonicalAccountId: "b", debit: "0", credit: "1" },
        ],
      }),
    /exactly one/,
  );
});

test("blocks unsafe task and review-point transitions", () => {
  assert.doesNotThrow(() =>
    assertReconciliationTransition("IN_PROGRESS", "RECONCILED"),
  );
  assert.throws(
    () => assertReconciliationTransition("REVIEWED", "IN_PROGRESS"),
    /cannot transition/,
  );
  assert.throws(
    () => assertTaskTransition("COMPLETE", "OPEN"),
    /cannot transition/,
  );
  assert.throws(
    () => assertReviewPointTransition("OPEN", "RESPONDED", null, "a", "b"),
    /response is required/,
  );
  assert.throws(
    () =>
      assertReviewPointTransition(
        "RESPONDED",
        "CLEARED",
        "done",
        "raiser",
        "raiser",
      ),
    /differ from raiser/,
  );
});

test("canonicalises dependency manifests deterministically", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: true, x: ["b", "a"] } }),
    '{"a":{"x":["b","a"],"y":true},"z":1}',
  );
  assert.equal(canonicalJson({ a: 1, z: 2 }), canonicalJson({ z: 2, a: 1 }));
});

test("enforces working-paper segregation and immutable lifecycle transitions", () => {
  assert.throws(
    () => assertWorkingPaperTransition("PREPARED", "REVIEWED", "same", "same"),
    /differ from preparer/,
  );
  assert.doesNotThrow(() =>
    assertWorkingPaperTransition(
      "PREPARED",
      "REVIEWED",
      "reviewer",
      "preparer",
    ),
  );
  assert.throws(
    () => assertAccountsVersionTransition("FINAL", "REVIEWED"),
    /cannot transition/,
  );
  assert.doesNotThrow(() => assertFilingTransition("SUBMITTED", "ACCEPTED"));
  assert.throws(
    () => assertFilingTransition("ACCEPTED", "SUBMITTED"),
    /cannot transition/,
  );
});

test("renders deterministic escaped accounts HTML with positive debit and credit-normal lines", () => {
  const input: AccountsHtmlInput = {
    organisation: {
      legalName: "A & B <Holdings>",
      legalForm: "LIMITED",
      jurisdiction: "UK",
    },
    engagement: {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      framework: "FRS_102",
      sectorProfile: "NONE",
    },
    accountsVersion: {
      version: 1,
      status: "DRAFT",
      contentHash: "dependency-hash",
      generatedAt: "2026-12-31T00:00:00.000Z",
    },
    pack: {
      code: "FRS102-2026",
      version: 1,
      title: "FRS 102 baseline",
      certificationStatus: "BASELINE_NOT_CERTIFIED",
      provenanceLabel: "REPOSITORY_BASELINE",
    },
    lines: [
      {
        statementCode: "PL",
        statementCaption: "Profit and loss",
        statementOrder: 1,
        lineCode: "REVENUE",
        caption: "Revenue",
        displayOrder: 1,
        balance: "1250.00",
      },
      {
        statementCode: "BS",
        statementCaption: "Balance sheet",
        statementOrder: 2,
        lineCode: "CASH",
        caption: "Cash",
        displayOrder: 1,
        balance: "1250.00",
      },
    ],
    disclosures: [],
  };
  const first = renderAccountsHtml(input),
    second = renderAccountsHtml(input);
  assert.equal(first, second);
  assert.match(first, /A &amp; B &lt;Holdings&gt;/);
  assert.equal((first.match(/£1,250\.00/g) ?? []).length, 2);
  assert.doesNotMatch(first, /\(£1,250\.00\)/);
});

test("renders deterministic valid PDF bytes from an exact accounts version", async () => {
  const input: AccountsHtmlInput = {
    organisation: {
      legalName: "Deterministic Accounts Limited",
      legalForm: "LIMITED",
      jurisdiction: "UK",
    },
    engagement: {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      framework: "FRS_102",
      sectorProfile: "NONE",
    },
    accountsVersion: {
      version: 2,
      status: "FINAL",
      contentHash: "a".repeat(64),
      generatedAt: "2026-12-31T12:00:00.000Z",
    },
    pack: {
      code: "FRS102-2026",
      version: 1,
      title: "FRS 102 baseline",
      certificationStatus: "BASELINE_NOT_CERTIFIED",
      provenanceLabel: "REPOSITORY_BASELINE",
    },
    lines: [
      {
        statementCode: "PL",
        statementCaption: "Profit and loss",
        statementOrder: 1,
        lineCode: "REVENUE",
        caption: "Revenue",
        displayOrder: 1,
        balance: "1250.00",
      },
    ],
    disclosures: [
      {
        code: "ACCOUNTING_POLICY",
        applicability: "REQUIRED",
        answer: { policy: "Accruals basis" },
      },
    ],
  };
  const first = await renderAccountsPdf(input),
    second = await renderAccountsPdf(input);
  assert.deepEqual(first, second);
  assert.equal(new TextDecoder().decode(first.slice(0, 5)), "%PDF-");
  assert.ok(first.byteLength > 1_000);
  const loaded = await PDFDocument.load(first, { updateMetadata: false });
  assert.ok(loaded.getPageCount() >= 8);
  for (const page of loaded.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.01);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.01);
  }
  assert.equal(ACCOUNTS_PDF_RENDERER_VERSION, "accounts-pdf-v1");
});

test("builds deterministic evidence ZIPs and redacts private storage fields", () => {
  const modifiedAt = new Date("2026-12-31T12:00:00.000Z");
  const json = evidenceJson({
    id: "version-1",
    htmlStorageKey: "tenants/private/object.html",
    token: "one-time-secret",
    nested: { password: "private", contentHash: "public-hash" },
  });
  const files = [
    { path: "readiness-summary.json", bytes: evidenceJson({ ready: true }) },
    { path: "bundle-manifest.json", bytes: json },
  ];
  const first = deterministicEvidenceZip(files, modifiedAt),
    second = deterministicEvidenceZip([...files].reverse(), modifiedAt);
  assert.deepEqual(first, second);
  const expanded = unzipSync(first);
  assert.deepEqual(Object.keys(expanded).sort(), [
    "bundle-manifest.json",
    "readiness-summary.json",
  ]);
  const manifest = strFromU8(expanded["bundle-manifest.json"]!);
  assert.doesNotMatch(manifest, /private|one-time-secret|storageKey|password/);
  assert.match(manifest, /public-hash/);
  assert.throws(
    () =>
      deterministicEvidenceZip(
        [{ path: "../secret.txt", bytes: new Uint8Array([1]) }],
        modifiedAt,
      ),
    /unsafe file path/,
  );
});
