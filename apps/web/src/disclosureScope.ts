import type { Disclosure, ReportLine, TrialBalanceLine } from "./api";

type Requirement = {
  code: string;
  title: string;
  group: string;
  source: string;
  applicability: Disclosure["applicability"];
  trigger: string;
  value?: string;
  rendered?: boolean;
  assessment?: boolean;
};

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const amount = (value: string | number) => Number(value) || 0;
const hasCode = (lines: ReportLine[], part: string) =>
  lines.some((line) => line.code.includes(part) && Math.abs(amount(line.balance)) > 0.004);

export function disclosureAnswerText(answer?: Record<string, unknown>) {
  for (const field of ["narrative", "policy", "answer", "value"]) {
    if (typeof answer?.[field] === "string") return String(answer[field]);
  }
  return "";
}

export function disclosureAnswerField(code: string) {
  return [
    "FRS102.1.2",
    "SORP.GOING_CONCERN",
    "SORP.FUNDS",
    "SORP.INCOME_RECOGNITION",
    "SORP.EXPENDITURE",
    "SORP.SUPPORT_COSTS",
    "SORP.FIXED_ASSETS",
    "SORP.FINANCIAL_INSTRUMENTS",
    "SORP.PENSIONS",
  ].includes(code)
    ? "narrative"
    : "answer";
}

export function unresolvedDisclosurePlaceholders(value: string) {
  return [...value.matchAll(/\[([^\]\n]{2,160})\]/g)].map((match) => match[1]!.trim());
}

const baselineWording: Record<string, string> = {
  "FRS102.1.2": "The accounts have been prepared under the historical cost convention, FRS 102 and the Charities SORP 2026. The charity is a public benefit entity. [confirm any material departures or additional measurement bases]",
  "SORP.GOING_CONCERN": "The trustees have considered forecasts and available resources for at least twelve months from approval. [describe the assessment, key assumptions and any material uncertainties]",
  "SORP.FUNDS": "Unrestricted funds are available for the charity’s general purposes. Restricted funds are applied only to the purposes specified by the donor or funder. [describe any designated or endowment funds]",
  "SORP.INCOME_RECOGNITION": "Income is recognised when the charity has entitlement, receipt is probable and the amount can be measured reliably. [describe material grant, legacy, donated-service or performance-related income policies]",
  "SORP.EXPENDITURE": "Expenditure is recognised when a legal or constructive obligation exists, settlement is probable and the amount can be measured reliably. Irrecoverable VAT is charged with the related expenditure. [describe grant-making and cost-allocation policies where applicable]",
  "SORP.SUPPORT_COSTS": "Support and governance costs are allocated to activities on a basis consistent with the use of resources. [state the allocation bases used in the period]",
  "SORP.FIXED_ASSETS": "Tangible fixed assets are stated at cost less accumulated depreciation and impairment. [insert capitalisation threshold and depreciation rates by asset class]",
  "SORP.FINANCIAL_INSTRUMENTS": "Basic financial instruments are initially recognised at transaction value and subsequently measured at amortised cost where material. [describe any non-basic instruments or impairment approach]",
  "SORP.PENSIONS": "Contributions to [name and type of pension arrangement] are charged to expenditure in the period in which they become payable.",
  CHARITY_INFORMATION: "[legal name] is a [legal form] registered in [jurisdiction] under company number [number, if applicable] and charity number [number]. Its registered office is [address].",
  TRUSTEES_REPORT: "The trustees present their annual report and financial statements for the year ended [date]. [complete objectives, activities, achievements, financial review, future plans, governance and reference details]",
  PUBLIC_BENEFIT: "The trustees have had regard to Charity Commission guidance on public benefit. [explain how the activities undertaken furthered the charity’s purposes for the public benefit]",
  RESERVES_POLICY: "At the reporting date the charity held total funds of [amount], of which [amount] were unrestricted. [state the reserves target, basis, actual free reserves and actions where outside target]",
  TRUSTEE_REMUNERATION: "During the year [no trustees received remuneration or benefits / insert details and legal authority]. Trustee expenses of [amount] were reimbursed to [number] trustees.",
  RELATED_PARTIES: "[state that there were no related-party transactions requiring disclosure / describe each relationship, transaction, balance and terms]",
  STAFF_COSTS: "Average headcount was [number]. Staff costs comprised wages and salaries of [amount], social security costs of [amount] and pension costs of [amount].",
  HIGHER_PAID_STAFF: "The number of employees whose benefits exceeded the applicable reporting threshold was [number], analysed in bands as follows: [insert bands].",
  COMMITMENTS_CONTINGENCIES: "[state that there were no material commitments or contingent liabilities / describe nature and estimated financial effect]",
};

export function baselineDisclosureWording(code: string) {
  return baselineWording[code] || `[complete the ${code.toLowerCase().replaceAll("_", " ")} disclosure]`;
}

