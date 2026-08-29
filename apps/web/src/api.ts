import { AuthRequiredError, freshAuthToken } from "./auth";

export type Engagement = {
  id: string;
  organisation_id: string;
  legal_name: string;
  period_start: string;
  period_end: string;
  framework: string;
  sector_profile: string;
  assurance_regime?:
    | "NOT_ASSESSED"
    | "NO_EXTERNAL_SCRUTINY"
    | "INDEPENDENT_EXAMINATION"
    | "STATUTORY_AUDIT";
  status: string;
  version: number;
};
export type TrialBalanceLine = {
  source_account_id: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  canonical_account_id: string | null;
  canonical_code: string | null;
  canonical_name: string | null;
  report_line: string | null;
};
export type ReportLine = {
  code: string;
  caption: string;
  statement_code: string;
  display_order: number;
  balance: string | number;
  canonical_codes: string[];
  source_account_ids: string[];
  fund_balances?: {
    unrestricted: string | number;
    restricted: string | number;
    endowment?: string | number;
  };
  comparative_balance?: string | number;
};
export type CanonicalAccount = {
  id: string;
  taxonomy_version: string;
  canonical_code: string;
  name: string;
  report_line: string;
  normal_balance: string;
};
export type TenantMembership = {
  tenant_id: string;
  name: string;
  role_code: string;
};
export type TenantOnboarding = { code: string; message: string };
export type TeamMember = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
  isCurrentActor: boolean;
};
export type TeamInvitation = {
  id: string;
  role: "ADMIN" | "MEMBER";
  status: "ACTIVE";
  expiresAt: string;
  createdAt: string;
};
export type Organisation = {
  id: string;
  legal_name: string;
  legal_form: string;
  jurisdiction: string;
  created_at?: string;
};
export type StatusCounts = { total: number; byStatus: Record<string, number> };
export type Dashboard = {
  engagementId?: string;
  journals?: StatusCounts;
  reconciliations?: StatusCounts;
  tasks?: StatusCounts;
  reviewPoints?: StatusCounts;
  filingAttempts?: StatusCounts;
  progress?: { completedTasks: number; totalTasks: number; percent: number };
  blockingItems?: number;
};
export type JournalLine = {
  id?: string;
  line_no?: number;
  canonical_account_id?: string;
  canonical_code?: string;
  account_name?: string;
  narrative?: string;
  debit: string | number;
  credit: string | number;
};
export type Journal = {
  id: string;
  journal_no?: number;
  journal_type?: string;
  description: string;
  status: JournalStatus;
  version?: number;
  prepared_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  lines?: JournalLine[];
  created_at?: string;
};
export type JournalStatus =
  | "DRAFT"
  | "PREPARED"
  | "APPROVED"
  | "POSTED"
  | "VOIDED";
export type Reconciliation = {
  id: string;
  reconciliation_type?: string;
  title?: string;
  status: ReconciliationStatus;
  trial_balance_id?: string | null;
  ledger_balance?: string | number;
  supporting_balance?: string | number;
  tolerance?: string | number;
  updated_at?: string;
};
export type ReconciliationStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "RECONCILED"
  | "EXCEPTION"
  | "REVIEWED";
export type WorkflowTask = {
  id: string;
  task_type?: string;
  title: string;
  status: WorkflowTaskStatus;
  blocking?: boolean;
  assigned_to?: string | null;
  due_at?: string | null;
  dependency_type?: string | null;
  dependency_id?: string | null;
};
export type WorkflowTaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETE"
  | "CANCELLED";
