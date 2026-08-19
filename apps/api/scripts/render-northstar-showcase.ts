import { writeFile } from "node:fs/promises";
import { renderAccountsPdf } from "../src/pdf-artefacts.ts";
import type { AccountsHtmlInput } from "../src/artefacts.ts";

const output = process.argv[2];
if (!output) throw new Error("An output path is required");

const input: AccountsHtmlInput = {
  organisation: {
    legalName: "Northstar Community Charity",
    legalForm: "CHARITABLE COMPANY LIMITED BY GUARANTEE",
    jurisdiction: "England and Wales",
  },
  engagement: {
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    framework: "FRS_102",
    sectorProfile: "CHARITIES_SORP_2026",
  },
  accountsVersion: {
    version: 1,
    status: "DRAFT",
    contentHash:
      "8e4b93d08d7a640ac847438705b25c28701b5a6cfcc95cf0ac3b10d6332a914e",
    generatedAt: "2027-02-15T09:30:00.000Z",
  },
  pack: {
    code: "CHARITIES-SORP-2026",
    version: 1,
    title: "Illustrative Charities SORP 2026 showcase",
    certificationStatus: "BASELINE_NOT_CERTIFIED",
    provenanceLabel: "ILLUSTRATIVE_FIXTURE_REPOSITORY_BASELINE",
  },
  entityDetails: {
    registrationNumber: "ILLUSTRATIVE FIXTURE - NOT A REGISTERED ENTITY",
    charityNumber: "ILLUSTRATIVE FIXTURE ONLY",
    registeredOffice: "1 Example Square, London, EX1 1AA",
    governingDocument: "Illustrative articles of association",
    directorsOrTrustees: ["A. Example", "B. Example", "C. Example"],
  },
  reports: [
    {
      code: "TRUSTEES_REPORT",
      title: "Status of this showcase",
      paragraphs: [
        "This document is an illustrative product-quality showcase generated from fixture data. It is not a filed set of accounts, is not regulator certified and must not be used as factual information about any real entity.",
      ],
    },
    {
      code: "OBJECTIVES",
      title: "Objectives and activities",
      paragraphs: [
        "The illustrative charity advances community wellbeing through advice, outreach and small-grant programmes. Activities shown here exist solely to demonstrate the statutory-accounts layout.",
      ],
    },
    {
      code: "ACHIEVEMENTS",
      title: "Achievements and performance",
      paragraphs: [
        "During the illustrative 2026 period the fixture records a balanced programme of unrestricted operations and restricted-project delivery. Trustees would replace this paragraph with approved versioned narrative before issue.",
      ],
    },
    {
      code: "RESERVES",
      title: "Reserves policy",
      paragraphs: [
        "The illustrative policy targets unrestricted reserves sufficient to support three months of core expenditure. This is fixture content and not a recommendation or statement about a real charity.",
      ],
    },
  ],
  policies: [
    {
      code: "BASIS",
      title: "Basis of preparation",
      paragraphs: [
        "The illustrative accounts are presented in sterling under FRS 102 and the Charities SORP 2026 baseline pack for a period beginning on 1 January 2026. The pack is explicitly marked as repository baseline and not regulator certified.",
      ],
    },
    {
      code: "FUNDS",
      title: "Fund accounting",
      paragraphs: [
        "Unrestricted funds are available for general charitable purposes. Restricted funds are applied only to the purposes specified by the illustrative donor conditions represented in this fixture.",
      ],
    },
    {
      code: "INCOME",
      title: "Income recognition",
      paragraphs: [
        "Illustrative income is recognised when entitlement, probability of receipt and reliable measurement are demonstrated in the versioned fixture data.",
      ],
    },
  ],
  lines: [
    {
      statementCode: "SOFA",
      statementCaption: "Statement of financial activities",
      statementOrder: 1,
      lineCode: "INCOME.DONATIONS",
      caption: "Donations and legacies",
      displayOrder: 10,
      balance: "485000.00",
      comparativeBalance: "452000.00",
      fundBalances: [
        { fund: "Unrestricted", balance: "310000.00" },
        { fund: "Restricted", balance: "175000.00" },
      ],
    },
    {
      statementCode: "SOFA",
      statementCaption: "Statement of financial activities",
      statementOrder: 1,
      lineCode: "INCOME.CHARITABLE",
      caption: "Income from charitable activities",
      displayOrder: 20,
      balance: "265000.00",
      comparativeBalance: "238000.00",
      fundBalances: [
        { fund: "Unrestricted", balance: "190000.00" },
        { fund: "Restricted", balance: "75000.00" },
      ],
    },
    {
      statementCode: "SOFA",
      statementCaption: "Statement of financial activities",
      statementOrder: 1,
      lineCode: "EXPENDITURE.CHARITABLE",
      caption: "Expenditure on charitable activities",
      displayOrder: 30,
      balance: "-681000.00",
      comparativeBalance: "-629000.00",
      fundBalances: [
        { fund: "Unrestricted", balance: "-447000.00" },
        { fund: "Restricted", balance: "-234000.00" },
      ],
    },
    {
      statementCode: "SOFA",
      statementCaption: "Statement of financial activities",
      statementOrder: 1,
      lineCode: "NET.MOVEMENT",
      caption: "Net movement in funds",
      displayOrder: 40,
      balance: "69000.00",
      comparativeBalance: "61000.00",
      fundBalances: [
        { fund: "Unrestricted", balance: "53000.00" },
        { fund: "Restricted", balance: "16000.00" },
      ],
    },
    {
      statementCode: "BALANCE_SHEET",
      statementCaption: "Balance sheet",
      statementOrder: 2,
      lineCode: "FIXED_ASSETS",
      caption: "Tangible fixed assets",
      displayOrder: 10,
      balance: "248000.00",
      comparativeBalance: "231000.00",
    },
    {
      statementCode: "BALANCE_SHEET",
      statementCaption: "Balance sheet",
      statementOrder: 2,
      lineCode: "CURRENT_ASSETS",
      caption: "Current assets",
      displayOrder: 20,
      balance: "436000.00",
      comparativeBalance: "389000.00",
    },
    {
      statementCode: "BALANCE_SHEET",
      statementCaption: "Balance sheet",
      statementOrder: 2,
      lineCode: "CREDITORS",
      caption: "Creditors: amounts falling due within one year",
      displayOrder: 30,
      balance: "-97000.00",
      comparativeBalance: "-102000.00",
    },
    {
      statementCode: "BALANCE_SHEET",
      statementCaption: "Balance sheet",
      statementOrder: 2,
      lineCode: "NET_ASSETS",
      caption: "Net assets",
      displayOrder: 40,
      balance: "587000.00",
      comparativeBalance: "518000.00",
    },
    {
      statementCode: "CASH_FLOW",
      statementCaption: "Statement of cash flows",
      statementOrder: 3,
      lineCode: "OPERATING",
      caption: "Net cash provided by operating activities",
      displayOrder: 10,
      balance: "92000.00",
      comparativeBalance: "78000.00",
    },
    {
      statementCode: "CASH_FLOW",
      statementCaption: "Statement of cash flows",
      statementOrder: 3,
      lineCode: "CLOSING_CASH",
      caption: "Cash and cash equivalents at the end of the year",
      displayOrder: 20,
      balance: "301000.00",
      comparativeBalance: "226000.00",
    },
  ],
  disclosures: [
    {
      code: "NOTE_1_INCOME",
      applicability: "ILLUSTRATIVE",
      answer: {
        narrative: "Illustrative income analysis for layout review only.",
        unrestricted: "500000.00",
        restricted: "250000.00",
      },
    },
    {
      code: "NOTE_2_STAFF_COSTS",
      applicability: "ILLUSTRATIVE",
      answer: {
        wages: "214000.00",
        socialSecurity: "21000.00",
        pension: "12000.00",
      },
    },
    {
      code: "NOTE_3_FUNDS",
      applicability: "ILLUSTRATIVE",
      answer: {
        unrestrictedClosing: "411000.00",
        restrictedClosing: "176000.00",
        statement: "All figures and narratives are fixture data.",
      },
    },
  ],
};

await writeFile(output, await renderAccountsPdf(input));