export function scopeDisclosureChecklist(input: {
  framework: string;
  sectorProfile: string;
  periodStart: string;
  periodEnd: string;
  report: ReportLine[];
  trialBalance: TrialBalanceLine[];
  existing: Disclosure[];
}) {
  const charity = input.sectorProfile === "CHARITIES_SORP_2026";
  const sofaIncome = input.report
    .filter((line) => line.statement_code === "SOFA" && /INCOME|DONATION/i.test(line.code))
    .reduce((total, line) => total + Math.max(0, amount(line.balance)), 0);
  const grossIncome = Math.abs(sofaIncome);
  const tier = !charity ? null : grossIncome <= 500_000 ? "Tier 1" : grossIncome <= 15_000_000 ? "Tier 2" : "Tier 3";
  const fixedAssets = hasCode(input.report, "FIXED_ASSETS");
  const debtors = hasCode(input.report, "RECEIVABLES") || hasCode(input.report, "DEBTORS");
  const creditors = hasCode(input.report, "PAYABLES") || hasCode(input.report, "CREDITORS");
  const supportCosts = hasCode(input.report, "SUPPORT_COSTS") || input.trialBalance.some((line) => /admin|support/i.test(line.canonical_code || line.account_name));
  const rules: Requirement[] = charity
    ? [
        { code: "CHARITY_INFORMATION", title: "Charity information and constitution", group: "Entity and basis", source: "Charities SORP 2026", applicability: "REQUIRED", trigger: "Charity accounts require identifying and constitutional information.", rendered: true },
        { code: "FRS102.1.2", title: "Basis of preparation and accounting policies", group: "Entity and basis", source: "FRS 102 and Charities SORP 2026", applicability: "REQUIRED", trigger: "Required for all accruals accounts.", rendered: true },
        { code: "SORP.GOING_CONCERN", title: "Going concern assessment", group: "Entity and basis", source: "FRS 102 Section 3", applicability: "REQUIRED", trigger: "Required for all accounts; material uncertainty must be disclosed.", rendered: true },
        { code: "TRUSTEES_REPORT", title: "Trustees’ annual report", group: "Trustees’ report", source: "Charities Act and Charities SORP 2026", applicability: "REQUIRED", trigger: "Required for the selected charity reporting period.", rendered: true },
        { code: "PUBLIC_BENEFIT", title: "Public benefit statement", group: "Trustees’ report", source: "Charities Act and Charity Commission guidance", applicability: "REQUIRED", trigger: "Required in the trustees’ annual report.", rendered: true },
        { code: "RESERVES_POLICY", title: "Reserves policy", group: "Trustees’ report", source: "Charities SORP 2026", applicability: "REQUIRED", trigger: "Required for the trustees’ annual report.", rendered: true },
        { code: "SORP.FUNDS", title: "Fund accounting and fund movements", group: "Financial statements", source: "Charities SORP 2026", applicability: "REQUIRED", trigger: "Charity accounts distinguish unrestricted, restricted and endowment funds.", rendered: true },
        { code: "SORP.INCOME_RECOGNITION", title: "Income recognition", group: "Accounting policies", source: "Charities SORP 2026", applicability: "REQUIRED", trigger: grossIncome ? `Income recognised in the SOFA: ${money.format(grossIncome)}.` : "Required accounting policy.", value: money.format(grossIncome), rendered: true },
        { code: "SORP.EXPENDITURE", title: "Expenditure recognition and irrecoverable VAT", group: "Accounting policies", source: "Charities SORP 2026", applicability: "REQUIRED", trigger: "Expenditure is presented in the SOFA.", rendered: true },
        { code: "SORP.SUPPORT_COSTS", title: "Support costs and allocation", group: "Accounting policies", source: "Charities SORP 2026", applicability: supportCosts ? "REQUIRED" : "NOT_APPLICABLE", trigger: supportCosts ? "Support or administration costs are present." : "No support-cost balance has been identified.", rendered: supportCosts },
        { code: "SORP.FIXED_ASSETS", title: "Tangible fixed assets and depreciation", group: "Balance sheet notes", source: "FRS 102 Section 17", applicability: fixedAssets ? "REQUIRED" : "NOT_APPLICABLE", trigger: fixedAssets ? "A non-zero fixed-asset balance is present." : "No fixed-asset balance is present.", rendered: fixedAssets },
        { code: "DEBTORS", title: "Debtors", group: "Balance sheet notes", source: "FRS 102", applicability: debtors ? "REQUIRED" : "NOT_APPLICABLE", trigger: debtors ? "A non-zero debtor balance is present." : "No debtor balance is present.", rendered: debtors },
        { code: "CREDITORS", title: "Creditors", group: "Balance sheet notes", source: "FRS 102", applicability: creditors ? "REQUIRED" : "NOT_APPLICABLE", trigger: creditors ? "A non-zero creditor balance is present." : "No creditor balance is present.", rendered: creditors },
        { code: "STAFF_COSTS", title: "Staff costs and employee numbers", group: "People and related parties", source: "Charities SORP 2026", applicability: "UNASSESSED", trigger: "Complete the employee and payroll assessment; ledger balances alone are insufficient.", assessment: true },
        { code: "HIGHER_PAID_STAFF", title: "Higher-paid employees", group: "People and related parties", source: "Charities SORP 2026", applicability: "UNASSESSED", trigger: "Confirm remuneration bands from payroll records.", assessment: true },
        { code: "TRUSTEE_REMUNERATION", title: "Trustee remuneration, benefits and expenses", group: "People and related parties", source: "Charities SORP 2026", applicability: "REQUIRED", trigger: "Positive or nil disclosure is required.", rendered: true },
        { code: "RELATED_PARTIES", title: "Related-party transactions", group: "People and related parties", source: "FRS 102 Section 33 and Charities SORP 2026", applicability: "REQUIRED", trigger: "Positive or nil disclosure is required.", rendered: true },
        { code: "SORP.PENSIONS", title: "Pension arrangements", group: "People and related parties", source: "FRS 102 Section 28", applicability: "UNASSESSED", trigger: "Confirm pension scheme participation from payroll records.", rendered: true, assessment: true },
        { code: "COMMITMENTS_CONTINGENCIES", title: "Commitments and contingent liabilities", group: "Other statutory notes", source: "FRS 102", applicability: "UNASSESSED", trigger: "Complete the legal and commitments assessment.", assessment: true },
        { code: "CASH_FLOW", title: "Statement of cash flows", group: "Other statutory notes", source: "FRS 102 and Charities SORP 2026", applicability: tier === "Tier 3" ? "REQUIRED" : "UNASSESSED", trigger: tier === "Tier 3" ? "Tier 3 charity: cash-flow presentation required." : `${tier}: confirm eligibility for any cash-flow exemption.`, assessment: tier !== "Tier 3" },
      ]
    : [
        { code: "ACCOUNTING_POLICIES", title: "Accounting policies", group: "Entity and basis", source: input.framework.replaceAll("_", " "), applicability: "REQUIRED", trigger: "Required by the selected reporting framework.", rendered: true },
        { code: "GOING_CONCERN", title: "Going concern", group: "Entity and basis", source: input.framework.replaceAll("_", " "), applicability: "REQUIRED", trigger: "Required for all accounts.", rendered: true },
        { code: "FIXED_ASSETS", title: "Tangible fixed assets", group: "Balance sheet notes", source: "FRS 102", applicability: fixedAssets ? "REQUIRED" : "NOT_APPLICABLE", trigger: fixedAssets ? "A non-zero balance is present." : "No fixed-asset balance is present.", rendered: fixedAssets },
        { code: "DEBTORS", title: "Debtors", group: "Balance sheet notes", source: "FRS 102", applicability: debtors ? "REQUIRED" : "NOT_APPLICABLE", trigger: debtors ? "A non-zero balance is present." : "No debtor balance is present.", rendered: debtors },
        { code: "CREDITORS", title: "Creditors", group: "Balance sheet notes", source: "FRS 102", applicability: creditors ? "REQUIRED" : "NOT_APPLICABLE", trigger: creditors ? "A non-zero balance is present." : "No creditor balance is present.", rendered: creditors },
        { code: "RELATED_PARTIES", title: "Related-party transactions", group: "Other statutory notes", source: "FRS 102 Section 33", applicability: "REQUIRED", trigger: "Positive or nil disclosure is required.", rendered: true },
      ];
  const existing = new Map(input.existing.map((item) => [item.disclosure_code, item]));
  const items = rules.map((rule) => {
    const saved = existing.get(rule.code);
    const rendered = Boolean(rule.rendered);
    return {
      ...(saved || {
        id: `scope:${rule.code}`,
        disclosure_code: rule.code,
        applicability: rule.applicability,
        status: "OPEN" as const,
        current_version: 0,
        answer: {
          [disclosureAnswerField(rule.code)]: baselineDisclosureWording(rule.code),
        },
      }),
      title: rule.title,
      requirement_source: rule.source,
      trigger_summary: rule.trigger,
      trigger_value: rule.value,
      rendered_in_accounts: rendered,
      sync_status: rule.assessment
        ? "ASSESSMENT_REQUIRED" as const
        : rendered
          ? saved ? "IN_SYNC" as const : "BASELINE_WORDING" as const
          : "NOT_RENDERED" as const,
      scope_group: rule.group,
      applicability: saved?.applicability === "UNASSESSED" ? rule.applicability : saved?.applicability || rule.applicability,
    } satisfies Disclosure;
  });
  return { items, tier, grossIncome, periodLabel: `${input.periodStart} to ${input.periodEnd}` };
}