export type ReviewPoint = {
  id: string;
  object_type?: string;
  object_id?: string;
  question?: string;
  status: ReviewPointStatus;
  severity?: string;
  response?: string | null;
  assigned_to?: string | null;
  created_at?: string;
};
export type ReviewPointStatus = "OPEN" | "RESPONDED" | "CLEARED" | "REOPENED";
export type WorkingPaperVersion = {
  id: string;
  version: number;
  content: Record<string, unknown>;
  content_hash: string;
  created_by: string;
  created_at: string;
};
export type PermanentFileAddress = {
  line1: string;
  line2?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode: string;
};
export type PermanentFileOfficer = {
  id: string;
  officerType:
    | "DIRECTOR"
    | "TRUSTEE"
    | "COMPANY_SECRETARY"
    | "PARTNER"
    | "DESIGNATED_MEMBER"
    | "LLP_MEMBER"
    | "OTHER";
  displayName: string;
  title?: string | null;
  givenNames?: string | null;
  middleNames?: string | null;
  familyName?: string | null;
  suffixHonours?: string | null;
  appointedOn: string;
  resignedOn?: string | null;
  occupation?: string | null;
  nationality?: string | null;
  countryOfResidence?: string | null;
  serviceAddress?: PermanentFileAddress | null;
  email?: string | null;
  telephone?: string | null;
  updatedAt: string;
};
export type PermanentFileAdviser = {
  id: string;
  adviserType:
    | "ACCOUNTANT"
    | "AUDITOR"
    | "INDEPENDENT_EXAMINER"
    | "BANKER"
    | "SOLICITOR"
    | "TAX_ADVISER"
    | "INSURER"
    | "INVESTMENT_MANAGER"
    | "OTHER";
  firmName: string;
  contactName?: string | null;
  contactQualifications?: string | null;
  professionalBody?: "ICAEW" | "ACCA" | "ICAS" | "CAI" | "AAT" | "ACIE" | "OTHER" | null;
  reportStyle?: "GENERIC" | "ICAEW" | "ACCA" | "ICAS" | "CAI" | "CUSTOM_APPROVED";
  email?: string | null;
  telephone?: string | null;
  address?: PermanentFileAddress | null;
  reference?: string | null;
  status: "ACTIVE" | "ENDED";
  activeFrom: string;
  activeTo?: string | null;
  updatedAt: string;
};
export type OrganisationPermanentFile = {
  organisation: {
    id: string;
    legalName: string;
    legalForm: string;
    officerNameStyle?: "FULL_NAME" | "TITLE_AND_SURNAME" | "INITIALS_AND_SURNAME" | "FULL_NAME_WITH_HONOURS";
    jurisdiction: string;
    tradingName?: string | null;
    companyRegistrationNumber?: string | null;
    charityRegistrationNumber?: string | null;
    registeredOfficeAddress?: PermanentFileAddress | null;
    accountingReferenceMonth?: number | null;
    accountingReferenceDay?: number | null;
    principalActivity?: string | null;
    website?: string | null;
    telephone?: string | null;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  officers: PermanentFileOfficer[];
  advisers: PermanentFileAdviser[];
  engagements: {
    id: string;
    periodStart: string;
    periodEnd: string;
    framework: string;
    sectorProfile?: string | null;
    status: string;
  }[];
};
export type WorkingPaper = {
  id: string;
  code: string;
  title: string;
  report_line_id?: string | null;
  status:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "PREPARED"
    | "REVIEWED"
    | "SUPERSEDED";
  current_version: number;
  prepared_by?: string | null;
  reviewed_by?: string | null;
  template_code?: string | null;
  template_version?: number | null;
  template_scope?: "STANDARD" | "PRACTICE" | "CLIENT" | "ENGAGEMENT";
  category_code?: WorkingPaperCategory;
  objective?: string | null;
  applicability?: "APPLICABLE" | "NOT_APPLICABLE";
  not_applicable_reason?: string | null;
  not_applicable_by?: string | null;
  not_applicable_at?: string | null;
  content?: Record<string, unknown>;
  content_hash?: string;
  version_created_by?: string;
  version_created_at?: string;
  created_at?: string;
  updated_at?: string;
};
export type WorkingPaperCategory =
  | "ACCEPTANCE"
  | "PLANNING"
  | "RECORDS"
  | "INCOME"
  | "EXPENDITURE"
  | "ASSETS"
  | "LIABILITIES"
  | "FUNDS"
  | "REPORTING"
  | "COMPLETION";
export type WorkingPaperLibraryItem = {
  templateCode: string;
  templateVersion: number | null;
  customTemplateId: string | null;
  categoryCode: WorkingPaperCategory;
  sequenceNo: number;
  code: string;
  title: string;
  objective: string;
  guidance: string;
  defaultContent: Record<string, unknown>;
  required: boolean;
  disposition: "INCLUDE" | "EXCLUDE";
  sourceScope: "STANDARD" | "PRACTICE" | "CLIENT";
  overrideReason: string | null;
  deployedWorkingPaperId: string | null;
  deployedApplicability: string | null;
  governanceStatus: "APPROVED" | "BASELINE" | "CUSTOM";
  provenanceLabel: string;
  controlledFallback: boolean;
  serviceFamily: "ACCOUNTS_PRODUCTION" | "CUSTOM";
  applicabilityLayer: "CORE" | "FRAMEWORK" | "SECTOR" | "ENTITY_FORM" | "CLIENT";
};
export type WorkingPaperRisk = {
  id: string;
  riskCode: string;
  title: string;
  description: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "SIGNIFICANT";
  response: string;
  status: "OPEN" | "MITIGATED" | "ACCEPTED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
};
export type WorkingPaperAttachment = {
  id: string;
  workingPaperId: string;
  workingPaperVersion: number;
  filename: string;
  mediaType: string;
  byteSize: number;
  contentHash: string;
  evidenceType:
    | "SOURCE_DOCUMENT"
    | "CALCULATION"
    | "CONFIRMATION"
    | "CORRESPONDENCE"
    | "REPORT"
    | "OTHER";
  description: string;
  uploadedAt: string;
  contentPath: string;
};
export type WorkingPaperGovernanceCatalogue = {
  workAreas: {
    code: WorkingPaperCategory;
    title: string;
    sequenceNo: number;
    status: string;
    provenanceLabel: string;
  }[];
  themes: {
    code: string;
    title: string;
    description: string;
    status: string;
    provenanceLabel: string;
  }[];
  templateThemes: {
    templateCode: string;
    templateVersion: number;
    themeCode: string;
    isPrimary: boolean;
  }[];
  assertions: string[];
  reportLines: {
    id: string;
    taxonomyVersion: string;
    lineCode: string;
    caption: string;
    statementCode: string;
    displayOrder: number;
  }[];
  evidence: {
    uploadAvailable: boolean;
    maxBytes: number;
    mediaTypes: string[];
    evidenceTypes: WorkingPaperAttachment["evidenceType"][];
  };
};
export type WorkingPaperGovernance = {
  workingPaper: {
    id: string;
    code: string;
    title: string;
    categoryCode: WorkingPaperCategory;
    objective: string | null;
    status: string;
    currentVersion: number;
    templateCode: string | null;
    templateVersion: number | null;
    templateScope: string;
    applicability: string;
  };
  reportLines: {
    id: string;
    reportLineId: string;
    lineCode: string;
    caption: string;
    statementCode: string;
    linkPurpose: "PRIMARY" | "SUPPORTING" | "DISCLOSURE";
    createdAt: string;
  }[];
  assertions: { id: string; assertionCode: string; createdAt: string }[];
  risks: {
    id: string;
    riskId: string;
    riskCode: string;
    title: string;
    riskLevel: WorkingPaperRisk["riskLevel"];
    status: WorkingPaperRisk["status"];
    createdAt: string;
  }[];
  themes: {
    id: string;
    themeCode: string;
    title: string;
    isPrimary: boolean;
    createdAt: string;
  }[];
  attachments: WorkingPaperAttachment[];
};
export type WorkingPaperLinkReplacement<T> = {
  item: T;
  supersededLinkId: string;
  reason: string;
};
export type DisclosureVersion = {
  id: string;
  version: number;
  answer: Record<string, unknown>;
  content_hash: string;
  created_by: string;
  created_at: string;
};
export type Disclosure = {
  id: string;
  disclosure_code: string;
  applicability:
    | "UNASSESSED"
    | "REQUIRED"
    | "RECOMMENDED"
    | "NOT_APPLICABLE"
    | "PROHIBITED";
  status: "OPEN" | "COMPLETE" | "REVIEWED" | "SUPERSEDED";
  current_version: number;
  rule_version?: string | null;
  answer?: Record<string, unknown>;
  versions?: DisclosureVersion[];
  updated_at?: string;
  title?: string;
  requirement_source?: string;
  trigger_summary?: string;
  trigger_value?: string;
  rendered_in_accounts?: boolean;
  sync_status?: "IN_SYNC" | "BASELINE_WORDING" | "NOT_RENDERED" | "ASSESSMENT_REQUIRED";
  scope_group?: string;
};
export type Signoff = {
  id: string;
  signoff_type: string;
  signed_by: string;
  signed_at: string;
  object_version: number;
  dependency_manifest?: Record<string, unknown>;
  signature_hash?: string;
  invalidated_at?: string | null;
};
export type AccountsVersion = {
  id: string;
  version: number;
  status: "DRAFT" | "REVIEWED" | "APPROVED" | "FINAL" | "FILED" | "SUPERSEDED";
  trial_balance_id: string;
  framework_pack_id: string;
  content_manifest: Record<string, unknown>;
  content_hash: string;
  html_storage_key?: string | null;
  pdf_storage_key?: string | null;
  ixbrl_storage_key?: string | null;
  generated_by: string;
  generated_at: string;
  frozen_at?: string | null;
  signoffs?: Signoff[];
};
export type ReportingPack = {
  pack_code: string;
  version_no: number;
  title: string;
  framework_code: string;
  sector_code: string;
  effective_from: string;
  effective_to?: string | null;
  certification_status: string;
  provenance_label: string;
  certification_label: string;
};
export type HtmlArtefact = {
  kind: "HTML";
  status: "READY";
  rendererVersion: string;
  contentHash: string;
  byteSize: number;
  viewPath: string;
  downloadPath: string;
};
export type PdfArtefact = {
  kind: "PDF";
  status: "READY";
  rendererVersion: string;
  contentHash: string;
  byteSize: number;
  viewPath: string;
  downloadPath: string;
};
export type DocxArtefact = {
  kind: "DOCX";
  status: "READY";
  rendererVersion: string;
  contentHash: string;
  byteSize: number;
  downloadPath: string;
};
export type ArtefactCapabilities = {
  html: { available: boolean; generated: boolean; rendererVersion?: string };
  pdf: {
    available: boolean;
    generated: boolean;
    rendererVersion?: string;
    code?: string;
    message?: string;
  };
  docx: {
    available: boolean;
    generated: boolean;
    rendererVersion?: string;
    code?: string;
    message?: string;
  };
  ixbrl: {
    available: false;
    code: string;
    message: string;
    taxonomyMappings: number;
  };
};
export type EvidenceBundleCapability = {
  available: boolean;
  code: string;
  formatVersion: string;
  accountsVersion: {
    id: string;
    version: number;
    status: string;
    contentHash: string;
  };
  dependencies: {
    complete: boolean;
    referencedObjectCount: number;
    missing: { kind: string; dependency_id: string }[];
  };
  signoffs: {
    total: number;
    active: number;
    invalidated: number;
    activeTypes: string[];
    preparedAndReviewed: boolean;
    clientAndPartnerApproved: boolean;
    filingAuthorised: boolean;
  };
  artefacts: { html: { generated: boolean }; pdf: { generated: boolean } };
  auditEventCount: number;
  maxSourceBytes: number;
};
export type FilingAttempt = {
  id: string;
  accounts_version_id: string;
  accounts_version?: number;
  regulator: string;
  attempt_no: number;
  status:
    | "PREPARED"
    | "SUBMITTED"
    | "ACCEPTED"
    | "REJECTED"
    | "FAILED"
    | "WITHDRAWN";
  payload_hash: string;
  response_content_hash?: string | null;
  regulator_reference?: string | null;
  submitted_by?: string | null;
  submitted_at?: string | null;
  responded_at?: string | null;
  created_at: string;
  evidence?: {
    filename: string;
    contentType: string;
    byteSize: number;
    contentHash: string;
  };
};
export type AuditEvent = {
  event_id: string;
  occurred_at_utc: string;
  actor_id: string;
  event_type: string;
  object_type: string;
  object_id: string;
  reason: string | null;
  correlation_id: string;
  metadata: Record<string, unknown> | null;
  event_hash: string;
};
export type PortalContact = {
  id: string;
  displayName: string;
  email: string;
  accessRole: "CLIENT_PREPARER" | "CLIENT_APPROVER" | "CLIENT_VIEWER";
  contactStatus: "ACTIVE" | "INACTIVE";
  accessStatus: "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  createdAt: string;
};
export type DocumentResponse = {
  id: string;
  requestId: string;
  version: number;
  filename: string;
  contentType: string;
  byteSize: number;
  contentHash: string;
  createdAt: string;
};
export type DocumentRequest = {
  id: string;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  assignedContactId?: string | null;
  documentType?: string | null;
  status: "OPEN" | "RESPONDED" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  latestResponse?: DocumentResponse | null;
};
export type Integration = {
  id: string;
  connectorCode: "CSV";
  organisationId?: string;
  displayName: string;
  status: "CONFIGURED" | "DISABLED" | "REAUTH_REQUIRED";
  hasCredentials: false;
  configuration: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
export type SyncRun = {
  id: string;
  integrationId?: string;
  engagementId?: string;
  status:
    | "QUEUED"
    | "RUNNING"
    | "SUCCEEDED"
    | "PARTIAL"
    | "FAILED"
    | "CANCELLED";
  counts?: Record<string, number>;
  errorSummary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
};
export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  status: "UNREAD" | "READ";
  actionPath?: string | null;
  createdAt: string;
  readAt?: string | null;
};
export type TenantSettings = {
  id: string;
  name: string;
  lifecycleStatus: "ACTIVE" | "SUSPENDED" | "CLOSURE_REQUESTED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
};
export type EntitlementDecision = {
  featureKey: string;
  enabled: boolean;
  value: number | null;
  source: string;
  decisionId: string | null;
};
export type ExportRequest = {
  id: string;
  scope: "TENANT" | "ENGAGEMENT";
  engagementId?: string | null;
  format: "ZIP";
  status: "REQUESTED" | "PROCESSING" | "READY" | "FAILED" | "EXPIRED";
  requestedAt: string;
  completedAt?: string | null;
  downloadPath?: string | null;
};
export type ExportCapability = {
  generationAvailable: false;
  code?: string;
  message?: string;
};
export type AccountsPresentation = {
  accountsVersionId: string;
  currentPeriod: { start: string; end: string };
  comparativePeriod: null | {
    start: string;
    end: string;
    accountsVersionId: string;
  };
  statements: {
    statementCode: string;
    title: string;
    columns: { key: "current" | "comparative"; label: string }[];
    lines: {
      code: string;
      caption: string;
      current: string | number;
      comparative: string | number | null;
    }[];
  }[];
  readiness: {
    comparativeConfigured: boolean;
    comparativeComplete: boolean;
    blocks: string[];
  };
};
export type TrialBalanceField = "accountCode" | "accountName" | "debit" | "credit";
export type TrialBalanceColumnMapping = Record<TrialBalanceField, number>;
export type NormalizedImportPreview = {
  sourceType: "CSV";
  filename: string;
  encoding: string;
  headers: string[];
  detectedColumns: string[];
  suggestedMapping: Partial<TrialBalanceColumnMapping>;
  appliedMapping: Partial<TrialBalanceColumnMapping> | null;
  mappingComplete: boolean;
  preview: Array<{
    rowNo: number;
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
  }>;
  rawPreview: Record<string, string>[];
  rowCount: number;
  recordCount?: number;
  columns?: TrialBalanceField[];
  debitTotal: string | null;
  creditTotal: string | null;
  balanced: boolean | null;
  warnings: string[];
};
export type ApiContext = { tenantId: string };
export type ClientRequestItem = {
  id: string; client_id: string; client_name?: string; title: string; request_type: string;
  status: "draft" | "open" | "viewed" | "responded" | "partially_complete" | "completed" | "cancelled" | "overdue";
  priority: string; due_at?: string | null; engagement_name?: string | null; work_title?: string | null;
  responsible_member_id?: string | null; response_count?: number; last_response_at?: string | null;
  description?: string | null; completion_mode?: "manual" | "automatic" | "workflow";
  response_requirements?: Record<string, unknown>; created_at?: string; updated_at?: string;
};
export type CreateClientRequestInput = {
  clientId: string;
  engagementId?: string;
  workItemId?: string;
  taskId?: string;
  recipientAccessIds: string[];
  requestType: "document" | "information" | "confirmation" | "approval";
  title: string;
  description?: string;
  dueAt?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  send: boolean;
  waitingOnClient?: boolean;
};
export type PortalDocumentItem = {
  id: string; display_filename: string; visibility: "internal" | "shared_with_client" | "client_uploaded" | "restricted";
  client_request_id?: string | null; engagement_id?: string | null; work_item_id?: string | null;
  current_version: number; original_filename?: string; media_type?: string; byte_size?: number;
  scan_status?: "pending" | "accepted" | "quarantined" | "rejected"; version_created_at?: string;
};
export type PortalMessageItem = {
  id: string; sender_context: "practice" | "portal"; body: string; sent_at: string;
  reply_to_message_id?: string | null;
};
export type PortalThreadItem = {
  id: string; client_id: string; client_name?: string; subject: string; status: "open" | "closed" | "archived";
  last_message_at?: string | null; updated_at: string;
};
export type ClientPortalAccess = {
  tenantId: string; tenantName: string; organisationId: string; organisationName: string;
  engagementId: string; periodStart: string; periodEnd: string; contactId: string;
  accessId: string; accessRole: string;
};
export type PracticeService = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  status: "active" | "inactive";
  default_frequency?: string | null;
  responsible_team_id?: string | null;
  specialist_module_key?: string | null;
  entitlement_feature_key?: string | null;
  created_at?: string;
  updated_at?: string;
};
export type ClientService = {
  id: string;
  client_id: string;
  service_id: string;
  service_name?: string;
  status: "active" | "inactive" | "terminated";
  start_date?: string | null;
  end_date?: string | null;
  frequency?: string | null;
  responsible_member_id?: string | null;
  responsible_team_id?: string | null;
  specialist_module_key?: string | null;
  delivery_readiness?: "commercially_accepted" | "onboarding" | "ready_for_delivery" | "active";
};
export type PracticeEngagement = {
  id: string;
  client_id: string;
  client_name?: string;
  reference: string;
  name: string;
  status: "draft" | "proposed" | "active" | "suspended" | "completed" | "terminated";
  acceptance_state: "not_required" | "pending" | "accepted" | "declined";
  start_date?: string | null;
  end_date?: string | null;
  responsible_owner_id?: string | null;
  responsible_team_id?: string | null;
};
export type PracticeWorkStatus = "not_started" | "ready" | "in_progress" | "waiting_on_client" | "waiting_internal" | "review" | "completed" | "cancelled";
export type PracticeWorkItem = {
  id: string;
  client_id: string;
  client_name?: string;
  client_service_id: string;
  service_name?: string;
  engagement_id?: string | null;
  engagement_name?: string | null;
  title: string;
  period_reference?: string | null;
  status: PracticeWorkStatus;
  priority: "low" | "normal" | "high" | "urgent";
  assigned_member_id?: string | null;
  assigned_member_name?: string | null;
  assigned_team_id?: string | null;
  assigned_team_name?: string | null;
  planned_start_date?: string | null;
  due_date?: string | null;
  calculated_due_date?: string | null;
  due_date_overridden?: boolean;
  due_date_override_reason?: string | null;
  due_date_calculation?: Record<string, unknown>;
  source_template_id?: string | null;
  source_template_version?: number | null;
  completed_at?: string | null;
  specialist_module_key?: string | null;
  specialist_record_reference?: string | null;
  created_at?: string;
  updated_at?: string;
};
export type PracticeTask = {
  id: string;
  work_item_id: string;
  title: string;
  description?: string | null;
  status: "not_started" | "in_progress" | "blocked" | "review" | "completed" | "skipped";
  assignee_member_id?: string | null;
  assignee_name?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  reviewer_member_id?: string | null;
  sequence: number;
  due_date?: string | null;
  completed_at?: string | null;
  review_required?: boolean;
  work_stage_id?: string | null;
  blockers?: Array<{ predecessorTaskId:string; dependencyType:string; blockingReason?:string|null; resolvedAt?:string|null }>;
};
export type PracticeWorkStage={id:string;work_item_id:string;name:string;sequence:number;stage_type:"preparation"|"client_input"|"internal_review"|"approval"|"specialist_execution"|"completion";status:"not_started"|"active"|"blocked"|"waiting"|"review"|"completed"|"skipped";block_reason?:string|null;source_template_version:number;};
export type PracticeReviewPoint={id:string;description:string;status:"open"|"addressed"|"cleared"|"reopened";resolution?:string|null;};
export type PracticeReview={id:string;work_item_id:string;work_title?:string;client_name?:string;service_name?:string;stage_name?:string;preparer_name?:string;reviewer_name?:string;due_date?:string|null;status:"requested"|"in_progress"|"changes_requested"|"approved"|"rejected"|"completed"|"reopened";requested_at:string;waiting_hours?:number;review_points?:PracticeReviewPoint[];};
export type AutomationRule={id:string;name:string;enabled:boolean;trigger_type:string;conditions:Array<Record<string,unknown>>;actions:Array<Record<string,unknown>>;priority:number;last_executed_at?:string|null;last_failure_code?:string|null;recent_executions?:Array<{id:string;status:string;started_at:string}>;};
export type RecurrenceExecution={id:string;trigger_type:"scheduled"|"manual"|"dry_run"|"replay";status:string;range_from?:string|null;range_to?:string|null;schedules_evaluated:number;work_generated:number;blocked_entitlement:number;skipped_idempotent:number;failures:number;started_at:string;completed_at?:string|null;};
export type PracticeWorkTemplate = {
  id: string;
  name: string;
  service_id?: string | null;
  service_name?: string | null;
  version: number;
  status: "draft" | "published" | "superseded" | "archived";
  tasks?: Array<{ id?: string; title: string; description?: string | null; sequence: number; dueDateOffsetDays?: number | null; mandatory: boolean }>;
  stages?: Array<{id?:string;name:string;sequence:number;stage_type:string;status:string}>;
};
export type RecurringWorkSchedule = {
  id: string; client_id: string; client_name?: string; client_service_id: string; service_name?: string;
  work_template_id: string; template_name?: string; recurrence_rule: { frequency?: string; interval?: number };
  next_occurrence_date?: string | null; next_due_date?: string | null; owner_name?: string | null; team_name?: string | null;
  specialist_module_key?: string | null; status: "active" | "suspended" | "blocked_entitlement" | "archived";
  generation_block_reason?: string | null;
};
export type ResourceProfile = {
  id:string;display_name:string;team_name?:string|null;role_title?:string|null;
  status:"active"|"inactive"|"unavailable"|"leave_unavailable"|"future_starter";
  weekly_capacity_hours:number;assigned_hours:number;available_hours:number;utilisation_percentage:number;overdue_work:number;
};
export type CapacityPeriod = {key:string;label:string;available_hours:number;committed_hours:number;forecast_hours:number;unavailable_hours:number;remaining_hours:number};
export type CapacityRow = {resource_id:string;display_name:string;team_name?:string|null;periods:CapacityPeriod[]};
export type WorkAllocation = {id:string;work_title:string;client_id:string;client_name:string;client_service_id:string;service_name:string;resource_name?:string|null;team_name?:string|null;planned_start?:string|null;planned_end?:string|null;planned_hours:number;remaining_hours?:number|null;due_date?:string|null;status:string;assignment_state:string};
export type TimeEntry = {id:string;resource_name:string;date:string;client_name:string;service_name?:string|null;work_title?:string|null;duration_hours:number;billable:boolean;status:string;description?:string|null};
export type PortfolioEconomicsRow = {id:string;client_name:string;owner_name?:string|null;team_name?:string|null;service_name?:string|null;workload_hours:number;overdue_work:number;capacity_pressure:string;wip_amount?:number|null;revenue_amount?:number|null;cost_amount?:number|null;contribution_amount?:number|null;margin_percentage?:number|null;currency:string;commercial_value_state:"known"|"calculated"|"estimated"|"unavailable"};
export type PracticeEconomicsOverview = {due_this_week:number;overdue_work:number;waiting_on_client:number;review_queue:number;capacity_utilisation_percentage:number;forecast_capacity_hours:number;wip_amount?:number|null;economic_exceptions:number;currency?:string};
export type PracticeClientSummary = {
  client: { id: string; legal_name?: string; name?: string; originating_opportunity_id?: string | null; originating_proposal_reference_id?: string | null; converted_at?: string | null };
  services: ClientService[];
  engagements: PracticeEngagement[];
  workItems: PracticeWorkItem[];
  upcomingTasks: PracticeTask[];
  recurringSchedules?: RecurringWorkSchedule[];
  onboarding?: { id: string; status: string; mandatory_gates_complete: boolean; updated_at: string } | null;
};
export type CrmProspect = {
  id: string; display_name: string; legal_name?: string | null; entity_type: string;
  status: "prospect" | "qualified" | "converted" | "lost" | "archived";
  primary_contact_id?: string | null; responsible_member_id?: string | null; responsible_team_id?: string | null;
  primary_contact_name?: string | null; primary_contact_email?: string | null;
  responsible_member_name?: string | null; responsible_team_name?: string | null;
  source?: string | null; last_activity_at?: string | null; open_opportunities?: number;
  contacts?: Array<Record<string, unknown>>; activities?: Array<Record<string, unknown>>;
};
export type PlatformTeam = { id: string; name: string; status: string; member_count: number };
export type OpportunityService = { id: string; serviceId?: string; service_id?: string; name?: string; service_name?: string; accepted?: boolean };
export type OpportunityCapabilities = { canCreate: boolean; canEdit: boolean; canConvert: boolean; quoteBenchAvailable: boolean };
export type OpportunityConversion = {
  id: string; client_id: string; client_name?: string | null; engagement_id: string; engagement_name?: string | null;
  onboarding_case_id: string; onboarding_status?: string | null; proposal_reference_id: string;
  proposal_id?: string | null; proposal_version?: string | null; proposal_status?: string | null; converted_at: string;
  activated_services?: Array<{ clientServiceId: string; opportunityServiceId: string; serviceId: string; serviceName?: string }>;
};
export type CrmOpportunity = {
  id: string; prospect_id?: string | null; existing_client_id?: string | null; relationship_name?: string;
  name: string; stage_key: string; stage_name?: string; status: "open" | "won" | "lost" | "cancelled";
  stage_sequence?: number; terminal_outcome?: "won" | "lost" | null;
  expected_close_date?: string | null; probability?: number | null; estimated_value?: string | number | null; currency: string;
  responsible_member_id?: string | null; responsible_team_id?: string | null; source?: string | null; outcome_reason?: string | null;
  responsible_member_name?: string | null; responsible_team_name?: string | null;
  services?: OpportunityService[]; proposal_status?: string | null; conversion_state: string;
  proposals?: Array<Record<string, unknown>>; activities?: Array<Record<string, unknown>>;
  conversion?: OpportunityConversion | null; capabilities?: OpportunityCapabilities;
};
export type OnboardingCase = {
  id: string; client_id: string; client_name?: string; opportunity_id: string; opportunity_name?: string;
  engagement_id: string; engagement_name?: string; work_item_id?: string | null; work_title?: string | null;
  status: "not_started" | "in_progress" | "blocked" | "ready_for_delivery" | "completed" | "cancelled";
  mandatory_gates_complete: boolean; open_blockers?: number; updated_at: string;
  services?: ClientService[]; tasks?: PracticeTask[]; stages?: PracticeWorkStage[];
  blockers?: Array<{ id: string; summary: string; status: "open" | "resolved" }>;
};
export function practiceClientSummaryItem(response: { item: PracticeClientSummary }): PracticeClientSummary {
  return response.item;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const demoTransport =
  (import.meta.env.VITE_PM_PROGRESS_PREVIEW === "true" &&
    typeof window !== "undefined" &&
    window.location.hostname === "pm-002-progress.ledgerly-accounts.pages.dev") ||
  (import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true");

type SessionCacheEntry = {
  value?: unknown;
  expiresAt: number;
  inFlight?: Promise<unknown>;
};

const sessionRequestCache = new Map<string, SessionCacheEntry>();
const sessionCacheGenerations = new Map<string, number>();

export function clearSessionRequestCache(): void {
  sessionRequestCache.clear();
  sessionCacheGenerations.clear();
}

export function sessionCacheTtlForPath(path: string): number {
  if (
    path === "/v1/practice/resources" ||
    path === "/v1/platform/teams" ||
    path === "/v1/practice/services" ||
    path.startsWith("/v1/platform/entitlements/")
  ) return 5 * 60_000;
  if (
    path === "/v1/organisations" ||
    path === "/v1/engagements" ||
    path.startsWith("/v1/crm/prospects") ||
    path.startsWith("/v1/crm/opportunities") ||
    path.startsWith("/v1/practice/work") ||
    path.startsWith("/v1/practice/capacity") ||
    path.startsWith("/v1/practice/portfolio-economics") ||
    path.startsWith("/v1/practice/economics/overview") ||
    /^\/v1\/engagements\/[^/]+\/dashboard$/.test(path)
  ) return 30_000;
  return 0;
}

function sessionCacheKey(path: string, context?: ApiContext): string {
  return `${context?.tenantId || "identity"}:${path}`;
}

function invalidateSessionCache(context?: ApiContext): void {
  const prefix = `${context?.tenantId || "identity"}:`;
  sessionCacheGenerations.set(prefix, (sessionCacheGenerations.get(prefix) ?? 0) + 1);
  for (const key of sessionRequestCache.keys()) {
    if (key.startsWith(prefix)) sessionRequestCache.delete(key);
  }
}

async function requestFromNetwork<T>(
  path: string,
  context?: ApiContext,
  init?: RequestInit,
): Promise<T> {
  const startedAt = performance.now();
  let fetchStartedAt = startedAt;
  let response: Response;
  try {
    const token = await freshAuthToken();
    fetchStartedAt = performance.now();
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(context?.tenantId ? { "x-tenant-id": context.tenantId } : {}),
        ...(init?.body instanceof FormData
          ? {}
          : { "content-type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      notifyUnauthorized();
      throw new ApiError(401, error.message, "AUTH_REQUIRED");
    }
    throw new ApiError(
      0,
      "The accounts service could not be reached. Check the API address and try again.",
      "OFFLINE",
    );
  }
  const completedAt = performance.now();
  const performancePath = path.split("?")[0]!.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
  performance.measure(`pe:api:${performancePath}`, { start: fetchStartedAt, end: completedAt, detail: { status: response.status } });
  if (sessionCacheTtlForPath(path) && typeof window !== "undefined" && /(?:^|[-.])(dev|test)(?:[-.]|$)/i.test(window.location.hostname)) {
    console.info("[pe-perf] api", JSON.stringify({
      path: performancePath,
      authMs: Math.round(fetchStartedAt - startedAt),
      responseMs: Math.round(completedAt - fetchStartedAt),
      responseBytes: Number(response.headers.get("x-pe-response-bytes")) || null,
      serializationMs: Number(response.headers.get("x-pe-serialization-ms")) || 0,
      status: response.status,
    }));
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload?.error;
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(
      response.status,
      error?.message ?? `Request failed (${response.status})`,
      error?.code,
    );
  }
  return payload as T;
}

async function request<T>(
  path: string,
  context?: ApiContext,
  init?: RequestInit,
): Promise<T> {
  if (demoTransport)
    return (await import("./demo")).demoRequest(path, init) as T;
  const method = (init?.method || "GET").toUpperCase();
  const ttl = method === "GET" ? sessionCacheTtlForPath(path) : 0;
  if (!ttl) {
    const result = await requestFromNetwork<T>(path, context, init);
    if (method !== "GET") invalidateSessionCache(context);
    return result;
  }

  const key = sessionCacheKey(path, context);
  const generationKey = `${context?.tenantId || "identity"}:`;
  const generation = sessionCacheGenerations.get(generationKey) ?? 0;
  const cached = sessionRequestCache.get(key);
  if (cached?.value !== undefined && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached?.inFlight) return cached.inFlight as Promise<T>;

  const inFlight = requestFromNetwork<T>(path, context, init).then((value) => {
    if ((sessionCacheGenerations.get(generationKey) ?? 0) === generation)
      sessionRequestCache.set(key, { value, expiresAt: Date.now() + ttl });
    return value;
  }).catch((error) => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      sessionRequestCache.delete(key);
      if (cached?.value !== undefined) return cached.value as T;
      throw error;
    }
    if (cached?.value !== undefined && (sessionCacheGenerations.get(generationKey) ?? 0) === generation) {
      sessionRequestCache.set(key, { value: cached.value, expiresAt: Date.now() + Math.min(ttl, 5_000) });
      return cached.value as T;
    }
    sessionRequestCache.delete(key);
    throw error;
  });
  sessionRequestCache.set(key, { value: cached?.value, expiresAt: cached?.expiresAt ?? 0, inFlight });
  if (cached?.value !== undefined) {
    void inFlight;
    return cached.value as T;
  }
  return inFlight;
}

async function requestBlob(path: string, context: ApiContext): Promise<Blob> {
  if (demoTransport) return (await import("./demo")).demoBlob(path);
  if (!path.startsWith("/v1/"))
    throw new ApiError(
      400,
      "The artefact path returned by the service is invalid.",
      "INVALID_ARTEFACT_PATH",
    );
  let response: Response;
  try {
    const token = await freshAuthToken();
    response = await fetch(`${apiBase}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": context.tenantId,
      },
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      notifyUnauthorized();
      throw new ApiError(401, error.message, "AUTH_REQUIRED");
    }
    throw new ApiError(
      0,
      "The accounts artefact could not be reached. Try again.",
      "OFFLINE",
    );
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(
      response.status,
      payload?.error?.message ?? `Artefact request failed (${response.status})`,
      payload?.error?.code,
    );
  }
  return response.blob();
}

let unauthorizedHandler: (() => void) | null = null;
function notifyUnauthorized() {
  clearSessionRequestCache();
  unauthorizedHandler?.();
}
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export const api = {
  tenantMemberships: () =>
    request<{
      items: TenantMembership[];
      onboarding?: TenantOnboarding | null;
    }>("/v1/me/tenants"),
  createTenant: (name: string) =>
    request<{
      item: { id: string; name: string; role: "OWNER" };
      created: boolean;
    }>("/v1/me/tenants", undefined, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  acceptInvitation: (token: string) =>
    request<{
      item: { tenantId: string; name: string; role: string };
      accepted: boolean;
      memberCreated: boolean;
    }>("/v1/me/invitations/accept", undefined, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  team: (context: ApiContext) =>
    request<{ members: TeamMember[]; invitations: TeamInvitation[] }>(
      "/v1/team",
      context,
    ),
  createTeamInvitation: (
    context: ApiContext,
    role: "ADMIN" | "MEMBER",
    expiresInHours: number,
  ) =>
    request<{ item: TeamInvitation; token: string; inviteUrl: string }>(
      "/v1/team/invitations",
      context,
      { method: "POST", body: JSON.stringify({ role, expiresInHours }) },
    ),
  revokeTeamInvitation: (context: ApiContext, invitationId: string) =>
    request<{
      item: {
        id: string;
        role: string;
        status: "REVOKED";
        expiresAt: string;
        revokedAt: string;
      };
    }>(
      `/v1/team/invitations/${encodeURIComponent(invitationId)}/revoke`,
      context,
      { method: "POST" },
    ),
  updateTeamMemberRole: (
    context: ApiContext,
    memberId: string,
    role: "OWNER" | "ADMIN" | "MEMBER",
  ) =>
    request<{
      item: { id: string; previousRole: string; role: string; removed: false };
    }>(`/v1/team/members/${encodeURIComponent(memberId)}/role`, context, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),
  removeTeamMember: (context: ApiContext, memberId: string) =>
    request<{
      item: { id: string; previousRole: string; role: null; removed: true };
    }>(`/v1/team/members/${encodeURIComponent(memberId)}/remove`, context, {
      method: "POST",
    }),
  organisations: (context: ApiContext) =>
    request<{ items: Organisation[] }>("/v1/organisations", context),
  organisationPermanentFile: (context: ApiContext, organisationId: string) =>
    request<{ item: OrganisationPermanentFile }>(
      `/v1/organisations/${encodeURIComponent(organisationId)}/permanent-file`,
      context,
    ),
  updateOrganisationPermanentFile: (
    context: ApiContext,
    organisationId: string,
    body: Record<string, string | number | null>,
  ) =>
    request<{ item: { organisationId: string; updatedAt: string } }>(
      `/v1/organisations/${encodeURIComponent(organisationId)}/permanent-file`,
      context,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  createPermanentFileOfficer: (
    context: ApiContext,
    organisationId: string,
    body: Record<string, string | null>,
  ) =>
    request<{ item: PermanentFileOfficer }>(
      `/v1/organisations/${encodeURIComponent(organisationId)}/permanent-file/officers`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updatePermanentFileOfficer: (
    context: ApiContext,
    organisationId: string,
    officerId: string,
    body: Record<string, string | null>,
  ) =>
    request<{ item: PermanentFileOfficer }>(
      `/v1/organisations/${encodeURIComponent(organisationId)}/permanent-file/officers/${encodeURIComponent(officerId)}`,
      context,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  createPermanentFileAdviser: (
    context: ApiContext,
    organisationId: string,
    body: Record<string, string | null>,
  ) =>
    request<{ item: PermanentFileAdviser }>(
      `/v1/organisations/${encodeURIComponent(organisationId)}/permanent-file/advisers`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updatePermanentFileAdviser: (
    context: ApiContext,
    organisationId: string,
    adviserId: string,
    body: Record<string, string | null>,
  ) =>
    request<{ item: PermanentFileAdviser }>(
      `/v1/organisations/${encodeURIComponent(organisationId)}/permanent-file/advisers/${encodeURIComponent(adviserId)}`,
      context,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  createOrganisation: (
    context: ApiContext,
    body: { legalName: string; legalForm: string; jurisdiction: string },
  ) =>
    request<{ item: Organisation }>("/v1/clients", context, {
      method: "POST",
      body: JSON.stringify({
        displayName: body.legalName,
        legalName: body.legalName,
        entityType: body.legalForm === "LLP"
          ? "PARTNERSHIP"
          : body.legalForm === "CHARITABLE_COMPANY"
            ? "CHARITY"
            : body.legalForm === "OTHER"
              ? "OTHER"
              : "COMPANY",
        legalForm: body.legalForm,
        jurisdiction: body.jurisdiction,
      }),
    }),
  createEngagement: (
    context: ApiContext,
    body: {
      organisationId: string;
      periodStart: string;
      periodEnd: string;
      framework: string;
      sectorProfile: string;
    },
  ) =>
    request<{ item: Engagement }>("/v1/engagements", context, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  engagements: (context: ApiContext) =>
    request<{ items: Engagement[] }>("/v1/engagements", context),
  canonicalAccounts: (context: ApiContext) =>
    request<{ items: CanonicalAccount[] }>(
      "/v1/canonical-accounts?taxonomyVersion=UK-CANONICAL-2026",
      context,
    ),
  trialBalance: (context: ApiContext, id: string) =>
    request<{ items: TrialBalanceLine[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/trial-balance`,
      context,
    ),
  history: (context: ApiContext, id: string) =>
    request<{ items: AuditEvent[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/history`,
      context,
    ),
  report: (context: ApiContext, id: string) =>
    request<{ balanced: boolean; fullyMapped: boolean; lines: ReportLine[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/report`,
      context,
    ),
  importTrialBalance: (
    context: ApiContext,
    id: string,
    file: File,
    mapping?: TrialBalanceColumnMapping,
  ) => {
    const body = new FormData();
    body.append("file", file);
    if (mapping) body.append("mapping", JSON.stringify(mapping));
    return request<{
      item: {
        id: string;
        trial_balance_id: string;
        snapshot_id: string;
        version_no: number;
        record_count: number;
      };
    }>(`/v1/engagements/${encodeURIComponent(id)}/imports`, context, {
      method: "POST",
      body,
    });
  },
  updateMapping: (
    context: ApiContext,
    id: string,
    sourceAccountId: string,
    canonicalAccountId: string,
  ) =>
    request<{ item: unknown }>(
      `/v1/engagements/${encodeURIComponent(id)}/mappings`,
      context,
      {
        method: "POST",
        body: JSON.stringify({
          sourceAccountId,
          canonicalAccountId,
          reason: "Mapped in accounts workspace",
        }),
      },
    ),
  normalizeImport: (
    context: ApiContext,
    id: string,
    file: File,
    mapping?: Partial<TrialBalanceColumnMapping>,
  ) => {
    const body = new FormData();
    body.append("file", file);
    if (mapping) body.append("mapping", JSON.stringify(mapping));
    return request<{ item: NormalizedImportPreview }>(
      `/v1/engagements/${encodeURIComponent(id)}/imports/normalize`,
      context,
      { method: "POST", body },
    );
  },
  dashboard: (context: ApiContext, id: string) =>
    request<Dashboard>(
      `/v1/engagements/${encodeURIComponent(id)}/dashboard`,
      context,
    ),
  journals: (context: ApiContext, id: string) =>
    request<{ items: Journal[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/journals`,
      context,
    ),
  createJournal: (
    context: ApiContext,
    id: string,
    body: {
      journalType: string;
      description: string;
      lines: {
        canonicalAccountId: string;
        debit: string;
        credit: string;
        narrative?: string;
      }[];
    },
  ) =>
    request<{ item: Journal }>(
      `/v1/engagements/${encodeURIComponent(id)}/journals`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  transitionJournal: (
    context: ApiContext,
    id: string,
    journalId: string,
    status: string,
  ) =>
    request<{ item: Journal }>(
      `/v1/engagements/${encodeURIComponent(id)}/journals/${encodeURIComponent(journalId)}/transitions`,
      context,
      {
        method: "POST",
        body: JSON.stringify({
          status,
          reason: `${status.toLowerCase()} from accounts workspace`,
        }),
      },
    ),
  reconciliations: (context: ApiContext, id: string) =>
    request<{ items: Reconciliation[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/reconciliations`,
      context,
    ),
  updateReconciliation: (
    context: ApiContext,
    id: string,
    body: Record<string, unknown>,
  ) =>
    request<{ item: Reconciliation }>(
      `/v1/engagements/${encodeURIComponent(id)}/reconciliations`,
      context,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  reviewReconciliation: (
    context: ApiContext,
    id: string,
    reconciliationId: string,
  ) =>
    request<{ item: Reconciliation }>(
      `/v1/engagements/${encodeURIComponent(id)}/reconciliations/${encodeURIComponent(reconciliationId)}/review`,
      context,
      {
        method: "POST",
        body: JSON.stringify({ reason: "Reviewed in accounts workspace" }),
      },
    ),
  workflowTasks: (context: ApiContext, id: string) =>
    request<{ items: WorkflowTask[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/workflow-tasks`,
      context,
    ),
  createWorkflowTask: (
    context: ApiContext,
    id: string,
    body: {
      taskType: string;
      title: string;
      blocking?: boolean;
      assignedTo?: string;
      dueAt?: string;
    },
  ) =>
    request<{ item: WorkflowTask }>(
      `/v1/engagements/${encodeURIComponent(id)}/workflow-tasks`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateWorkflowTask: (
    context: ApiContext,
    id: string,
    taskId: string,
    body: {
      title?: string;
      status?: WorkflowTaskStatus;
      blocking?: boolean;
      assignedTo?: string | null;
      dueAt?: string | null;
    },
  ) =>
    request<{ item: WorkflowTask }>(
      `/v1/engagements/${encodeURIComponent(id)}/workflow-tasks/${encodeURIComponent(taskId)}`,
      context,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  reviewPoints: (context: ApiContext, id: string) =>
    request<{ items: ReviewPoint[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/review-points`,
      context,
    ),
  createReviewPoint: (
    context: ApiContext,
    id: string,
    body: {
      objectType: string;
      objectId: string;
      question: string;
      severity?: string;
      assignedTo?: string;
    },
  ) =>
    request<{ item: ReviewPoint }>(
      `/v1/engagements/${encodeURIComponent(id)}/review-points`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateReviewPoint: (
    context: ApiContext,
    id: string,
    pointId: string,
    body: Partial<ReviewPoint>,
  ) =>
    request<{ item: ReviewPoint }>(
      `/v1/engagements/${encodeURIComponent(id)}/review-points/${encodeURIComponent(pointId)}`,
      context,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  workingPapers: (context: ApiContext, id: string) =>
    request<{ items: WorkingPaper[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers`,
      context,
    ),
  workingPaperLibrary: (context: ApiContext, id: string) =>
    request<{ items: WorkingPaperLibraryItem[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-paper-library`,
      context,
    ),
  customiseWorkingPaperTemplate: (
    context: ApiContext,
    id: string,
    templateCode: string,
    body: {
      scope: "PRACTICE" | "CLIENT";
      templateVersion: number;
      disposition: "INCLUDE" | "EXCLUDE";
      title?: string;
      objective?: string;
      guidance?: string;
      required?: boolean;
      reason: string;
    },
  ) =>
    request<{ item: Record<string, unknown> }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-paper-library/${encodeURIComponent(templateCode)}`,
      context,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  createCustomWorkingPaperTemplate: (
    context: ApiContext,
    id: string,
    body: {
      scope: "PRACTICE" | "CLIENT";
      code: string;
      categoryCode: WorkingPaperCategory;
      title: string;
      objective: string;
      guidance?: string;
      required?: boolean;
    },
  ) =>
    request<{ item: Record<string, unknown> }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-paper-library`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  deployWorkingPaperLibrary: (
    context: ApiContext,
    id: string,
    templateCodes?: string[],
  ) =>
    request<{ created: number; skipped: number; replaced: number; controlledFallbacks: number; items: WorkingPaper[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/deploy`,
      context,
      {
        method: "POST",
        body: JSON.stringify(templateCodes ? { templateCodes } : {}),
      },
    ),
  setWorkingPaperApplicability: (
    context: ApiContext,
    id: string,
    paperId: string,
    body: {
      applicability: "APPLICABLE" | "NOT_APPLICABLE";
      reason?: string;
    },
  ) =>
    request<{ item: WorkingPaper }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/applicability`,
      context,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  workingPaperGovernanceCatalogue: (context: ApiContext, id: string) =>
    request<{ item: WorkingPaperGovernanceCatalogue }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-paper-governance/catalogue`,
      context,
    ),
  workingPaperRisks: (context: ApiContext, id: string) =>
    request<{ items: WorkingPaperRisk[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/risks`,
      context,
    ),
  createWorkingPaperRisk: (
    context: ApiContext,
    id: string,
    body: {
      riskCode: string;
      title: string;
      description?: string;
      riskLevel: WorkingPaperRisk["riskLevel"];
      response?: string;
      status?: WorkingPaperRisk["status"];
    },
  ) =>
    request<{ item: WorkingPaperRisk }>(
      `/v1/engagements/${encodeURIComponent(id)}/risks`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  workingPaperGovernance: (
    context: ApiContext,
    id: string,
    paperId: string,
  ) =>
    request<{ item: WorkingPaperGovernance }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/governance`,
      context,
    ),
  linkWorkingPaperReportLine: (
    context: ApiContext,
    id: string,
    paperId: string,
    reportLineId: string,
    linkPurpose: "PRIMARY" | "SUPPORTING" | "DISCLOSURE",
  ) =>
    request<{ created: boolean; item: Record<string, unknown> }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/report-line-links/${encodeURIComponent(reportLineId)}`,
      context,
      { method: "PUT", body: JSON.stringify({ linkPurpose }) },
    ),
  linkWorkingPaperAssertion: (
    context: ApiContext,
    id: string,
    paperId: string,
    assertionCode: string,
  ) =>
    request<{ created: boolean; item: Record<string, unknown> }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/assertion-links/${encodeURIComponent(assertionCode)}`,
      context,
      { method: "PUT", body: JSON.stringify({}) },
    ),
  linkWorkingPaperRisk: (
    context: ApiContext,
    id: string,
    paperId: string,
    riskId: string,
  ) =>
    request<{ created: boolean; item: Record<string, unknown> }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/risk-links/${encodeURIComponent(riskId)}`,
      context,
      { method: "PUT", body: JSON.stringify({}) },
    ),
  linkWorkingPaperTheme: (
    context: ApiContext,
    id: string,
    paperId: string,
    themeCode: string,
    isPrimary = false,
  ) =>
    request<{ created: boolean; item: Record<string, unknown> }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/theme-links/${encodeURIComponent(themeCode)}`,
      context,
      { method: "PUT", body: JSON.stringify({ isPrimary }) },
    ),
  replaceWorkingPaperReportLine: (
    context: ApiContext,
    id: string,
    paperId: string,
    linkId: string,
    reportLineId: string,
    reason: string,
  ) =>
    request<WorkingPaperLinkReplacement<WorkingPaperGovernance["reportLines"][number]>>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/report-line-links/${encodeURIComponent(linkId)}/replace`,
      context,
      { method: "POST", body: JSON.stringify({ reportLineId, reason }) },
    ),
  replaceWorkingPaperAssertion: (
    context: ApiContext,
    id: string,
    paperId: string,
    linkId: string,
    assertionCode: string,
    reason: string,
  ) =>
    request<WorkingPaperLinkReplacement<WorkingPaperGovernance["assertions"][number]>>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/assertion-links/${encodeURIComponent(linkId)}/replace`,
      context,
      { method: "POST", body: JSON.stringify({ assertionCode, reason }) },
    ),
  replaceWorkingPaperRisk: (
    context: ApiContext,
    id: string,
    paperId: string,
    linkId: string,
    riskId: string,
    reason: string,
  ) =>
    request<WorkingPaperLinkReplacement<WorkingPaperGovernance["risks"][number]>>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/risk-links/${encodeURIComponent(linkId)}/replace`,
      context,
      { method: "POST", body: JSON.stringify({ riskId, reason }) },
    ),
  replaceWorkingPaperTheme: (
    context: ApiContext,
    id: string,
    paperId: string,
    linkId: string,
    themeCode: string,
    reason: string,
  ) =>
    request<WorkingPaperLinkReplacement<WorkingPaperGovernance["themes"][number]>>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/theme-links/${encodeURIComponent(linkId)}/replace`,
      context,
      { method: "POST", body: JSON.stringify({ themeCode, reason }) },
    ),
  workingPaperAttachments: (
    context: ApiContext,
    id: string,
    paperId: string,
  ) =>
    request<{ items: WorkingPaperAttachment[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/attachments`,
      context,
    ),
  uploadWorkingPaperAttachment: (
    context: ApiContext,
    id: string,
    paperId: string,
    form: FormData,
  ) =>
    request<{ created: boolean; item: WorkingPaperAttachment }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/attachments`,
      context,
      { method: "POST", body: form },
    ),
  workingPaperAttachmentBlob: (
    context: ApiContext,
    contentPath: string,
    download = false,
  ) => requestBlob(`${contentPath}${download ? "?download=1" : ""}`, context),
  createWorkingPaper: (
    context: ApiContext,
    id: string,
    body: {
      code: string;
      title: string;
      categoryCode: WorkingPaperCategory;
      objective: string;
      reportLineId?: string;
      content: Record<string, unknown>;
    },
  ) =>
    request<{ item: WorkingPaper }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  workingPaperVersions: (context: ApiContext, id: string, paperId: string) =>
    request<{ items: WorkingPaperVersion[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/versions`,
      context,
    ),
  createWorkingPaperVersion: (
    context: ApiContext,
    id: string,
    paperId: string,
    content: Record<string, unknown>,
  ) =>
    request<{ item: WorkingPaperVersion }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/versions`,
      context,
      { method: "POST", body: JSON.stringify({ content }) },
    ),
  transitionWorkingPaper: (
    context: ApiContext,
    id: string,
    paperId: string,
    status: string,
  ) =>
    request<{ item: WorkingPaper }>(
      `/v1/engagements/${encodeURIComponent(id)}/working-papers/${encodeURIComponent(paperId)}/transitions`,
      context,
      {
        method: "POST",
        body: JSON.stringify({
          status,
          reason: `${status.toLowerCase()} from accounts workspace`,
        }),
      },
    ),
  disclosures: (context: ApiContext, id: string) =>
    request<{ items: Disclosure[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/disclosures`,
      context,
    ),
  createDisclosure: (
    context: ApiContext,
    id: string,
    body: {
      disclosureCode: string;
      applicability: Disclosure["applicability"];
      ruleVersion?: string;
      answer: Record<string, unknown>;
    },
  ) =>
    request<{ item: Disclosure }>(
      `/v1/engagements/${encodeURIComponent(id)}/disclosures`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateDisclosure: (
    context: ApiContext,
    id: string,
    disclosureId: string,
    body: { applicability?: string; status?: string },
  ) =>
    request<{ item: Disclosure }>(
      `/v1/engagements/${encodeURIComponent(id)}/disclosures/${encodeURIComponent(disclosureId)}`,
      context,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  createDisclosureVersion: (
    context: ApiContext,
    id: string,
    disclosureId: string,
    answer: Record<string, unknown>,
  ) =>
    request<{ item: DisclosureVersion }>(
      `/v1/engagements/${encodeURIComponent(id)}/disclosures/${encodeURIComponent(disclosureId)}/versions`,
      context,
      { method: "POST", body: JSON.stringify({ answer }) },
    ),
  accountsVersions: (context: ApiContext, id: string) =>
    request<{ items: AccountsVersion[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions`,
      context,
    ),
  reportingPacks: (context: ApiContext, id: string) =>
    request<{ items: ReportingPack[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/reporting-packs`,
      context,
    ),
  generateAccountsVersion: (
    context: ApiContext,
    id: string,
    frameworkPackId: string,
    frameworkPackVersionNo: number,
    comparativeAccountsVersionId?: string,
  ) =>
    request<{ item: AccountsVersion }>(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions/generate`,
      context,
      {
        method: "POST",
        body: JSON.stringify({
          frameworkPackId,
          frameworkPackVersionNo,
          ...(comparativeAccountsVersionId
            ? { comparativeAccountsVersionId }
            : {}),
        }),
      },
    ),
  accountsPresentation: (context: ApiContext, id: string, versionId: string) =>
    request<{ item: AccountsPresentation }>(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions/${encodeURIComponent(versionId)}/presentation`,
      context,
    ),
  transitionAccountsVersion: (
    context: ApiContext,
    id: string,
    versionId: string,
    status: string,
  ) =>
    request<{ item: AccountsVersion }>(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions/${encodeURIComponent(versionId)}/transitions`,
      context,
      {
        method: "POST",
        body: JSON.stringify({
          status,
          reason: `${status.toLowerCase()} from accounts workspace`,
        }),
      },
    ),
  signoffAccountsVersion: (
    context: ApiContext,
    id: string,
    versionId: string,
    objectVersion: number,
    signoffType: string,
  ) =>
    request<{ item: Signoff }>(
      `/v1/engagements/${encodeURIComponent(id)}/signoffs`,
      context,
      {
        method: "POST",
        body: JSON.stringify({
          objectType: "ACCOUNTS_VERSION",
          objectId: versionId,
          objectVersion,
          signoffType,
        }),
      },
    ),
  accountsArtefactCapabilities: (
    context: ApiContext,
    id: string,
    versionId: string,
  ) =>
    request<{ capabilities: ArtefactCapabilities }>(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions/${encodeURIComponent(versionId)}/artefacts/capabilities`,
      context,
    ),
  generateAccountsHtml: (context: ApiContext, id: string, versionId: string) =>
    request<{ item: HtmlArtefact; created: boolean }>(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions/${encodeURIComponent(versionId)}/artefacts/html`,
      context,
      { method: "POST" },
    ),
  accountsHtmlBlob: (context: ApiContext, path: string) =>
    requestBlob(path, context),
  generateAccountsPdf: (context: ApiContext, id: string, versionId: string) =>
    request<{ item: PdfArtefact; created: boolean }>(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions/${encodeURIComponent(versionId)}/artefacts/pdf`,
      context,
      { method: "POST" },
    ),
  accountsPdfBlob: (context: ApiContext, path: string) =>
    requestBlob(path, context),
  generateAccountsDocx: (context: ApiContext, id: string, versionId: string) =>
    request<{ item: DocxArtefact; created: boolean }>(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions/${encodeURIComponent(versionId)}/artefacts/docx`,
      context,
      { method: "POST" },
    ),
  accountsDocxBlob: (context: ApiContext, path: string) =>
    requestBlob(path, context),
  evidenceBundleCapability: (
    context: ApiContext,
    id: string,
    versionId: string,
  ) =>
    request<{ capability: EvidenceBundleCapability }>(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions/${encodeURIComponent(versionId)}/evidence-bundle/capabilities`,
      context,
    ),
  evidenceBundleBlob: (context: ApiContext, id: string, versionId: string) =>
    requestBlob(
      `/v1/engagements/${encodeURIComponent(id)}/accounts-versions/${encodeURIComponent(versionId)}/evidence-bundle.zip`,
      context,
    ),
  filingAttempts: (context: ApiContext, id: string) =>
    request<{ items: FilingAttempt[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/filing-attempts`,
      context,
    ),
  createFilingAttempt: (
    context: ApiContext,
    id: string,
    accountsVersionId: string,
    regulator: string,
  ) =>
    request<{ item: FilingAttempt }>(
      `/v1/engagements/${encodeURIComponent(id)}/filing-attempts`,
      context,
      {
        method: "POST",
        body: JSON.stringify({ accountsVersionId, regulator }),
      },
    ),
  updateFilingAttempt: (
    context: ApiContext,
    id: string,
    filingId: string,
    status: "SUBMITTED" | "FAILED" | "WITHDRAWN",
  ) =>
    request<{ item: FilingAttempt }>(
      `/v1/engagements/${encodeURIComponent(id)}/filing-attempts/${encodeURIComponent(filingId)}`,
      context,
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),
  uploadFilingEvidence: (
    context: ApiContext,
    id: string,
    filingId: string,
    file: File,
    status: "ACCEPTED" | "REJECTED",
    regulatorReference?: string,
  ) => {
    const body = new FormData();
    body.append("file", file);
    body.append("status", status);
    if (regulatorReference?.trim())
      body.append("regulatorReference", regulatorReference.trim());
    return request<{ item: FilingAttempt; created: boolean }>(
      `/v1/engagements/${encodeURIComponent(id)}/filing-attempts/${encodeURIComponent(filingId)}/evidence`,
      context,
      { method: "POST", body },
    );
  },
  portalContacts: (context: ApiContext, id: string) =>
    request<{ items: PortalContact[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/client-portal/contacts`,
      context,
    ),
  createPortalContact: (
    context: ApiContext,
    id: string,
    body: {
      displayName: string;
      email: string;
      accessRole: PortalContact["accessRole"];
    },
  ) =>
    request<{ item: PortalContact }>(
      `/v1/engagements/${encodeURIComponent(id)}/client-portal/contacts`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  invitePortalContact: (context: ApiContext, id: string, contactId: string) =>
    request<{
      item: {
        id: string;
        contactId: string;
        status: "ACTIVE";
        expiresAt: string;
      };
      token: string;
      inviteUrl: string;
    }>(
      `/v1/engagements/${encodeURIComponent(id)}/client-portal/contacts/${encodeURIComponent(contactId)}/invitations`,
      context,
      { method: "POST" },
    ),
  updatePortalAccess: (
    context: ApiContext,
    id: string,
    contactId: string,
    status: "ACTIVE" | "SUSPENDED" | "REVOKED",
    reason?: string,
  ) =>
    request<{ item: PortalContact }>(
      `/v1/engagements/${encodeURIComponent(id)}/client-portal/contacts/${encodeURIComponent(contactId)}/access`,
      context,
      { method: "PATCH", body: JSON.stringify({ status, reason }) },
    ),
  documentRequests: (context: ApiContext, id: string) =>
    request<{ items: DocumentRequest[] }>(
      `/v1/engagements/${encodeURIComponent(id)}/client-portal/document-requests`,
      context,
    ),
  createDocumentRequest: (
    context: ApiContext,
    id: string,
    body: {
      title: string;
      description?: string;
      dueAt?: string;
      assignedContactId?: string;
      documentType?: string;
    },
  ) =>
    request<{ item: DocumentRequest }>(
      `/v1/engagements/${encodeURIComponent(id)}/client-portal/document-requests`,
      context,
      { method: "POST", body: JSON.stringify(body) },
    ),
  cancelDocumentRequest: (
    context: ApiContext,
    id: string,
    requestId: string,
    reason: string,
  ) =>
    request<{ item: DocumentRequest }>(
      `/v1/engagements/${encodeURIComponent(id)}/client-portal/document-requests/${encodeURIComponent(requestId)}/cancel`,
      context,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  reviewDocumentResponse: (
    context: ApiContext,
    id: string,
    requestId: string,
    responseId: string,
    decision: "APPROVED" | "REJECTED",
    reason: string,
  ) =>
    request<{ item: DocumentRequest }>(
      `/v1/engagements/${encodeURIComponent(id)}/client-portal/document-requests/${encodeURIComponent(requestId)}/review`,
      context,
      {
        method: "POST",
        body: JSON.stringify({ responseId, decision, reason }),
      },
    ),
  integrations: (context: ApiContext) =>
    request<{ items: Integration[] }>("/v1/integrations", context),
  createIntegration: (
    context: ApiContext,
    organisationId: string,
    displayName: string,
    configuration: Record<string, unknown> = {},
  ) =>
    request<{ item: Integration }>("/v1/integrations", context, {
      method: "POST",
      body: JSON.stringify({
        organisationId,
        connectorCode: "CSV",
        displayName,
        configuration,
      }),
    }),
  updateIntegration: (
    context: ApiContext,
    integrationId: string,
    body: {
      displayName?: string;
      status?: "CONFIGURED" | "DISABLED";
      configuration?: Record<string, unknown>;
    },
  ) =>
    request<{ item: Integration }>(
      `/v1/integrations/${encodeURIComponent(integrationId)}`,
      context,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  syncRuns: (context: ApiContext, integrationId: string) =>
    request<{ items: SyncRun[] }>(
      `/v1/integrations/${encodeURIComponent(integrationId)}/sync-runs`,
      context,
    ),
  createSyncRun: (
    context: ApiContext,
    integrationId: string,
    engagementId: string,
    idempotencyKey: string,
  ) =>
    request<{ item: SyncRun }>(
      `/v1/integrations/${encodeURIComponent(integrationId)}/sync-runs`,
      context,
      {
        method: "POST",
        body: JSON.stringify({ engagementId, idempotencyKey }),
      },
    ),
  notifications: (context: ApiContext, status?: "UNREAD" | "READ") =>
    request<{ items: NotificationItem[] }>(
      `/v1/notifications${status ? `?status=${status}` : ""}`,
      context,
    ),
  markNotificationRead: (context: ApiContext, notificationId: string) =>
    request<{ item: NotificationItem }>(
      `/v1/notifications/${encodeURIComponent(notificationId)}/read`,
      context,
      { method: "POST" },
    ),
  entitlementDecision: (context: ApiContext, featureKey: string) =>
    request<{ item: EntitlementDecision }>(
      `/v1/platform/entitlements/${encodeURIComponent(featureKey)}`,
      context,
    ),
  tenantSettings: (context: ApiContext) =>
    request<{ item: TenantSettings }>("/v1/tenant/settings", context),
  updateTenantSettings: (context: ApiContext, name: string) =>
    request<{ item: TenantSettings }>("/v1/tenant/settings", context, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  updateTenantLifecycle: (
    context: ApiContext,
    status: "ACTIVE" | "SUSPENDED" | "CLOSURE_REQUESTED" | "CLOSED",
    reason?: string,
  ) =>
    request<{ item: TenantSettings }>("/v1/tenant/lifecycle", context, {
      method: "POST",
      body: JSON.stringify({ status, reason }),
    }),
  exportRequests: (context: ApiContext) =>
    request<{ items: ExportRequest[]; capability?: ExportCapability }>(
      "/v1/tenant/export-requests",
      context,
    ),
  createExportRequest: (
    context: ApiContext,
    body: {
      scope: "TENANT" | "ENGAGEMENT";
      engagementId?: string;
      idempotencyKey: string;
    },
  ) =>
    request<{ item: ExportRequest }>("/v1/tenant/export-requests", context, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  practiceServices: (context: ApiContext) =>
    request<{ items: PracticeService[] }>("/v1/practice/services", context),
  createPracticeService: (context: ApiContext, body: Record<string, unknown>) =>
    request<{ item: PracticeService }>("/v1/practice/services", context, { method: "POST", body: JSON.stringify(body) }),
  updatePracticeService: (context: ApiContext, id: string, body: Record<string, unknown>) =>
    request<{ item: PracticeService }>(`/v1/practice/services/${encodeURIComponent(id)}`, context, { method: "PATCH", body: JSON.stringify(body) }),
  clientServices: (context: ApiContext, clientId: string) =>
    request<{ items: ClientService[] }>(`/v1/clients/${encodeURIComponent(clientId)}/services`, context),
  practiceEngagements: (context: ApiContext, clientId?: string) =>
    request<{ items: PracticeEngagement[] }>(`/v1/practice/engagements${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`, context),
  practiceWork: (context: ApiContext, filters: { clientId?: string; serviceId?: string; status?: string; assignedMemberId?: string; dueBefore?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
    return request<{ items: PracticeWorkItem[] }>(`/v1/practice/work${query ? `?${query}` : ""}`, context);
  },
  createPracticeWork: (context: ApiContext, body: { clientId: string; clientServiceId: string; engagementId?: string; title: string; periodReference?: string; status?: PracticeWorkStatus; priority?: PracticeWorkItem["priority"]; dueDate?: string; assignedMemberId?: string; assignedTeamId?: string }) =>
    request<{ item: PracticeWorkItem }>("/v1/practice/work", context, { method: "POST", body: JSON.stringify(body) }),
  practiceWorkItem: (context: ApiContext, id: string) =>
    request<{ item: PracticeWorkItem & {tasks?:PracticeTask[];stages?:PracticeWorkStage[];reviews?:PracticeReview[]} }>(`/v1/practice/work/${encodeURIComponent(id)}`, context),
  updatePracticeWorkStatus: (context: ApiContext, id: string, status: PracticeWorkStatus) =>
    request<{ item: PracticeWorkItem }>(`/v1/practice/work/${encodeURIComponent(id)}/status`, context, { method: "POST", body: JSON.stringify({ status }) }),
  practiceTasks: (context: ApiContext, workId: string) =>
    request<{ items: PracticeTask[] }>(`/v1/practice/work/${encodeURIComponent(workId)}/tasks`, context),
  updatePracticeTaskStatus: (context: ApiContext, id: string, status: PracticeTask["status"]) =>
    request<{ item: PracticeTask }>(`/v1/practice/tasks/${encodeURIComponent(id)}/status`, context, { method: "POST", body: JSON.stringify({ status }) }),
  practiceWorkTemplates: (context: ApiContext) =>
    request<{ items: PracticeWorkTemplate[] }>("/v1/practice/work-templates", context),
  createPracticeWorkTemplate: (context: ApiContext, body: Record<string, unknown>) =>
    request<{ item: PracticeWorkTemplate }>("/v1/practice/work-templates", context, { method: "POST", body: JSON.stringify(body) }),
  publishPracticeWorkTemplate: (context: ApiContext, id: string) =>
    request<{ item: PracticeWorkTemplate }>(`/v1/practice/work-templates/${encodeURIComponent(id)}/publish`, context, { method: "POST", body: "{}" }),
  recurringSchedules: (context: ApiContext) =>
    request<{ items: RecurringWorkSchedule[] }>("/v1/practice/recurring-schedules", context),
  generateRecurringSchedule: (context: ApiContext, id: string) =>
    request<{ generated: number; workItemIds: string[] }>(`/v1/practice/recurring-schedules/${encodeURIComponent(id)}/generate`, context, { method: "POST", body: "{}" }),
  practiceWorkflow:(context:ApiContext,workId:string)=>request<{items:PracticeWorkStage[]}>(`/v1/practice/work/${encodeURIComponent(workId)}/workflow`,context),
  advancePracticeStage:(context:ApiContext,stageId:string,status:PracticeWorkStage["status"],reason?:string)=>request<{item:PracticeWorkStage}>(`/v1/practice/workflow-stages/${encodeURIComponent(stageId)}/advance`,context,{method:"POST",body:JSON.stringify({status,reason})}),
  practiceReviews:(context:ApiContext,status?:string)=>request<{items:PracticeReview[]}>(`/v1/practice/reviews${status?`?status=${encodeURIComponent(status)}`:""}`,context),
  decidePracticeReview:(context:ApiContext,id:string,status:PracticeReview["status"],reason?:string)=>request<{item:PracticeReview}>(`/v1/practice/reviews/${encodeURIComponent(id)}/decision`,context,{method:"POST",body:JSON.stringify({status,reason})}),
  automationRules:(context:ApiContext)=>request<{items:AutomationRule[]}>("/v1/practice/automation-rules",context),
  createAutomationRule:(context:ApiContext,body:Record<string,unknown>)=>request<{item:AutomationRule}>("/v1/practice/automation-rules",context,{method:"POST",body:JSON.stringify(body)}),
  updateAutomationRule:(context:ApiContext,id:string,body:Record<string,unknown>)=>request<{item:AutomationRule}>(`/v1/practice/automation-rules/${encodeURIComponent(id)}`,context,{method:"PATCH",body:JSON.stringify(body)}),
  recurrenceOperations:(context:ApiContext)=>request<{items:RecurrenceExecution[]}>("/v1/practice/recurrence-operations",context),
  dryRunRecurrence:(context:ApiContext,from:string,to:string)=>request<{item:Record<string,unknown>}>("/v1/practice/recurrence-operations/dry-run",context,{method:"POST",body:JSON.stringify({from,to})}),
  replayRecurrence:(context:ApiContext,from:string,to:string)=>request<{item:Record<string,unknown>}>("/v1/practice/recurrence-operations/replay",context,{method:"POST",body:JSON.stringify({from,to})}),
  overridePracticeDeadline: (context: ApiContext, id: string, dueDate: string, reason: string) =>
    request<{ item: PracticeWorkItem }>(`/v1/practice/work/${encodeURIComponent(id)}/deadline-override`, context, { method: "POST", body: JSON.stringify({ dueDate, reason }) }),
  recalculatePracticeDeadline: (context: ApiContext, id: string) =>
    request<{ item: PracticeWorkItem }>(`/v1/practice/work/${encodeURIComponent(id)}/deadline-recalculate`, context, { method: "POST", body: "{}" }),
  practiceClientSummary: async (context: ApiContext, clientId: string) =>
    practiceClientSummaryItem(await request<{ item: PracticeClientSummary }>(`/v1/practice/clients/${encodeURIComponent(clientId)}/summary`, context)),
  resourceProfiles: (context: ApiContext) => request<{items:ResourceProfile[]}>("/v1/practice/resources",context),
  updateResourceProfile: (context: ApiContext, id: string, body: { jobTitle?: string | null; status?: string; standardCapacityMinutesWeek?: number }) => request<{item:ResourceProfile}>(`/v1/practice/resources/${encodeURIComponent(id)}`,context,{method:"PATCH",body:JSON.stringify(body)}),
  capacity: (context: ApiContext, range:{from:string;to:string}) => request<{items:CapacityRow[]}>(`/v1/practice/capacity?${new URLSearchParams(range)}`,context),
  workAllocations: (context: ApiContext, range:{from:string;to:string}) => request<{items:WorkAllocation[]}>(`/v1/practice/work-allocations?${new URLSearchParams(range)}`,context),
  reassignWork: (context: ApiContext, workId:string, body:{resourceId:string}) => request<{item:WorkAllocation}>(`/v1/practice/work/${encodeURIComponent(workId)}/resource-assignment`,context,{method:"POST",body:JSON.stringify({assignedMemberId:body.resourceId,assignmentState:"confirmed"})}),
  timeEntries: (context: ApiContext, range:{from:string;to:string}) => request<{items:TimeEntry[]}>(`/v1/practice/time-entries?${new URLSearchParams(range)}`,context),
  createTimeEntry: (context: ApiContext, body:{resourceId:string;workItemId:string;clientId:string;clientServiceId:string;date:string;durationHours:number;description?:string;billable:boolean}) => request<{item:TimeEntry}>("/v1/practice/time-entries",context,{method:"POST",body:JSON.stringify({tenantMemberId:body.resourceId,workItemId:body.workItemId,clientId:body.clientId,clientServiceId:body.clientServiceId,entryDate:body.date,durationMinutes:Math.round(body.durationHours*60),narrative:body.description,classification:body.billable?"billable":"non_billable"})}),
  portfolioEconomics: (context: ApiContext) => request<{items:PortfolioEconomicsRow[]}>("/v1/practice/portfolio-economics",context),
  practiceEconomicsOverview: async (context: ApiContext) => (await request<{item:PracticeEconomicsOverview}>("/v1/practice/economics/overview",context)).item,
  crmProspects: (context: ApiContext) => request<{ items: CrmProspect[] }>("/v1/crm/prospects", context),
  createCrmProspect: (context: ApiContext, body: Record<string, unknown>) => request<{ item: CrmProspect }>("/v1/crm/prospects", context, { method: "POST", body: JSON.stringify(body) }),
  crmProspect: (context: ApiContext, id: string) => request<{ item: CrmProspect }>(`/v1/crm/prospects/${encodeURIComponent(id)}`, context),
  updateCrmProspect: (context: ApiContext, id: string, body: Record<string, unknown>) => request<{ item: CrmProspect }>(`/v1/crm/prospects/${encodeURIComponent(id)}`, context, { method: "PATCH", body: JSON.stringify(body) }),
  platformTeams: (context: ApiContext) => request<{ items: PlatformTeam[] }>("/v1/platform/teams", context),
  createPlatformTeam: (context: ApiContext, name: string) => request<{ item: PlatformTeam }>("/v1/platform/teams", context, { method: "POST", body: JSON.stringify({ name }) }),
  crmOpportunities: (context: ApiContext) => request<{ items: CrmOpportunity[]; capabilities?: OpportunityCapabilities }>("/v1/crm/opportunities", context),
  createCrmOpportunity: (context: ApiContext, body: Record<string, unknown>) => request<{ item: CrmOpportunity }>("/v1/crm/opportunities", context, { method: "POST", body: JSON.stringify(body) }),
  crmOpportunity: (context: ApiContext, id: string) => request<{ item: CrmOpportunity }>(`/v1/crm/opportunities/${encodeURIComponent(id)}`, context),
  updateCrmOpportunity: (context: ApiContext, id: string, body: Record<string, unknown>) => request<{ item: CrmOpportunity }>(`/v1/crm/opportunities/${encodeURIComponent(id)}`, context, { method: "PATCH", body: JSON.stringify(body) }),
  updateOpportunityStage: (context: ApiContext, id: string, stageKey: string, outcomeReason?: string) => request<{ item: CrmOpportunity }>(`/v1/crm/opportunities/${encodeURIComponent(id)}/stage`, context, { method: "POST", body: JSON.stringify({ stageKey, outcomeReason }) }),
  linkQuoteBenchProposal: (context: ApiContext, id: string, proposalId: string, proposalVersion = "1") => request<{ item: Record<string, unknown> }>(`/v1/crm/opportunities/${encodeURIComponent(id)}/proposals`, context, { method: "POST", body: JSON.stringify({ proposalId, proposalVersion }) }),
  onboardingCases: (context: ApiContext) => request<{ items: OnboardingCase[] }>("/v1/onboarding", context),
  onboardingCase: (context: ApiContext, id: string) => request<{ item: OnboardingCase }>(`/v1/onboarding/${encodeURIComponent(id)}`, context),
  updateOnboardingStatus: (context: ApiContext, id: string, status: OnboardingCase["status"]) => request<{ item: OnboardingCase }>(`/v1/onboarding/${encodeURIComponent(id)}/status`, context, { method: "POST", body: JSON.stringify({ status }) }),
  clientRequests: (context: ApiContext) => request<{ items: ClientRequestItem[] }>("/v1/client-requests", context),
  createClientRequest: (context: ApiContext, body: CreateClientRequestInput) => request<{ item: ClientRequestItem }>("/v1/client-requests", context, { method: "POST", body: JSON.stringify(body) }),
  clientRequest: (context: ApiContext, id: string) => request<{ item: ClientRequestItem & { recipients?: Record<string, unknown>[]; responses?: Record<string, unknown>[]; documents?: Record<string, unknown>[] } }>(`/v1/client-requests/${encodeURIComponent(id)}`, context),
  completeClientRequest: (context: ApiContext, id: string) => request<{ item: ClientRequestItem }>(`/v1/client-requests/${encodeURIComponent(id)}/complete`, context, { method: "POST", body: "{}" }),
  portalThreads: (context: ApiContext) => request<{ items: PortalThreadItem[] }>("/v1/portal-threads", context),
  clientPortalAccess: () => request<{ items: ClientPortalAccess[] }>("/v1/me/client-portal/access"),
  clientPortalRequests: (context: ApiContext) => request<{ items: ClientRequestItem[] }>("/v1/portal/requests", context),
  clientPortalRequest: (context: ApiContext, id: string) => request<{ item: ClientRequestItem & { responses?: Record<string, unknown>[]; documents?: PortalDocumentItem[] } }>(`/v1/portal/requests/${encodeURIComponent(id)}`, context),
  clientPortalDocuments: (context: ApiContext) => request<{ items: PortalDocumentItem[] }>("/v1/portal/documents", context),
  respondToClientRequest: (context: ApiContext, id: string, body: { responseType: "text" | "confirmation" | "structured"; text?: string; value?: boolean; structured?: Record<string, unknown>; idempotencyKey: string }) => request<{ item: Record<string, unknown> }>(`/v1/portal/requests/${encodeURIComponent(id)}/responses`, context, { method: "POST", body: JSON.stringify(body) }),
  uploadClientRequestDocument: (context: ApiContext, id: string, file: File, idempotencyKey: string) => { const body = new FormData(); body.append("file", file); body.append("idempotencyKey", idempotencyKey); return request<{ item: Record<string, unknown> }>(`/v1/portal/requests/${encodeURIComponent(id)}/documents`, context, { method: "POST", body }); },
  clientPortalThreads: (context: ApiContext) => request<{ items: PortalThreadItem[] }>("/v1/portal/messages", context),
  clientPortalThread: (context: ApiContext, id: string) => request<{ item: PortalThreadItem; messages: PortalMessageItem[] }>(`/v1/portal/messages/${encodeURIComponent(id)}`, context),
  sendClientPortalMessage: (context: ApiContext, id: string, body: string, idempotencyKey: string) => request<{ item: PortalMessageItem }>(`/v1/portal/messages/${encodeURIComponent(id)}`, context, { method: "POST", body: JSON.stringify({ body, idempotencyKey }) }),
  clientPortalDocumentBlob: (context: ApiContext, id: string) => requestBlob(`/v1/portal/documents/${encodeURIComponent(id)}/content`, context),
};
