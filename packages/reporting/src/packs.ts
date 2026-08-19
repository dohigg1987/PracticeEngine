import type { FrameworkPack } from "./framework.js";

const balanceSheet = {
  code: "BALANCE_SHEET",
  caption: "Balance sheet",
  lines: [
    { code: "BS.FIXED_ASSETS", caption: "Tangible fixed assets", canonicalCodes: ["ASSET.FIXED.TANGIBLE"] },
    { code: "BS.RECEIVABLES", caption: "Debtors", canonicalCodes: ["ASSET.RECEIVABLES.TRADE", "ASSET.RECEIVABLES.OTHER"] },
    { code: "BS.CASH", caption: "Cash at bank and in hand", canonicalCodes: ["ASSET.CASH"] },
    { code: "BS.PAYABLES", caption: "Creditors", canonicalCodes: ["LIABILITY.PAYABLES.TRADE", "LIABILITY.PAYABLES.OTHER"] },
  ],
};

const profitAndLoss = {
  code: "PROFIT_AND_LOSS",
  caption: "Profit and loss account",
  lines: [
    { code: "PL.REVENUE", caption: "Turnover", canonicalCodes: ["REV.TRADING"] },
    { code: "PL.COST_OF_SALES", caption: "Cost of sales", canonicalCodes: ["EXP.DIRECT"] },
    { code: "PL.ADMIN", caption: "Administrative expenses", canonicalCodes: ["EXP.ADMIN", "EXP.STAFF", "EXP.DEPRECIATION"] },
  ],
};

const charitySofa = {
  code: "SOFA",
  caption: "Statement of financial activities",
  lines: [
    { code: "SOFA.DONATIONS", caption: "Donations and legacies", canonicalCodes: ["REV.DONATIONS"] },
    { code: "SOFA.CHARITABLE_INCOME", caption: "Income from charitable activities", canonicalCodes: ["REV.TRADING"] },
    { code: "SOFA.CHARITABLE_EXPENDITURE", caption: "Expenditure on charitable activities", canonicalCodes: ["EXP.DIRECT", "EXP.STAFF"] },
    { code: "SOFA.SUPPORT_COSTS", caption: "Support costs", canonicalCodes: ["EXP.ADMIN", "EXP.DEPRECIATION"] },
  ],
};

export const baselineFrameworkPacks: FrameworkPack[] = [
  {
    id: "FRS102-2026",
    framework: "FRS_102",
    sector: "NONE",
    effectiveFrom: "2026-01-01",
    statements: [profitAndLoss, balanceSheet],
    requiredDisclosures: ["ACCOUNTING_POLICIES", "TURNOVER", "EMPLOYEES", "FIXED_ASSETS", "DEBTORS", "CREDITORS", "RELATED_PARTIES"],
  },
  {
    id: "FRS102-1A-2026",
    framework: "FRS_102_1A",
    sector: "NONE",
    effectiveFrom: "2026-01-01",
    statements: [profitAndLoss, balanceSheet],
    requiredDisclosures: ["ACCOUNTING_POLICIES", "FIXED_ASSETS", "DEBTORS", "CREDITORS", "RELATED_PARTIES"],
  },
  {
    id: "FRS105-2026",
    framework: "FRS_105",
    sector: "NONE",
    effectiveFrom: "2026-01-01",
    statements: [profitAndLoss, balanceSheet],
    requiredDisclosures: ["ADVANCES_AND_CREDITS", "FINANCIAL_COMMITMENTS"],
  },
  {
    id: "CHARITIES-SORP-2026",
    framework: "FRS_102",
    sector: "CHARITIES_SORP_2026",
    effectiveFrom: "2026-01-01",
    statements: [charitySofa, balanceSheet],
    requiredDisclosures: ["CHARITY_INFORMATION", "TRUSTEES_REPORT", "ACCOUNTING_POLICIES", "FUND_ANALYSIS", "STAFF_COSTS", "TRUSTEE_REMUNERATION", "RELATED_PARTIES", "PUBLIC_BENEFIT", "RESERVES_POLICY"],
  },
  {
    id: "ACADEMIES-2025-26",
    framework: "FRS_102",
    sector: "ACADEMIES_2026",
    effectiveFrom: "2025-09-01",
    effectiveTo: "2026-08-31",
    statements: [charitySofa, balanceSheet],
    requiredDisclosures: ["TRUSTEES_REPORT", "GOVERNANCE_STATEMENT", "REGULARITY_STATEMENT", "TRUSTEE_RESPONSIBILITIES", "FUND_ANALYSIS", "GOVERNMENT_GRANTS", "PENSIONS", "EXECUTIVE_PAY", "RELATED_PARTIES", "CENTRAL_SERVICES"],
  },
  {
    id: "LLP-SORP-2026",
    framework: "FRS_102",
    sector: "LLP_SORP_2026",
    effectiveFrom: "2026-01-01",
    statements: [profitAndLoss, balanceSheet],
    requiredDisclosures: ["ACCOUNTING_POLICIES", "MEMBERS_INTERESTS", "MEMBERS_REMUNERATION", "PROFIT_DIVISION", "LOANS_TO_MEMBERS", "DESIGNATED_MEMBERS"],
  },
];
