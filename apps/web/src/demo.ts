import type {
  AccountsVersion,
  OrganisationPermanentFile,
  PermanentFileAdviser,
  PermanentFileOfficer,
  PracticeService,
  PracticeReview,
  PracticeWorkStage,
  AutomationRule,
  RecurrenceExecution,
  PracticeTask,
  PracticeWorkItem,
  PracticeWorkTemplate,
  RecurringWorkSchedule,
  ResourceProfile,
  CapacityRow,
  WorkAllocation,
  TimeEntry,
  PortfolioEconomicsRow,
  PracticeEconomicsOverview,
  CrmProspect,
  CrmOpportunity,
  OnboardingCase,
  ClientRequestItem,
  PortalMessageItem,
  PortalThreadItem,
  WorkingPaper,
  WorkingPaperAttachment,
  WorkingPaperCategory,
  WorkingPaperGovernance,
  WorkingPaperGovernanceCatalogue,
  WorkingPaperLibraryItem,
  WorkingPaperRisk,
} from "./api";

const now = "2027-03-18T09:30:00.000Z";
let demoClientRequests: ClientRequestItem[] = [
  { id: "client-request-1", client_id: "demo-org", client_name: "Northstar Community Foundation", title: "Confirm trustee details", description: "Check the current trustee list and confirm that it is complete.", request_type: "confirmation", status: "open", priority: "high", due_at: "2027-03-25T17:00:00.000Z", engagement_name: "2026 accounts engagement", responsible_member_id: "member-demo", response_count: 0, completion_mode: "manual" },
  { id: "client-request-2", client_id: "demo-org-2", client_name: "Harbour Trading Ltd", title: "Upload quarterly bank statements", description: "Upload statements for each trading account for the quarter.", request_type: "document", status: "responded", priority: "normal", due_at: "2027-03-20T17:00:00.000Z", work_title: "Q1 VAT Return", responsible_member_id: "member-demo", response_count: 1, last_response_at: now, completion_mode: "manual" },
];
let demoPortalThreads: PortalThreadItem[] = [{ id: "portal-thread-1", client_id: "demo-org", client_name: "Northstar Community Foundation", subject: "Trustee information", status: "open", last_message_at: now, updated_at: now }];
let demoPortalMessages: PortalMessageItem[] = [{ id: "portal-message-1", sender_context: "practice", body: "Please let us know if any trustees changed during the year.", sent_at: now }];
let demoPracticeServices: PracticeService[] = [
  { id: "service-accounts", name: "Annual accounts", description: "Statutory accounts preparation and filing support", category: "accounts", status: "active", default_frequency: "annual", specialist_module_key: "ledgerly", entitlement_feature_key: "ledgerly.accounts" },
  { id: "service-vat", name: "VAT returns", description: "Periodic VAT return preparation", category: "tax", status: "active", default_frequency: "quarterly" },
  { id: "service-advisory", name: "Advisory", description: "General business advisory engagements", category: "advisory", status: "active" },
];
let demoPracticeWork: PracticeWorkItem[] = [
  { id: "work-accounts-2026", client_id: "demo-org", client_name: "Northstar Community Foundation", client_service_id: "client-service-accounts", service_name: "Annual accounts", engagement_id: "practice-engagement-1", engagement_name: "2026 accounts engagement", title: "2026 Annual Accounts", period_reference: "Year ended 31 December 2026", status: "in_progress", priority: "high", assigned_member_id: "member-demo", assigned_member_name: "Demo Partner", assigned_team_name: "Accounts", planned_start_date: "2027-01-08", due_date: "2027-09-30", specialist_module_key: "ledgerly", specialist_record_reference: "demo-engagement" },
  { id: "work-vat-q1", client_id: "demo-org-2", client_name: "Harbour Trading Ltd", client_service_id: "client-service-vat", service_name: "VAT returns", title: "Q1 VAT Return", period_reference: "Quarter ended 31 March 2027", status: "waiting_on_client", priority: "urgent", assigned_member_name: "Demo Partner", assigned_team_name: "Business services", planned_start_date: "2027-04-02", due_date: "2027-05-07" },
  { id: "work-advisory", client_id: "demo-org", client_name: "Northstar Community Foundation", client_service_id: "client-service-advisory", service_name: "Advisory", title: "Funding model review", status: "ready", priority: "normal", assigned_team_name: "Advisory", due_date: "2027-04-15" },
];
let demoPracticeTasks: PracticeTask[] = [
  { id: "pm-task-1", work_item_id: "work-accounts-2026", title: "Confirm engagement scope", status: "completed", assignee_name: "Demo Partner", sequence: 10, due_date: "2027-01-10", completed_at: now },
  { id: "pm-task-2", work_item_id: "work-accounts-2026", title: "Prepare accounts", description: "Complete Ledgerly accounts-production work", status: "in_progress", assignee_name: "Demo Partner", team_name: "Accounts", sequence: 20, due_date: "2027-08-31" },
  { id: "pm-task-3", work_item_id: "work-accounts-2026", title: "Partner review", status: "not_started", reviewer_member_id: "member-reviewer", sequence: 30, due_date: "2027-09-15" },
];
const demoPracticeTemplates: PracticeWorkTemplate[] = [
  { id: "template-accounts", name: "Annual accounts delivery", service_id: "service-accounts", service_name: "Annual accounts", version: 1, status: "published", tasks: [{ title: "Confirm scope", sequence: 10, mandatory: true }, { title: "Prepare accounts", sequence: 20, mandatory: true }, { title: "Partner review", sequence: 30, mandatory: true }] },
];
const demoRecurringSchedules: RecurringWorkSchedule[] = [
  { id: "schedule-accounts", client_id: "demo-org", client_name: "Northstar Community Foundation", client_service_id: "client-service-accounts", service_name: "Annual accounts", work_template_id: "template-accounts", template_name: "Annual accounts delivery", recurrence_rule: { frequency: "annually" }, next_occurrence_date: "2027-12-31", next_due_date: "2028-09-30", owner_name: "Demo Partner", team_name: "Accounts", specialist_module_key: "ledgerly", status: "active" },
  { id: "schedule-vat", client_id: "demo-org-2", client_name: "Harbour Trading Ltd", client_service_id: "client-service-vat", service_name: "VAT returns", work_template_id: "template-accounts", template_name: "Quarterly VAT delivery", recurrence_rule: { frequency: "quarterly" }, next_occurrence_date: "2027-06-30", next_due_date: "2027-08-07", team_name: "Business services", status: "active" },
];
const demoResources: ResourceProfile[] = [
  { id: "member-demo", display_name: "Demo Partner", team_name: "Accounts", role_title: "Partner", status: "active", weekly_capacity_hours: 37.5, assigned_hours: 31, available_hours: 6.5, utilisation_percentage: 82.7, overdue_work: 1 },
  { id: "member-reviewer", display_name: "Review Manager", team_name: "Accounts", role_title: "Manager", status: "active", weekly_capacity_hours: 30, assigned_hours: 21, available_hours: 9, utilisation_percentage: 70, overdue_work: 0 },
];
const demoCapacity: CapacityRow[] = demoResources.map((resource, index) => ({
  resource_id: resource.id,
  display_name: resource.display_name,
  team_name: resource.team_name,
  periods: [
    { key: "2026-W35", label: "24–30 Aug", available_hours: resource.weekly_capacity_hours, committed_hours: index ? 21 : 31, forecast_hours: index ? 5 : 9, unavailable_hours: index ? 0 : 4, remaining_hours: index ? 9 : 2.5 },
    { key: "2026-W36", label: "31 Aug–6 Sep", available_hours: resource.weekly_capacity_hours, committed_hours: index ? 18 : 40, forecast_hours: 6, unavailable_hours: 0, remaining_hours: index ? 12 : -2.5 },
  ],
}));
let demoAllocations: WorkAllocation[] = [
  { id: "work-accounts-2026", work_title: "2026 Annual Accounts", client_id: "demo-org", client_name: "Northstar Community Foundation", client_service_id: "client-service-accounts", service_name: "Annual accounts", due_date: "2026-09-30", planned_hours: 42, remaining_hours: 18, resource_name: "Demo Partner", team_name: "Accounts", assignment_state: "confirmed", status: "in_progress" },
  { id: "work-vat-q1", work_title: "Q3 VAT Return", client_id: "demo-org-2", client_name: "Harbour Trading Ltd", client_service_id: "client-service-vat", service_name: "VAT returns", due_date: "2026-10-07", planned_hours: 12, remaining_hours: 12, resource_name: null, team_name: "Business services", assignment_state: "proposed", status: "ready" },
];
let demoTimeEntries: TimeEntry[] = [
  { id: "time-demo-1", date: "2026-08-26", resource_name: "Demo Partner", client_name: "Northstar Community Foundation", work_title: "2026 Annual Accounts", service_name: "Annual accounts", duration_hours: 3.5, billable: true, status: "submitted" },
];
const demoPortfolio: PortfolioEconomicsRow[] = [
  { id: "client-service-accounts", client_name: "Northstar Community Foundation", owner_name: "Demo Partner", team_name: "Accounts", service_name: "Annual accounts", workload_hours: 18, overdue_work: 1, capacity_pressure: "attention", wip_amount: 1250, revenue_amount: 5200, cost_amount: 2100, contribution_amount: 3100, margin_percentage: 59.6, currency: "GBP", commercial_value_state: "known" },
  { id: "client-service-vat", client_name: "Harbour Trading Ltd", owner_name: null, team_name: "Business services", service_name: "VAT returns", workload_hours: 12, overdue_work: 0, capacity_pressure: "normal", wip_amount: null, revenue_amount: null, cost_amount: 480, contribution_amount: null, margin_percentage: null, currency: "GBP", commercial_value_state: "unavailable" },
];
const demoEconomicsOverview: PracticeEconomicsOverview = { due_this_week: 4, overdue_work: 1, waiting_on_client: 2, review_queue: 3, capacity_utilisation_percentage: 78, forecast_capacity_hours: 15.5, wip_amount: null, economic_exceptions: 1, currency: "GBP" };
let demoWorkStages:PracticeWorkStage[]=[
  {id:"stage-prep",work_item_id:"work-accounts-2026",name:"Preparation",sequence:10,stage_type:"preparation",status:"active",source_template_version:1},
  {id:"stage-review",work_item_id:"work-accounts-2026",name:"Partner review",sequence:20,stage_type:"approval",status:"not_started",source_template_version:1},
];
let demoPracticeReviews:PracticeReview[]=[{id:"practice-review-1",work_item_id:"work-accounts-2026",work_title:"2026 Annual Accounts",client_name:"Northstar Community Foundation",service_name:"Annual accounts",stage_name:"Partner review",preparer_name:"Demo Partner",reviewer_name:"Review Partner",due_date:"2027-09-15",status:"requested",requested_at:now,waiting_hours:4,review_points:[{id:"practice-point-1",description:"Confirm the operational delivery checklist is complete",status:"open"}]}];
let demoAutomationRules:AutomationRule[]=[{id:"automation-1",name:"Assign urgent work to service team",enabled:true,trigger_type:"work.created",conditions:[{field:"workStatus",operator:"equals",value:"ready"}],actions:[{type:"assign_team",teamId:"team-accounts"}],priority:100,recent_executions:[]}];
let demoRecurrenceExecutions:RecurrenceExecution[]=[{id:"recurrence-run-1",trigger_type:"scheduled",status:"succeeded",schedules_evaluated:2,work_generated:1,blocked_entitlement:0,skipped_idempotent:1,failures:0,started_at:now,completed_at:now}];
let demoProspects:CrmProspect[]=[{id:"prospect-1",display_name:"Cedar Advisory Group",legal_name:"Cedar Advisory Group Ltd",entity_type:"COMPANY",status:"qualified",primary_contact_name:"Morgan Reed",primary_contact_email:"morgan@example.test",responsible_member_name:"Demo Partner",responsible_team_name:"Advisory",source:"Referral",last_activity_at:now,open_opportunities:1}];
let demoOpportunities:CrmOpportunity[]=[{id:"opportunity-1",prospect_id:"prospect-1",relationship_name:"Cedar Advisory Group",name:"Finance function and annual accounts",stage_key:"proposal",stage_name:"Proposal",status:"open",expected_close_date:"2027-04-30",probability:65,estimated_value:"12500.00",currency:"GBP",responsible_member_id:"member-demo",responsible_team_id:"team-advisory",responsible_member_name:"Demo Partner",responsible_team_name:"Advisory",services:[{id:"opportunity-service-1",serviceId:"service-accounts",name:"Annual accounts",accepted:false},{id:"opportunity-service-2",serviceId:"service-advisory",name:"Advisory",accepted:false}],proposal_status:"sent",conversion_state:"not_converted",proposals:[{id:"proposal-reference-1",proposal_id:"QB-2027-0042",proposal_version:"2",status:"sent"}],activities:[]}];
const demoOpportunityCapabilities=()=>{const readOnly=typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("permission")==="view";return {canCreate:!readOnly,canEdit:!readOnly,canConvert:!readOnly,quoteBenchAvailable:false};};
let demoOnboarding:OnboardingCase[]=[{id:"onboarding-1",client_id:"demo-org-2",client_name:"Harbour Trading Ltd",opportunity_id:"opportunity-converted",opportunity_name:"Bookkeeping and VAT onboarding",engagement_id:"practice-engagement-onboarding",engagement_name:"2027 bookkeeping and VAT",work_item_id:"work-onboarding",work_title:"Client onboarding — Service setup",status:"in_progress",mandatory_gates_complete:false,open_blockers:1,updated_at:now,tasks:[{id:"onboarding-task-1",work_item_id:"work-onboarding",title:"Confirm client details",status:"completed",sequence:10,completed_at:now},{id:"onboarding-task-2",work_item_id:"work-onboarding",title:"Request software access",status:"blocked",sequence:20}],stages:[{id:"onboarding-stage-1",work_item_id:"work-onboarding",name:"Client information",sequence:10,stage_type:"client_input",status:"blocked",block_reason:"Awaiting software authority",source_template_version:1}],blockers:[{id:"onboarding-blocker-1",summary:"Software authority is outstanding",status:"open"}]}];
const engagement = {
  id: "demo-engagement",
  organisation_id: "demo-org",
  legal_name: "Northstar Community Foundation",
  period_start: "2026-01-01",
  period_end: "2026-12-31",
  framework: "FRS_102",
  sector_profile: "CHARITIES_SORP_2026",
  assurance_regime: "INDEPENDENT_EXAMINATION",
  status: "IN_PROGRESS",
  version: 4,
};
const companyEngagement = {
  id: "demo-company-engagement",
  organisation_id: "demo-org-2",
  legal_name: "Harbour Trading Ltd",
  period_start: "2026-01-01",
  period_end: "2026-12-31",
  framework: "FRS_102_1A",
  sector_profile: "NONE",
  assurance_regime: "NO_EXTERNAL_SCRUTINY",
  status: "IN_PROGRESS",
  version: 2,
};
const demoLibrarySeed: [string, WorkingPaperLibraryItem["categoryCode"], string][] = [
  ["A01","ACCEPTANCE","Engagement setup and responsibilities"], ["A02","ACCEPTANCE","Client information authority and access"], ["A03","ACCEPTANCE","Engagement letter and scope"],
  ["B01","PLANNING","Entity and reporting profile"], ["B02","PLANNING","Information requirements and dependencies"], ["B03","PLANNING","Significant balances and judgements"], ["B04","PLANNING","Accounts production plan"],
  ["C01","RECORDS","Trial balance control"], ["C02","RECORDS","Opening balances and comparatives"], ["C03","RECORDS","Journal review"], ["C04","RECORDS","Accounting estimates"],
  ["D01","INCOME","Revenue and income"], ["D02","INCOME","Other income"], ["E01","EXPENDITURE","Operating expenditure"], ["E02","EXPENDITURE","Payroll and people costs"], ["E03","EXPENDITURE","Taxation"],
  ["F01","ASSETS","Bank and cash"], ["F02","ASSETS","Trade and other debtors"], ["F03","ASSETS","Tangible and intangible fixed assets"], ["F04","ASSETS","Investments"],
  ["G01","LIABILITIES","Creditors and accruals"], ["G02","LIABILITIES","Borrowings and finance"], ["G03","LIABILITIES","Provisions and contingencies"],
  ["H01","FUNDS","Fund accounting and reconciliation"], ["H02","FUNDS","Restricted funds"], ["H03","FUNDS","Reserves policy"], ["H04","FUNDS","Support cost allocation"], ["H05","INCOME","Donations, legacies and grants"], ["H06","EXPENDITURE","Charitable activities and grants payable"],
  ["H07","REPORTING","Trustees, related parties and benefits"], ["H08","REPORTING","Public benefit and activities report"], ["H09","REPORTING","Fundraising and safeguarding disclosures"],
  ["I01","REPORTING","Accounting policies"], ["I02","REPORTING","Statutory disclosure checklist"], ["I03","REPORTING","Trustees’ or directors’ report"],
  ["J01","COMPLETION","Going concern"], ["J02","COMPLETION","Subsequent events confirmation"], ["J03","COMPLETION","Related parties and statutory compliance disclosures"], ["J04","COMPLETION","Final accounts consistency review"], ["J05","COMPLETION","Client information confirmation and accounts approval"], ["J06","COMPLETION","Completion and review clearance"],
];
let demoWorkingPaperLibrary: WorkingPaperLibraryItem[] = demoLibrarySeed.map(
  ([code, categoryCode, title], index) => ({
    templateCode: code,
    templateVersion: 1,
    customTemplateId: null,
    categoryCode,
    sequenceNo: (index + 1) * 10,
    code,
    title,
    objective: `Document the evidence, procedures and conclusion for ${title.toLowerCase()}.`,
    guidance: "",
    defaultContent: { procedures: [], findings: "", conclusion: "" },
    required: !["D02","E03","F03","F04","G02","G03","H09"].includes(code),
    disposition: "INCLUDE",
    sourceScope: "STANDARD",
    overrideReason: null,
    deployedWorkingPaperId: ["F01","H02"].includes(code) ? `wp-${code}` : null,
    deployedApplicability: ["F01","H02"].includes(code) ? "APPLICABLE" : null,
    governanceStatus: "APPROVED",
    provenanceLabel: "GOVERNED_ACCOUNTS_PRODUCTION",
    controlledFallback: false,
    serviceFamily: "ACCOUNTS_PRODUCTION",
    applicabilityLayer: code.startsWith("H") ? "SECTOR" : "CORE",
  }),
);
let demoWorkingPapers: WorkingPaper[] = [
  {
    id: "wp-F01",
    code: "F01",
    title: "Bank and cash",
    status: "PREPARED",
    current_version: 2,
    prepared_by: "Demo Preparer",
    template_code: "F01",
    template_version: 1,
    template_scope: "STANDARD",
    category_code: "ASSETS",
    objective: "Verify the existence, completeness and presentation of cash.",
    applicability: "APPLICABLE",
    content: {
      narrative:
        "Cash agrees to the independent bank evidence and the ledger reconciliation. No exceptions were identified.",
    },
    content_hash: "sha256:wp2",
    version_created_by: "Demo Preparer",
    version_created_at: now,
    updated_at: now,
  },
  {
    id: "wp-H02",
    code: "H02",
    title: "Restricted funds",
    status: "IN_PROGRESS",
    current_version: 1,
    template_code: "H02",
    template_version: 1,
    template_scope: "STANDARD",
    category_code: "FUNDS",
    objective: "Confirm restrictions, movements and closing balances by fund.",
    applicability: "APPLICABLE",
    content: {
      narrative:
        "Fund conditions and movements are being agreed to the underlying grant records.",
    },
    content_hash: "sha256:wp-h02",
    updated_at: now,
  },
];
const demoWorkingPaperCatalogue: WorkingPaperGovernanceCatalogue = {
  workAreas: [
    ["ACCEPTANCE", "Acceptance and continuance"],
    ["PLANNING", "Planning"],
    ["RECORDS", "Accounting records and controls"],
    ["INCOME", "Income"],
    ["EXPENDITURE", "Expenditure"],
    ["ASSETS", "Assets"],
    ["LIABILITIES", "Liabilities"],
    ["FUNDS", "Funds"],
    ["REPORTING", "Financial statements and reporting"],
    ["COMPLETION", "Completion"],
  ].map(([code, title], index) => ({
    code: code as WorkingPaperCategory,
    title,
    sequenceNo: (index + 1) * 10,
    status: "ACTIVE",
    provenanceLabel: "REPOSITORY_BASELINE_NOT_CERTIFIED",
  })),
  themes: [
    { code: "COMPLETENESS", title: "Completeness", description: "Completeness of records and balances" },
    { code: "INTERNAL_CONTROLS", title: "Internal controls", description: "Design and operation of relevant controls" },
    { code: "FINANCIAL_STATEMENT_DISCLOSURE", title: "Financial statement disclosure", description: "Presentation and disclosure support" },
  ].map((theme) => ({ ...theme, status: "ACTIVE", provenanceLabel: "REPOSITORY_BASELINE_NOT_CERTIFIED" })),
  templateThemes: [
    { templateCode: "F01", templateVersion: 1, themeCode: "COMPLETENESS", isPrimary: true },
  ],
  assertions: ["EXISTENCE", "OCCURRENCE", "RIGHTS_AND_OBLIGATIONS", "COMPLETENESS", "ACCURACY", "VALUATION", "ALLOCATION", "CUTOFF", "CLASSIFICATION", "PRESENTATION", "DISCLOSURE"],
  reportLines: [
    { id: "line-cash", taxonomyVersion: "UK-CANONICAL-2026", lineCode: "BS.CASH", caption: "Cash at bank and in hand", statementCode: "BS", displayOrder: 30 },
    { id: "line-funds", taxonomyVersion: "UK-CANONICAL-2026", lineCode: "BS.FUNDS", caption: "Charity funds", statementCode: "BS", displayOrder: 70 },
  ],
  evidence: {
    uploadAvailable: true,
    maxBytes: 10 * 1024 * 1024,
    mediaTypes: ["application/pdf", "text/plain", "text/csv", "application/csv", "image/png", "image/jpeg", "application/msword", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    evidenceTypes: ["SOURCE_DOCUMENT", "CALCULATION", "CONFIRMATION", "CORRESPONDENCE", "REPORT", "OTHER"],
  },
};
let demoWorkingPaperRisks: WorkingPaperRisk[] = [
  { id: "risk-cash", riskCode: "R.CASH.01", title: "Unrecorded bank accounts", description: "Bank accounts may be omitted from the ledger.", riskLevel: "HIGH", response: "Obtain independent bank evidence and reconcile all known accounts.", status: "OPEN", createdAt: now, updatedAt: now },
];
let demoWorkingPaperAttachments: WorkingPaperAttachment[] = [
  { id: "attachment-bank", workingPaperId: "wp-F01", workingPaperVersion: 2, filename: "bank-confirmation.pdf", mediaType: "application/pdf", byteSize: 48210, contentHash: "demo-bank-confirmation-hash", evidenceType: "CONFIRMATION", description: "Independent year-end bank confirmation", uploadedAt: now, contentPath: "/v1/engagements/demo-engagement/working-papers/wp-F01/attachments/attachment-bank/content" },
];
const demoWorkingPaperGovernance = new Map<string, Omit<WorkingPaperGovernance, "workingPaper" | "attachments">>([
  ["wp-F01", {
    reportLines: [{ id: "link-line-cash", reportLineId: "line-cash", lineCode: "BS.CASH", caption: "Cash at bank and in hand", statementCode: "BS", linkPurpose: "PRIMARY", createdAt: now }],
    assertions: [{ id: "link-assertion-existence", assertionCode: "EXISTENCE", createdAt: now }],
    risks: [{ id: "link-risk-cash", riskId: "risk-cash", riskCode: "R.CASH.01", title: "Unrecorded bank accounts", riskLevel: "HIGH", status: "OPEN", createdAt: now }],
    themes: [{ id: "link-theme-completeness", themeCode: "COMPLETENESS", title: "Completeness", isPrimary: true, createdAt: now }],
  }],
]);
function demoWorkingPaperGovernanceItem(paperId: string): WorkingPaperGovernance {
  const paper = demoWorkingPapers.find((item) => item.id === paperId) || demoWorkingPapers[0];
  const links = demoWorkingPaperGovernance.get(paperId) || {
    reportLines: [], assertions: [], risks: [], themes: [],
  };
  return {
    workingPaper: {
      id: paper.id,
      code: paper.code,
      title: paper.title,
      categoryCode: paper.category_code || "REPORTING",
      objective: paper.objective || null,
      status: paper.status,
      currentVersion: paper.current_version,
      templateCode: paper.template_code || null,
      templateVersion: paper.template_version || null,
      templateScope: paper.template_scope || "ENGAGEMENT",
      applicability: paper.applicability || "APPLICABLE",
    },
    ...links,
    attachments: demoWorkingPaperAttachments.filter(
      (attachment) => attachment.workingPaperId === paperId,
    ),
  };
}
function demoWorkingPaperLinks(
  paperId: string,
): Omit<WorkingPaperGovernance, "workingPaper" | "attachments"> {
  const existing = demoWorkingPaperGovernance.get(paperId);
  if (existing) return existing;
  const created: Omit<WorkingPaperGovernance, "workingPaper" | "attachments"> = {
    reportLines: [], assertions: [], risks: [], themes: [],
  };
  demoWorkingPaperGovernance.set(paperId, created);
  return created;
}
const accountsVersion: AccountsVersion = {
  id: "demo-accounts-v3",
  version: 3,
  status: "FINAL",
  trial_balance_id: "demo-tb",
  framework_pack_id: "CHARITIES-SORP-2026",
  content_manifest: {
    framework: "FRS 102",
    period: "31 December 2026",
    sections: [
      "Trustees' report",
      "Statement of financial activities",
      "Balance sheet",
      "Cash flow statement",
      "Notes to the accounts",
    ],
    sourceTrialBalance: "demo-tb-v4",
    disclosureRuleSet: "CHARITIES-SORP-2026@1",
    generatedLineCount: 47,
  },
  content_hash: "sha256:9b7b…4f21",
  generated_by: "Demo Partner",
  generated_at: now,
  frozen_at: now,
  signoffs: [
    {
      id: "sig-0",
      signoff_type: "PREPARED",
      signed_by: "Demo Preparer",
      signed_at: "2027-03-16T14:00:00Z",
      object_version: 3,
    },
    {
      id: "sig-review",
      signoff_type: "REVIEWED",
      signed_by: "Demo Reviewer",
      signed_at: "2027-03-17T08:45:00Z",
      object_version: 3,
    },
    {
      id: "sig-1",
      signoff_type: "PARTNER_APPROVED",
      signed_by: "Demo Partner",
      signed_at: now,
      object_version: 3,
    },
    {
      id: "sig-2",
      signoff_type: "CLIENT_APPROVED",
      signed_by: "Client approver",
      signed_at: now,
      object_version: 3,
    },
    {
      id: "sig-3",
      signoff_type: "FILING_AUTHORISED",
      signed_by: "Demo Partner",
      signed_at: now,
      object_version: 3,
    },
  ],
};
let demoAccountsVersions: AccountsVersion[] = [
  accountsVersion,
  {
    ...accountsVersion,
    id: "demo-accounts-v2",
    version: 2,
    status: "SUPERSEDED",
    content_hash: "sha256:1a42…90de",
    generated_at: "2027-03-14T11:00:00Z",
    frozen_at: "2027-03-15T12:00:00Z",
    signoffs: [],
  },
];
let demoNarrativeVersion = 3;
const portalContacts = [
  {
    id: "portal-contact-1",
    displayName: "Amelia Hart",
    email: "amelia@northstar.example.org",
    accessRole: "CLIENT_APPROVER",
    contactStatus: "ACTIVE",
    accessStatus: "ACTIVE",
    createdAt: now,
  },
  {
    id: "portal-contact-2",
    displayName: "Jon Bell",
    email: "jon@northstar.example.org",
    accessRole: "CLIENT_PREPARER",
    contactStatus: "ACTIVE",
    accessStatus: "INVITED",
    createdAt: now,
  },
];
const documentRequests = [
  {
    id: "request-1",
    title: "December bank statement",
    description: "Signed year-end statement",
    dueAt: "2027-03-22T17:00:00Z",
    assignedContactId: "portal-contact-2",
    documentType: "Bank statement",
    status: "RESPONDED",
    createdAt: now,
    latestResponse: {
      id: "response-1",
      requestId: "request-1",
      version: 1,
      filename: "current-account-december.pdf",
      contentType: "application/pdf",
      byteSize: 184220,
      contentHash: "sha256:portal-response",
      createdAt: now,
    },
  },
  {
    id: "request-2",
    title: "Trustee approval minutes",
    dueAt: "2027-03-25T17:00:00Z",
    assignedContactId: "portal-contact-1",
    documentType: "Minutes",
    status: "OPEN",
    createdAt: now,
  },
];
const integrations = [
  {
    id: "integration-1",
    connectorCode: "CSV",
    organisationId: "demo-org",
    displayName: "Northstar nominal export",
    status: "CONFIGURED",
    hasCredentials: false,
    configuration: { templateVersion: 1, headerRow: 1 },
    createdAt: now,
    updatedAt: now,
  },
];
const notifications = [
  {
    id: "notification-1",
    type: "DOCUMENT_RESPONSE",
    title: "Bank statement received",
    message:
      "Northstar uploaded a response to the December bank statement request.",
    severity: "INFO",
    status: "UNREAD",
    actionPath: "/engagement/demo-engagement/portal",
    createdAt: now,
  },
  {
    id: "notification-2",
    type: "ACCOUNTS_FINAL",
    title: "Accounts version finalised",
    message: "Version 3 passed client and partner approval.",
    severity: "SUCCESS",
    status: "READ",
    createdAt: now,
    readAt: now,
  },
];

const reads: Array<[RegExp, unknown]> = [
  [
    /^\/v1\/me\/tenants$/,
    {
      items: [
        {
          tenant_id: "demo-workspace",
          name: "Northstar Accounts Demo",
          role_code: "OWNER",
        },
      ],
      onboarding: null,
    },
  ],
  [
    /^\/v1\/team$/,
    {
      members: [
        {
          id: "member-demo",
          role: "OWNER",
          createdAt: now,
          isCurrentActor: true,
        },
        {
          id: "member-reviewer",
          role: "MEMBER",
          createdAt: now,
          isCurrentActor: false,
        },
      ],
      invitations: [],
    },
  ],
  [
    /^\/v1\/organisations$/,
    {
      items: [
        {
          id: "demo-org",
          legal_name: "Northstar Community Foundation",
          legal_form: "Charitable company",
          jurisdiction: "England and Wales",
          created_at: now,
        },
        {
          id: "demo-org-2",
          legal_name: "Harbour Trading Ltd",
          legal_form: "Private limited company",
          jurisdiction: "England and Wales",
          created_at: now,
        },
      ],
    },
  ],
  [/^\/v1\/engagements$/, { items: [engagement, companyEngagement] }],
  [
    /^\/v1\/organisations\/demo-org\/permanent-file$/,
    {
      item: {
        organisation: {
          id: "demo-org",
          legalName: "Northstar Community Foundation",
          legalForm: "CHARITABLE_COMPANY",
          jurisdiction: "ENGLAND_AND_WALES",
          officerNameStyle: "FULL_NAME_WITH_HONOURS",
          tradingName: "Northstar Foundation",
          companyRegistrationNumber: "09481247",
          charityRegistrationNumber: "1182047",
          registeredOfficeAddress: {
            line1: "14 Harbour Street",
            locality: "Bristol",
            postalCode: "BS1 4QF",
            countryCode: "GB",
          },
          accountingReferenceMonth: 12,
          accountingReferenceDay: 31,
          principalActivity:
            "Community grants, youth services and neighbourhood programmes",
          website: "https://northstar.example.org",
          telephone: "0117 555 0142",
          notes: "Public benefit review completed annually by the trustees.",
          createdAt: "2021-01-01T09:00:00Z",
          updatedAt: now,
        },
        officers: [
          {
            id: "officer-1",
            displayName: "Amelia Hart",
            title: "Ms",
            givenNames: "Amelia",
            familyName: "Hart",
            suffixHonours: "MA",
            officerType: "TRUSTEE",
            appointedOn: "2022-06-15",
            resignedOn: null,
            occupation: "Community programme director",
            updatedAt: now,
          },
          {
            id: "officer-2",
            displayName: "Jon Bell",
            officerType: "TRUSTEE",
            appointedOn: "2024-02-01",
            resignedOn: null,
            updatedAt: now,
          },
          {
            id: "officer-3",
            displayName: "Priya Shah",
            officerType: "COMPANY_SECRETARY",
            appointedOn: "2023-09-12",
            resignedOn: null,
            updatedAt: now,
          },
        ],
        advisers: [
          {
            id: "adviser-1",
            adviserType: "BANKER",
            firmName: "North West Commercial Bank",
            contactName: "Charities team",
            telephone: "0345 555 0180",
            address: {
              line1: "1 Exchange Square",
              locality: "Bristol",
              postalCode: "BS1 6AA",
              countryCode: "GB",
            },
            status: "ACTIVE",
            activeFrom: "2021-01-01",
            activeTo: null,
            updatedAt: now,
          },
          {
            id: "adviser-2",
            adviserType: "SOLICITOR",
            firmName: "Mason & Cole LLP",
            contactName: "Rebecca Cole",
            email: "rebecca.cole@example.org",
            address: {
              line1: "8 King Street",
              locality: "Bristol",
              postalCode: "BS1 4EF",
              countryCode: "GB",
            },
            status: "ACTIVE",
            activeFrom: "2023-04-01",
            activeTo: null,
            updatedAt: now,
          },
          {
            id: "adviser-3",
            adviserType: "INDEPENDENT_EXAMINER",
            firmName: "Westborough Assurance LLP",
            contactName: "Ruth Morgan",
            contactQualifications: "FCA",
            professionalBody: "ICAEW",
            reportStyle: "ICAEW",
            status: "ACTIVE",
            activeFrom: "2025-01-01",
            activeTo: null,
            updatedAt: now,
          },
        ],
        engagements: [
          {
            id: engagement.id,
            periodStart: engagement.period_start,
            periodEnd: engagement.period_end,
            framework: engagement.framework,
            sectorProfile: engagement.sector_profile,
            status: engagement.status,
          },
        ],
      },
    },
  ],
  [
    /^\/v1\/organisations\/demo-org-2\/permanent-file$/,
    {
      item: {
        organisation: {
          id: "demo-org-2",
          legalName: "Harbour Trading Ltd",
          legalForm: "PRIVATE_LIMITED_COMPANY",
          jurisdiction: "ENGLAND_AND_WALES",
          officerNameStyle: "INITIALS_AND_SURNAME",
          tradingName: "Harbour Trading",
          companyRegistrationNumber: "12874621",
          registeredOfficeAddress: {
            line1: "22 Queen Square",
            locality: "Bristol",
            postalCode: "BS1 4ND",
            countryCode: "GB",
          },
          accountingReferenceMonth: 12,
          accountingReferenceDay: 31,
          principalActivity: "Wholesale distribution of marine equipment",
          website: "https://harbour-trading.example.org",
          telephone: "0117 555 0198",
          notes: "Small-company audit exemption reviewed annually.",
          createdAt: "2020-05-12T09:00:00Z",
          updatedAt: now,
        },
        officers: [
          { id: "company-officer-1", displayName: "Daniel Price", officerType: "DIRECTOR", appointedOn: "2020-05-12", resignedOn: null, updatedAt: now },
          { id: "company-officer-2", displayName: "Sarah Wong", officerType: "DIRECTOR", appointedOn: "2022-03-01", resignedOn: null, updatedAt: now },
        ],
        advisers: [
          { id: "company-adviser-1", adviserType: "BANKER", firmName: "North West Commercial Bank", contactName: "Business banking", status: "ACTIVE", activeFrom: "2020-05-12", activeTo: null, updatedAt: now },
          { id: "company-adviser-2", adviserType: "ACCOUNTANT", firmName: "Ledgerly Practice", contactName: "Accounts team", status: "ACTIVE", activeFrom: "2025-01-01", activeTo: null, updatedAt: now },
        ],
        engagements: [
          { id: companyEngagement.id, periodStart: companyEngagement.period_start, periodEnd: companyEngagement.period_end, framework: companyEngagement.framework, sectorProfile: companyEngagement.sector_profile, status: companyEngagement.status },
        ],
      },
    },
  ],
  [/\/client-portal\/contacts$/, { items: portalContacts }],
  [/\/client-portal\/document-requests$/, { items: documentRequests }],
  [/^\/v1\/integrations$/, { items: integrations }],
  [
    /\/v1\/integrations\/[^/]+\/sync-runs$/,
    {
      items: [
        {
          id: "sync-1",
          integrationId: "integration-1",
          engagementId: engagement.id,
          status: "SUCCEEDED",
          counts: { imported: 47, rejected: 0 },
          startedAt: now,
          completedAt: now,
        },
      ],
    },
  ],
  [/^\/v1\/notifications(?:\?.*)?$/, { items: notifications }],
  [
    /^\/v1\/tenant\/settings$/,
    {
      item: {
        id: "demo-workspace",
        name: "Northstar Accounts Demo",
        lifecycleStatus: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    },
  ],
  [
    /^\/v1\/tenant\/export-requests$/,
    {
      items: [
        {
          id: "export-1",
          scope: "ENGAGEMENT",
          engagementId: engagement.id,
          format: "ZIP",
          status: "REQUESTED",
          requestedAt: now,
          completedAt: now,
        },
      ],
      capability: {
        generationAvailable: false,
        code: "EXPORT_RUNNER_NOT_PROVISIONED",
        message: "Export generation is not available in this environment.",
      },
    },
  ],
  [
    /\/accounts-versions\/[^/]+\/presentation$/,
    {
      item: {
        accountsVersionId: accountsVersion.id,
        currentPeriod: { start: "2026-01-01", end: "2026-12-31" },
        comparativePeriod: {
          start: "2025-01-01",
          end: "2025-12-31",
          accountsVersionId: "demo-accounts-v2",
        },
        statements: [
          {
            statementCode: "SOFA",
            title: "Statement of financial activities",
            columns: [
              { key: "current", label: "2026" },
              { key: "comparative", label: "2025" },
            ],
            lines: [
              {
                code: "SOFA.INCOME.DONATIONS",
                caption: "Donations and legacies",
                current: "184250.00",
                comparative: "171400.00",
              },
              {
                code: "SOFA.EXPENDITURE.CHARITABLE",
                caption: "Charitable activities",
                current: "-219430.00",
                comparative: "-207800.00",
              },
            ],
          },
        ],
        readiness: {
          comparativeConfigured: true,
          comparativeComplete: true,
          blocks: [],
        },
      },
    },
  ],
  [
    /\/canonical-accounts/,
    {
      items: [
        {
          id: "ca-cash",
          taxonomy_version: "UK-CANONICAL-2026",
          canonical_code: "BS.CASH",
          name: "Cash at bank and in hand",
          report_line: "Cash",
          normal_balance: "DEBIT",
        },
        {
          id: "ca-income",
          taxonomy_version: "UK-CANONICAL-2026",
          canonical_code: "SOFA.DONATIONS",
          name: "Donations and legacies",
          report_line: "Income from donations",
          normal_balance: "CREDIT",
        },
      ],
    },
  ],
  [
    /\/trial-balance$/,
    {
      items: [
        {
          source_account_id: "src-1000",
          account_code: "1000",
          account_name: "Current account",
          debit: "184250.00",
          credit: "0.00",
          canonical_account_id: "ca-cash",
          canonical_code: "BS.CASH",
          canonical_name: "Cash at bank and in hand",
          report_line: "Cash",
        },
        {
          source_account_id: "src-1100",
          account_code: "1100",
          account_name: "Fixtures and equipment",
          debit: "72300.00",
          credit: "0.00",
          canonical_account_id: "ca-fixed",
          canonical_code: "BS.FIXED_ASSETS",
          canonical_name: "Tangible fixed assets",
          report_line: "Fixed assets",
        },
        {
          source_account_id: "src-6000",
          account_code: "6000",
          account_name: "Community programme costs",
          debit: "219430.00",
          credit: "0.00",
          canonical_account_id: "ca-charitable-expense",
          canonical_code: "SOFA.CHARITABLE_EXPENDITURE",
          canonical_name: "Charitable activities",
          report_line: "Charitable expenditure",
        },
        {
          source_account_id: "src-4000",
          account_code: "4000",
          account_name: "Donations and legacies",
          debit: "0.00",
          credit: "184250.00",
          canonical_account_id: "ca-income",
          canonical_code: "SOFA.DONATIONS",
          canonical_name: "Donations and legacies",
          report_line: "Income from donations",
        },
        {
          source_account_id: "src-4100",
          account_code: "4100",
          account_name: "Programme service income",
          debit: "0.00",
          credit: "96800.00",
          canonical_account_id: "ca-charitable-income",
          canonical_code: "SOFA.CHARITABLE_INCOME",
          canonical_name: "Charitable activities income",
          report_line: "Charitable income",
        },
        {
          source_account_id: "src-2000",
          account_code: "2000",
          account_name: "Trade and other creditors",
          debit: "0.00",
          credit: "28750.00",
          canonical_account_id: "ca-creditors",
          canonical_code: "BS.CREDITORS",
          canonical_name: "Creditors within one year",
          report_line: "Creditors",
        },
        {
          source_account_id: "src-3000",
          account_code: "3000",
          account_name: "Funds brought forward",
          debit: "0.00",
          credit: "166180.00",
          canonical_account_id: "ca-funds",
          canonical_code: "BS.FUNDS",
          canonical_name: "Charity funds",
          report_line: "Funds",
        },
      ],
    },
  ],
  [
    /\/report$/,
    {
      balanced: true,
      fullyMapped: true,
      lines: [
        {
          code: "SOFA.INCOME.DONATIONS",
          caption: "Donations and legacies",
          statement_code: "SOFA",
          display_order: 10,
          balance: "184250.00",
          canonical_codes: ["SOFA.DONATIONS"],
          source_account_ids: ["src-4000"],
          fund_balances: { unrestricted: "40000.00", restricted: "144250.00", endowment: "0.00" },
          comparative_balance: "171400.00",
        },
        {
          code: "SOFA.INCOME.CHARITABLE",
          caption: "Income from charitable activities",
          statement_code: "SOFA",
          display_order: 20,
          balance: "96800.00",
          canonical_codes: ["SOFA.CHARITABLE_INCOME"],
          source_account_ids: ["src-4100", "src-4110"],
          fund_balances: { unrestricted: "96800.00", restricted: "0.00", endowment: "0.00" },
          comparative_balance: "88500.00",
        },
        {
          code: "SOFA.EXPENDITURE.CHARITABLE",
          caption: "Expenditure on charitable activities",
          statement_code: "SOFA",
          display_order: 40,
          balance: "-219430.00",
          canonical_codes: ["SOFA.CHARITABLE_EXPENDITURE"],
          source_account_ids: ["src-6000", "src-6100"],
          fund_balances: { unrestricted: "-115180.00", restricted: "-104250.00", endowment: "0.00" },
          comparative_balance: "-207800.00",
        },
        {
          code: "SOFA.NET_MOVEMENT",
          caption: "Net movement in funds",
          statement_code: "SOFA",
          display_order: 60,
          balance: "61620.00",
          canonical_codes: ["SOFA.NET_MOVEMENT"],
          source_account_ids: ["src-9998"],
          fund_balances: { unrestricted: "21620.00", restricted: "40000.00", endowment: "0.00" },
          comparative_balance: "52100.00",
        },
        {
          code: "BS.FIXED_ASSETS",
          caption: "Tangible fixed assets",
          statement_code: "BS",
          display_order: 10,
          balance: "72300.00",
          canonical_codes: ["BS.FIXED_ASSETS"],
          source_account_ids: ["src-1100"],
        },
        {
          code: "BS.CASH",
          caption: "Cash at bank and in hand",
          statement_code: "BS",
          display_order: 30,
          balance: "184250.00",
          canonical_codes: ["BS.CASH"],
          source_account_ids: ["src-1000"],
        },
        {
          code: "BS.CREDITORS",
          caption: "Creditors: amounts falling due within one year",
          statement_code: "BS",
          display_order: 40,
          balance: "-28750.00",
          canonical_codes: ["BS.CREDITORS"],
          source_account_ids: ["src-2000"],
        },
        {
          code: "BS.FUNDS",
          caption: "Total charity funds",
          statement_code: "BS",
          display_order: 70,
          balance: "227800.00",
          canonical_codes: ["BS.FUNDS"],
          source_account_ids: ["src-3000", "src-3100"],
        },
      ],
    },
  ],
  [
    /\/history$/,
    {
      items: [
        {
          event_id: "audit-1",
          occurred_at_utc: now,
          actor_id: "demo-user",
          event_type: "ACCOUNTS_VERSION_FINALISED",
          object_type: "ACCOUNTS_VERSION",
          object_id: "demo-accounts-v3",
          reason: "Client and partner approval recorded",
          correlation_id: "demo-correlation",
          metadata: { version: 3 },
          event_hash: "sha256:demo",
        },
      ],
    },
  ],
  [
    /\/dashboard$/,
    {
      engagementId: engagement.id,
      journals: { total: 2, byStatus: { APPROVED: 1, DRAFT: 1 } },
      reconciliations: { total: 3, byStatus: { REVIEWED: 2, IN_PROGRESS: 1 } },
      tasks: { total: 8, byStatus: { COMPLETE: 6, IN_PROGRESS: 2 } },
      reviewPoints: { total: 2, byStatus: { CLEARED: 1, OPEN: 1 } },
      progress: { completedTasks: 6, totalTasks: 8, percent: 75 },
      blockingItems: 1,
    },
  ],
  [
    /\/journals$/,
    {
      items: [
        {
          id: "journal-1",
          journal_no: 1,
          journal_type: "ADJUSTMENT",
          description: "Accrued professional fees",
          status: "APPROVED",
          version: 2,
          prepared_by: "Demo Preparer",
          approved_by: "Demo Partner",
          approved_at: now,
          lines: [
            {
              id: "jl-1",
              line_no: 1,
              canonical_account_id: "ca-expense",
              canonical_code: "SOFA.PROFESSIONAL_FEES",
              account_name: "Professional fees",
              debit: "4800.00",
              credit: "0.00",
            },
            {
              id: "jl-2",
              line_no: 2,
              canonical_account_id: "ca-accrual",
              canonical_code: "BS.ACCRUALS",
              account_name: "Accruals",
              debit: "0.00",
              credit: "4800.00",
            },
          ],
        },
      ],
    },
  ],
  [
    /\/reconciliations$/,
    {
      items: [
        {
          id: "rec-1",
          reconciliation_type: "BANK",
          title: "Current account – December 2026",
          status: "REVIEWED",
          ledger_balance: "184250.00",
          supporting_balance: "184250.00",
          tolerance: "1.00",
          updated_at: now,
        },
        {
          id: "rec-2",
          reconciliation_type: "PAYROLL",
          title: "December payroll control",
          status: "IN_PROGRESS",
          ledger_balance: "32200.00",
          supporting_balance: "31950.00",
          tolerance: "1.00",
          updated_at: now,
        },
      ],
    },
  ],
  [
    /\/workflow-tasks$/,
    {
      items: [
        {
          id: "task-1",
          task_type: "ACCOUNTS",
          title: "Complete trustees' report",
          status: "IN_PROGRESS",
          blocking: true,
          assigned_to: "Demo Preparer",
          due_at: "2027-03-22",
        },
        {
          id: "task-2",
          task_type: "REVIEW",
          title: "Partner review of financial statements",
          status: "OPEN",
          blocking: false,
          assigned_to: "Demo Partner",
          due_at: "2027-03-25",
        },
      ],
    },
  ],
  [
    /\/review-points$/,
    {
      items: [
        {
          id: "rp-1",
          object_type: "WORKING_PAPER",
          object_id: "wp-1",
          question:
            "Confirm post year-end grant receipts agree to bank evidence.",
          status: "OPEN",
          severity: "NORMAL",
          assigned_to: "Demo Preparer",
          created_at: now,
        },
      ],
    },
  ],
  [
    /\/working-papers\/[^/]+\/versions$/,
    {
      items: [
        {
          id: "wpv-2",
          version: 2,
          content: {
            conclusion:
              "Cash balance agrees to bank confirmation with no exceptions.",
          },
          content_hash: "sha256:wp2",
          created_by: "Demo Preparer",
          created_at: now,
        },
        {
          id: "wpv-1",
          version: 1,
          content: { conclusion: "Initial reconciliation completed." },
          content_hash: "sha256:wp1",
          created_by: "Demo Preparer",
          created_at: "2027-03-15T10:00:00Z",
        },
      ],
    },
  ],
  [
    /\/working-papers$/,
    {
      items: [
        {
          id: "wp-1",
          code: "A1",
          title: "Bank and cash reconciliation",
          status: "PREPARED",
          current_version: 2,
          prepared_by: "Demo Preparer",
          content: {
            objective: "Verify existence and completeness of cash",
            conclusion: "Agrees to independent bank evidence.",
          },
          content_hash: "sha256:wp2",
          version_created_by: "Demo Preparer",
          version_created_at: now,
          updated_at: now,
        },
        {
          id: "wp-2",
          code: "B4",
          title: "Restricted funds testing",
          status: "IN_PROGRESS",
          current_version: 1,
          content: { sampleSize: 12, exceptions: 0 },
          content_hash: "sha256:wpb4",
          updated_at: now,
        },
      ],
    },
  ],
  [
    /\/disclosures$/,
    {
      items: [
        {
          id: "disc-1",
          disclosure_code: "FRS102.1.2",
          applicability: "REQUIRED",
          status: "REVIEWED",
          current_version: 2,
          rule_version: "2026.1",
          answer: {
            narrative:
              "The accounts have been prepared under FRS 102 and Charities SORP 2026.",
          },
          updated_at: now,
        },
        {
          id: "disc-2",
          disclosure_code: "SORP.FUNDS",
          applicability: "REQUIRED",
          status: "COMPLETE",
          current_version: 1,
          rule_version: "2026.1",
          answer: {
            policy:
              "Restricted and unrestricted funds are separately disclosed.",
          },
          updated_at: now,
        },
      ],
    },
  ],
  [
    /\/reporting-packs$/,
    {
      items: [
        {
          pack_code: "CHARITIES-SORP-2026",
          version_no: 1,
          title: "Charities SORP 2026 baseline",
          framework_code: "FRS_102",
          sector_code: "CHARITIES_SORP_2026",
          effective_from: "2026-01-01",
          effective_to: null,
          certification_status: "REPOSITORY_BASELINE",
          provenance_label: "Version-controlled repository baseline",
          certification_label: "Repository baseline - not regulator certified",
        },
      ],
    },
  ],
  [
    /\/artefacts\/capabilities$/,
    {
      capabilities: {
        html: {
          available: true,
          generated: true,
          rendererVersion: "accounts-html-v1",
        },
        pdf: {
          available: true,
          generated: true,
          rendererVersion: "accounts-pdf-native-v1",
        },
        docx: {
          available: true,
          generated: true,
          rendererVersion: "accounts-docx-v1",
        },
        ixbrl: {
          available: false,
          code: "TAXONOMY_MAPPINGS_UNAVAILABLE",
          message: "iXBRL taxonomy mappings are not available.",
          taxonomyMappings: 0,
        },
      },
    },
  ],
  [
    /\/evidence-bundle\/capabilities$/,
    {
      capability: {
        available: true,
        code: "EVIDENCE_BUNDLE_AVAILABLE",
        formatVersion: "accounts-evidence-bundle-v1",
        accountsVersion: {
          id: accountsVersion.id,
          version: 3,
          status: "FINAL",
          contentHash: accountsVersion.content_hash,
        },
        dependencies: {
          complete: true,
          referencedObjectCount: 11,
          missing: [],
        },
        signoffs: {
          total: 5,
          active: 5,
          invalidated: 0,
          activeTypes: [
            "CLIENT_APPROVED",
            "FILING_AUTHORISED",
            "PARTNER_APPROVED",
            "PREPARED",
            "REVIEWED",
          ],
          preparedAndReviewed: true,
          clientAndPartnerApproved: true,
          filingAuthorised: true,
        },
        artefacts: { html: { generated: true }, pdf: { generated: true } },
        auditEventCount: 18,
        maxSourceBytes: 10485760,
      },
    },
  ],
  [
    /\/filing-attempts$/,
    {
      items: [
        {
          id: "filing-1",
          accounts_version_id: accountsVersion.id,
          accounts_version: 3,
          regulator: "COMPANIES_HOUSE",
          attempt_no: 1,
          status: "SUBMITTED",
          payload_storage_key: "server-managed",
          payload_hash: "sha256:filing",
          regulator_reference: "CH-DEMO-1042",
          submitted_by: "Demo Partner",
          submitted_at: now,
          created_at: now,
        },
      ],
    },
  ],
];

let demoPlatformTeams = [
  { id: "team-accounts", name: "Accounts", status: "ACTIVE", member_count: 1 },
  { id: "team-advisory", name: "Advisory", status: "ACTIVE", member_count: 1 },
  { id: "team-business-services", name: "Business services", status: "ACTIVE", member_count: 1 },
];

function practiceDemoRead(path: string): unknown | undefined {
  if (path === "/v1/practice/resources") return { items: structuredClone(demoResources) };
  if (path.startsWith("/v1/practice/capacity?")) return { items: structuredClone(demoCapacity) };
  if (path.startsWith("/v1/practice/work-allocations?")) return { items: structuredClone(demoAllocations) };
  if (path.startsWith("/v1/practice/time-entries?")) return { items: structuredClone(demoTimeEntries) };
  if (path === "/v1/practice/portfolio-economics") return { items: structuredClone(demoPortfolio) };
  if (path === "/v1/practice/economics/overview") return { item: structuredClone(demoEconomicsOverview) };
  if (path === "/v1/client-requests" || path === "/v1/portal/requests") return { items: structuredClone(demoClientRequests) };
  if (path === "/v1/portal/documents") return { items: [] };
  const requestMatch = path.match(/^\/v1\/client-requests\/([^/]+)$/);
  if (requestMatch) return { item: { ...structuredClone(demoClientRequests.find((item) => item.id === requestMatch[1])), recipients: [], responses: [], documents: [] } };
  if (path === "/v1/portal-threads" || path === "/v1/portal/messages") return { items: structuredClone(demoPortalThreads) };
  const messageMatch = path.match(/^\/v1\/portal\/messages\/([^/]+)$/);
  if (messageMatch) return { item: structuredClone(demoPortalThreads.find((item) => item.id === messageMatch[1])), messages: structuredClone(demoPortalMessages) };
  if (path === "/v1/crm/prospects") return {items:structuredClone(demoProspects)};
  const prospectMatch=path.match(/^\/v1\/crm\/prospects\/([^/]+)$/);if(prospectMatch)return {item:structuredClone({...demoProspects.find(item=>item.id===prospectMatch[1]),contacts:[],activities:[{id:"prospect-activity-1",summary:"Referral received",occurred_at:now}]})};
  if (path === "/v1/platform/teams") return { items: structuredClone(demoPlatformTeams) };
  const opportunityCapabilities=demoOpportunityCapabilities();
  if (path === "/v1/crm/opportunities") return {items:structuredClone(demoOpportunities),capabilities:opportunityCapabilities};
  const opportunityMatch=path.match(/^\/v1\/crm\/opportunities\/([^/]+)$/);if(opportunityMatch){const item=demoOpportunities.find(entry=>entry.id===opportunityMatch[1]);return {item:structuredClone(item?{...item,capabilities:opportunityCapabilities}:undefined)};}
  if (path === "/v1/onboarding") return {items:structuredClone(demoOnboarding)};
  const onboardingMatch=path.match(/^\/v1\/onboarding\/([^/]+)$/);if(onboardingMatch)return {item:structuredClone(demoOnboarding.find(item=>item.id===onboardingMatch[1]))};
  if (path === "/v1/practice/services") return { items: structuredClone(demoPracticeServices) };
  if (path === "/v1/practice/work-templates") return { items: structuredClone(demoPracticeTemplates) };
  if (path === "/v1/practice/recurring-schedules") return { items: structuredClone(demoRecurringSchedules) };
  if (path.startsWith("/v1/practice/reviews")) return {items:structuredClone(demoPracticeReviews)};
  if (path === "/v1/practice/automation-rules") return {items:structuredClone(demoAutomationRules)};
  if (path === "/v1/practice/recurrence-operations") return {items:structuredClone(demoRecurrenceExecutions)};
  if (path.startsWith("/v1/practice/work?" ) || path === "/v1/practice/work") return { items: structuredClone(demoPracticeWork) };
  const workMatch = path.match(/^\/v1\/practice\/work\/([^/]+)$/);
  if (workMatch) {const item=demoPracticeWork.find((entry)=>entry.id===workMatch[1]);return { item: structuredClone(item?{...item,tasks:demoPracticeTasks.filter(task=>task.work_item_id===item.id),stages:demoWorkStages.filter(stage=>stage.work_item_id===item.id),reviews:demoPracticeReviews.filter(review=>review.work_item_id===item.id)}:undefined) };}
  const workflowMatch=path.match(/^\/v1\/practice\/work\/([^/]+)\/workflow$/);if(workflowMatch)return {items:structuredClone(demoWorkStages.filter(stage=>stage.work_item_id===workflowMatch[1]))};
  const tasksMatch = path.match(/^\/v1\/practice\/work\/([^/]+)\/tasks$/);
  if (tasksMatch) return { items: structuredClone(demoPracticeTasks.filter((item) => item.work_item_id === tasksMatch[1])) };
  const summaryMatch = path.match(/^\/v1\/practice\/clients\/([^/]+)\/summary$/);
  if (summaryMatch) {
    const clientId = summaryMatch[1];
    const clientName = clientId === "demo-org-2" ? "Harbour Trading Ltd" : "Northstar Community Foundation";
    return { item: {
      client: { id: clientId, legal_name: clientName },
      services: demoPracticeServices.slice(0, clientId === "demo-org-2" ? 2 : 3).map((service, index) => ({ id: `client-${service.id}`, client_id: clientId, service_id: service.id, service_name: service.name, status: "active", frequency: service.default_frequency, responsible_team_id: index ? null : "team-accounts", specialist_module_key: service.specialist_module_key })),
      engagements: [{ id: "practice-engagement-1", client_id: clientId, client_name: clientName, reference: "PE-2027-001", name: "2027 professional services", status: "active", acceptance_state: "accepted", start_date: "2027-01-01", responsible_owner_id: "member-demo" }],
      workItems: structuredClone(demoPracticeWork.filter((item) => item.client_id === clientId)),
      upcomingTasks: structuredClone(demoPracticeTasks.filter((item) => item.status !== "completed")),
    } };
  }
  return undefined;
}

export function demoRequest(path: string, init?: RequestInit): unknown {
  const method = init?.method ?? "GET";
  if (method === "GET") {
    const practiceRead = practiceDemoRead(path);
    if (practiceRead !== undefined) return practiceRead;
  }
  if (method === "POST" && path === "/v1/practice/services") {
    const body = JSON.parse(String(init?.body || "{}")) as Partial<PracticeService>;
    const item: PracticeService = { id: `service-${Date.now()}`, name: body.name || "New service", description: body.description, category: body.category, status: body.status || "active", default_frequency: body.default_frequency, specialist_module_key: body.specialist_module_key };
    demoPracticeServices = [...demoPracticeServices, item];
    return { item: structuredClone(item) };
  }
  if (method === "POST" && path === "/v1/platform/teams") {
    const body = JSON.parse(String(init?.body || "{}")) as { name?: string };
    const item = { id: `team-${Date.now()}`, name: body.name?.trim() || "New team", status: "ACTIVE", member_count: 0 };
    demoPlatformTeams = [...demoPlatformTeams, item];
    return { item: structuredClone(item) };
  }
  const resourceSettingsMatch = path.match(/^\/v1\/practice\/resources\/([^/]+)$/);
  if (method === "PATCH" && resourceSettingsMatch) {
    const body = JSON.parse(String(init?.body || "{}")) as { jobTitle?: string | null; status?: ResourceProfile["status"]; standardCapacityMinutesWeek?: number };
    const item = demoResources.find((resource) => resource.id === resourceSettingsMatch[1]);
    if (!item) throw new Error("Resource not found");
    if ("jobTitle" in body) item.role_title = body.jobTitle || null;
    if (body.status) item.status = body.status;
    if (body.standardCapacityMinutesWeek !== undefined) item.weekly_capacity_hours = body.standardCapacityMinutesWeek / 60;
    return { item: structuredClone(item) };
  }
  if (method === "POST" && path === "/v1/clients") {
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    const item = {
      id: `demo-org-${Date.now()}`,
      legal_name: String(body.legalName || body.displayName || "New client"),
      legal_form: String(body.legalForm || body.entityType || "OTHER"),
      jurisdiction: String(body.jurisdiction || "UK"),
      created_at: now,
    };
    const organisations = reads.find(([pattern]) => pattern.test("/v1/organisations"))?.[1] as { items: Array<typeof item> } | undefined;
    if (organisations) organisations.items = [...organisations.items, item];
    return { item: structuredClone(item) };
  }
  if (method === "POST" && path === "/v1/practice/work") {
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    const service = demoPracticeServices.find((entry) => `client-${entry.id}` === body.clientServiceId || entry.id === body.clientServiceId);
    const clientId = String(body.clientId);
    const item: PracticeWorkItem = {
      id: `work-${Date.now()}`,
      client_id: clientId,
      client_name: clientId === "demo-org-2" ? "Harbour Trading Ltd" : "Northstar Community Foundation",
      client_service_id: String(body.clientServiceId),
      service_name: service?.name || "Service",
      engagement_id: body.engagementId ? String(body.engagementId) : null,
      title: String(body.title || "New work"),
      period_reference: body.periodReference ? String(body.periodReference) : null,
      status: (body.status || "not_started") as PracticeWorkItem["status"],
      priority: (body.priority || "normal") as PracticeWorkItem["priority"],
      due_date: body.dueDate ? String(body.dueDate) : null,
    };
    demoPracticeWork = [item, ...demoPracticeWork];
    return { item: structuredClone(item) };
  }
  if (method === "POST" && path === "/v1/client-requests") {
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    const work = demoPracticeWork.find((entry) => entry.id === body.workItemId);
    const item: ClientRequestItem = {
      id: `client-request-${Date.now()}`,
      client_id: String(body.clientId),
      client_name: work?.client_name || "Client",
      title: String(body.title || "Client request"),
      description: body.description ? String(body.description) : undefined,
      request_type: String(body.requestType || "information"),
      status: body.send === true ? "open" : "draft",
      priority: String(body.priority || "normal"),
      due_at: body.dueAt ? String(body.dueAt) : null,
      work_title: work?.title,
      response_count: 0,
      completion_mode: "manual",
    };
    demoClientRequests = [item, ...demoClientRequests];
    if (body.waitingOnClient === true && work) demoPracticeWork = demoPracticeWork.map((entry) => entry.id === work.id ? { ...entry, status: "waiting_on_client" } : entry);
    return { item: structuredClone(item) };
  }
  const assignmentMatch = path.match(/^\/v1\/practice\/work\/([^/]+)\/resource-assignment$/);
  if (method === "POST" && assignmentMatch) {
    const body = JSON.parse(String(init?.body || "{}")) as { assignedMemberId?: string };
    const resource = demoResources.find((item) => item.id === body.assignedMemberId);
    demoAllocations = demoAllocations.map((item) => item.id === assignmentMatch[1] ? { ...item, resource_name: resource?.display_name || null, team_name: resource?.team_name || item.team_name, assignment_state: "confirmed" } : item);
    demoPracticeWork = demoPracticeWork.map((item) => item.id === assignmentMatch[1] ? { ...item, assigned_member_id: resource?.id || null, assigned_member_name: resource?.display_name || null, assigned_team_name: resource?.team_name || item.assigned_team_name } : item);
    return { item: structuredClone(demoAllocations.find((item) => item.id === assignmentMatch[1])) };
  }
  const deadlineOverrideMatch = path.match(/^\/v1\/practice\/work\/([^/]+)\/deadline-override$/);
  if (method === "POST" && deadlineOverrideMatch) {
    const body = JSON.parse(String(init?.body || "{}")) as { dueDate?: string; reason?: string };
    demoPracticeWork = demoPracticeWork.map((item) => item.id === deadlineOverrideMatch[1] ? { ...item, due_date: body.dueDate || item.due_date, due_date_overridden: true, due_date_override_reason: body.reason || null } : item);
    return { item: structuredClone(demoPracticeWork.find((item) => item.id === deadlineOverrideMatch[1])) };
  }
  if (method === "POST" && path === "/v1/practice/time-entries") {
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    const resource = demoResources.find((item) => item.id === body.tenantMemberId);
    const work = demoAllocations.find((item) => item.id === body.workItemId);
    const item: TimeEntry = { id: `time-demo-${Date.now()}`, date: String(body.entryDate), resource_name: resource?.display_name || "Unknown resource", client_name: work?.client_name || "Unknown client", work_title: work?.work_title, service_name: work?.service_name, duration_hours: Number(body.durationMinutes) / 60, billable: body.classification === "billable", status: "draft" };
    demoTimeEntries = [item, ...demoTimeEntries];
    return { item: structuredClone(item) };
  }
  const completeRequestMatch = path.match(/^\/v1\/client-requests\/([^/]+)\/complete$/);
  if (method === "POST" && completeRequestMatch) {
    demoClientRequests = demoClientRequests.map((item) => item.id === completeRequestMatch[1] ? { ...item, status: "completed" } : item);
    return { item: structuredClone(demoClientRequests.find((item) => item.id === completeRequestMatch[1])) };
  }
  const portalResponseMatch = path.match(/^\/v1\/portal\/requests\/([^/]+)\/responses$/);
  if (method === "POST" && portalResponseMatch) {
    demoClientRequests = demoClientRequests.map((item) => item.id === portalResponseMatch[1] ? { ...item, status: "responded", response_count: (item.response_count ?? 0) + 1, last_response_at: now } : item);
    return { item: { id: `demo-response-${Date.now()}`, submitted_at: now } };
  }
  const portalMessageMatch = path.match(/^\/v1\/portal\/messages\/([^/]+)$/);
  if (method === "POST" && portalMessageMatch) {
    const body = JSON.parse(String(init?.body || "{}")) as { body?: string };
    const item: PortalMessageItem = { id: `portal-message-${Date.now()}`, sender_context: "portal", body: body.body || "Message", sent_at: now };
    demoPortalMessages = [...demoPortalMessages, item];
    return { item: structuredClone(item) };
  }
  if(method==="POST"&&path==="/v1/crm/prospects"){const body=JSON.parse(String(init?.body||"{}")) as Record<string,unknown>;const item:CrmProspect={id:`prospect-${Date.now()}`,display_name:String(body.displayName||"New prospect"),entity_type:String(body.entityType||"OTHER"),status:"prospect",source:body.source?String(body.source):null,open_opportunities:0};demoProspects=[item,...demoProspects];return {item:structuredClone(item)};}
  const prospectPatchMatch=path.match(/^\/v1\/crm\/prospects\/([^/]+)$/);if(method==="PATCH"&&prospectPatchMatch){const body=JSON.parse(String(init?.body||"{}")) as Record<string,unknown>;demoProspects=demoProspects.map(item=>item.id===prospectPatchMatch[1]?{...item,display_name:body.displayName===undefined?item.display_name:String(body.displayName),legal_name:body.legalName===undefined?item.legal_name:body.legalName?String(body.legalName):null,source:body.source===undefined?item.source:body.source?String(body.source):null,status:body.status===undefined?item.status:body.status as CrmProspect["status"],responsible_member_id:body.responsibleMemberId===undefined?item.responsible_member_id:body.responsibleMemberId?String(body.responsibleMemberId):null,responsible_team_id:body.responsibleTeamId===undefined?item.responsible_team_id:body.responsibleTeamId?String(body.responsibleTeamId):null,responsible_member_name:body.responsibleMemberId===undefined?item.responsible_member_name:demoResources.find(resource=>resource.id===body.responsibleMemberId)?.display_name??null,responsible_team_name:body.responsibleTeamId===undefined?item.responsible_team_name:({"team-accounts":"Accounts","team-advisory":"Advisory","team-business-services":"Business services"} as Record<string,string>)[String(body.responsibleTeamId)]??null}:item);return {item:structuredClone(demoProspects.find(item=>item.id===prospectPatchMatch[1]))};}
  if(method==="POST"&&path==="/v1/crm/opportunities"){const body=JSON.parse(String(init?.body||"{}")) as Record<string,unknown>,prospect=demoProspects.find(item=>item.id===body.prospectId),serviceIds=Array.isArray(body.serviceIds)?body.serviceIds.map(String):[];const item:CrmOpportunity={id:`opportunity-${Date.now()}`,prospect_id:body.prospectId?String(body.prospectId):null,existing_client_id:body.existingClientId?String(body.existingClientId):null,relationship_name:prospect?.display_name||"Existing client",name:String(body.name||"New opportunity"),stage_key:String(body.stageKey||"qualification"),status:"open",expected_close_date:body.expectedCloseDate?String(body.expectedCloseDate):null,probability:body.probability==null?25:Number(body.probability),estimated_value:body.estimatedValue==null?null:Number(body.estimatedValue),currency:String(body.currency||"GBP"),responsible_member_id:body.responsibleMemberId?String(body.responsibleMemberId):null,responsible_team_id:body.responsibleTeamId?String(body.responsibleTeamId):null,responsible_member_name:demoResources.find(resource=>resource.id===body.responsibleMemberId)?.display_name??null,responsible_team_name:demoPlatformTeams.find(team=>team.id===body.responsibleTeamId)?.name??null,services:serviceIds.map((serviceId,index)=>{const service=demoPracticeServices.find(entry=>entry.id===serviceId);return {id:`opportunity-service-${Date.now()}-${index}`,serviceId,name:service?.name||"Service",accepted:false};}),conversion_state:"not_converted",activities:[{id:`opportunity-activity-${Date.now()}`,summary:"Opportunity created",occurred_at:now}]};demoOpportunities=[item,...demoOpportunities];return {item:structuredClone(item)};}
  const opportunityPatchMatch=path.match(/^\/v1\/crm\/opportunities\/([^/]+)$/);if(method==="PATCH"&&opportunityPatchMatch){const body=JSON.parse(String(init?.body||"{}")) as Record<string,unknown>,serviceIds=Array.isArray(body.serviceIds)?body.serviceIds.map(String):undefined;demoOpportunities=demoOpportunities.map(item=>item.id===opportunityPatchMatch[1]?{...item,name:body.name===undefined?item.name:String(body.name),expected_close_date:body.expectedCloseDate===undefined?item.expected_close_date:body.expectedCloseDate?String(body.expectedCloseDate):null,probability:body.probability===undefined?item.probability:body.probability===null?null:Number(body.probability),estimated_value:body.estimatedValue===undefined?item.estimated_value:body.estimatedValue===null?null:Number(body.estimatedValue),currency:body.currency===undefined?item.currency:String(body.currency),responsible_member_id:body.responsibleMemberId===undefined?item.responsible_member_id:body.responsibleMemberId?String(body.responsibleMemberId):null,responsible_team_id:body.responsibleTeamId===undefined?item.responsible_team_id:body.responsibleTeamId?String(body.responsibleTeamId):null,responsible_member_name:body.responsibleMemberId===undefined?item.responsible_member_name:demoResources.find(resource=>resource.id===body.responsibleMemberId)?.display_name??null,responsible_team_name:body.responsibleTeamId===undefined?item.responsible_team_name:demoPlatformTeams.find(team=>team.id===body.responsibleTeamId)?.name??null,services:serviceIds?serviceIds.map((serviceId,index)=>{const service=demoPracticeServices.find(entry=>entry.id===serviceId);return {id:`opportunity-service-edit-${index}`,serviceId,name:service?.name||"Service",accepted:false};}):item.services,activities:[{id:`opportunity-activity-${Date.now()}`,summary:"Opportunity updated",occurred_at:now},...(item.activities||[])]}:item);return {item:structuredClone({...demoOpportunities.find(item=>item.id===opportunityPatchMatch[1]),capabilities:demoOpportunityCapabilities()})};}
  const opportunityStageMatch=path.match(/^\/v1\/crm\/opportunities\/([^/]+)\/stage$/);if(method==="POST"&&opportunityStageMatch){const body=JSON.parse(String(init?.body||"{}")) as {stageKey:string;outcomeReason?:string},current=demoOpportunities.find(item=>item.id===opportunityStageMatch[1]);if(current?.stage_key===body.stageKey)throw new Error("Choose a stage other than the current stage");demoOpportunities=demoOpportunities.map(item=>item.id===opportunityStageMatch[1]?{...item,stage_key:body.stageKey,status:body.stageKey==="lost"?"lost":"open",outcome_reason:body.stageKey==="lost"?body.outcomeReason:null,activities:[{id:`opportunity-stage-${Date.now()}`,summary:`Stage changed from ${item.stage_key} to ${body.stageKey}`,occurred_at:now},...(item.activities||[])]}:item);return {item:structuredClone(demoOpportunities.find(item=>item.id===opportunityStageMatch[1]))};}
  const proposalMatch=path.match(/^\/v1\/crm\/opportunities\/([^/]+)\/proposals$/);if(method==="POST"&&proposalMatch){const body=JSON.parse(String(init?.body||"{}")) as {proposalId:string;proposalVersion?:string};demoOpportunities=demoOpportunities.map(item=>item.id===proposalMatch[1]?{...item,proposal_status:"created",proposals:[...(item.proposals||[]),{id:`proposal-${Date.now()}`,proposal_id:body.proposalId,proposal_version:body.proposalVersion||"1",status:"created"}]}:item);return {item:{proposal_id:body.proposalId}};}
  const onboardingStatusMatch=path.match(/^\/v1\/onboarding\/([^/]+)\/status$/);if(method==="POST"&&onboardingStatusMatch){const body=JSON.parse(String(init?.body||"{}")) as {status:OnboardingCase["status"]};if(["ready_for_delivery","completed"].includes(body.status))throw new Error("Mandatory onboarding gates remain incomplete");demoOnboarding=demoOnboarding.map(item=>item.id===onboardingStatusMatch[1]?{...item,status:body.status}:item);return {item:structuredClone(demoOnboarding.find(item=>item.id===onboardingStatusMatch[1]))};}
  const stageMatch=path.match(/^\/v1\/practice\/workflow-stages\/([^/]+)\/advance$/);if(method==="POST"&&stageMatch){const body=JSON.parse(String(init?.body||"{}")) as {status:PracticeWorkStage["status"]};demoWorkStages=demoWorkStages.map(stage=>stage.id===stageMatch[1]?{...stage,status:body.status}:stage);return {item:structuredClone(demoWorkStages.find(stage=>stage.id===stageMatch[1]))};}
  const reviewMatch=path.match(/^\/v1\/practice\/reviews\/([^/]+)\/decision$/);if(method==="POST"&&reviewMatch){const body=JSON.parse(String(init?.body||"{}")) as {status:PracticeReview["status"]};demoPracticeReviews=demoPracticeReviews.map(review=>review.id===reviewMatch[1]?{...review,status:body.status}:review);return {item:structuredClone(demoPracticeReviews.find(review=>review.id===reviewMatch[1]))};}
  if(method==="POST"&&path==="/v1/practice/automation-rules"){const body=JSON.parse(String(init?.body||"{}")) as Record<string,unknown>;const item:AutomationRule={id:`automation-${Date.now()}`,name:String(body.name||"New automation"),enabled:body.enabled===true,trigger_type:String(body.triggerType||"work.created"),conditions:Array.isArray(body.conditions)?body.conditions as Array<Record<string,unknown>>:[],actions:Array.isArray(body.actions)?body.actions as Array<Record<string,unknown>>:[{type:"mark_blocked"}],priority:Number(body.priority||100),recent_executions:[]};demoAutomationRules=[...demoAutomationRules,item];return {item:structuredClone(item)};}
  const automationMatch=path.match(/^\/v1\/practice\/automation-rules\/([^/]+)$/);if(method==="PATCH"&&automationMatch){const body=JSON.parse(String(init?.body||"{}")) as {enabled?:boolean};demoAutomationRules=demoAutomationRules.map(rule=>rule.id===automationMatch[1]?{...rule,...body}:rule);return {item:structuredClone(demoAutomationRules.find(rule=>rule.id===automationMatch[1]))};}
  if(method==="POST"&&(path==="/v1/practice/recurrence-operations/dry-run"||path==="/v1/practice/recurrence-operations/replay")){const body=JSON.parse(String(init?.body||"{}")) as {from:string;to:string},replay=path.endsWith("replay"),item:RecurrenceExecution={id:`recurrence-${Date.now()}`,trigger_type:replay?"replay":"dry_run",status:"succeeded",range_from:body.from,range_to:body.to,schedules_evaluated:demoRecurringSchedules.length,work_generated:replay?1:0,blocked_entitlement:0,skipped_idempotent:1,failures:0,started_at:now,completed_at:now};demoRecurrenceExecutions=[item,...demoRecurrenceExecutions];return {item:structuredClone(item)};}
  const workStatusMatch = path.match(/^\/v1\/practice\/work\/([^/]+)\/status$/);
  if (method === "POST" && workStatusMatch) {
    const body = JSON.parse(String(init?.body || "{}")) as { status: PracticeWorkItem["status"] };
    demoPracticeWork = demoPracticeWork.map((item) => item.id === workStatusMatch[1] ? { ...item, status: body.status, completed_at: body.status === "completed" ? now : item.completed_at } : item);
    return { item: structuredClone(demoPracticeWork.find((item) => item.id === workStatusMatch[1])) };
  }
  const taskStatusMatch = path.match(/^\/v1\/practice\/tasks\/([^/]+)\/status$/);
  if (method === "POST" && taskStatusMatch) {
    const body = JSON.parse(String(init?.body || "{}")) as { status: PracticeTask["status"] };
    demoPracticeTasks = demoPracticeTasks.map((item) => item.id === taskStatusMatch[1] ? { ...item, status: body.status, completed_at: body.status === "completed" ? now : item.completed_at } : item);
    return { item: structuredClone(demoPracticeTasks.find((item) => item.id === taskStatusMatch[1])) };
  }
  if (method === "POST" && path.endsWith("/mappings")) {
    const body = JSON.parse(String(init?.body || "{}")) as {
      sourceAccountId?: string;
      canonicalAccountId?: string;
    };
    if (
      body.sourceAccountId &&
      localStorage.getItem("accounts.demo.unmappedSource") ===
        body.sourceAccountId
    )
      localStorage.removeItem("accounts.demo.unmappedSource");
    const unmappedSources = (
      localStorage.getItem("accounts.demo.unmappedSources") || ""
    )
      .split(",")
      .filter(Boolean);
    if (body.sourceAccountId && unmappedSources.includes(body.sourceAccountId)) {
      const remaining = unmappedSources.filter(
        (sourceId) => sourceId !== body.sourceAccountId,
      );
      if (remaining.length)
        localStorage.setItem("accounts.demo.unmappedSources", remaining.join(","));
      else localStorage.removeItem("accounts.demo.unmappedSources");
    }
    return {
      item: {
        source_account_id: body.sourceAccountId,
        canonical_account_id: body.canonicalAccountId,
      },
    };
  }
  if (method === "POST" && path.endsWith("/imports/normalize")) {
    const form = init?.body instanceof FormData ? init.body : new FormData();
    const upload = form.get("file");
    const arbitrary = upload instanceof File && upload.name === "arbitrary-headings.csv";
    const mappingApplied = typeof form.get("mapping") === "string";
    if (arbitrary) {
      return {
        item: {
          rowCount: 2,
          sourceType: "CSV",
          filename: upload.name,
          encoding: "UTF-8",
          headers: ["Ref", "Label", "Left side", "Right side"],
          detectedColumns: ["Ref", "Label", "Left side", "Right side"],
          suggestedMapping: {},
          appliedMapping: mappingApplied ? { accountCode: 0, accountName: 1, debit: 2, credit: 3 } : null,
          mappingComplete: mappingApplied,
          debitTotal: mappingApplied ? "100.00" : null,
          creditTotal: mappingApplied ? "100.00" : null,
          balanced: mappingApplied ? true : null,
          preview: mappingApplied ? [
            { rowNo: 2, accountCode: "1000", accountName: "Bank", debit: "100.00", credit: "0.00" },
            { rowNo: 3, accountCode: "4000", accountName: "Income", debit: "0.00", credit: "100.00" },
          ] : [],
          rawPreview: [
            { Ref: "1000", Label: "Bank", "Left side": "100.00", "Right side": "" },
            { Ref: "4000", Label: "Income", "Left side": "", "Right side": "100.00" },
          ],
          warnings: mappingApplied ? [] : ["Match the four trial-balance fields to columns before importing."],
        },
      };
    }
    return {
      item: {
        rowCount: 2,
        sourceType: "CSV",
        filename: "balanced-trial-balance.csv",
        encoding: "UTF-8",
        headers: ["account_code", "account_name", "debit", "credit"],
        detectedColumns: ["account_code", "account_name", "debit", "credit"],
        suggestedMapping: { accountCode: 0, accountName: 1, debit: 2, credit: 3 },
        appliedMapping: { accountCode: 0, accountName: 1, debit: 2, credit: 3 },
        mappingComplete: true,
        debitTotal: "100.00",
        creditTotal: "100.00",
        balanced: true,
        preview: [
          { accountCode: "1000", accountName: "Bank", debit: "100.00", credit: "" },
          { accountCode: "4000", accountName: "Income", debit: "", credit: "100.00" },
        ],
        rawPreview: [
          { account_code: "1000", account_name: "Bank", debit: "100.00", credit: "" },
          { account_code: "4000", account_name: "Income", debit: "", credit: "100.00" },
        ],
        warnings: [],
      },
    };
  }
  if (method === "POST" && /\/engagements\/[^/]+\/imports$/.test(path)) {
    return {
      item: {
        id: `demo-import-${Date.now()}`,
        trial_balance_id: "demo-trial-balance",
        snapshot_id: "demo-snapshot",
        version_no: 2,
        record_count: 2,
      },
    };
  }
  const memberMatch = path.match(/^\/v1\/team\/members\/([^/]+)\/(role|remove)$/);
  if (memberMatch && method === "POST") {
    const team = reads.find(([pattern]) => pattern.test("/v1/team"))?.[1] as
      | { members: Array<{ id: string; role: "OWNER" | "ADMIN" | "MEMBER"; isCurrentActor: boolean }> }
      | undefined;
    const member = team?.members.find((item) => item.id === memberMatch[1]);
    if (!member || member.isCurrentActor) throw new Error("Workspace member not found");
    const previousRole = member.role;
    if (memberMatch[2] === "remove") {
      team!.members = team!.members.filter((item) => item.id !== member.id);
      return { item: { id: member.id, previousRole, role: null, removed: true } };
    }
    const body = JSON.parse(String(init?.body || "{}")) as { role?: "OWNER" | "ADMIN" | "MEMBER" };
    if (!body.role) throw new Error("Select a valid workspace role");
    member.role = body.role;
    return { item: { id: member.id, previousRole, role: member.role, removed: false } };
  }
  const permanentMatch = path.match(/^\/v1\/organisations\/(demo-org(?:-2)?)\/permanent-file(?:\/(officers|advisers)(?:\/([^/]+))?)?$/);
  if (permanentMatch && method !== "GET") {
    const [, organisationId, collection, recordId] = permanentMatch;
    const source = reads.find(([pattern]) => pattern.test(`/v1/organisations/${organisationId}/permanent-file`))?.[1] as { item: OrganisationPermanentFile } | undefined;
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, string | null>;
    if (source && collection === "officers") {
      const existing = source.item.officers.find((entry) => entry.id === recordId);
      const item = existing || ({ id: `demo-officer-${Date.now()}`, updatedAt: now } as PermanentFileOfficer);
      Object.assign(item, {
        officerType: body.officerType ?? item.officerType,
        displayName: body.displayName ?? item.displayName,
        title: body.title ?? null,
        givenNames: body.givenNames ?? null,
        middleNames: body.middleNames ?? null,
        familyName: body.familyName ?? null,
        suffixHonours: body.suffixHonours ?? null,
        appointedOn: body.appointedOn ?? item.appointedOn,
        resignedOn: body.resignedOn ?? null,
        occupation: body.occupation ?? null,
        email: body.email ?? null,
        telephone: body.telephone ?? null,
        updatedAt: new Date().toISOString(),
      });
      if (!existing) source.item.officers.push(item);
      return { item: structuredClone(item) };
    }
    if (source && collection === "advisers") {
      const existing = source.item.advisers.find((entry) => entry.id === recordId);
      const item = existing || ({ id: `demo-adviser-${Date.now()}`, updatedAt: now } as PermanentFileAdviser);
      Object.assign(item, {
        adviserType: body.adviserType ?? item.adviserType,
        firmName: body.firmName ?? item.firmName,
        contactName: body.contactName ?? null,
        contactQualifications: body.contactQualifications ?? null,
        professionalBody: body.professionalBody ?? null,
        reportStyle: body.reportStyle ?? "GENERIC",
        activeFrom: body.activeFrom ?? item.activeFrom,
        activeTo: body.activeTo ?? null,
        status: body.activeTo ? "ENDED" : "ACTIVE",
        email: body.email ?? null,
        telephone: body.telephone ?? null,
        reference: body.reference ?? null,
        address: body.addressLine1 ? {
          line1: body.addressLine1,
          locality: body.addressLocality || null,
          postalCode: body.addressPostalCode || null,
          countryCode: body.addressCountryCode || "GB",
        } : null,
        updatedAt: new Date().toISOString(),
      });
      if (!existing) source.item.advisers.push(item);
      return { item: structuredClone(item) };
    }
    if (source && !collection) {
      Object.assign(source.item.organisation, {
        legalForm: body.legalForm ?? source.item.organisation.legalForm,
        officerNameStyle: body.officerNameStyle ?? source.item.organisation.officerNameStyle,
        tradingName: body.tradingName ?? source.item.organisation.tradingName,
        companyRegistrationNumber: body.companyRegistrationNumber ?? source.item.organisation.companyRegistrationNumber,
        charityRegistrationNumber: body.charityRegistrationNumber ?? source.item.organisation.charityRegistrationNumber,
        principalActivity: body.principalActivity ?? source.item.organisation.principalActivity,
        website: body.website ?? source.item.organisation.website,
        telephone: body.telephone ?? source.item.organisation.telephone,
        notes: body.notes ?? source.item.organisation.notes,
        updatedAt: new Date().toISOString(),
      });
      return { item: { organisationId, updatedAt: source.item.organisation.updatedAt } };
    }
  }
  if (method === "GET") {
    if (path.includes(`/engagements/${companyEngagement.id}/trial-balance`))
      return {
        items: [
          ["1000", "Bank current account", "120000.00", "0.00", "BS.CASH"],
          ["1100", "Trade debtors", "35000.00", "0.00", "BS.DEBTORS"],
          ["1200", "Plant and equipment", "80000.00", "0.00", "BS.FIXED_ASSETS"],
          ["5000", "Operating costs", "540000.00", "0.00", "PNL.OPERATING_COSTS"],
          ["2000", "Trade creditors", "0.00", "45000.00", "BS.CREDITORS"],
          ["3000", "Called-up share capital", "0.00", "10000.00", "BS.SHARE_CAPITAL"],
          ["4000", "Turnover", "0.00", "720000.00", "PNL.TURNOVER"],
        ].map(([code, name, debit, credit, canonical], index) => ({
          source_account_id: `company-src-${index + 1}`,
          account_code: code,
          account_name: name,
          debit,
          credit,
          canonical_account_id: `company-ca-${index + 1}`,
          canonical_code: canonical,
          canonical_name: name,
          report_line: name,
        })),
      };
    if (path.includes(`/engagements/${companyEngagement.id}/report`))
      return {
        balanced: true,
        fullyMapped: true,
        lines: [
          ["PNL.TURNOVER", "Turnover", "PNL", 10, "720000.00"],
          ["PNL.OPERATING_COSTS", "Administrative expenses", "PNL", 30, "-540000.00"],
          ["PNL.PROFIT", "Profit for the financial year", "PNL", 50, "180000.00"],
          ["BS.FIXED_ASSETS", "Tangible fixed assets", "BS", 10, "80000.00"],
          ["BS.DEBTORS", "Debtors", "BS", 20, "35000.00"],
          ["BS.CASH", "Cash at bank and in hand", "BS", 30, "120000.00"],
          ["BS.CREDITORS", "Creditors: amounts falling due within one year", "BS", 40, "-45000.00"],
          ["BS.NET_ASSETS", "Net assets", "BS", 60, "190000.00"],
          ["BS.SHARE_CAPITAL", "Called-up share capital", "BS", 70, "10000.00"],
          ["BS.RESERVES", "Profit and loss account", "BS", 80, "180000.00"],
        ].map(([code, caption, statement_code, display_order, balance], index) => ({
          code, caption, statement_code, display_order, balance,
          canonical_codes: [code], source_account_ids: [`company-src-${index + 1}`],
        })),
      };
    if (path.includes(`/engagements/${companyEngagement.id}/dashboard`))
      return {
        engagementId: companyEngagement.id,
        journals: { total: 1, byStatus: { DRAFT: 1 } },
        reconciliations: { total: 2, byStatus: { REVIEWED: 2 } },
        tasks: { total: 6, byStatus: { COMPLETE: 4, IN_PROGRESS: 2 } },
        reviewPoints: { total: 1, byStatus: { OPEN: 1 } },
        progress: { completedTasks: 4, totalTasks: 6, percent: 67 },
        blockingItems: 1,
      };
    if (path.endsWith("/working-paper-governance/catalogue"))
      return { item: structuredClone(demoWorkingPaperCatalogue) };
    if (path.endsWith("/risks"))
      return { items: structuredClone(demoWorkingPaperRisks) };
    if (/\/working-papers\/[^/]+\/governance$/.test(path)) {
      const paperId = decodeURIComponent(path.split("/working-papers/")[1].split("/")[0]);
      return { item: structuredClone(demoWorkingPaperGovernanceItem(paperId)) };
    }
    if (/\/working-papers\/[^/]+\/attachments$/.test(path)) {
      const paperId = decodeURIComponent(path.split("/working-papers/")[1].split("/")[0]);
      return {
        items: structuredClone(
          demoWorkingPaperAttachments.filter(
            (attachment) => attachment.workingPaperId === paperId,
          ),
        ),
      };
    }
    if (path.endsWith("/working-paper-library"))
      return { items: structuredClone(demoWorkingPaperLibrary) };
    if (path.endsWith("/working-papers"))
      return { items: structuredClone(demoWorkingPapers) };
    if (path.endsWith("/accounts-versions"))
      return { items: structuredClone(demoAccountsVersions) };
    const match = reads.find(([pattern]) => pattern.test(path));
    if (match) {
      const response = structuredClone(match[1]);
      if (
        path.includes("/canonical-accounts") &&
        localStorage.getItem("accounts.demo.largeCanonicalModel") === "true"
      ) {
        const items = (response as { items?: Array<Record<string, unknown>> })
          .items;
        if (items) {
          for (let index = items.length; index < 95; index += 1) {
            items.push({
              id: `ca-test-${index}`,
              taxonomy_version: "UK-CANONICAL-2026",
              canonical_code: `TEST.${String(index).padStart(3, "0")}`,
              name: `Canonical test account ${index}`,
              report_line: `Test report line ${Math.floor(index / 3) + 1}`,
              normal_balance: index % 2 ? "CREDIT" : "DEBIT",
            });
          }
        }
      }
      if (path.endsWith("/trial-balance")) {
        const sourceAccountIds = [
          localStorage.getItem("accounts.demo.unmappedSource") || "",
          ...(localStorage.getItem("accounts.demo.unmappedSources") || "")
            .split(",")
            .filter(Boolean),
        ];
        for (const item of (
          response as { items?: Array<Record<string, unknown>> }
        ).items || []) {
          if (sourceAccountIds.includes(String(item.source_account_id))) {
            item.canonical_account_id = null;
            item.canonical_code = null;
            item.canonical_name = null;
            item.report_line = null;
          }
        }
      }
      return response;
    }
  }
  if (path.endsWith("/artefacts/html"))
    return {
      item: {
        kind: "HTML",
        status: "READY",
        rendererVersion: "accounts-html-v1",
        contentHash: "sha256:demo-html",
        byteSize: 48210,
        viewPath: "/v1/demo/accounts.html",
        downloadPath: "/v1/demo/accounts.html?download=1",
      },
      created: false,
    };
  if (path.endsWith("/artefacts/pdf"))
    return {
      item: {
        kind: "PDF",
        status: "READY",
        rendererVersion: "accounts-pdf-native-v1",
        contentHash: "sha256:demo-pdf",
        byteSize: 96320,
        viewPath: "/v1/demo/accounts.pdf",
        downloadPath: "/v1/demo/accounts.pdf?download=1",
      },
      created: false,
    };
  if (path.endsWith("/artefacts/docx"))
    return {
      item: {
        kind: "DOCX",
        status: "READY",
        rendererVersion: "accounts-docx-v1",
        contentHash: "sha256:demo-docx",
        byteSize: 28672,
        downloadPath: "/v1/demo/accounts.docx?download=1",
      },
      created: false,
    };
  if (path.endsWith("/imports/normalize"))
    return {
      item: {
        detectedColumns: ["Account code", "Account name", "Debit", "Credit"],
        rowCount: 47,
        preview: [
          {
            accountCode: "1000",
            accountName: "Current account",
            debit: "184250.00",
            credit: "0.00",
          },
        ],
        warnings: [],
      },
    };
  if (
    path.includes("/client-portal/contacts/") &&
    path.endsWith("/invitations")
  )
    return {
      item: {
        id: "portal-invite-1",
        contactId: "portal-contact-2",
        status: "ACTIVE",
        expiresAt: "2027-03-21T09:30:00Z",
      },
      token: "demo-portal-token",
      inviteUrl: `${location.origin}/client-invite#token=demo-portal-token`,
    };
  if (path.includes("/invitations"))
    return {
      item: {
        id: "demo-invite",
        role: "MEMBER",
        status: "ACTIVE",
        expiresAt: "2027-03-21T09:30:00Z",
        createdAt: now,
      },
      token: "demo-token",
      inviteUrl: `${location.origin}/invite#token=demo-token`,
      accepted: true,
      memberCreated: true,
    };
  if (method === "POST" && path.endsWith("/risks")) {
    const body = JSON.parse(String(init?.body || "{}"));
    const item: WorkingPaperRisk = {
      id: `demo-risk-${Date.now()}`,
      riskCode: body.riskCode,
      title: body.title,
      description: body.description || "",
      riskLevel: body.riskLevel,
      response: body.response || "",
      status: body.status || "OPEN",
      createdAt: now,
      updatedAt: now,
    };
    demoWorkingPaperRisks = [...demoWorkingPaperRisks, item];
    return { item };
  }
  if (method === "PUT" && /\/working-papers\/[^/]+\/(?:report-line|assertion|risk|theme)-links\/[^/]+$/.test(path)) {
    const [, tail] = path.split("/working-papers/");
    const [paperPart, linkKind, valuePart] = tail.split("/");
    const paperId = decodeURIComponent(paperPart);
    const value = decodeURIComponent(valuePart);
    const links = demoWorkingPaperLinks(paperId);
    const body = JSON.parse(String(init?.body || "{}"));
    if (linkKind === "report-line-links") {
      const line = demoWorkingPaperCatalogue.reportLines.find((item) => item.id === value)!;
      const existing = links.reportLines.find((item) => item.reportLineId === value);
      if (existing) return { created: false, item: existing };
      const item: WorkingPaperGovernance["reportLines"][number] = {
        id: `demo-line-link-${Date.now()}`,
        reportLineId: value,
        lineCode: line.lineCode,
        caption: line.caption,
        statementCode: line.statementCode,
        linkPurpose: body.linkPurpose,
        createdAt: now,
      };
      links.reportLines.push(item);
      return { created: true, item };
    }
    if (linkKind === "assertion-links") {
      const existing = links.assertions.find((item) => item.assertionCode === value);
      if (existing) return { created: false, item: existing };
      const item = { id: `demo-assertion-link-${Date.now()}`, assertionCode: value, createdAt: now };
      links.assertions.push(item);
      return { created: true, item };
    }
    if (linkKind === "risk-links") {
      const risk = demoWorkingPaperRisks.find((item) => item.id === value)!;
      const existing = links.risks.find((item) => item.riskId === value);
      if (existing) return { created: false, item: existing };
      const item: WorkingPaperGovernance["risks"][number] = {
        id: `demo-risk-link-${Date.now()}`,
        riskId: value,
        riskCode: risk.riskCode,
        title: risk.title,
        riskLevel: risk.riskLevel,
        status: risk.status,
        createdAt: now,
      };
      links.risks.push(item);
      return { created: true, item };
    }
    const theme = demoWorkingPaperCatalogue.themes.find((item) => item.code === value)!;
    const existing = links.themes.find((item) => item.themeCode === value);
    if (existing) return { created: false, item: existing };
    const item: WorkingPaperGovernance["themes"][number] = {
      id: `demo-theme-link-${Date.now()}`,
      themeCode: value,
      title: theme.title,
      isPrimary: body.isPrimary === true,
      createdAt: now,
    };
    links.themes.push(item);
    return { created: true, item };
  }
  if (method === "POST" && /\/working-papers\/[^/]+\/(?:report-line|assertion|risk|theme)-links\/[^/]+\/replace$/.test(path)) {
    const [, tail] = path.split("/working-papers/");
    const [paperPart, linkKind, linkPart] = tail.split("/");
    const paperId = decodeURIComponent(paperPart);
    const linkId = decodeURIComponent(linkPart);
    const links = demoWorkingPaperLinks(paperId);
    const body = JSON.parse(String(init?.body || "{}"));
    if (linkKind === "report-line-links") {
      const index = links.reportLines.findIndex((item) => item.id === linkId);
      const previous = links.reportLines[index];
      const line = demoWorkingPaperCatalogue.reportLines.find((item) => item.id === body.reportLineId)!;
      const item: WorkingPaperGovernance["reportLines"][number] = {
        id: `demo-line-link-${Date.now()}`,
        reportLineId: line.id,
        lineCode: line.lineCode,
        caption: line.caption,
        statementCode: line.statementCode,
        linkPurpose: previous.linkPurpose,
        createdAt: now,
      };
      links.reportLines.splice(index, 1, item);
      return { item, supersededLinkId: linkId, reason: body.reason };
    }
    if (linkKind === "assertion-links") {
      const index = links.assertions.findIndex((item) => item.id === linkId);
      const item = { id: `demo-assertion-link-${Date.now()}`, assertionCode: body.assertionCode, createdAt: now };
      links.assertions.splice(index, 1, item);
      return { item, supersededLinkId: linkId, reason: body.reason };
    }
    if (linkKind === "risk-links") {
      const index = links.risks.findIndex((item) => item.id === linkId);
      const risk = demoWorkingPaperRisks.find((item) => item.id === body.riskId)!;
      const item: WorkingPaperGovernance["risks"][number] = {
        id: `demo-risk-link-${Date.now()}`,
        riskId: risk.id,
        riskCode: risk.riskCode,
        title: risk.title,
        riskLevel: risk.riskLevel,
        status: risk.status,
        createdAt: now,
      };
      links.risks.splice(index, 1, item);
      return { item, supersededLinkId: linkId, reason: body.reason };
    }
    const index = links.themes.findIndex((item) => item.id === linkId);
    const previous = links.themes[index];
    const theme = demoWorkingPaperCatalogue.themes.find((item) => item.code === body.themeCode)!;
    const item: WorkingPaperGovernance["themes"][number] = {
      id: `demo-theme-link-${Date.now()}`,
      themeCode: theme.code,
      title: theme.title,
      isPrimary: previous.isPrimary,
      createdAt: now,
    };
    links.themes.splice(index, 1, item);
    return { item, supersededLinkId: linkId, reason: body.reason };
  }
  if (method === "POST" && /\/working-papers\/[^/]+\/attachments$/.test(path)) {
    const paperId = decodeURIComponent(path.split("/working-papers/")[1].split("/")[0]);
    const form = init?.body instanceof FormData ? init.body : new FormData();
    const upload = form.get("file");
    if (!(upload instanceof File)) throw new Error("Choose an evidence file.");
    const item: WorkingPaperAttachment = {
      id: `demo-attachment-${Date.now()}`,
      workingPaperId: paperId,
      workingPaperVersion: Number(form.get("workingPaperVersion") || 1),
      filename: upload.name,
      mediaType: upload.type,
      byteSize: upload.size,
      contentHash: `demo-evidence-${Date.now()}`,
      evidenceType: String(form.get("evidenceType")) as WorkingPaperAttachment["evidenceType"],
      description: String(form.get("description") || ""),
      uploadedAt: now,
      contentPath: `/v1/engagements/demo-engagement/working-papers/${paperId}/attachments/demo-attachment/content`,
    };
    demoWorkingPaperAttachments = [item, ...demoWorkingPaperAttachments];
    return { created: true, item };
  }
  if (method === "POST" && path.endsWith("/working-papers")) {
    const body = JSON.parse(String(init?.body || "{}"));
    const item: WorkingPaper = {
        id: `demo-working-paper-${Date.now()}`,
        code: body.code,
        title: body.title,
        status: "IN_PROGRESS",
        current_version: 1,
        template_scope: "ENGAGEMENT",
        category_code: body.categoryCode,
        objective: body.objective,
        applicability: "APPLICABLE",
        content: body.content || {},
        created_at: now,
        updated_at: now,
      };
    demoWorkingPapers = [...demoWorkingPapers, item];
    return { item };
  }
  if (method === "POST" && path.endsWith("/working-papers/deploy")) {
    let created = 0;
    const deployed: WorkingPaper[] = [];
    demoWorkingPaperLibrary = demoWorkingPaperLibrary.map((item) => {
      if (item.disposition === "EXCLUDE" || item.deployedWorkingPaperId)
        return item;
      created += 1;
      const paper: WorkingPaper = {
        id: `demo-deployed-${item.templateCode}`,
        code: item.code,
        title: item.title,
        status: "NOT_STARTED",
        current_version: 1,
        template_code: item.templateVersion ? item.templateCode : null,
        template_version: item.templateVersion,
        template_scope: item.sourceScope,
        category_code: item.categoryCode,
        objective: item.objective,
        applicability: "APPLICABLE",
        content: structuredClone(item.defaultContent),
        content_hash: `sha256:demo-${item.templateCode}`,
        updated_at: now,
      };
      deployed.push(paper);
      return {
        ...item,
        deployedWorkingPaperId: paper.id,
        deployedApplicability: "APPLICABLE",
      };
    });
    demoWorkingPapers = [...demoWorkingPapers, ...deployed];
    return {
      created,
      skipped: demoWorkingPaperLibrary.length - created,
      items: structuredClone(deployed),
    };
  }
  if (method === "PUT" && /\/working-paper-library\/[^/]+$/.test(path)) {
    const body = JSON.parse(String(init?.body || "{}"));
    const code = decodeURIComponent(path.split("/").at(-1) || "");
    demoWorkingPaperLibrary = demoWorkingPaperLibrary.map((item) =>
      item.templateCode === code
        ? {
            ...item,
            title: body.title || item.title,
            objective: body.objective || item.objective,
            required: typeof body.required === "boolean" ? body.required : item.required,
            disposition: body.disposition || item.disposition,
            sourceScope: body.scope || item.sourceScope,
            overrideReason: body.reason || null,
          }
        : item,
    );
    return { item: demoWorkingPaperLibrary.find((item) => item.templateCode === code) };
  }
  if (method === "POST" && path.endsWith("/working-paper-library")) {
    const body = JSON.parse(String(init?.body || "{}"));
    const item: WorkingPaperLibraryItem = {
      templateCode: `CUSTOM:${Date.now()}`,
      templateVersion: null,
      customTemplateId: `demo-custom-${Date.now()}`,
      categoryCode: body.categoryCode,
      sequenceNo: demoWorkingPaperLibrary.length * 10 + 10,
      code: body.code,
      title: body.title,
      objective: body.objective,
      guidance: body.guidance || "",
      defaultContent: { procedures: [], findings: "", conclusion: "" },
      required: body.required === true,
      disposition: "INCLUDE",
      sourceScope: body.scope,
      overrideReason: null,
      deployedWorkingPaperId: null,
      deployedApplicability: null,
      governanceStatus: "CUSTOM",
      provenanceLabel: "TENANT_AUTHORED",
      controlledFallback: false,
      serviceFamily: "CUSTOM",
      applicabilityLayer: "CLIENT",
    };
    demoWorkingPaperLibrary = [...demoWorkingPaperLibrary, item];
    return { item };
  }
  if (method === "PATCH" && path.endsWith("/applicability")) {
    const body = JSON.parse(String(init?.body || "{}"));
    const paperId = path.split("/").at(-2);
    demoWorkingPapers = demoWorkingPapers.map((paper) =>
      paper.id === paperId
        ? {
            ...paper,
            applicability: body.applicability,
            not_applicable_reason: body.reason || null,
          }
        : paper,
    );
    return { item: demoWorkingPapers.find((paper) => paper.id === paperId) };
  }
  if (
    method === "POST" &&
    /\/working-papers\/[^/]+\/versions$/.test(path)
  ) {
    const body = JSON.parse(String(init?.body || "{}"));
    demoNarrativeVersion += 1;
    const paperId = path.split("/working-papers/")[1].split("/")[0];
    demoWorkingPapers = demoWorkingPapers.map((paper) =>
      paper.id === paperId
        ? {
            ...paper,
            content: body.content || {},
            current_version: paper.current_version + 1,
            content_hash: `sha256:demo-narrative-${demoNarrativeVersion}`,
            updated_at: now,
          }
        : paper,
    );
    return {
      item: {
        id: `demo-working-paper-version-${demoNarrativeVersion}`,
        version: demoNarrativeVersion,
        content: body.content || {},
        content_hash: `sha256:demo-narrative-${demoNarrativeVersion}`,
        created_by: "Demo Preparer",
        created_at: now,
      },
    };
  }
  if (
    method === "POST" &&
    /\/working-papers\/[^/]+\/transitions$/.test(path)
  ) {
    const body = JSON.parse(String(init?.body || "{}"));
    const paperId = path.split("/working-papers/")[1].split("/")[0];
    demoWorkingPapers = demoWorkingPapers.map((paper) =>
      paper.id === paperId ? { ...paper, status: body.status } : paper,
    );
    return { item: demoWorkingPapers.find((paper) => paper.id === paperId) };
  }
  if (method === "POST" && path.endsWith("/disclosures")) {
    const body = JSON.parse(String(init?.body || "{}"));
    return {
      item: {
        id: `demo-disclosure-${Date.now()}`,
        disclosure_code: body.disclosureCode,
        applicability: body.applicability || "REQUIRED",
        status: "OPEN",
        current_version: 1,
        answer: body.answer || {},
        updated_at: now,
      },
    };
  }
  if (
    method === "POST" &&
    /\/disclosures\/[^/]+\/versions$/.test(path)
  ) {
    const body = JSON.parse(String(init?.body || "{}"));
    demoNarrativeVersion += 1;
    return {
      item: {
        id: `demo-disclosure-version-${demoNarrativeVersion}`,
        version: demoNarrativeVersion,
        answer: body.answer || {},
        content_hash: `sha256:demo-disclosure-${demoNarrativeVersion}`,
        created_by: "Demo Preparer",
        created_at: now,
      },
    };
  }
  if (path.endsWith("/signoffs")) {
    const body = JSON.parse(String(init?.body || "{}"));
    const version =
      demoAccountsVersions.find((item) => item.id === body.objectId) ||
      demoAccountsVersions[0];
    const item = {
      id: `sig-demo-${Date.now()}`,
      signoff_type: body.signoffType || "PREPARED",
      signed_by: "Demo Partner",
      signed_at: now,
      object_version: version.version,
    };
    version.signoffs = [
      ...(version.signoffs || []).filter(
        (entry) => entry.signoff_type !== item.signoff_type,
      ),
      item,
    ];
    return { item };
  }
  if (path.endsWith("/accounts-versions/generate")) {
    const version: AccountsVersion = {
      ...accountsVersion,
      id: `demo-accounts-v${demoAccountsVersions.length + 2}`,
      version:
        Math.max(...demoAccountsVersions.map((item) => item.version)) + 1,
      status: "DRAFT",
      frozen_at: null,
      generated_at: now,
      signoffs: [],
      content_hash: `sha256:demo-${Date.now()}`,
    };
    demoAccountsVersions = [version, ...demoAccountsVersions];
    return { item: version };
  }
  if (path.includes("/accounts-versions/") && path.endsWith("/transitions")) {
    const body = JSON.parse(String(init?.body || "{}"));
    const versionId = path.split("/accounts-versions/")[1].split("/")[0];
    const version =
      demoAccountsVersions.find((item) => item.id === versionId) ||
      demoAccountsVersions[0];
    version.status = body.status || version.status;
    if (["APPROVED", "FINAL"].includes(version.status)) version.frozen_at = now;
    return { item: structuredClone(version) };
  }
  if (path.endsWith("/filing-attempts"))
    return { item: (reads.at(-1)?.[1] as { items: unknown[] }).items[0] };
  return {
    item: { id: "demo-created", status: "IN_PROGRESS", created_at: now },
  };
}

export async function demoBlob(path: string): Promise<Blob> {
  if (path.includes("/working-papers/") && path.includes("/attachments/")) {
    return new Blob(["Ledgerly DEV showcase working-paper evidence"], {
      type: "text/plain",
    });
  }
  if (path.includes("evidence-bundle.zip")) {
    return new Blob(["Ledgerly DEV showcase evidence bundle"], {
      type: "application/zip",
    });
  }
  if (path.includes(".pdf") || path.includes("/artefacts/pdf")) {
    const response = await fetch("/northstar-charity-accounts.pdf");
    if (!response.ok) throw new Error("The showcase PDF could not be loaded.");
    return response.blob();
  }
  if (path.includes(".docx") || path.includes("/artefacts/docx")) {
    const response = await fetch("/northstar-charity-accounts.docx");
    if (!response.ok) throw new Error("The showcase Word file could not be loaded.");
    return response.blob();
  }
  return new Blob(
    [
      "<!doctype html><title>Northstar demo accounts</title><h1>Northstar Community Foundation</h1><p>Demo HTML accounts artefact.</p>",
    ],
    { type: "text/html" },
  );
}
