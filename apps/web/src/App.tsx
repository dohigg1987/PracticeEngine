import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Button as FluentButton,
  Card,
  Checkbox,
  createTableColumn,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Link as FluentLink,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  NavDrawer,
  NavDrawerBody,
  NavItem,
  ProgressBar,
  SearchBox,
  Select,
  Skeleton as FluentSkeleton,
  SkeletonItem,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Textarea,
  Toolbar,
  Tooltip,
  Tree,
  TreeItem,
  TreeItemLayout,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import {
  BuildingRegular,
  DismissRegular,
  DocumentRegular,
  ErrorCircleRegular,
  NavigationRegular,
  OpenRegular,
  PeopleTeamRegular,
  SearchRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import {
  api,
  ApiContext,
  ApiError,
  AccountsVersion,
  AuditEvent,
  CanonicalAccount,
  Dashboard,
  Disclosure,
  Engagement,
  FilingAttempt,
  Journal,
  JournalStatus,
  JournalLine,
  onUnauthorized,
  Organisation,
  OrganisationPermanentFile,
  Reconciliation,
  ReportLine,
  ReviewPoint,
  ReviewPointStatus,
  TenantMembership,
  TenantOnboarding,
  TeamInvitation,
  TeamMember,
  TrialBalanceLine,
  WorkflowTask,
  WorkflowTaskStatus,
  WorkingPaper,
} from "./api";
import { statutoryLabel } from "./format";
import {
  actorDisplayLabel,
  formatDate,
  formatDateTime,
  formatPeriodYear,
  mappingSummaryLabel,
} from "./displayFormat";
import { statusBadgeProps } from "./statusBadge";
import { RoutePanelBoundary } from "./RoutePanelBoundary";
import {
  authClient,
  authConfigured,
  authFailureDiagnostic,
  authFailureMessage,
  AuthUser,
  demoMode,
} from "./auth";
import ClientPermanentFile from "./ClientPermanentFile";
import { ConfirmAction } from "./ConfirmAction";
import {
  blockingItemsLabel,
  blockingItemsMessage,
  engagementResponseIsCurrent,
  isOutstandingReviewPoint,
  reportBalanceLabel,
  submissionStageState,
} from "./workflowState";
import {
  adjustmentsStageState,
  isMappedTrialBalanceLine,
  isOpenWorkflowTask,
  isOutstandingReconciliation,
  mappingPopulation,
  reviewApprovalStageState,
  taskProgress,
} from "./workflowCorrectness";
import { invitationStatus } from "./invitationState";
import {
  permittedSectorProfiles,
  permittedFrameworks,
  requiredSectorProfile,
  reportingRegimeError,
} from "./reporting-regime";

type View =
  | "overview"
  | "data"
  | "mapping"
  | "journals"
  | "reconciliations"
  | "tasks"
  | "review"
  | "working-papers"
  | "disclosures"
  | "accounts"
  | "versions"
  | "filing"
  | "portal"
  | "history";
type ProductionNavStage =
  | "source"
  | "adjustments"
  | "builder"
  | "review"
  | "submission";

const productionNavStageForView: Partial<Record<View, ProductionNavStage>> = {
  data: "source",
  mapping: "source",
  journals: "adjustments",
  reconciliations: "adjustments",
  "working-papers": "builder",
  disclosures: "builder",
  accounts: "builder",
  tasks: "review",
  review: "review",
  versions: "review",
  history: "review",
  filing: "submission",
  portal: "submission",
};
export type WorkspaceSearchEntry = {
  id: string;
  label: string;
  description: string;
  keywords: string;
  category?: "Workspace" | "Clients" | "Engagements" | "Engagement sections";
};
export function matchWorkspaceSearch<T extends WorkspaceSearchEntry>(
  entries: T[],
  query: string,
): T[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const normalizedQuery = terms.join(" ");
  return entries
    .filter((entry) => {
      const haystack =
        `${entry.label} ${entry.description} ${entry.keywords}`.toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .map((entry, index) => {
      const label = entry.label.toLocaleLowerCase();
      const score =
        label === normalizedQuery
          ? 0
          : label.startsWith(normalizedQuery)
            ? 1
            : terms.every((term) =>
                  label.split(/\s+/).some((word) => word.startsWith(term)),
                )
              ? 2
              : 3;
      return { entry, index, score };
    })
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ entry }) => entry)
    .slice(0, 8);
}

function WorkspaceSearchIcon({
  category,
}: Pick<WorkspaceSearchEntry, "category">) {
  if (category === "Clients") return <BuildingRegular aria-hidden="true" />;
  if (category === "Engagements") return <DocumentRegular aria-hidden="true" />;
  if (category === "Engagement sections")
    return <OpenRegular aria-hidden="true" />;
  return <PeopleTeamRegular aria-hidden="true" />;
}
const EngagementProduction = lazy(() => import("./EngagementProduction"));
const CommercialWorkspace = lazy(() => import("./CommercialWorkspace"));
type CsvRow = {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
};
const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const fullDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const wholeNumber = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});
function statementFigure(value: string | number) {
  const amount = Number(value);
  const formatted = wholeNumber.format(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
}
const amount = (line: TrialBalanceLine) =>
  Number(line.debit || 0) - Number(line.credit || 0);
const money = (value: number) =>
  value < 0 ? `(${gbp.format(Math.abs(value))})` : gbp.format(value);
const title = statutoryLabel;

function parseCsv(text: string): CsvRow[] {
  const data: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) data.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) data.push(row);
  if (data.length < 2) return [];
  const headers = data[0].map((v) => v.toLowerCase().replace(/[^a-z]/g, ""));
  const find = (...names: string[]) =>
    headers.findIndex((v) => names.includes(v));
  const indexes = [
    find("accountcode", "code", "nominalcode"),
    find("accountname", "name", "description", "nominalname"),
    find("debit", "debits"),
    find("credit", "credits"),
  ];
  if (indexes.some((i) => i < 0)) return [];
  return data.slice(1).map((v) => ({
    accountCode: v[indexes[0]] || "",
    accountName: v[indexes[1]] || "",
    debit: v[indexes[2]] || "",
    credit: v[indexes[3]] || "",
  }));
}

function Empty({
  heading,
  body,
  children,
}: React.PropsWithChildren<{ heading: string; body: string }>) {
  return (
    <div className="empty">
      <span>＋</span>
      <h3>{heading}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}
function Skeleton() {
  return (
    <FluentSkeleton
      className="skeleton"
      role="status"
      aria-live="polite"
      aria-label="Loading workspace"
    >
      <span className="sr-only">Loading workspace…</span>
      {Array.from({ length: 7 }, (_, i) => (
        <SkeletonItem aria-hidden="true" key={i} size={i === 0 ? 24 : 12} />
      ))}
    </FluentSkeleton>
  );
}

export function inviteTokenFromHash(hash: string): string {
  if (!hash.startsWith("#")) return "";
  return new URLSearchParams(hash.slice(1)).get("token")?.trim() || "";
}

export function App() {
  const [checkingSession, setCheckingSession] = useState(authConfigured);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");

  const refreshSession = useCallback(async () => {
    if (demoMode) {
      setUser({
        id: "demo-user",
        email: "demo@accounts.local",
        name: "Demo Partner",
      });
      setCheckingSession(false);
      return;
    }
    if (!authClient) {
      setCheckingSession(false);
      return;
    }
    setCheckingSession(true);
    try {
      const result = await authClient.getSession();
      setUser(
        result.data?.user
          ? {
              id: result.data.user.id,
              email: result.data.user.email,
              name: result.data.user.name,
              image: result.data.user.image,
            }
          : null,
      );
    } catch {
      setUser(null);
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);
  useEffect(() => {
    onUnauthorized(() => {
      setSessionMessage("Your session expired. Sign in again to continue.");
      authClient?.signOut().finally(() => setUser(null));
    });
    return () => onUnauthorized(null);
  }, []);

  async function signOut() {
    if (demoMode) {
      setSessionMessage(
        "Demo mode stays signed in. Restart without VITE_DEMO_MODE to use Neon Auth.",
      );
      return;
    }
    await authClient?.signOut();
    setUser(null);
    setSessionMessage("You have been signed out.");
  }

  if (!authConfigured) return <AuthConfiguration />;
  if (checkingSession) return <AuthLoading />;
  if (!user)
    return (
      <AuthScreen message={sessionMessage} onAuthenticated={refreshSession} />
    );
  return <AccountsWorkspace user={user} onSignOut={signOut} />;
}

function AccountsWorkspace({
  user,
  onSignOut,
}: {
  user: AuthUser;
  onSignOut: () => Promise<void>;
}) {
  const localTestTenant = import.meta.env.DEV
    ? import.meta.env.VITE_TENANT_ID?.trim() || ""
    : "";
  const [context, setContext] = useState<ApiContext>(() => {
    localStorage.removeItem("accounts.actorId");
    return {
      tenantId: localStorage.getItem("accounts.tenantId") || localTestTenant,
    };
  });
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [onboarding, setOnboarding] = useState<TenantOnboarding | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipError, setMembershipError] = useState("");
  const [workspacePage, setWorkspacePage] = useState<
    "engagement" | "clients" | "team" | "integrations" | "inbox" | "settings"
  >("engagement");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState(() => {
    const token = inviteTokenFromHash(window.location.hash);
    if (token)
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    return token;
  });
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [organisationLoading, setOrganisationLoading] = useState(false);
  const [organisationError, setOrganisationError] = useState("");
  const [showEngagementSetup, setShowEngagementSetup] = useState(false);
  const [engagementOrganisationId, setEngagementOrganisationId] = useState("");
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [lines, setLines] = useState<TrialBalanceLine[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [report, setReport] = useState<ReportLine[]>([]);
  const [reportBalanced, setReportBalanced] = useState<boolean | null>(null);
  const [accountsVersions, setAccountsVersions] = useState<AccountsVersion[]>(
    [],
  );
  const [view, setView] = useState<View>(demoMode ? "accounts" : "overview");
  const [openProductionNavStage, setOpenProductionNavStage] =
    useState<ProductionNavStage | null>(
      productionNavStageForView[demoMode ? "accounts" : "overview"] ?? null,
    );
  const [practiceNavOpen, setPracticeNavOpen] = useState(true);
  const [accountsProductionNavOpen, setAccountsProductionNavOpen] =
    useState(true);
  const [administrationNavOpen, setAdministrationNavOpen] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [journals, setJournals] = useState<Journal[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [reviewPoints, setReviewPoints] = useState<ReviewPoint[]>([]);
  const [filingAttempts, setFilingAttempts] = useState<FilingAttempt[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState("");
  const [canonicalAccounts, setCanonicalAccounts] = useState<
    CanonicalAccount[]
  >([]);
  const [taxonomyError, setTaxonomyError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [reportError, setReportError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState<{ good: boolean; text: string } | null>(
    null,
  );
  const [importFile, setImportFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const operationsSelectionRef = useRef(selectedId);
  operationsSelectionRef.current = selectedId;
  const detailSelectionRef = useRef(selectedId);
  detailSelectionRef.current = selectedId;
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);
  useEffect(() => {
    const stage = productionNavStageForView[view];
    if (stage) setOpenProductionNavStage(stage);
  }, [view]);
  useEffect(() => {
    if (workspacePage === "engagement" || workspacePage === "integrations")
      setAccountsProductionNavOpen(true);
    if (workspacePage === "integrations") setOpenProductionNavStage("source");
    if (workspacePage === "clients" || workspacePage === "team")
      setPracticeNavOpen(true);
    if (workspacePage === "inbox" || workspacePage === "settings")
      setAdministrationNavOpen(true);
  }, [workspacePage]);
  const hasDiscoveredMembership = memberships.some(
    (item) => item.tenant_id === context.tenantId,
  );
  const usingLocalFallback = Boolean(
    membershipError && localTestTenant && context.tenantId === localTestTenant,
  );
  const configured = Boolean(
    context.tenantId && (hasDiscoveredMembership || usingLocalFallback),
  );
  const engagement = engagements.find((item) => item.id === selectedId);
  const selectedMembership = memberships.find(
    (item) => item.tenant_id === context.tenantId,
  );
  const loadMemberships = useCallback(async () => {
    setMembershipLoading(true);
    setMembershipError("");
    try {
      const data = await api.tenantMemberships();
      setMemberships(data.items);
      setOnboarding(data.onboarding ?? null);
      const stored = localStorage.getItem("accounts.tenantId") || "";
      const preferred =
        data.items.find((item) => item.tenant_id === stored) ??
        (data.items.length === 1 ? data.items[0] : undefined);
      if (preferred) {
        localStorage.setItem("accounts.tenantId", preferred.tenant_id);
        setContext({ tenantId: preferred.tenant_id });
      } else {
        localStorage.removeItem("accounts.tenantId");
        setContext({ tenantId: "" });
      }
    } catch (e) {
      setMemberships([]);
      setOnboarding(null);
      setMembershipError(
        e instanceof Error ? e.message : "Could not discover your workspaces.",
      );
      if (localTestTenant) setContext({ tenantId: localTestTenant });
      else setContext({ tenantId: "" });
    } finally {
      setMembershipLoading(false);
    }
  }, [localTestTenant]);
  const loadEngagements = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError("");
    setTaxonomyError("");
    api
      .canonicalAccounts(context)
      .then((data) => setCanonicalAccounts(data.items))
      .catch((e) => {
        setCanonicalAccounts([]);
        setTaxonomyError(
          e instanceof Error ? e.message : "Could not load canonical accounts.",
        );
      });
    try {
      const data = await api.engagements(context);
      setEngagements(data.items);
      setSelectedId((current) =>
        data.items.some((item) => item.id === current)
          ? current
          : data.items[0]?.id || "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load engagements.");
    } finally {
      setLoading(false);
    }
  }, [configured, context]);
  const loadOrganisations = useCallback(async () => {
    if (!configured) return;
    setOrganisationLoading(true);
    setOrganisationError("");
    try {
      const data = await api.organisations(context);
      setOrganisations(data.items);
    } catch (e) {
      setOrganisationError(
        e instanceof Error ? e.message : "Could not load clients.",
      );
    } finally {
      setOrganisationLoading(false);
    }
  }, [configured, context]);
  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setLines([]);
      setEvents([]);
      setReport([]);
      setReportBalanced(null);
      setAccountsVersions([]);
      setReportError("");
      setHistoryError("");
      setDetailLoading(false);
      return;
    }
    const requestEngagementId = selectedId;
    setDetailLoading(true);
    setDetailError("");
    setReportError("");
    setHistoryError("");
    const [tb, history, reportData, versionData] = await Promise.allSettled([
      api.trialBalance(context, selectedId),
      api.history(context, selectedId),
      api.report(context, selectedId),
      api.accountsVersions(context, selectedId),
    ]);
    if (detailSelectionRef.current !== requestEngagementId) return;
    if (tb.status === "fulfilled") setLines(tb.value.items);
    else {
      setLines([]);
      setDetailError(tb.reason?.message || "Could not load the trial balance.");
    }
    if (history.status === "fulfilled") setEvents(history.value.items);
    else {
      setEvents([]);
      setHistoryError(
        history.reason?.message || "Could not load engagement history.",
      );
    }
    if (reportData.status === "fulfilled") {
      setReport(reportData.value.lines);
      setReportBalanced(reportData.value.balanced);
    }
    else {
      setReport([]);
      setReportBalanced(null);
      if (
        !(
          reportData.reason instanceof ApiError &&
          reportData.reason.status === 404
        )
      )
        setReportError(
          reportData.reason?.message || "Could not load the draft accounts.",
        );
    }
    if (versionData.status === "fulfilled")
      setAccountsVersions(versionData.value.items);
    else setAccountsVersions([]);
    setDetailLoading(false);
  }, [context, selectedId]);
  const loadOperations = useCallback(async () => {
    if (!selectedId) {
      setDashboard({});
      setJournals([]);
      setReconciliations([]);
      setTasks([]);
      setReviewPoints([]);
      setFilingAttempts([]);
      setOperationsLoading(false);
      return;
    }
    const requestEngagementId = selectedId;
    setOperationsLoading(true);
    setOperationsError("");
    const results = await Promise.allSettled([
      api.dashboard(context, selectedId),
      api.journals(context, selectedId),
      api.reconciliations(context, selectedId),
      api.workflowTasks(context, selectedId),
      api.reviewPoints(context, selectedId),
      api.filingAttempts(context, selectedId),
    ]);
    if (
      !engagementResponseIsCurrent(
        requestEngagementId,
        operationsSelectionRef.current,
      )
    )
      return;
    const [
      dash,
      journalData,
      reconciliationData,
      taskData,
      reviewData,
      filingData,
    ] = results;
    if (dash.status === "fulfilled") setDashboard(dash.value);
    else setDashboard({});
    if (journalData.status === "fulfilled")
      setJournals(journalData.value.items);
    else setJournals([]);
    if (reconciliationData.status === "fulfilled")
      setReconciliations(reconciliationData.value.items);
    else setReconciliations([]);
    if (taskData.status === "fulfilled") setTasks(taskData.value.items);
    else setTasks([]);
    if (reviewData.status === "fulfilled")
      setReviewPoints(reviewData.value.items);
    else setReviewPoints([]);
    if (filingData.status === "fulfilled")
      setFilingAttempts(filingData.value.items);
    else setFilingAttempts([]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected")
      setOperationsError(
        failure.reason?.message ||
          "Some engagement operations could not be loaded.",
      );
    setOperationsLoading(false);
  }, [context, selectedId]);
  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);
  useEffect(() => {
    loadEngagements();
  }, [loadEngagements]);
  useEffect(() => {
    loadOrganisations();
  }, [loadOrganisations]);
  useEffect(() => {
    setDashboard({});
    setJournals([]);
    setReconciliations([]);
    setTasks([]);
    setReviewPoints([]);
    setFilingAttempts([]);
    setOperationsError("");
    setOperationsLoading(false);
  }, [selectedId]);
  useEffect(() => {
    loadDetail();
  }, [loadDetail]);
  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  const { mapped, unmapped } = mappingPopulation(lines),
    debit = lines.reduce((n, line) => n + Number(line.debit || 0), 0),
    credit = lines.reduce((n, line) => n + Number(line.credit || 0), 0);
  const options = useMemo(
    () =>
      canonicalAccounts.map((account) => [
        account.id,
        `${account.canonical_code} · ${account.name}`,
      ]),
    [canonicalAccounts],
  );

  function selectWorkspace(tenantId: string) {
    if (!memberships.some((item) => item.tenant_id === tenantId)) return;
    localStorage.setItem("accounts.tenantId", tenantId);
    setContext({ tenantId });
    setSelectedId("");
    setEngagements([]);
  }
  function clearWorkspace() {
    localStorage.removeItem("accounts.tenantId");
    setContext({ tenantId: "" });
    setSelectedId("");
    setEngagements([]);
  }
  function openImport() {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    fileRef.current?.click();
  }
  function closeImport() {
    setImportFile(null);
    setCsvRows([]);
    setImportError("");
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }
  async function chooseFile(file?: File) {
    setImportFile(file || null);
    setCsvRows([]);
    setImportError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Choose a CSV file.");
      return;
    }
    if (file.size > 10485760) {
      setImportError("The file must be smaller than 10 MB.");
      return;
    }
    const rows = parseCsv(await file.text());
    if (!rows.length)
      setImportError(
        "Expected account code, account name, debit and credit columns.",
      );
    else setCsvRows(rows);
  }
  async function commitImport() {
    if (!importFile) return;
    setImporting(true);
    setImportError("");
    try {
      await api.importTrialBalance(context, selectedId, importFile);
      setNotice({ good: true, text: `${importFile.name} was imported.` });
      closeImport();
      await loadDetail();
    } catch (e) {
      setImportError(
        e instanceof ApiError && e.status === 404
          ? "Import is ready, but the API import route has not been deployed yet."
          : e instanceof Error
            ? e.message
            : "Import failed.",
      );
    } finally {
      setImporting(false);
    }
  }
  async function saveMapping(
    line: TrialBalanceLine,
    canonicalAccountId: string,
  ) {
    if (!canonicalAccountId) return;
    setSaving(line.account_code);
    setNotice(null);
    try {
      await api.updateMapping(
        context,
        selectedId,
        line.source_account_id,
        canonicalAccountId,
      );
      setNotice({
        good: true,
        text: `${line.account_code} · ${line.account_name} was mapped.`,
      });
      await loadDetail();
    } catch (e) {
      setNotice({
        good: false,
        text: e instanceof Error ? e.message : "Mapping failed.",
      });
    } finally {
      setSaving("");
    }
  }

  const views: { id: View; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "data", label: "Source data" },
    { id: "mapping", label: "Mapping", count: unmapped || undefined },
    { id: "journals", label: "Journals", count: journals.length || undefined },
    {
      id: "reconciliations",
      label: "Reconciliations",
      count:
        reconciliations.filter(isOutstandingReconciliation).length ||
        undefined,
    },
    {
      id: "tasks",
      label: "Tasks",
      count:
        tasks.filter(isOpenWorkflowTask).length || undefined,
    },
    {
      id: "review",
      label: "Review points",
      count:
        reviewPoints.filter(isOutstandingReviewPoint).length || undefined,
    },
    { id: "working-papers", label: "Working papers" },
    { id: "disclosures", label: "Disclosures" },
    { id: "accounts", label: "Draft accounts" },
    { id: "versions", label: "Accounts versions" },
    { id: "filing", label: "Filing evidence" },
    { id: "portal", label: "Client portal" },
    { id: "history", label: "History", count: events.length || undefined },
  ];
  const productionNavStages: {
    id: ProductionNavStage;
    label: string;
    viewIds: View[];
  }[] = [
    { id: "source", label: "Source data", viewIds: ["data", "mapping"] },
    {
      id: "adjustments",
      label: "Adjustments",
      viewIds: ["journals", "reconciliations"],
    },
    {
      id: "builder",
      label: "Accounts builder",
      viewIds: ["working-papers", "disclosures", "accounts"],
    },
    {
      id: "review",
      label: "Review & approval",
      viewIds: ["tasks", "review", "versions", "history"],
    },
    {
      id: "submission",
      label: "Submission",
      viewIds: ["filing", "portal"],
    },
  ];
  const productionStages: {
    label: string;
    target: View;
    views: View[];
    state: "ready" | "attention" | "pending";
  }[] = [
    {
      label: "Source data",
      target: "data",
      views: ["data", "mapping"],
      state:
        lines.length && !unmapped
          ? "ready"
          : lines.length
            ? "attention"
            : "pending",
    },
    {
      label: "Adjustments",
      target: "journals",
      views: ["journals", "reconciliations"],
      state: adjustmentsStageState(journals, reconciliations),
    },
    {
      label: "Accounts builder",
      target: "accounts",
      views: ["working-papers", "disclosures", "accounts"],
      state:
        report.length && !reportError
          ? "ready"
          : reportError
            ? "attention"
            : "pending",
    },
    {
      label: "Review / approval",
      target: "versions",
      views: ["tasks", "review", "versions", "history"],
      state: reviewApprovalStageState(
        reviewPoints.some(isOutstandingReviewPoint),
        accountsVersions,
      ),
    },
    {
      label: "Submission",
      target: "filing",
      views: ["filing", "portal"],
      state: submissionStageState(filingAttempts),
    },
  ];
  const activeProductionStage =
    productionStages.find((stage) => stage.views.includes(view)) ??
    productionStages[0];
  const searchEntries: (WorkspaceSearchEntry & {
    open: () => void;
  })[] = [
    {
      id: "workspace-clients",
      label: "Clients",
      description: "Workspace",
      keywords: "organisations legal entities",
      category: "Workspace" as const,
      open: () => setWorkspacePage("clients"),
    },
    {
      id: "workspace-integrations",
      label: "Imports and integrations",
      description: "Workspace",
      keywords: "csv xlsx templates connectors sync",
      category: "Workspace" as const,
      open: () => setWorkspacePage("integrations"),
    },
    {
      id: "workspace-inbox",
      label: "Inbox",
      description: "Workspace",
      keywords: "notifications alerts delivery",
      category: "Workspace" as const,
      open: () => setWorkspacePage("inbox"),
    },
    ...(["OWNER", "ADMIN"].includes(selectedMembership?.role_code || "")
      ? [
          {
            id: "workspace-team",
            label: "Team",
            description: "Workspace",
            keywords: "members invitations roles",
            category: "Workspace" as const,
            open: () => setWorkspacePage("team" as const),
          },
        ]
      : []),
    ...(["OWNER", "ADMIN"].includes(selectedMembership?.role_code || "")
      ? [
          {
            id: "workspace-settings",
            label: "Workspace settings",
            description: "Administration",
            keywords: "tenant lifecycle export close suspend",
            category: "Workspace" as const,
            open: () => setWorkspacePage("settings" as const),
          },
        ]
      : []),
    ...organisations.map((organisation) => ({
      id: `client-${organisation.id}`,
      label: organisation.legal_name,
      description: `Client · ${organisation.legal_form}`,
      keywords: `${organisation.jurisdiction} organisation client`,
      category: "Clients" as const,
      open: () => setWorkspacePage("clients" as const),
    })),
    ...engagements.map((item) => ({
      id: `engagement-${item.id}`,
      label: `${item.legal_name} · ${formatPeriodYear(item.period_end)}`,
      description: `Engagement · ${title(item.framework)}`,
      keywords: `${item.period_start} ${item.period_end} ${item.sector_profile}`,
      category: "Engagements" as const,
      open: () => {
        setSelectedId(item.id);
        setWorkspacePage("engagement");
        setView("overview");
      },
    })),
    ...views.map((item) => ({
      id: `section-${item.id}`,
      label: item.label,
      description: "Engagement section",
      keywords: item.id,
      category: "Engagement sections" as const,
      open: () => {
        setWorkspacePage("engagement" as const);
        setView(item.id);
      },
    })),
  ];
  const searchResults = matchWorkspaceSearch(searchEntries, searchQuery);
  const quickSearchResults = searchEntries
    .filter((entry) =>
      [
        "workspace-clients",
        "workspace-team",
        `engagement-${selectedId}`,
        "section-overview",
        "section-data",
        "section-versions",
      ].includes(entry.id),
    )
    .slice(0, 7);
  const visibleSearchResults = searchQuery.trim()
    ? searchResults
    : quickSearchResults;
  function openSearchResult(index: number) {
    const result = visibleSearchResults[index];
    if (!result) return;
    result.open();
    setSearchQuery("");
    setSearchOpen(false);
    setActiveSearchIndex(0);
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <Tooltip content="Open practice navigation" relationship="description">
          <FluentButton
            className="nav-toggle"
            appearance="subtle"
            icon={<NavigationRegular />}
            aria-label="Open practice navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
          />
        </Tooltip>
        <a className="brand" href="/">
          <span>LD</span>
          <b>Ledgerly</b>
        </a>
        <div className="global-search">
          <SearchBox
            className="global-search-box"
            ref={searchRef}
            size="large"
            role="combobox"
            contentBefore={<SearchRegular aria-hidden="true" />}
            placeholder="Search clients, engagements and sections"
            aria-label="Search workspace"
            aria-expanded={searchOpen}
            aria-controls="workspace-search-results"
            aria-activedescendant={
              searchOpen && visibleSearchResults[activeSearchIndex]
                ? `workspace-search-${visibleSearchResults[activeSearchIndex].id}`
                : undefined
            }
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 100)}
            onChange={(_, data) => {
              setSearchQuery(data.value);
              setActiveSearchIndex(0);
              setSearchOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setSearchOpen(false);
                searchRef.current?.blur();
              } else if (
                event.key === "ArrowDown" &&
                visibleSearchResults.length
              ) {
                event.preventDefault();
                setActiveSearchIndex((current) =>
                  current >= visibleSearchResults.length - 1 ? 0 : current + 1,
                );
              } else if (
                event.key === "ArrowUp" &&
                visibleSearchResults.length
              ) {
                event.preventDefault();
                setActiveSearchIndex((current) =>
                  current <= 0 ? visibleSearchResults.length - 1 : current - 1,
                );
              } else if (event.key === "Enter" && visibleSearchResults.length) {
                event.preventDefault();
                openSearchResult(activeSearchIndex);
              }
            }}
          />
          {searchOpen && (
            <div
              id="workspace-search-results"
              className="global-search-results"
              role="listbox"
              aria-label="Workspace search results"
            >
              {visibleSearchResults.length ? (
                visibleSearchResults.map((result, index) => (
                  <React.Fragment key={result.id}>
                    {(index === 0 ||
                      visibleSearchResults[index - 1]?.category !==
                        result.category) && (
                      <div className="global-search-group" role="presentation">
                        {result.category || "Workspace"}
                      </div>
                    )}
                    <FluentButton
                      id={`workspace-search-${result.id}`}
                      type="button"
                      appearance="subtle"
                      className="global-search-result"
                      role="option"
                      aria-selected={index === activeSearchIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveSearchIndex(index)}
                      onClick={() => openSearchResult(index)}
                    >
                      <span className="global-search-result-layout">
                        <span className="global-search-icon">
                          <WorkspaceSearchIcon category={result.category} />
                        </span>
                        <span className="global-search-copy">
                          <b>{result.label}</b>
                          <small>{result.description}</small>
                        </span>
                        <kbd className="global-search-enter" aria-hidden="true">
                          Enter
                        </kbd>
                      </span>
                    </FluentButton>
                  </React.Fragment>
                ))
              ) : (
                <p role="status">
                  No matching clients, engagements or sections.
                </p>
              )}
            </div>
          )}
        </div>
        <Toolbar className="top-actions" aria-label="Workspace actions">
          {error && (
            <Badge appearance="tint" color="danger">
              Service issue
            </Badge>
          )}
          {demoMode ? (
            <Badge appearance="tint" color="informative">
              Showcase mode · seeded data
            </Badge>
          ) : (
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <FluentButton
                  appearance="subtle"
                  className="account-menu-button"
                  type="button"
                  aria-label={`Account menu for ${user.email}`}
                >
                  <span className="account-menu-copy">
                    <span>Account</span>
                    <small>{user.email}</small>
                  </span>
                  <span className="avatar" aria-hidden="true">
                    {initials(user)}
                  </span>
                </FluentButton>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem onClick={onSignOut}>Sign out</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          )}
        </Toolbar>
      </header>
      <div className="workspace">
        <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
          <NavDrawer
            className="fluent-nav"
            type="inline"
            open
            selectedValue={
              workspacePage === "engagement" ? view : workspacePage
            }
          >
            <NavDrawerBody>
              <p className="eyebrow">
                {selectedMembership?.name || "Accounts workspace"}
              </p>
              <div className="current-engagement-context">
                <label htmlFor="engagement">Current engagement</label>
                <Select
                  id="engagement"
                  aria-label="Engagement"
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setWorkspacePage("engagement");
                  }}
                  disabled={loading || !engagements.length}
                >
                  <option value="">
                    {loading ? "Loading…" : "Select engagement"}
                  </option>
                  {engagements.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legal_name} —{" "}
                      {formatPeriodYear(item.period_end)}
                    </option>
                  ))}
                </Select>
              </div>
              <Accordion
                multiple
                collapsible
                className="workspace-nav-accordion"
                openItems={[
                  ...(practiceNavOpen ? ["practice"] : []),
                  ...(accountsProductionNavOpen ? ["production"] : []),
                  ...(administrationNavOpen ? ["administration"] : []),
                ]}
                onToggle={(_, data) => {
                  const openItems = new Set(data.openItems);
                  setPracticeNavOpen(openItems.has("practice"));
                  setAccountsProductionNavOpen(openItems.has("production"));
                  setAdministrationNavOpen(openItems.has("administration"));
                }}
              >
              <AccordionItem
                value="practice"
                className="workspace-nav-bookend"
              >
                <AccordionHeader
                  className="workspace-nav-header"
                  button={{ className: "workspace-nav-toggle" }}
                  expandIconPosition="end"
                >
                  Practice
                </AccordionHeader>
                <AccordionPanel className="workspace-nav-panel">
                  <div className="workspace-nav-items">
                    <NavItem
                      className="workspace-nav-item"
                      value="clients"
                      icon={<BuildingRegular />}
                      onClick={() => {
                        setWorkspacePage("clients");
                        setMobileNavOpen(false);
                      }}
                    >
                      Clients
                    </NavItem>
                    {["OWNER", "ADMIN"].includes(
                      selectedMembership?.role_code || "",
                    ) && (
                      <NavItem
                        className="workspace-nav-item"
                        value="team"
                        icon={<PeopleTeamRegular />}
                        onClick={() => {
                          setWorkspacePage("team");
                          setMobileNavOpen(false);
                        }}
                      >
                        Team
                      </NavItem>
                    )}
                  </div>
                </AccordionPanel>
              </AccordionItem>
              <AccordionItem
                value="production"
                className="production-navigation"
              >
                <AccordionHeader
                  className="workspace-nav-header"
                  button={{ className: "workspace-nav-toggle" }}
                  expandIconPosition="end"
                >
                  Accounts production
                </AccordionHeader>
                <AccordionPanel className="workspace-nav-panel">
                  <div
                    className="accounts-production-nav-items"
                  >
                    <nav aria-label="Engagement sections">
                      <NavItem
                        className="workspace-nav-item"
                        value="overview"
                        icon={<DocumentRegular />}
                        onClick={() => {
                          setView("overview");
                          setWorkspacePage("engagement");
                          setMobileNavOpen(false);
                        }}
                      >
                        Overview
                      </NavItem>
                      <Accordion
                        collapsible
                        openItems={openProductionNavStage ? [openProductionNavStage] : []}
                        onToggle={(_, data) =>
                          setOpenProductionNavStage(
                            (data.openItems[0] as ProductionNavStage | undefined) ?? null,
                          )
                        }
                      >
                      {productionNavStages.map((stage) => {
                        const stageViews = views.filter((item) =>
                          stage.viewIds.includes(item.id),
                        );
                        return (
                          <AccordionItem
                            value={stage.id}
                            className="production-nav-stage"
                            key={stage.id}
                          >
                            <AccordionHeader
                              className="production-nav-stage-header"
                              button={{ className: "production-nav-stage-toggle" }}
                              expandIconPosition="end"
                            >
                              {stage.label}
                            </AccordionHeader>
                            <AccordionPanel className="production-nav-stage-panel">
                              <div className="production-nav-stage-items">
                                {stage.id === "source" ? (
                                  <NavItem
                                    className="workspace-nav-item"
                                    value="integrations"
                                    icon={<DocumentRegular />}
                                    onClick={() => {
                                      setWorkspacePage("integrations");
                                      setMobileNavOpen(false);
                                    }}
                                  >
                                    Imports and integrations
                                  </NavItem>
                                ) : null}
                                {stageViews.map((item) => (
                                  <NavItem
                                    className="workspace-nav-item"
                                    key={item.id}
                                    value={item.id}
                                    icon={<DocumentRegular />}
                                    onClick={() => {
                                      setView(item.id);
                                      setWorkspacePage("engagement");
                                      setMobileNavOpen(false);
                                    }}
                                  >
                                    {item.label}
                                  </NavItem>
                                ))}
                              </div>
                            </AccordionPanel>
                          </AccordionItem>
                        );
                      })}
                      </Accordion>
                    </nav>
                    <div className="progress">
                      <span>Source mapping</span>
                      <b>
                        {lines.length
                          ? Math.round((mapped / lines.length) * 100)
                          : 0}
                        %
                      </b>
                      <ProgressBar
                        aria-label="Source mapping progress"
                        value={lines.length ? mapped / lines.length : 0}
                      />
                      <small>
                        {unmapped
                          ? `${unmapped} mapping decisions remaining`
                          : lines.length
                            ? "Mapping complete"
                            : "Waiting for source data"}
                      </small>
                    </div>
                  </div>
                </AccordionPanel>
              </AccordionItem>
              <AccordionItem
                value="administration"
                className="workspace-nav-bookend administration-navigation"
              >
                <AccordionHeader
                  className="workspace-nav-header"
                  button={{ className: "workspace-nav-toggle" }}
                  expandIconPosition="end"
                >
                  Administration
                </AccordionHeader>
                <AccordionPanel className="workspace-nav-panel">
                  <div className="workspace-nav-items">
                    <NavItem
                      className="workspace-nav-item"
                      value="inbox"
                      icon={<DocumentRegular />}
                      onClick={() => {
                        setWorkspacePage("inbox");
                        setMobileNavOpen(false);
                      }}
                    >
                      Inbox
                    </NavItem>
                    {["OWNER", "ADMIN"].includes(
                      selectedMembership?.role_code || "",
                    ) && (
                      <NavItem
                        className="workspace-nav-item"
                        value="settings"
                        icon={<DocumentRegular />}
                        onClick={() => {
                          setWorkspacePage("settings");
                          setMobileNavOpen(false);
                        }}
                      >
                        Workspace settings
                      </NavItem>
                    )}
                  </div>
                </AccordionPanel>
              </AccordionItem>
              </Accordion>
            </NavDrawerBody>
          </NavDrawer>
        </aside>
        <main className="content">
          {inviteToken ? (
            <InviteAcceptance
              token={inviteToken}
              onCancel={() => setInviteToken("")}
              onAccepted={async () => {
                setInviteToken("");
                await loadMemberships();
              }}
            />
          ) : membershipLoading ? (
            <Skeleton />
          ) : membershipError && !usingLocalFallback ? (
            <MembershipError
              message={membershipError}
              onRetry={loadMemberships}
            />
          ) : !memberships.length && !usingLocalFallback ? (
            <NoMembership
              user={user}
              onboarding={onboarding}
              onRetry={loadMemberships}
              onCreated={loadMemberships}
            />
          ) : !configured ? (
            <WorkspaceChooser
              memberships={memberships}
              onSelect={selectWorkspace}
            />
          ) : workspacePage === "clients" ? (
            <ClientsView
              context={context}
              items={organisations}
              engagements={engagements}
              canCreateClient={["OWNER", "ADMIN"].includes(
                selectedMembership?.role_code || "",
              )}
              loading={organisationLoading}
              error={organisationError}
              reload={loadOrganisations}
              onCreateEngagement={(organisationId) => {
                setEngagementOrganisationId(organisationId || "");
                setShowEngagementSetup(true);
              }}
              onOpenEngagement={(engagementId) => {
                setSelectedId(engagementId);
                setView("overview");
                setWorkspacePage("engagement");
              }}
              onOpenWorkspace={() => {
                setView("overview");
                setWorkspacePage("engagement");
              }}
            />
          ) : workspacePage === "team" ? (
            <TeamView
              context={context}
              currentRole={selectedMembership?.role_code || ""}
              onOpenWorkspace={() => {
                setView("overview");
                setWorkspacePage("engagement");
              }}
            />
          ) : ["integrations", "inbox", "settings"].includes(workspacePage) ? (
            <RoutePanelBoundary resetKey={`${workspacePage}:${selectedId}`}>
              <Suspense fallback={<Skeleton />}>
                <CommercialWorkspace
                  view={workspacePage as "integrations" | "inbox" | "settings"}
                  context={context}
                  engagementId={selectedId}
                  engagements={engagements}
                  onOpenSource={(engagementId) => {
                    setSelectedId(engagementId);
                    setView("data");
                    setWorkspacePage("engagement");
                  }}
                />
              </Suspense>
            </RoutePanelBoundary>
          ) : loading ? (
            <Skeleton />
          ) : error ? (
            <section className="error-state">
              <span aria-hidden="true">
                <ErrorCircleRegular />
              </span>
              <h1>We couldn’t open this workspace</h1>
              <p>{error}</p>
              <FluentButton appearance="primary" onClick={loadEngagements}>
                Try again
              </FluentButton>
            </section>
          ) : !engagements.length ? (
            <Empty
              heading="No engagements yet"
              body="Create an accounting period for one of your clients to begin preparation."
            >
              <FluentButton
                appearance="primary"
                onClick={() => {
                  setEngagementOrganisationId("");
                  setShowEngagementSetup(true);
                }}
              >
                Create engagement
              </FluentButton>
            </Empty>
          ) : (
            <>
              <section className="page-head">
                <div>
                  <Breadcrumb aria-label="Current engagement">
                    <BreadcrumbItem>
                      <BreadcrumbButton
                        onClick={() => setWorkspacePage("clients")}
                      >
                        {selectedMembership?.name || "Workspace"}
                      </BreadcrumbButton>
                    </BreadcrumbItem>
                    <BreadcrumbDivider />
                    <BreadcrumbItem>
                      <BreadcrumbButton current>
                        {engagement?.legal_name}
                      </BreadcrumbButton>
                    </BreadcrumbItem>
                  </Breadcrumb>
                  <div>
                    <h1>{engagement?.legal_name}</h1>
                    <Badge {...statusBadgeProps(engagement?.status || "PREPARATION")}>
                      {title(engagement?.status || "preparation")}
                    </Badge>
                  </div>
                  <small>
                    Year ended{" "}
                    {engagement &&
                      formatDate(engagement.period_end, "Date unavailable")}{" "}
                    · {title(engagement?.framework || "")} · Version {engagement?.version}
                  </small>
                </div>
                <div className="page-actions">
                  <FluentButton
                    onClick={() => {
                      setEngagementOrganisationId("");
                      setShowEngagementSetup(true);
                    }}
                  >
                    New engagement
                  </FluentButton>
                  {memberships.length > 1 && (
                    <FluentButton onClick={clearWorkspace}>
                      Switch workspace
                    </FluentButton>
                  )}
                </div>
              </section>
              <TabList
                className="production-spine"
                aria-label="Accounts production stages"
                selectedValue={
                  productionStages.find((stage) => stage.views.includes(view))
                    ?.target ?? "overview"
                }
              >
                {productionStages.map((stage, index) => (
                  <Tab
                    key={stage.label}
                    value={stage.target}
                    aria-label={`${stage.label}, ${stage.state === "ready" ? "complete" : stage.state === "attention" ? "action needed" : "not started"}`}
                    title={stage.label}
                    className={`${stage.views.includes(view) ? "active" : ""} ${stage.state}`}
                    onClick={() => setView(stage.target)}
                  >
                    <span className="production-stage-tab-content">
                      <Badge
                        appearance="tint"
                        color={
                          stage.state === "ready"
                            ? "success"
                            : stage.state === "attention"
                              ? "warning"
                              : "subtle"
                        }
                        shape="circular"
                        size="medium"
                        className="production-stage-badge"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </Badge>
                      <span>
                        <b>{stage.label}</b>
                        <small>
                          <span className="stage-status">
                            {stage.state === "ready"
                              ? "Complete"
                              : stage.state === "attention"
                                ? "Action needed"
                                : "Not started"}
                          </span>
                        </small>
                      </span>
                    </span>
                  </Tab>
                ))}
              </TabList>
              <TabList
                className="production-stage-menu"
                aria-label={`${activeProductionStage.label} sections`}
                selectedValue={view}
              >
                {activeProductionStage.views.map((stageView) => {
                  const destination = views.find(
                    (item) => item.id === stageView,
                  );
                  return (
                    <Tab
                      key={stageView}
                      value={stageView}
                      onClick={() => setView(stageView)}
                    >
                      {destination?.label ?? title(stageView)}
                    </Tab>
                  );
                })}
              </TabList>
              {notice && (
                <MessageBar intent={notice.good ? "success" : "error"}>
                  <MessageBarBody>
                    <b>{notice.good ? "Saved" : "Action needed"}</b>{" "}
                    {notice.text}
                  </MessageBarBody>
                  <MessageBarActions>
                    <FluentButton
                      appearance="transparent"
                      icon={<DismissRegular />}
                      onClick={() => setNotice(null)}
                      aria-label="Dismiss notification"
                    />
                  </MessageBarActions>
                </MessageBar>
              )}
              <RoutePanelBoundary resetKey={`${selectedId}:${view}`}>
              {view === "portal" ? (
                <Suspense fallback={<Skeleton />}>
                  <CommercialWorkspace
                    view="portal"
                    context={context}
                    engagementId={selectedId}
                    engagements={engagements}
                  />
                </Suspense>
              ) : isOperationalView(view) ? (
                <OperationsView
                  view={view}
                  context={context}
                  engagementId={selectedId}
                  dashboard={dashboard}
                  journals={journals}
                  reconciliations={reconciliations}
                  tasks={tasks}
                  reviewPoints={reviewPoints}
                  canonicalAccounts={canonicalAccounts}
                  loading={operationsLoading}
                  error={operationsError}
                  reload={loadOperations}
                />
              ) : isProductionView(view) ? (
                <Suspense fallback={<Skeleton />}>
                  <EngagementProduction
                    view={view}
                    context={context}
                    engagementId={selectedId}
                    framework={engagement?.framework || "FRS_102"}
                    sectorProfile={engagement?.sector_profile || "NONE"}
                    periodStart={engagement?.period_start || ""}
                    periodEnd={engagement?.period_end || ""}
                    report={report}
                    trialBalance={lines}
                    onEngagementChanged={loadOperations}
                  />
                </Suspense>
              ) : detailLoading ? (
                <Skeleton />
              ) : detailError ? (
                <div className="inline-error">
                  <div>
                    <b>Couldn’t load engagement data</b>
                    <p>{detailError}</p>
                  </div>
                  <FluentButton onClick={loadDetail}>
                    Retry
                  </FluentButton>
                </div>
              ) : view === "data" ? (
                <DataView
                  lines={lines}
                  debit={debit}
                  credit={credit}
                  fileRef={fileRef}
                  chooseFile={chooseFile}
                  openImport={openImport}
                />
              ) : view === "mapping" ? (
                <MappingView
                  lines={lines}
                  options={options}
                  mapped={mapped}
                  unmapped={unmapped}
                  saving={saving}
                  onSave={saveMapping}
                  taxonomyError={taxonomyError}
                  onRetryTaxonomy={loadEngagements}
                />
              ) : view === "accounts" ? (
                <AccountsView
                  context={context}
                  engagement={engagement}
                  lines={lines}
                  report={report}
                  reportBalanced={reportBalanced}
                  error={reportError}
                  onRetry={loadDetail}
                  onOpenSource={() => setView("mapping")}
                />
              ) : (
                <HistoryView
                  events={events}
                  error={historyError}
                  onRefresh={loadDetail}
                />
              )}
              </RoutePanelBoundary>
            </>
          )}
        </main>
      </div>
      {importFile && (
        <Dialog
          open
          onOpenChange={(_, data) => {
            if (!data.open && !importing) closeImport();
          }}
        >
          <DialogSurface className="modal">
            <DialogBody>
              <DialogTitle id="import-title">
                <p className="eyebrow">Import source data</p>
                Review trial balance
              </DialogTitle>
              <DialogContent>
                <div className="file-card" id="import-summary">
                  <span>CSV</span>
                  <div>
                    <b>{importFile.name}</b>
                    <small>
                      {(importFile.size / 1024).toFixed(1)} KB · {csvRows.length}{" "}
                      rows detected
                    </small>
                  </div>
                  <FluentButton
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={importing}
                  >
                    Replace file
                  </FluentButton>
                </div>
                {importError && (
                  <MessageBar intent="error">
                    <MessageBarBody>{importError}</MessageBarBody>
                  </MessageBar>
                )}
                {csvRows.length > 0 && (
                  <div className="preview">
                    <Table size="small" aria-label="Trial balance import preview">
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Code</TableHeaderCell>
                          <TableHeaderCell>Account</TableHeaderCell>
                          <TableHeaderCell>Debit</TableHeaderCell>
                          <TableHeaderCell>Credit</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                    {csvRows.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{row.accountCode}</TableCell>
                            <TableCell>{row.accountName}</TableCell>
                            <TableCell>{row.debit || "—"}</TableCell>
                            <TableCell>{row.credit || "—"}</TableCell>
                          </TableRow>
                    ))}
                      </TableBody>
                    </Table>
                    {csvRows.length > 5 && (
                      <small>Plus {csvRows.length - 5} more rows</small>
                    )}
                  </div>
                )}
              </DialogContent>
              <DialogActions>
                <FluentButton
                  appearance="primary"
                  type="button"
                  onClick={commitImport}
                  disabled={!csvRows.length || importing}
                >
                  {importing
                    ? "Importing…"
                    : `Import ${csvRows.length || ""} rows`}
                </FluentButton>
                <FluentButton type="button" onClick={closeImport} disabled={importing}>
                  Cancel
                </FluentButton>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      {showEngagementSetup && (
        <EngagementSetup
          context={context}
          organisations={organisations}
          initialOrganisationId={engagementOrganisationId}
          onClose={() => setShowEngagementSetup(false)}
          onCreated={async (id) => {
            setSelectedId(id);
            setWorkspacePage("engagement");
            setShowEngagementSetup(false);
            await loadEngagements();
          }}
        />
      )}
    </div>
  );
}

function teamError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "INVITATION_LIMIT_REACHED")
      return "This workspace has reached its active invitation limit. Revoke an unused invitation and try again.";
    if (error.code === "FORBIDDEN")
      return "Your workspace role cannot manage this invitation.";
    if (error.code === "INVITATION_NOT_ACTIVE")
      return "That invitation is no longer active. Refresh the team list.";
  }
  return error instanceof Error
    ? error.message
    : "The team request could not be completed.";
}

function TeamView({
  context,
  currentRole,
  onOpenWorkspace,
}: {
  context: ApiContext;
  currentRole: string;
  onOpenWorkspace: () => void;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [hours, setHours] = useState(72);
  const [oneTimeLink, setOneTimeLink] = useState("");
  const [copyState, setCopyState] = useState("");
  const [invitationClock, setInvitationClock] = useState(() => Date.now());
  const [memberRoles, setMemberRoles] = useState<
    Record<string, "OWNER" | "ADMIN" | "MEMBER">
  >({});
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.team(context);
      setMembers(data.members);
      setMemberRoles(
        Object.fromEntries(data.members.map((member) => [member.id, member.role])),
      );
      setInvitations(data.invitations);
    } catch (e) {
      setError(teamError(e));
    } finally {
      setLoading(false);
    }
  }, [context]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (currentRole !== "OWNER") setRole("MEMBER");
  }, [currentRole]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setInvitationClock(Date.now()),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      setActionError(
        "Invitation expiry must be a whole number from 1 to 168 hours.",
      );
      return;
    }
    setBusy("create");
    setActionError("");
    setOneTimeLink("");
    try {
      const result = await api.createTeamInvitation(context, role, hours);
      setOneTimeLink(result.inviteUrl);
      setCopyState("");
      await load();
    } catch (e) {
      setActionError(teamError(e));
    } finally {
      setBusy("");
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(oneTimeLink);
      setCopyState("Invite link copied.");
    } catch {
      setCopyState("Copy was blocked. Select and copy the link manually.");
    }
  }
  async function revoke(invitation: TeamInvitation) {
    setBusy(invitation.id);
    setActionError("");
    try {
      await api.revokeTeamInvitation(context, invitation.id);
      await load();
    } catch (e) {
      setActionError(teamError(e));
    } finally {
      setBusy("");
    }
  }
  async function updateMember(member: TeamMember) {
    const nextRole = memberRoles[member.id] || member.role;
    if (nextRole === member.role) return;
    setBusy(`member-${member.id}`);
    setActionError("");
    try {
      await api.updateTeamMemberRole(context, member.id, nextRole);
      await load();
    } catch (e) {
      setActionError(teamError(e));
    } finally {
      setBusy("");
    }
  }
  async function removeMember(member: TeamMember) {
    setBusy(`member-${member.id}`);
    setActionError("");
    try {
      await api.removeTeamMember(context, member.id);
      await load();
    } catch (e) {
      setActionError(teamError(e));
    } finally {
      setBusy("");
    }
  }
  if (loading) return <Skeleton />;
  if (error)
    return (
      <section className="error-state" role="alert">
        <span aria-hidden="true">
          <ErrorCircleRegular />
        </span>
        <h1>We couldn’t load this team</h1>
        <p>{error}</p>
        <FluentButton appearance="primary" onClick={load}>
          Try again
        </FluentButton>
      </section>
    );
  return (
    <>
      <section className="page-head client-head">
        <div>
          <Breadcrumb aria-label="Team location">
            <BreadcrumbItem>
              <BreadcrumbButton onClick={onOpenWorkspace}>Workspace</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>Team</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <div>
            <h1>Team</h1>
          </div>
          <small>{members.length} members · Manage workspace access and invitations.</small>
        </div>
      </section>
      <section className="team-section" aria-labelledby="team-members-heading">
        <header className="team-section-head">
          <div>
            <h2 id="team-members-heading">Members</h2>
            <p>People with access to this workspace.</p>
          </div>
        </header>
        <Table aria-label="Workspace members">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Member</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell>Joined</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <b>{member.isCurrentActor ? "You" : "Team member"}</b>
                </TableCell>
                <TableCell>
                  {member.isCurrentActor ? (
                    title(member.role)
                  ) : (
                    <Select
                      aria-label="Workspace role"
                      size="small"
                      value={memberRoles[member.id] || member.role}
                      onChange={(event) =>
                        setMemberRoles((current) => ({
                          ...current,
                          [member.id]: event.target.value as "OWNER" | "ADMIN" | "MEMBER",
                        }))
                      }
                    >
                      <option value="MEMBER">Member</option>
                      {currentRole === "OWNER" && <option value="ADMIN">Administrator</option>}
                      {currentRole === "OWNER" && <option value="OWNER">Owner</option>}
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {fullDate.format(new Date(member.createdAt))}
                </TableCell>
                <TableCell>
                  {!member.isCurrentActor && (
                    <div className="team-member-actions">
                      <FluentButton
                        size="small"
                        disabled={
                          busy === `member-${member.id}` ||
                          (memberRoles[member.id] || member.role) === member.role
                        }
                        onClick={() => updateMember(member)}
                      >
                        Save role
                      </FluentButton>
                      <ConfirmAction
                        label="Remove access"
                        title="Remove workspace access?"
                        body="This colleague will immediately lose access to the workspace."
                        confirmLabel="Remove access"
                        disabled={busy === `member-${member.id}`}
                        onConfirm={() => removeMember(member)}
                      />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section className="team-section" aria-labelledby="team-invite-heading">
        <header className="team-section-head">
          <div>
            <h2 id="team-invite-heading">Invite a colleague</h2>
            <p>Create a time-limited link for a colleague.</p>
          </div>
        </header>
        <form className="invite-form" onSubmit={create}>
          <Field label="Role">
            <Select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "ADMIN" | "MEMBER")
              }
            >
              <option value="MEMBER">Member</option>
              {currentRole === "OWNER" && (
                <option value="ADMIN">Administrator</option>
              )}
            </Select>
          </Field>
          <Field label="Expiry (hours)">
            <Input
              type="number"
              min={1}
              max={168}
              step={1}
              value={String(hours)}
              onChange={(event) => setHours(Number(event.target.value))}
            />
          </Field>
          <FluentButton
            appearance="primary"
            type="submit"
            disabled={busy === "create"}
          >
            {busy === "create" ? "Creating…" : "Create invite link"}
          </FluentButton>
        </form>
        <p className="delivery-note">
          Invitations can remain active for 1–168 hours. The link is shown once; send it using your usual secure channel.
        </p>
        {actionError && (
          <MessageBar intent="error">
            <MessageBarBody>{actionError}</MessageBarBody>
          </MessageBar>
        )}
        {oneTimeLink && (
          <section className="one-time-link" role="status" aria-live="polite">
            <div>
              <b>Copy this link now</b>
              <span>
                For security, it will not be shown again after you dismiss it or
                leave this page.
              </span>
            </div>
            <Input
              aria-label="One-time invitation link"
              readOnly
              value={oneTimeLink}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div>
              <FluentButton appearance="primary" onClick={copyLink}>
                Copy link
              </FluentButton>
              <FluentButton
                appearance="secondary"
                onClick={() => {
                  setOneTimeLink("");
                  setCopyState("");
                }}
              >
                Dismiss
              </FluentButton>
            </div>
            {copyState && <small role="status">{copyState}</small>}
          </section>
        )}
        <div className="invitation-list">
          <h3>Invitation links</h3>
          {!invitations.length ? (
            <p>No active invitation links.</p>
          ) : (
            invitations.map((invitation) => {
              const status = invitationStatus(
                invitation.expiresAt,
                invitationClock,
              );
              return (
              <article key={invitation.id}>
                <div>
                  <b>{title(invitation.role)}</b>
                  <small>
                    Expires {dateTime.format(new Date(invitation.expiresAt))}
                  </small>
                </div>
                <Badge appearance="outline" {...statusBadgeProps(status)}>
                  {title(status)}
                </Badge>
                {status === "ACTIVE" && (
                  <ConfirmAction
                    label="Revoke"
                    title="Revoke invitation?"
                    body={`The ${title(invitation.role)} invitation link will stop working immediately.`}
                    confirmLabel="Revoke invitation"
                    disabled={busy === invitation.id}
                    onConfirm={() => revoke(invitation)}
                  />
                )}
              </article>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}

export function InviteAcceptance({
  token,
  onCancel,
  onAccepted,
}: {
  token: string;
  onCancel: () => void;
  onAccepted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function accept() {
    setBusy(true);
    setError("");
    try {
      await api.acceptInvitation(token);
      await onAccepted();
    } catch (e) {
      if (e instanceof ApiError && e.code === "INVITATION_UNAVAILABLE")
        setError(
          "This invitation link is invalid, expired, revoked, or has already been claimed.",
        );
      else if (e instanceof ApiError && e.code === "INVITATION_NOT_ACTIVE")
        setError("This invitation is no longer active.");
      else
        setError(
          e instanceof Error
            ? e.message
            : "The invitation could not be accepted.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup invite-accept">
      <span className="membership-mark" aria-hidden="true">
        <OpenRegular aria-hidden="true" />
      </span>
      <p className="eyebrow">Workspace invitation</p>
      <h1>Join this workspace</h1>
      <p>
        The invitation was opened securely from the URL fragment. Accept it to
        add your signed-in account to the workspace; the secret token is never
        stored in the browser workspace.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <FluentButton
          type="button"
          appearance="primary"
          disabled={busy}
          onClick={accept}
        >
          {busy ? "Accepting…" : "Accept invitation"}
        </FluentButton>
        <FluentButton
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Continue without invite
        </FluentButton>
      </div>
    </section>
  );
}

function ClientsView({
  context,
  items,
  engagements,
  canCreateClient,
  loading,
  error,
  reload,
  onCreateEngagement,
  onOpenEngagement,
  onOpenWorkspace,
}: {
  context: ApiContext;
  items: Organisation[];
  engagements: Engagement[];
  canCreateClient: boolean;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  onCreateEngagement: (organisationId?: string) => void;
  onOpenEngagement: (engagementId: string) => void;
  onOpenWorkspace: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [selectedOrganisationId, setSelectedOrganisationId] = useState("");
  const [form, setForm] = useState({
    legalName: "",
    legalForm: "PRIVATE_LIMITED_COMPANY",
    jurisdiction: "ENGLAND_AND_WALES",
  });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const clientColumns = useMemo<TableColumnDefinition<Organisation>[]>(
    () => [
      createTableColumn<Organisation>({
        columnId: "legalName",
        renderHeaderCell: () => "Legal name",
        renderCell: (item) => (
          <FluentLink
            as="button"
            className="client-name-button"
            title={item.legal_name}
            onClick={() => setSelectedOrganisationId(item.id)}
          >
            {item.legal_name}
          </FluentLink>
        ),
      }),
      createTableColumn<Organisation>({
        columnId: "legalForm",
        renderHeaderCell: () => "Legal form",
        renderCell: (item) => title(item.legal_form),
      }),
      createTableColumn<Organisation>({
        columnId: "jurisdiction",
        renderHeaderCell: () => "Jurisdiction",
        renderCell: (item) => title(item.jurisdiction),
      }),
      createTableColumn<Organisation>({
        columnId: "engagements",
        renderHeaderCell: () => "Engagements",
        renderCell: (item) => {
          const clientEngagements = engagements.filter(
            (engagement) => engagement.organisation_id === item.id,
          );
          return (
            <div className="client-engagement-links">
              {clientEngagements.map((engagement) => (
                <FluentLink
                  as="button"
                  key={engagement.id}
                  className="client-engagement-link"
                  onClick={() => onOpenEngagement(engagement.id)}
                >
                  {formatDate(engagement.period_end, "Date unavailable")}
                </FluentLink>
              ))}
              {!clientEngagements.length && (
                <span className="muted">No engagements</span>
              )}
            </div>
          );
        },
      }),
      createTableColumn<Organisation>({
        columnId: "action",
        renderHeaderCell: () => "Action",
        renderCell: (item) => (
          <FluentButton
            appearance="secondary"
            size="small"
            onClick={() => onCreateEngagement(item.id)}
          >
            New engagement
          </FluentButton>
        ),
      }),
    ],
    [engagements, onCreateEngagement, onOpenEngagement],
  );
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const legalName = form.legalName.trim();
    if (!legalName) {
      setFormError("Enter the client’s legal name.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await api.createOrganisation(context, { ...form, legalName });
      setForm({ ...form, legalName: "" });
      setCreating(false);
      await reload();
    } catch (e) {
      setFormError(
        e instanceof ApiError && e.status >= 500
          ? "The service could not create this client. Your details were not saved. Try again; if the problem continues, contact your workspace administrator."
          : e instanceof Error
            ? e.message
            : "Could not create client.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Skeleton />;
  if (error)
    return (
      <section className="error-state" role="alert">
        <span aria-hidden="true">
          <ErrorCircleRegular />
        </span>
        <h1>We couldn’t load your clients</h1>
        <p>{error}</p>
        <FluentButton appearance="primary" onClick={reload}>
          Try again
        </FluentButton>
      </section>
    );
  if (selectedOrganisationId)
    return (
      <ClientPermanentFile
        context={context}
        organisationId={selectedOrganisationId}
        onBack={() => setSelectedOrganisationId("")}
        onOpenEngagement={onOpenEngagement}
      />
    );
  return (
    <>
      <section className="page-head client-head">
        <div className="client-heading-copy">
          <Breadcrumb aria-label="Clients location">
            <BreadcrumbItem>
              <BreadcrumbButton onClick={onOpenWorkspace}>Workspace</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>Clients</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <div className="client-title-row">
            <h1>Clients</h1>
          </div>
        </div>
        <div className="page-actions">
          {canCreateClient && (creating || items.length > 0) && (
            <FluentButton
              appearance={creating ? "secondary" : "primary"}
              onClick={() => setCreating(!creating)}
            >
              {creating ? "Close" : "New client"}
            </FluentButton>
          )}
        </div>
      </section>
      {creating && (
        <section className="panel client-form">
          <header className="client-form-header">
            <h2>Add legal entity</h2>
          </header>
          <form className="compact-form" onSubmit={create}>
            <Field label="Legal name" required>
              <Input
                maxLength={255}
                value={form.legalName}
                onChange={(e) =>
                  setForm({ ...form, legalName: e.target.value })
                }
              />
            </Field>
            <Field label="Legal form">
              <Select
                className="client-select"
                value={form.legalForm}
                onChange={(e) =>
                  setForm({ ...form, legalForm: e.target.value })
                }
              >
                <option value="PRIVATE_LIMITED_COMPANY">
                  Private limited company
                </option>
                <option value="PUBLIC_LIMITED_COMPANY">
                  Public limited company
                </option>
                <option value="LLP">Limited liability partnership</option>
                <option value="CHARITABLE_COMPANY">Charitable company</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Jurisdiction">
              <Select
                className="client-select"
                value={form.jurisdiction}
                onChange={(e) =>
                  setForm({ ...form, jurisdiction: e.target.value })
                }
              >
                <option value="ENGLAND_AND_WALES">England and Wales</option>
                <option value="SCOTLAND">Scotland</option>
                <option value="NORTHERN_IRELAND">Northern Ireland</option>
              </Select>
            </Field>
            <div className="client-form-actions">
              <FluentButton appearance="primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create client"}
              </FluentButton>
            </div>
          </form>
          {formError && (
            <MessageBar intent="error">
              <MessageBarBody>{formError}</MessageBarBody>
            </MessageBar>
          )}
        </section>
      )}
      {!items.length ? (
        !creating ? <section className="panel client-empty-panel">
          <Empty
            heading="No clients yet"
            body={
              canCreateClient
                ? "Add your first legal entity, then create its accounts engagement."
                : "Ask a workspace owner or administrator to add the first client."
            }
          >
            {canCreateClient && (
              <FluentButton
                appearance="primary"
                onClick={() => setCreating(true)}
              >
                Add first client
              </FluentButton>
            )}
          </Empty>
        </section> : null
      ) : (
        <div className="table-wrap client-table">
          <DataGrid
            className="client-data-grid"
            aria-label="Clients"
            items={items}
            columns={clientColumns}
            getRowId={(item) => item.id}
            focusMode="composite"
            resizableColumns
            resizableColumnsOptions={{ autoFitColumns: true }}
            columnSizingOptions={{
              legalName: { minWidth: 190, defaultWidth: 320 },
              legalForm: { minWidth: 160, defaultWidth: 230 },
              jurisdiction: { minWidth: 150, defaultWidth: 210 },
              engagements: { minWidth: 150, defaultWidth: 210 },
              action: { minWidth: 155, defaultWidth: 180 },
            }}
          >
            <DataGridHeader className="client-data-grid-header">
              <DataGridRow className="client-data-grid-row">
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell className="client-data-grid-header-cell">
                    {renderHeaderCell()}
                  </DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<Organisation>>
              {({ item, rowId }) => (
                <DataGridRow<Organisation>
                  key={rowId}
                  className="client-data-grid-row"
                >
                  {({ renderCell }) => (
                    <DataGridCell className="client-data-grid-cell">
                      {renderCell(item)}
                    </DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        </div>
      )}
    </>
  );
}

function EngagementSetup({
  context,
  organisations,
  initialOrganisationId,
  onClose,
  onCreated,
}: {
  context: ApiContext;
  organisations: Organisation[];
  initialOrganisationId: string;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const initialOrganisation =
    organisations.find((item) => item.id === initialOrganisationId) ??
    organisations[0];
  const [form, setForm] = useState({
    organisationId: initialOrganisation?.id || "",
    periodStart: "",
    periodEnd: "",
    framework: "FRS_102",
    sectorProfile:
      requiredSectorProfile(initialOrganisation?.legal_form ?? "") ?? "NONE",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedOrganisation = organisations.find(
    (item) => item.id === form.organisationId,
  );
  const sectorProfiles = permittedSectorProfiles(
    form.framework,
    selectedOrganisation?.legal_form ?? "",
  );
  const frameworks = permittedFrameworks(
    selectedOrganisation?.legal_form ?? "",
  );
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (form.periodEnd < form.periodStart) {
      setError("The period end must be on or after the period start.");
      return;
    }
    const regimeError = reportingRegimeError(
      form.framework,
      form.sectorProfile,
      selectedOrganisation?.legal_form ?? "",
    );
    if (regimeError) {
      setError(regimeError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.createEngagement(context, form);
      await onCreated(result.item.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create engagement.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open && !busy) onClose();
      }}
    >
      <DialogSurface className="modal engagement-dialog">
        <DialogBody>
          <DialogTitle>
            <p className="eyebrow">Engagement setup</p>
            Create accounts period
          </DialogTitle>
          <DialogContent>
        {!organisations.length ? (
          <>
            <Empty
              heading="Create a client first"
              body="An engagement must belong to a legal entity in this workspace."
            />
            <DialogActions>
              <FluentButton type="button" onClick={onClose}>Close</FluentButton>
            </DialogActions>
          </>
        ) : (
          <form className="engagement-form" onSubmit={create}>
            <Field
              className="engagement-field engagement-client-field"
              label="Client"
              required
            >
              <Select
                className="engagement-control"
                value={form.organisationId}
                onChange={(event) => {
                  const organisationId = event.target.value;
                  const legalForm =
                    organisations.find((item) => item.id === organisationId)
                      ?.legal_form ?? "";
                  const requiredProfile = requiredSectorProfile(legalForm);
                  const framework = requiredProfile ? "FRS_102" : form.framework;
                  const sectorProfile = requiredProfile ?? "NONE";
                  setForm({
                    ...form,
                    organisationId,
                    framework,
                    sectorProfile,
                  });
                }}
              >
                {organisations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.legal_name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="engagement-period-fields">
              <Field
                className="engagement-field"
                label="Period start"
                required
              >
                <Input
                  className="engagement-control"
                  type="date"
                  value={form.periodStart}
                  onChange={(event) =>
                    setForm({ ...form, periodStart: event.target.value })
                  }
                />
              </Field>
              <Field
                className="engagement-field"
                label="Period end"
                required
              >
                <Input
                  className="engagement-control"
                  type="date"
                  value={form.periodEnd}
                  onChange={(event) =>
                    setForm({ ...form, periodEnd: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field
              className="engagement-field"
              label="Reporting framework"
              required
            >
              <Select
                className="engagement-control"
                value={form.framework}
                onChange={(event) => {
                  const framework = event.target.value;
                  const sectorProfile = reportingRegimeError(
                    framework,
                    form.sectorProfile,
                    selectedOrganisation?.legal_form ?? "",
                  )
                    ? "NONE"
                    : form.sectorProfile;
                  setForm({ ...form, framework, sectorProfile });
                }}
              >
                {frameworks.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              className="engagement-field"
              label="Sector profile"
              required
              hint={
                sectorProfiles.length === 1 && sectorProfiles[0]?.value === "NONE"
                  ? "No sector-specific reporting profile is compatible with this framework and client type."
                  : sectorProfiles.length === 1
                    ? "This client type requires this reporting profile."
                  : "Only profiles compatible with the framework and client type are shown."
              }
            >
              <Select
                className="engagement-control"
                value={form.sectorProfile}
                onChange={(event) =>
                  setForm({ ...form, sectorProfile: event.target.value })
                }
              >
                {sectorProfiles.map((profile) => (
                  <option key={profile.value} value={profile.value}>
                    {profile.label}
                  </option>
                ))}
              </Select>
            </Field>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <DialogActions className="engagement-dialog-actions">
              <FluentButton appearance="primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create engagement"}
              </FluentButton>
              <FluentButton type="button" onClick={onClose} disabled={busy}>
                Cancel
              </FluentButton>
            </DialogActions>
          </form>
        )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function WorkspaceChooser({
  memberships,
  onSelect,
}: {
  memberships: TenantMembership[];
  onSelect: (tenantId: string) => void;
}) {
  const [tenantId, setTenantId] = useState("");
  return (
    <section className="setup fluent-workspace-choice">
      <p className="eyebrow">Select your workspace</p>
      <h1>Where would you like to work?</h1>
      <p>
        Your administrator has assigned your account to the following
        workspaces.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSelect(tenantId);
        }}
      >
        <Field label="Workspace" required>
          <Select
            id="workspace-select"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            required
          >
            <option value="">Choose a workspace…</option>
            {memberships.map((item) => (
              <option key={item.tenant_id} value={item.tenant_id}>
                {item.name} · {title(item.role_code)}
              </option>
            ))}
          </Select>
        </Field>
        <FluentButton appearance="primary" type="submit" disabled={!tenantId}>
          Open workspace
        </FluentButton>
      </form>
    </section>
  );
}

export function onboardingAllowsCreation(
  onboarding: TenantOnboarding | null,
): boolean {
  return onboarding?.code === "SELF_SERVICE_WORKSPACE_AVAILABLE";
}
export function NoMembership({
  user,
  onboarding,
  onRetry,
  onCreated,
}: {
  user: AuthUser;
  onboarding: TenantOnboarding | null;
  onRetry: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canCreate = onboardingAllowsCreation(onboarding);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createTenant(name.trim());
      await onCreated();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create your workspace.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup membership-state">
      <span className="membership-mark" aria-hidden="true">
        ◎
      </span>
      <p className="eyebrow">Workspace access</p>
      {canCreate ? (
        <>
          <h1>Create your first workspace</h1>
          <p>
            Your account <b>{user.email}</b> is ready. Create a workspace to
            become its owner and begin setting up clients.
          </p>
          <form className="workspace-create" onSubmit={create}>
            <Field label="Workspace name" required>
              <Input
                id="new-workspace-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                required
                autoFocus
              />
            </Field>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <FluentButton appearance="primary" type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create workspace"}
            </FluentButton>
          </form>
          <small>
            You will be the workspace owner and can invite trusted colleagues
            later.
          </small>
        </>
      ) : (
        <>
          <h1>You haven’t been assigned a workspace yet</h1>
          <p>
            Your account <b>{user.email}</b> is signed in successfully, but it
            has no organisation memberships.{" "}
            {onboarding?.message ||
              "Ask your Ledgerly administrator to invite this email address, then check again."}
          </p>
          <div>
            <FluentButton appearance="primary" type="button" onClick={onRetry}>
              Check again
            </FluentButton>
          </div>
          <small>
            Once an administrator adds you, your workspace will appear here
            automatically.
          </small>
        </>
      )}
    </section>
  );
}

function MembershipError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="error-state membership-state" role="alert">
      <span aria-hidden="true">
        <ErrorCircleRegular />
      </span>
      <h1>We couldn’t find your workspaces</h1>
      <p>{message}</p>
      <p>
        Your sign-in is still active. Retry the membership check before
        contacting your administrator.
      </p>
      <FluentButton appearance="primary" type="button" onClick={onRetry}>
        Try again
      </FluentButton>
    </section>
  );
}

function isOperationalView(view: View) {
  return [
    "overview",
    "journals",
    "reconciliations",
    "tasks",
    "review",
  ].includes(view);
}
function isProductionView(
  view: View,
): view is "working-papers" | "disclosures" | "versions" | "filing" {
  return ["working-papers", "disclosures", "versions", "filing"].includes(view);
}
type OperationsProps = {
  context: ApiContext;
  engagementId: string;
  reload: () => Promise<void> | void;
};
function OperationsView({
  view,
  context,
  engagementId,
  dashboard,
  journals,
  reconciliations,
  tasks,
  reviewPoints,
  canonicalAccounts,
  loading,
  error,
  reload,
}: OperationsProps & {
  view: View;
  dashboard: Dashboard;
  journals: Journal[];
  reconciliations: Reconciliation[];
  tasks: WorkflowTask[];
  reviewPoints: ReviewPoint[];
  canonicalAccounts: CanonicalAccount[];
  loading: boolean;
  error: string;
}) {
  if (loading) return <Skeleton />;
  return (
    <>
      {error && (
        <PanelError
          heading="Some engagement operations are unavailable"
          message={error}
          onRetry={reload}
        />
      )}
      {view === "overview" ? (
        <Overview
          dashboard={dashboard}
          journals={journals}
          reconciliations={reconciliations}
          tasks={tasks}
          reviewPoints={reviewPoints}
        />
      ) : view === "journals" ? (
        <JournalsView
          context={context}
          engagementId={engagementId}
          reload={reload}
          items={journals}
          canonicalAccounts={canonicalAccounts}
        />
      ) : view === "reconciliations" ? (
        <ReconciliationsView
          context={context}
          engagementId={engagementId}
          reload={reload}
          items={reconciliations}
        />
      ) : view === "tasks" ? (
        <TasksView
          context={context}
          engagementId={engagementId}
          reload={reload}
          items={tasks}
        />
      ) : (
        <ReviewPointsView
          context={context}
          engagementId={engagementId}
          reload={reload}
          items={reviewPoints}
        />
      )}
    </>
  );
}

function Overview({
  dashboard,
  journals,
  reconciliations,
  tasks,
  reviewPoints,
}: {
  dashboard: Dashboard;
  journals: Journal[];
  reconciliations: Reconciliation[];
  tasks: WorkflowTask[];
  reviewPoints: ReviewPoint[];
}) {
  const taskStats = taskProgress(tasks);
  const cards = [
    {
      label: "Journals",
      value: dashboard.journals?.total ?? journals.length,
      note: `${dashboard.journals?.byStatus?.DRAFT ?? journals.filter((item) => item.status === "DRAFT").length} draft`,
    },
    {
      label: "Reconciliations",
      value: dashboard.reconciliations?.total ?? reconciliations.length,
      note: `${dashboard.reconciliations?.byStatus?.EXCEPTION ?? reconciliations.filter((item) => item.status === "EXCEPTION").length} exceptions`,
    },
    {
      label: "Open tasks",
      value: taskStats.openTasks,
      note: `${taskStats.percent}% complete`,
    },
    {
      label: "Review points",
      value: dashboard.reviewPoints?.total ?? reviewPoints.length,
      note: blockingItemsLabel(dashboard.blockingItems),
    },
  ];
  return (
    <>
      <div className="metrics operational-metrics">
        {cards.map((card) => (
          <div key={card.label}>
            <span>{card.label}</span>
            <b>{card.value}</b>
            <small>{card.note}</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <PanelHead
          eyebrow="Engagement control"
          heading="Preparation overview"
          body="Live operational readiness across this engagement."
        >
          <Badge appearance="outline" color="warning" size="small">
            {taskStats.percent}% complete
          </Badge>
        </PanelHead>
        <div className="readiness">
          <div
            className="readiness-ring"
            style={
              {
                "--progress": `${taskStats.percent}%`,
              } as React.CSSProperties
            }
          >
            <b>{taskStats.percent}%</b>
          </div>
          <div>
            <h3>Workflow readiness</h3>
            <p>
              {blockingItemsMessage(dashboard.blockingItems)}
            </p>
            <dl>
              <div>
                <dt>Completed tasks</dt>
                <dd>
                  {taskStats.completedTasks}
                </dd>
              </div>
              <div>
                <dt>Total tasks</dt>
                <dd>{taskStats.totalTasks}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}

function JournalsView({
  context,
  engagementId,
  reload,
  items,
  canonicalAccounts,
}: OperationsProps & {
  items: Journal[];
  canonicalAccounts: CanonicalAccount[];
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [journalType, setJournalType] = useState("ADJUSTMENT");
  const [lines, setLines] = useState([
    { canonicalAccountId: "", narrative: "", debit: "", credit: "" },
    { canonicalAccountId: "", narrative: "", debit: "", credit: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0),
    credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0),
    balanced = debit > 0 && Math.abs(debit - credit) < 0.005;
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!balanced) return;
    setBusy(true);
    setError("");
    try {
      await api.createJournal(context, engagementId, {
        journalType,
        description,
        lines,
      });
      setEditing(false);
      setDescription("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create journal.");
    } finally {
      setBusy(false);
    }
  }
  async function transition(item: Journal, status: JournalStatus) {
    setBusy(true);
    setError("");
    try {
      await api.transitionJournal(context, engagementId, item.id, status);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update journal.");
    } finally {
      setBusy(false);
    }
  }
  const next: Partial<Record<JournalStatus, JournalStatus>> = {
    DRAFT: "PREPARED",
    PREPARED: "APPROVED",
    APPROVED: "POSTED",
  };
  return (
    <section className="panel operations-panel journals-panel">
      <PanelHead
        eyebrow="Adjustments"
        heading="Journals"
        body="Balanced adjustments with controlled preparation and approval."
      >
        <FluentButton
          appearance="primary"
          size="small"
          type="button"
          aria-expanded={editing}
          aria-controls="journal-editor"
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Close editor" : "New journal"}
        </FluentButton>
      </PanelHead>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {editing && (
        <form
          id="journal-editor"
          className="journal-editor operation-form"
          onSubmit={create}
        >
          <div className="operation-form-heading">
            <div>
              <h3>Journal details</h3>
              <p>
                Enter at least two lines. Debits and credits must balance before
                the draft can be saved.
              </p>
            </div>
            <span aria-live="polite">{lines.length} lines</span>
          </div>
          <div className="editor-grid">
            <Field label="Journal type" required size="small">
              <Select
                size="small"
                value={journalType}
                onChange={(e) => setJournalType(e.target.value)}
              >
                <option>ADJUSTMENT</option>
                <option>RECLASSIFICATION</option>
                <option>ELIMINATION</option>
              </Select>
            </Field>
            <Field label="Description" required size="small">
              <Input
                size="small"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Purpose of the adjustment"
                required
              />
            </Field>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Canonical account</th>
                  <th>Narrative</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <Select
                        size="small"
                        aria-label={`Line ${index + 1} canonical account`}
                        value={line.canonicalAccountId}
                        onChange={(e) =>
                          setLines((current) =>
                            current.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    canonicalAccountId: e.target.value,
                                  }
                                : item,
                            ),
                          )
                        }
                        required
                      >
                        <option value="">Select account…</option>
                        {canonicalAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.canonical_code} · {account.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <Input
                        size="small"
                        aria-label={`Line ${index + 1} narrative`}
                        value={line.narrative}
                        placeholder="Line narrative"
                        onChange={(e) =>
                          setLines((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, narrative: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <Input
                        size="small"
                        aria-label={`Line ${index + 1} debit`}
                        inputMode="decimal"
                        value={line.debit}
                        onChange={(e) =>
                          setLines((current) =>
                            current.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    debit: e.target.value,
                                    credit: e.target.value ? "" : item.credit,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <Input
                        size="small"
                        aria-label={`Line ${index + 1} credit`}
                        inputMode="decimal"
                        value={line.credit}
                        onChange={(e) =>
                          setLines((current) =>
                            current.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    credit: e.target.value,
                                    debit: e.target.value ? "" : item.debit,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className={`balance-control ${balanced ? "balanced" : "unbalanced"}`}
          >
            <span>
              Debits {money(debit)} · Credits {money(credit)}
            </span>
            <b aria-live="polite">
              {balanced ? "Balanced" : `Difference ${money(debit - credit)}`}
            </b>
            <FluentButton
              appearance="primary"
              size="small"
              type="submit"
              disabled={!balanced || busy}
            >
              Save draft
            </FluentButton>
          </div>
        </form>
      )}
      {!items.length ? (
        <Empty
          heading="No journals yet"
          body="Create a balanced journal to record an adjustment."
        />
      ) : (
        <div className="table-wrap operation-register">
          <table className="journal-register">
            <caption className="sr-only">Journal register</caption>
            <thead>
              <tr>
                <th>Journal</th>
                <th>Type</th>
                <th>Status</th>
                <th>Version</th>
                <th className="number">Lines</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <React.Fragment key={item.id}>
                  <tr>
                    <td>
                      <span className="mono block">
                        J{item.journal_no ?? item.id.slice(0, 6)}
                      </span>
                      <b>{item.description}</b>
                    </td>
                    <td>{title(item.journal_type || "Journal")}</td>
                    <td>
                      <Badge
                        appearance="outline"
                        color={
                          item.status === "POSTED" ? "success" : "informative"
                        }
                      >
                        {title(item.status)}
                      </Badge>
                    </td>
                    <td>{item.version || 1}</td>
                    <td className="number">{item.lines?.length || 0}</td>
                    <td className="register-action">
                      {next[item.status] && (
                        <FluentButton
                          size="small"
                          type="button"
                          disabled={busy}
                          onClick={() => transition(item, next[item.status]!)}
                        >
                          {next[item.status] === "PREPARED"
                            ? "Mark prepared"
                            : title(next[item.status])}
                        </FluentButton>
                      )}
                    </td>
                  </tr>
                  {item.lines?.length ? (
                    <tr className="journal-lines-row">
                      <td colSpan={6}>
                        <details>
                          <summary>View journal lines</summary>
                          <div className="journal-line-list">
                            {item.lines.map((line) => (
                              <div key={line.id || line.line_no}>
                                <span className="mono">
                                  {line.canonical_code ||
                                    line.canonical_account_id}
                                </span>
                                <span>
                                  {line.narrative ||
                                    line.account_name ||
                                    "No narrative"}
                                </span>
                                <b>
                                  {money(
                                    Number(line.debit) - Number(line.credit),
                                  )}
                                </b>
                              </div>
                            ))}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReconciliationsView({
  context,
  engagementId,
  reload,
  items,
}: OperationsProps & { items: Reconciliation[] }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    reconciliationType: "BANK",
    title: "",
    ledgerBalance: "",
    supportingBalance: "",
    tolerance: "0.00",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.updateReconciliation(context, engagementId, form);
      setShowForm(false);
      setForm({ ...form, title: "", ledgerBalance: "", supportingBalance: "" });
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save reconciliation.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function review(id: string) {
    setBusy(true);
    setError("");
    try {
      await api.reviewReconciliation(context, engagementId, id);
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not review reconciliation.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel operations-panel reconciliations-panel">
      <PanelHead
        eyebrow="Balance controls"
        heading="Reconciliations"
        body="Compare ledger balances to independent supporting records."
      >
        <FluentButton
          appearance="primary"
          size="small"
          className="reconciliation-header-action"
          type="button"
          aria-expanded={showForm}
          aria-controls="reconciliation-editor"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Close" : "New reconciliation"}
        </FluentButton>
      </PanelHead>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {showForm && (
        <form
          id="reconciliation-editor"
          className="compact-form operation-form reconciliation-form"
          onSubmit={save}
        >
          <div className="operation-form-heading">
            <div>
              <h3>Control balance</h3>
              <p>
                Record the ledger balance, independent support and accepted
                tolerance.
              </p>
            </div>
          </div>
          <Field label="Type" required size="small">
            <Select
              size="small"
              value={form.reconciliationType}
              onChange={(e) =>
                setForm({ ...form, reconciliationType: e.target.value })
              }
            >
              {[
                "BANK",
                "DEBTORS",
                "CREDITORS",
                "VAT",
                "PAYROLL",
                "FIXED_ASSETS",
                "LOANS",
                "PENSIONS",
                "INTERCOMPANY",
                "FUNDS",
                "OTHER",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field label="Title" required size="small">
            <Input
              size="small"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </Field>
          <Field label="Ledger balance" required size="small">
            <Input
              size="small"
              inputMode="decimal"
              value={form.ledgerBalance}
              onChange={(e) =>
                setForm({ ...form, ledgerBalance: e.target.value })
              }
              required
            />
          </Field>
          <Field label="Supporting balance" required size="small">
            <Input
              size="small"
              inputMode="decimal"
              value={form.supportingBalance}
              onChange={(e) =>
                setForm({ ...form, supportingBalance: e.target.value })
              }
              required
            />
          </Field>
          <Field label="Tolerance" required size="small">
            <Input
              size="small"
              inputMode="decimal"
              value={form.tolerance}
              onChange={(e) => setForm({ ...form, tolerance: e.target.value })}
              required
            />
          </Field>
          <FluentButton
            appearance="primary"
            size="small"
            type="submit"
            disabled={busy}
          >
            Save reconciliation
          </FluentButton>
        </form>
      )}
      {!items.length ? (
        <Empty
          heading="No reconciliations"
          body="Create a reconciliation for each material control account."
        />
      ) : (
        <div className="table-wrap operation-register">
          <table className="reconciliation-register">
            <caption className="sr-only">Reconciliation register</caption>
            <thead>
              <tr>
                <th>Control</th>
                <th>Status</th>
                <th className="number">Ledger</th>
                <th className="number">Supporting</th>
                <th className="number">Difference</th>
                <th className="number">Tolerance</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const difference =
                  Number(item.ledger_balance || 0) -
                  Number(item.supporting_balance || 0);
                const exception =
                  Math.abs(difference) > Number(item.tolerance || 0);
                return (
                  <tr key={item.id}>
                    <td>
                      <span className="mono block">
                        {title(item.reconciliation_type || "CONTROL")}
                      </span>
                      <b>{item.title || "Reconciliation"}</b>
                    </td>
                    <td>
                      <Badge
                        appearance="outline"
                        color={
                          ["RECONCILED", "REVIEWED"].includes(item.status)
                            ? "success"
                            : exception
                              ? "warning"
                              : "informative"
                        }
                      >
                        {title(item.status)}
                      </Badge>
                    </td>
                    <td className="number">
                      {money(Number(item.ledger_balance || 0))}
                    </td>
                    <td className="number">
                      {money(Number(item.supporting_balance || 0))}
                    </td>
                    <td className={`number ${exception ? "difference" : ""}`}>
                      {money(difference)}
                    </td>
                    <td className="number">
                      {money(Number(item.tolerance || 0))}
                    </td>
                    <td className="register-action">
                      {item.status !== "REVIEWED" && (
                        <FluentButton
                          size="small"
                          type="button"
                          disabled={busy}
                          onClick={() => review(item.id)}
                        >
                          Mark reviewed
                        </FluentButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TasksView({
  context,
  engagementId,
  reload,
  items,
}: OperationsProps & { items: WorkflowTask[] }) {
  const [titleValue, setTitleValue] = useState("");
  const [taskType, setTaskType] = useState("PREPARATION");
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createWorkflowTask(context, engagementId, {
        taskType,
        title: titleValue,
        blocking,
      });
      setTitleValue("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create task.");
    } finally {
      setBusy(false);
    }
  }
  async function move(item: WorkflowTask, status: WorkflowTaskStatus) {
    setBusy(true);
    try {
      await api.updateWorkflowTask(context, engagementId, item.id, { status });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update task.");
    } finally {
      setBusy(false);
    }
  }
  const columns: WorkflowTaskStatus[] = [
    "OPEN",
    "IN_PROGRESS",
    "BLOCKED",
    "COMPLETE",
  ];
  const statusOptions: WorkflowTaskStatus[] = [...columns, "CANCELLED"];
  const taskTypes = ["PREPARATION", "ACCOUNTS", "REVIEW"] as const;
  const visibleItems = items.filter((item) => columns.includes(item.status));
  return (
    <>
      <section className="panel task-create">
        <PanelHead
          eyebrow="Workflow"
          heading="Task board"
          body="Assign, prioritise and complete engagement work."
        />
        <form className="compact-form" onSubmit={create}>
          <Field label="Task title" required>
            <Input
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              required
            />
          </Field>
          <Field label="Task type" required>
            <Select
              className="task-type-select"
              select={{ className: "task-select-native" }}
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              required
            >
              {taskTypes.map((value) => (
                <option key={value} value={value}>
                  {title(value)}
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox
              className="check"
              label="Blocking"
              checked={blocking}
              onChange={(_, data) => setBlocking(Boolean(data.checked))}
          />
          <FluentButton appearance="primary" type="submit" disabled={busy}>
            Add task
          </FluentButton>
        </form>
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
      </section>
      {!visibleItems.length ? (
        <Card className="task-board-empty" appearance="outline">
          <h3>No tasks yet</h3>
          <p>Add a task above to start tracking engagement work.</p>
        </Card>
      ) : (
        <div className="task-board">
          {columns.map((status) => {
            const columnItems = visibleItems.filter(
              (item) => item.status === status,
            );
            const headingId = `task-column-${status.toLowerCase()}`;
            return (
              <Card
                aria-labelledby={headingId}
                className="task-column"
                key={status}
                appearance="outline"
              >
                <header>
                  <h3 id={headingId}>{title(status)}</h3>
                  <Badge appearance="tint" color="subtle" size="small">
                    {columnItems.length}
                  </Badge>
                </header>
                <div className="task-column-items">
                  {columnItems.map((item) => (
                    <Card
                      aria-label={item.title}
                      className="task-card"
                      key={item.id}
                      appearance="subtle"
                    >
                      <div>
                        {item.blocking && (
                          <Badge color="danger" appearance="tint" size="small">
                            Blocking
                          </Badge>
                        )}
                        <h4>{item.title}</h4>
                        <small>
                          {title(item.task_type || "TASK")}
                          {item.due_at
                            ? ` · Due ${fullDate.format(new Date(item.due_at))}`
                            : ""}
                        </small>
                      </div>
                      <Select
                        className="task-status-select"
                        select={{ className: "task-select-native" }}
                        aria-label={`Status for ${item.title}`}
                        value={item.status}
                        disabled={busy}
                        onChange={(e) =>
                          move(item, e.target.value as WorkflowTaskStatus)
                        }
                      >
                        {statusOptions.map((value) => (
                          <option key={value} value={value}>
                            {title(value)}
                          </option>
                        ))}
                      </Select>
                    </Card>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function ReviewPointsView({
  context,
  engagementId,
  reload,
  items,
}: OperationsProps & { items: ReviewPoint[] }) {
  const [form, setForm] = useState({
    objectType: "ENGAGEMENT",
    objectId: engagementId,
    question: "",
    severity: "NORMAL",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createReviewPoint(context, engagementId, form);
      setForm({ ...form, question: "" });
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not raise review point.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function update(item: ReviewPoint, status: ReviewPointStatus) {
    setBusy(true);
    setError("");
    try {
      await api.updateReviewPoint(context, engagementId, item.id, { status });
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update review point.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <PanelHead
        eyebrow="Review"
        heading="Review points"
        body="Raise, respond to and clear review queries."
      />
      <form className="review-create" onSubmit={create}>
        <Field label="Review question" required>
          <Textarea
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            required
          />
        </Field>
        <Field label="Severity">
          <Select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value })}
          >
            <option>NORMAL</option>
            <option>BLOCKING</option>
          </Select>
        </Field>
        <FluentButton appearance="primary" type="submit" disabled={busy}>
          Raise point
        </FluentButton>
      </form>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {!items.length ? (
        <Empty
          heading="No review points"
          body="Review questions raised on this engagement will appear here."
        />
      ) : (
        <div className="review-list">
          {items.map((item) => (
            <article key={item.id}>
              <Badge
                color={item.severity === "BLOCKING" ? "danger" : "informative"}
                appearance="outline"
              >
                {item.severity || "NORMAL"}
              </Badge>
              <div>
                <h3>{item.question || "Review point"}</h3>
                <p>
                  {item.response ||
                    `${item.object_type || "Object"} · ${item.object_id || ""}`}
                </p>
              </div>
              <Badge
                color={item.status === "CLEARED" ? "success" : "informative"}
                appearance="outline"
              >
                {title(item.status)}
              </Badge>
              <div>
                {item.status === "OPEN" && (
                  <FluentButton onClick={() => update(item, "RESPONDED")}>
                    Mark responded
                  </FluentButton>
                )}
                {item.status !== "CLEARED" && (
                  <FluentButton onClick={() => update(item, "CLEARED")}>
                    Clear
                  </FluentButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function initials(user: AuthUser) {
  const source = user.name?.trim() || user.email;
  return source
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function AuthFrame({ children }: React.PropsWithChildren) {
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <a className="brand" href="/">
          <span>LD</span>
          <b>Ledgerly</b>
        </a>
        <div>
          <p className="eyebrow">Accounts production</p>
          <h1>UK statutory accounts</h1>
          <p>
            Trial balance, adjustments, disclosures, accounts and filing
            evidence.
          </p>
        </div>
        <small>Managed authentication · Immutable engagement history</small>
      </section>
      <section className="auth-panel">{children}</section>
    </main>
  );
}

function AuthConfiguration() {
  return (
    <AuthFrame>
      <div className="auth-card configuration">
        <span className="config-mark" aria-hidden="true">
          <ErrorCircleRegular />
        </span>
        <p className="eyebrow">Configuration required</p>
        <h2>Connect Neon Auth</h2>
        <p>
          This build is missing its public Neon Auth base URL. Add{" "}
          <code>VITE_NEON_AUTH_URL</code> to the web environment, then rebuild
          or restart the development server.
        </p>
        <div className="config-example">
          <b>Environment variable</b>
          <code>VITE_NEON_AUTH_URL=&lt;your Neon Auth base URL&gt;</code>
        </div>
        <small>
          No database credentials or private keys belong in the browser
          environment.
        </small>
      </div>
    </AuthFrame>
  );
}

function AuthLoading() {
  return (
    <AuthFrame>
      <div className="auth-card auth-loading" role="status">
        <span className="spinner" />
        <p>Restoring your secure session…</p>
      </div>
    </AuthFrame>
  );
}

function AuthScreen({
  message,
  onAuthenticated,
}: {
  message: string;
  onAuthenticated: () => Promise<void>;
}) {
  type AuthMode = "sign-in" | "sign-up" | "reset-request" | "reset-password";
  const initialResetToken = typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("token") ?? "";
  const [mode, setMode] = useState<AuthMode>(initialResetToken ? "reset-password" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(message);
  const heading = mode === "sign-in"
    ? "Welcome back"
    : mode === "sign-up"
      ? "Create your account"
      : mode === "reset-request"
        ? "Reset your password"
        : "Choose a new password";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!authClient) return;
    setBusy(true);
    setError("");
    setConfirmation("");
    try {
      if (mode === "reset-request") {
        const result = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: window.location.origin,
        });
        if (result.error) {
          setError(authFailureMessage(result.error));
          return;
        }
        setConfirmation("If an account exists for this email address, a password-reset email has been sent.");
        return;
      }
      if (mode === "reset-password") {
        if (password !== passwordConfirmation) {
          setError("The passwords do not match.");
          return;
        }
        const result = await authClient.resetPassword({
          newPassword: password,
          token: initialResetToken,
        });
        if (result.error) {
          setError(authFailureMessage(result.error));
          return;
        }
        window.history.replaceState({}, "", window.location.pathname);
        setConfirmation("Your password has been updated. Sign in with the new password.");
        setMode("sign-in");
        setPassword("");
        setPasswordConfirmation("");
        return;
      }
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              name: name.trim(),
              email: email.trim(),
              password,
            })
          : await authClient.signIn.email({
              email: email.trim(),
              password,
              rememberMe: true,
            });
      if (result.error) {
        setError(result.error.message || "Authentication failed. Try again.");
        return;
      }
      const session = await authClient.getSession();
      if (!session.data?.session) {
        setConfirmation(
          "Account created. Check your email if verification is required, then sign in.",
        );
        setMode("sign-in");
        setPassword("");
        return;
      }
      await onAuthenticated();
    } catch (e) {
      console.error("Authentication flow failed", authFailureDiagnostic(e));
      setError(authFailureMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (!authClient) return;
    setBusy(true);
    setError("");
    setConfirmation("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.origin,
      });
      if (result.error) setError(authFailureMessage(result.error));
    } catch (e) {
      console.error("Google authentication flow failed", authFailureDiagnostic(e));
      setError(authFailureMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError("");
    setConfirmation("");
    setPassword("");
    setPasswordConfirmation("");
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <p className="eyebrow">Account access</p>
        <h2>{heading}</h2>
        <p>
          {mode === "sign-in"
            ? "Sign in to continue to your accounts workspace."
            : mode === "sign-up"
              ? "Use your work email to create a secure Ledgerly account."
              : mode === "reset-request"
                ? "Enter your account email and we will send a secure reset link."
                : "Enter and confirm your new password."}
        </p>
        {confirmation && (
          <MessageBar intent="success"><MessageBarBody>{confirmation}</MessageBarBody></MessageBar>
        )}
        {error && (
          <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
        )}
        <form className="fluent-auth-form" onSubmit={submit}>
          {mode === "sign-up" && (
            <Field label="Full name" required>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </Field>
          )}
          {mode !== "reset-password" && (
            <Field label="Email address" required>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                required
              />
            </Field>
          )}
          {mode !== "reset-request" && (
            <Field
              label={mode === "reset-password" ? "New password" : "Password"}
              hint="At least 8 characters"
              required
            >
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              minLength={8}
              required
            />
            </Field>
          )}
          {mode === "reset-password" && (
            <Field label="Confirm new password" required>
              <Input
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
          )}
          <FluentButton appearance="primary" type="submit" className="auth-submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "sign-in"
                ? "Sign in"
                : mode === "sign-up"
                  ? "Create account"
                  : mode === "reset-request"
                    ? "Send reset link"
                    : "Update password"}
          </FluentButton>
        </form>
        {(mode === "sign-in" || mode === "sign-up") && (
          <FluentButton
            type="button"
            className="auth-submit"
            disabled={busy}
            onClick={signInWithGoogle}
          >
            Continue with Google
          </FluentButton>
        )}
        {mode === "sign-in" && (
          <div className="auth-switch">
            <FluentButton appearance="transparent" type="button" onClick={() => switchMode("reset-request")}>
              Forgot your password?
            </FluentButton>
          </div>
        )}
        <div className="auth-switch">
          <span>
            {mode === "sign-in" ? "New to Ledgerly?" : "Return to sign in"}
          </span>
          <FluentButton
            appearance="transparent"
            type="button"
            onClick={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          >
            {mode === "sign-in" ? "Create an account" : "Sign in"}
          </FluentButton>
        </div>
      </div>
    </AuthFrame>
  );
}

function DataView({
  lines,
  debit,
  credit,
  fileRef,
  chooseFile,
  openImport,
}: {
  lines: TrialBalanceLine[];
  debit: number;
  credit: number;
  fileRef: React.RefObject<HTMLInputElement | null>;
  chooseFile: (file?: File) => void;
  openImport: () => void;
}) {
  return (
    <>
      <div className="metrics">
        <div>
          <span>Total debits</span>
          <b>{money(debit)}</b>
        </div>
        <div>
          <span>Total credits</span>
          <b>{money(credit)}</b>
        </div>
        <div>
          <span>Difference</span>
          <b
            className={Math.abs(debit - credit) > 0.005 ? "danger" : "success"}
          >
            {money(debit - credit)}
          </b>
        </div>
        <div>
          <span>Source accounts</span>
          <b>{lines.length}</b>
        </div>
      </div>
      <section className="panel">
        <PanelHead
          eyebrow="Data"
          heading="Trial balance"
          body="The latest committed source balances for this period."
        >
          <FluentButton appearance="primary" type="button" onClick={openImport}>
            Import trial balance
          </FluentButton>
          <input
            hidden
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose trial balance CSV"
            onChange={(e) => {
              chooseFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </PanelHead>
        {!lines.length ? (
          <Empty
            heading="No trial balance imported"
            body="Import a CSV with account code, account name, debit and credit columns."
          >
            <FluentButton appearance="primary" type="button" onClick={openImport}>
              Choose CSV file
            </FluentButton>
          </Empty>
        ) : (
          <div className="table-wrap">
            <Table size="small" aria-label="Trial balance">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Account</TableHeaderCell>
                  <TableHeaderCell>Account name</TableHeaderCell>
                  <TableHeaderCell className="number">Debit</TableHeaderCell>
                  <TableHeaderCell className="number">Credit</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.account_code}>
                    <TableCell className="mono">{line.account_code}</TableCell>
                    <TableCell>
                      <b>{line.account_name}</b>
                    </TableCell>
                    <TableCell className="number">
                      {Number(line.debit) ? money(Number(line.debit)) : "—"}
                    </TableCell>
                    <TableCell className="number">
                      {Number(line.credit) ? money(Number(line.credit)) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge {...statusBadgeProps(isMappedTrialBalanceLine(line) ? "COMPLETE" : "WARNING")}>
                        {isMappedTrialBalanceLine(line)
                          ? "Mapped"
                          : "Needs mapping"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="control-total-row">
                  <TableCell colSpan={2}>Control total</TableCell>
                  <TableCell className="number">{money(debit)}</TableCell>
                  <TableCell className="number">{money(credit)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
function PanelHead({
  eyebrow,
  heading,
  body,
  children,
}: React.PropsWithChildren<{
  eyebrow: string;
  heading: string;
  body: string;
}>) {
  return (
    <div className="panel-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{heading}</h2>
        <small>{body}</small>
      </div>
      {children}
    </div>
  );
}
function MappingView({
  lines,
  options,
  mapped,
  unmapped,
  saving,
  onSave,
  taxonomyError,
  onRetryTaxonomy,
}: {
  lines: TrialBalanceLine[];
  options: string[][];
  mapped: number;
  unmapped: number;
  saving: string;
  onSave: (line: TrialBalanceLine, code: string) => void;
  taxonomyError: string;
  onRetryTaxonomy: () => void;
}) {
  return (
    <div className="mapping-layout">
      <section className="panel">
        <PanelHead
          eyebrow="Classification"
          heading="Account mapping"
          body="Connect each source account to the reporting taxonomy."
        >
          <Badge {...statusBadgeProps(unmapped || !lines.length ? "PENDING" : "COMPLETE")}>
            {mappingSummaryLabel(lines.length, unmapped)}
          </Badge>
        </PanelHead>
        {taxonomyError && (
          <PanelError
            heading="Canonical accounts unavailable"
            message={taxonomyError}
            onRetry={onRetryTaxonomy}
          />
        )}
        {!lines.length ? (
          <Empty
            heading="Nothing to map"
            body="Import a trial balance before mapping source accounts."
          />
        ) : (
          <div className="table-wrap">
            <Table size="small" aria-label="Account mapping">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Source account</TableHeaderCell>
                  <TableHeaderCell className="number">Balance</TableHeaderCell>
                  <TableHeaderCell>Canonical account</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.account_code}>
                    <TableCell>
                      <small className="mono">{line.account_code}</small>
                      <b className="block">{line.account_name}</b>
                    </TableCell>
                    <TableCell className="number">{money(amount(line))}</TableCell>
                    <TableCell>
                      <Select
                        aria-label={`Canonical account for ${line.account_code} ${line.account_name}`}
                        className={
                          !line.canonical_account_id ? "select-warning" : ""
                        }
                        value={line.canonical_account_id || ""}
                        disabled={
                          Boolean(taxonomyError) || saving === line.account_code
                        }
                        onChange={(e) => onSave(line, e.target.value)}
                      >
                        <option value="">Select canonical account…</option>
                        {line.canonical_account_id &&
                          !options.some(
                            ([id]) => id === line.canonical_account_id,
                          ) && (
                            <option value={line.canonical_account_id}>
                              {line.canonical_code} · {line.canonical_name}
                            </option>
                          )}
                        {options.map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <aside className="guidance">
        <i aria-hidden="true">i</i>
        <h3>Mapping control</h3>
        <p>
          Every source account must be mapped before this period can move to
          review.
        </p>
        <dl>
          <div>
            <dt>Mapped</dt>
            <dd>{mapped}</dd>
          </div>
          <div>
            <dt>Unmapped</dt>
            <dd>{unmapped}</dd>
          </div>
        </dl>
        <small>Changes are recorded in the immutable engagement history.</small>
      </aside>
    </div>
  );
}

const statementLabels: Record<string, string> = {
  SOFA: "Statement of financial activities (incorporating an income and expenditure account)",
  IS: "Income statement",
  PNL: "Profit and loss account",
  BS: "Balance sheet",
  SFP: "Statement of financial position",
  CASH_FLOW: "Cash flow statement",
  CF: "Cash flow statement",
};
type AccountsNarrativeEdit = {
  kind: "working-paper" | "disclosure";
  code: string;
  title: string;
  field: string;
  value: string;
  recordId?: string;
  content: Record<string, unknown>;
};
function AccountsView({
  context,
  engagement,
  lines,
  report,
  reportBalanced,
  error,
  onRetry,
  onOpenSource,
}: {
  context: ApiContext;
  engagement?: Engagement;
  lines: TrialBalanceLine[];
  report: ReportLine[];
  reportBalanced: boolean | null;
  error: string;
  onRetry: () => void;
  onOpenSource: () => void;
}) {
  const statements = [
    ...new Map(
      report.map((row) => [
        row.statement_code,
        report.filter((item) => item.statement_code === row.statement_code),
      ]),
    ).entries(),
  ];
  const [selectedDocument, setSelectedDocument] = useState("front-cover");
  const [inspector, setInspector] = useState<
    "review" | "provenance" | "edit"
  >("review");
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [outlineWidth, setOutlineWidth] = useState(248);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [workingPapers, setWorkingPapers] = useState<WorkingPaper[]>([]);
  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [permanentFile, setPermanentFile] =
    useState<OrganisationPermanentFile | null>(null);
  const [latestAccountsVersion, setLatestAccountsVersion] =
    useState<AccountsVersion | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<"pdf" | "docx" | "">("");
  const [downloadError, setDownloadError] = useState("");
  const [editingNarrative, setEditingNarrative] =
    useState<AccountsNarrativeEdit | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [mobilePanel, setMobilePanel] = useState<
    "outline" | "inspector" | null
  >(null);
  const startPaneResize = useCallback(
    (
      pane: "outline" | "inspector",
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = pane === "outline" ? outlineWidth : inspectorWidth;
      const move = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const next =
          pane === "outline" ? startWidth + delta : startWidth - delta;
        const bounded = Math.min(440, Math.max(200, next));
        if (pane === "outline") setOutlineWidth(bounded);
        else setInspectorWidth(bounded);
      };
      const stop = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", stop);
        document.body.classList.remove("resizing-builder-pane");
      };
      document.body.classList.add("resizing-builder-pane");
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", stop, { once: true });
    },
    [inspectorWidth, outlineWidth],
  );
  const resizePaneFromKeyboard = useCallback(
    (
      pane: "outline" | "inspector",
      event: React.KeyboardEvent<HTMLDivElement>,
    ) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const change = pane === "outline" ? direction * 16 : direction * -16;
      if (pane === "outline") {
        setOutlineWidth((width) => Math.min(440, Math.max(200, width + change)));
      } else {
        setInspectorWidth((width) =>
          Math.min(440, Math.max(200, width + change)),
        );
      }
    },
    [],
  );
  useEffect(() => {
    if (!engagement?.id) return;
    let current = true;
    Promise.all([
      api.workingPapers(context, engagement.id),
      api.disclosures(context, engagement.id),
      api.accountsVersions(context, engagement.id),
    ])
      .then(([paperResult, disclosureResult, versionResult]) => {
        if (!current) return;
        setWorkingPapers(paperResult.items);
        setDisclosures(disclosureResult.items);
        setLatestAccountsVersion(
          [...versionResult.items]
            .filter((item) => item.status !== "SUPERSEDED")
            .sort((left, right) => right.version - left.version)[0] || null,
        );
      })
      .catch(() => {
        if (current)
          setEditError(
            "Supporting narrative records could not be loaded. Try again before editing.",
          );
      });
    return () => {
      current = false;
    };
  }, [context, engagement?.id]);

  async function downloadAccountsPdf() {
    if (!engagement?.id || !latestAccountsVersion) {
      setDownloadError(
        "Generate an accounts version before downloading the accounts.",
      );
      return;
    }
    setDownloadBusy("pdf");
    setDownloadError("");
    try {
      const result = await api.generateAccountsPdf(
        context,
        engagement.id,
        latestAccountsVersion.id,
      );
      const blob = await api.accountsPdfBlob(
        context,
        result.item.downloadPath,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${(engagement.legal_name || "accounts").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${engagement.period_end}-v${latestAccountsVersion.version}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (downloadFailure) {
      setDownloadError(
        downloadFailure instanceof Error
          ? downloadFailure.message
          : "The accounts could not be downloaded.",
      );
    } finally {
      setDownloadBusy("");
    }
  }

  async function downloadAccountsDocx() {
    if (!engagement?.id || !latestAccountsVersion) {
      setDownloadError("Generate an accounts version before downloading the accounts.");
      return;
    }
    setDownloadBusy("docx");
    setDownloadError("");
    try {
      const result = await api.generateAccountsDocx(context, engagement.id, latestAccountsVersion.id);
      const blob = await api.accountsDocxBlob(context, result.item.downloadPath);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${(engagement.legal_name || "accounts").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${engagement.period_end}-v${latestAccountsVersion.version}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (downloadFailure) {
      setDownloadError(downloadFailure instanceof Error ? downloadFailure.message : "The Word accounts could not be downloaded.");
    } finally {
      setDownloadBusy("");
    }
  }

  useEffect(() => {
    if (!engagement?.organisation_id) return;
    let current = true;
    api.organisationPermanentFile(context, engagement.organisation_id)
      .then((result) => { if (current) setPermanentFile(result.item); })
      .catch(() => { if (current) setPermanentFile(null); });
    return () => { current = false; };
  }, [context, engagement?.organisation_id]);

  function workingPaperText(code: string, field: string, fallback: string) {
    const paper = workingPapers.find((item) => item.code === code);
    const value = paper?.content?.[field];
    return typeof value === "string" ? value : fallback;
  }

  function disclosureText(code: string, field: string, fallback: string) {
    const disclosure = disclosures.find(
      (item) => item.disclosure_code === code,
    );
    const value = disclosure?.answer?.[field];
    return typeof value === "string" ? value : fallback;
  }

  function beginWorkingPaperEdit(
    code: string,
    title: string,
    field: string,
    fallback: string,
  ) {
    const paper = workingPapers.find((item) => item.code === code);
    const value = workingPaperText(code, field, fallback);
    setEditingNarrative({
      kind: "working-paper",
      code,
      title,
      field,
      value,
      recordId: paper?.id,
      content: paper?.content || {},
    });
    setEditValue(value);
    setEditError("");
    setEditNotice("");
    setInspector("edit");
    setInspectorVisible(true);
    setMobilePanel("inspector");
  }

  function beginDisclosureEdit(
    code: string,
    title: string,
    field: string,
    fallback: string,
  ) {
    const disclosure = disclosures.find(
      (item) => item.disclosure_code === code,
    );
    const value = disclosureText(code, field, fallback);
    setEditingNarrative({
      kind: "disclosure",
      code,
      title,
      field,
      value,
      recordId: disclosure?.id,
      content: disclosure?.answer || {},
    });
    setEditValue(value);
    setEditError("");
    setEditNotice("");
    setInspector("edit");
    setInspectorVisible(true);
    setMobilePanel("inspector");
  }

  async function saveNarrative() {
    if (!editingNarrative || !engagement?.id || !editValue.trim()) return;
    setEditBusy(true);
    setEditError("");
    try {
      const content = {
        ...editingNarrative.content,
        [editingNarrative.field]: editValue.trim(),
      };
      if (editingNarrative.kind === "working-paper") {
        if (editingNarrative.recordId) {
          const result = await api.createWorkingPaperVersion(
            context,
            engagement.id,
            editingNarrative.recordId,
            content,
          );
          setWorkingPapers((items) =>
            items.map((item) =>
              item.id === editingNarrative.recordId
                ? {
                    ...item,
                    content,
                    current_version: result.item.version,
                  }
                : item,
            ),
          );
        } else {
          const result = await api.createWorkingPaper(context, engagement.id, {
            code: editingNarrative.code,
            title: editingNarrative.title,
            categoryCode: "REPORTING",
            objective: `Document and support ${editingNarrative.title.toLowerCase()}.`,
            content,
          });
          setWorkingPapers((items) => [
            ...items,
            {
              ...result.item,
              code: editingNarrative.code,
              title: editingNarrative.title,
              status: result.item.status || "IN_PROGRESS",
              current_version: result.item.current_version || 1,
              content,
            },
          ]);
        }
      } else if (editingNarrative.recordId) {
        const result = await api.createDisclosureVersion(
          context,
          engagement.id,
          editingNarrative.recordId,
          content,
        );
        setDisclosures((items) =>
          items.map((item) =>
            item.id === editingNarrative.recordId
              ? {
                  ...item,
                  answer: content,
                  current_version: result.item.version,
                  status: "OPEN",
                }
              : item,
          ),
        );
      } else {
        const result = await api.createDisclosure(context, engagement.id, {
          disclosureCode: editingNarrative.code,
          applicability: "REQUIRED",
          answer: content,
        });
        setDisclosures((items) => [
          ...items,
          {
            ...result.item,
            disclosure_code: editingNarrative.code,
            applicability: result.item.applicability || "REQUIRED",
            status: result.item.status || "OPEN",
            current_version: result.item.current_version || 1,
            answer: content,
          },
        ]);
      }
      setEditNotice("Saved as a new version. Existing approvals may require renewal.");
      setEditingNarrative(null);
      setInspector("review");
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "The change could not be saved.",
      );
    } finally {
      setEditBusy(false);
    }
  }
  const selectedStatement = statements.find(
    ([code]) => code === selectedDocument,
  );
  const grossIncome = report.reduce(
    (total, row) =>
      /income|donation|legac|grant/i.test(row.caption)
        ? total + Math.max(0, Number(row.balance) || 0)
        : total,
    0,
  );
  const inferredAssuranceRegime =
    engagement?.assurance_regime && engagement.assurance_regime !== "NOT_ASSESSED"
      ? engagement.assurance_regime
      : grossIncome > 1_500_000
        ? "STATUTORY_AUDIT"
        : grossIncome > 40_000
          ? "INDEPENDENT_EXAMINATION"
          : "NO_EXTERNAL_SCRUTINY";
  const assuranceLabel =
    inferredAssuranceRegime === "STATUTORY_AUDIT"
      ? "Independent auditor’s report"
      : inferredAssuranceRegime === "INDEPENDENT_EXAMINATION"
        ? "Independent examiner’s report"
        : "External scrutiny statement";
  const documentTitle = selectedStatement
    ? statementLabels[selectedStatement[0]] || title(selectedStatement[0])
    : selectedDocument === "front-cover"
      ? "Annual report and financial statements"
      : selectedDocument === "reference-details"
        ? "Reference and administrative details"
        : selectedDocument === "assurance-report"
          ? assuranceLabel
        : selectedDocument === "accounting-policies"
          ? "Notes to the financial statements"
          : "Trustees’ annual report";
  const accountingPolicySections = [
    {
      number: "1.1",
      code: "FRS102.1.2",
      title: "Basis of preparation",
      field: "narrative",
      fallback:
        "These draft accounts have been prepared under the historical cost convention, FRS 102 and the Charities SORP applicable to the reporting period.",
    },
    {
      number: "1.2",
      code: "SORP.GOING_CONCERN",
      title: "Going concern",
      field: "narrative",
      fallback:
        "The trustees have considered the charity’s forecasts and available resources and expect it to meet its liabilities as they fall due for at least twelve months from approval of the accounts.",
    },
    {
      number: "1.3",
      code: "SORP.FUNDS",
      title: "Fund accounting",
      field: "policy",
      fallback:
        "Unrestricted funds are available for the charity’s general purposes. Restricted funds are applied only to the purposes specified by the donor or funder.",
    },
    {
      number: "1.4",
      code: "SORP.INCOME_RECOGNITION",
      title: "Income recognition",
      field: "narrative",
      fallback:
        "Income is recognised when the charity has entitlement, receipt is probable and the amount can be measured reliably. Donated services are recognised when a reliable value is available.",
    },
    {
      number: "1.5",
      code: "SORP.EXPENDITURE",
      title: "Expenditure and irrecoverable VAT",
      field: "narrative",
      fallback:
        "Expenditure is recognised once there is a legal or constructive obligation, settlement is probable and the amount can be measured reliably. Irrecoverable VAT is charged with the related expenditure.",
    },
    {
      number: "1.6",
      code: "SORP.SUPPORT_COSTS",
      title: "Allocation of support costs",
      field: "narrative",
      fallback:
        "Support and governance costs are allocated to activities on a basis consistent with the use of resources. The allocation basis is reviewed for each reporting period.",
    },
    {
      number: "1.7",
      code: "SORP.FIXED_ASSETS",
      title: "Tangible fixed assets and depreciation",
      field: "narrative",
      fallback:
        "Tangible fixed assets are stated at cost less accumulated depreciation and impairment. Depreciation is charged over their estimated useful economic lives.",
    },
    {
      number: "1.8",
      code: "SORP.FINANCIAL_INSTRUMENTS",
      title: "Financial instruments",
      field: "narrative",
      fallback:
        "The charity holds only basic financial instruments. Debtors and creditors are initially recognised at transaction value and subsequently measured at amortised cost where material.",
    },
    {
      number: "1.9",
      code: "SORP.PENSIONS",
      title: "Pension costs",
      field: "narrative",
      fallback:
        "Contributions to defined contribution pension arrangements are charged to expenditure in the period in which they become payable.",
    },
  ];
  return (
    <section className="accounts-builder-shell">
      <PanelHead
        eyebrow="Draft accounts"
        heading="Statutory accounts document"
        body="Select a section from the outline. Narrative text can be edited; statement descriptions open their source mapping."
      >
        <div className="builder-pane-actions">
          <FluentButton
            appearance="primary"
            size="small"
            disabled={Boolean(downloadBusy) || !latestAccountsVersion}
            onClick={downloadAccountsPdf}
          >
            {downloadBusy === "pdf" ? "Preparing PDF…" : "Download PDF"}
          </FluentButton>
          <FluentButton
            appearance="secondary"
            size="small"
            disabled={Boolean(downloadBusy) || !latestAccountsVersion}
            onClick={downloadAccountsDocx}
          >
            {downloadBusy === "docx" ? "Preparing Word…" : "Download Word"}
          </FluentButton>
          <FluentButton
            className="pane-toggle"
            appearance="subtle"
            size="small"
            aria-pressed={outlineVisible}
            onClick={() => setOutlineVisible((visible) => !visible)}
          >
            Outline
          </FluentButton>
          <FluentButton
            className="pane-toggle"
            appearance="subtle"
            size="small"
            aria-pressed={inspectorVisible}
            onClick={() => setInspectorVisible((visible) => !visible)}
          >
            Review
          </FluentButton>
          <Badge appearance="outline" color="warning" size="small">
            Draft
          </Badge>
        </div>
      </PanelHead>
      {downloadError ? (
        <MessageBar intent="error">
          <MessageBarBody>{downloadError}</MessageBarBody>
        </MessageBar>
      ) : null}
      {error ? (
        <PanelError
          heading="Draft accounts unavailable"
          message={error}
          onRetry={onRetry}
        />
      ) : !report.length ? (
        <Empty
          heading="No reportable balances"
          body={
            lines.length
              ? "Map source accounts to populate the draft accounts."
              : "Import and map a trial balance to populate the draft accounts."
          }
        />
      ) : (
        <div
          className={`accounts-builder ${outlineVisible ? "" : "outline-collapsed"} ${inspectorVisible ? "" : "inspector-collapsed"}`}
          style={
            {
              "--outline-width": `${outlineWidth}px`,
              "--inspector-width": `${inspectorWidth}px`,
            } as React.CSSProperties
          }
        >
          <div className="builder-mobile-toolbar">
            <FluentButton
              className="builder-mobile-trigger"
              appearance="secondary"
              onClick={() => setMobilePanel("outline")}
            >
              Document outline
            </FluentButton>
            <FluentButton
              className="builder-mobile-trigger"
              appearance="secondary"
              onClick={() => setMobilePanel("inspector")}
            >
              Review inspector
            </FluentButton>
          </div>
          <aside
            className={`document-tree ${mobilePanel === "outline" ? "mobile-panel-open" : ""}`}
            aria-label="Accounts document sections"
          >
            <FluentButton
              className="mobile-panel-close"
              appearance="subtle"
              onClick={() => setMobilePanel(null)}
            >
              Close outline
            </FluentButton>
            <p className="eyebrow">Document</p>
            <Tree aria-label="Statutory accounts sections">
              <TreeItem itemType="leaf" value="front-cover">
                <TreeItemLayout onClick={() => { setSelectedDocument("front-cover"); setMobilePanel(null); }}>
                  01 · Cover
                </TreeItemLayout>
              </TreeItem>
              <TreeItem itemType="leaf" value="reference-details">
                <TreeItemLayout onClick={() => { setSelectedDocument("reference-details"); setMobilePanel(null); }}>
                  02 · Reference and administrative details
                </TreeItemLayout>
              </TreeItem>
              <TreeItem itemType="leaf" value="trustees-report">
                <TreeItemLayout
                  onClick={() => {
                    setSelectedDocument("trustees-report");
                    setMobilePanel(null);
                  }}
                >
                  03 · Trustees’ report
                </TreeItemLayout>
              </TreeItem>
              <TreeItem itemType="leaf" value="assurance-report">
                <TreeItemLayout
                  onClick={() => {
                    setSelectedDocument("assurance-report");
                    setMobilePanel(null);
                  }}
                >
                  04 · {assuranceLabel}
                </TreeItemLayout>
              </TreeItem>
              {statements.map(([statementCode], index) => (
                <TreeItem
                  itemType="leaf"
                  value={statementCode}
                  key={statementCode}
                >
                  <TreeItemLayout
                    onClick={() => {
                      setSelectedDocument(statementCode);
                      setMobilePanel(null);
                    }}
                  >
                    {String(index + 5).padStart(2, "0")} ·{" "}
                    {statementLabels[statementCode] || title(statementCode)}
                  </TreeItemLayout>
                </TreeItem>
              ))}
              <TreeItem itemType="leaf" value="accounting-policies">
                <TreeItemLayout
                  onClick={() => {
                    setSelectedDocument("accounting-policies");
                    setMobilePanel(null);
                  }}
                >
                  {String(statements.length + 5).padStart(2, "0")} · Accounting
                  policies
                </TreeItemLayout>
              </TreeItem>
            </Tree>
          </aside>
          {outlineVisible ? (
            <div
              className="builder-pane-resizer outline-resizer"
              role="separator"
              aria-label="Resize document outline"
              aria-orientation="vertical"
              aria-valuemin={200}
              aria-valuemax={440}
              aria-valuenow={outlineWidth}
              tabIndex={0}
              onPointerDown={(event) => startPaneResize("outline", event)}
              onKeyDown={(event) => resizePaneFromKeyboard("outline", event)}
            />
          ) : null}
          <main
            className="page-canvas"
            aria-label="Typeset accounts page preview"
          >
            <article className="statutory-page">
              {selectedDocument !== "front-cover" ? (
                <>
                  <header>
                    <p>{engagement?.legal_name}</p>
                    <small>Company and charity accounts · Draft</small>
                  </header>
                  <div className="page-rule" />
                </>
              ) : null}
              {![
                "accounting-policies",
                "front-cover",
                "reference-details",
                "assurance-report",
              ].includes(selectedDocument) ? (
                <>
                  <h2>{documentTitle}</h2>
                  <p className="page-period">
                    For the year ended{" "}
                    {engagement &&
                      formatDate(engagement.period_end, "Date unavailable")}
                  </p>
                </>
              ) : null}
              {selectedDocument === "front-cover" ? (
                <div className="accounts-cover-page">
                  <p className="accounts-cover-entity">{engagement?.legal_name}</p>
                  <h2>Annual report and financial statements</h2>
                  <p>For the year ended {engagement && formatDate(engagement.period_end, "Date unavailable")}</p>
                  {permanentFile?.organisation.companyRegistrationNumber && <p>Company number {permanentFile.organisation.companyRegistrationNumber}</p>}
                  {permanentFile?.organisation.charityRegistrationNumber && <p>Charity number {permanentFile.organisation.charityRegistrationNumber}</p>}
                  <strong>Unaudited draft</strong>
                </div>
              ) : selectedDocument === "reference-details" ? (
                <div className="reference-details-page">
                  <h2>Reference and administrative details</h2>
                  <dl>
                    <div><dt>Charity name</dt><dd>{engagement?.legal_name}</dd></div>
                    <div><dt>Company number</dt><dd>{permanentFile?.organisation.companyRegistrationNumber || "[company number]"}</dd></div>
                    <div><dt>Charity number</dt><dd>{permanentFile?.organisation.charityRegistrationNumber || "[charity number]"}</dd></div>
                    <div><dt>Registered office</dt><dd>{permanentFile?.organisation.registeredOfficeAddress ? [permanentFile.organisation.registeredOfficeAddress.line1, permanentFile.organisation.registeredOfficeAddress.line2, permanentFile.organisation.registeredOfficeAddress.locality, permanentFile.organisation.registeredOfficeAddress.region, permanentFile.organisation.registeredOfficeAddress.postalCode].filter(Boolean).join(", ") : "[registered office]"}</dd></div>
                    <div><dt>Trustees and directors</dt><dd>{permanentFile?.officers.filter((officer) => !officer.resignedOn && ["TRUSTEE", "DIRECTOR"].includes(officer.officerType)).map((officer) => officer.displayName).join("\n") || "[trustee names]"}</dd></div>
                    <div><dt>Company secretary</dt><dd>{permanentFile?.officers.find((officer) => !officer.resignedOn && officer.officerType === "COMPANY_SECRETARY")?.displayName || "[company secretary, if appointed]"}</dd></div>
                    {permanentFile?.advisers.filter((adviser) => adviser.status === "ACTIVE").map((adviser) => <div key={adviser.id}><dt>{title(adviser.adviserType)}</dt><dd>{adviser.firmName}{adviser.contactName ? `\n${adviser.contactName}` : ""}</dd></div>)}
                  </dl>
                </div>
              ) : selectedDocument === "assurance-report" ? (
                <div className="narrative-page assurance-report-page">
                  <p className="assurance-kicker">External scrutiny</p>
                  <h2>{assuranceLabel}</h2>
                  {inferredAssuranceRegime === "STATUTORY_AUDIT" ? (
                    <>
                      <p>To the members and trustees of {engagement?.legal_name}</p>
                      <h3>Opinion</h3>
                      <p className="document-placeholder">
                        [Insert the signed auditor’s report supplied by the appointed statutory auditor.]
                      </p>
                      <p>
                        This draft does not contain or imply an audit opinion. The signed report,
                        auditor’s name, registration details and report date must be attached before
                        an audited copy can be approved.
                      </p>
                    </>
                  ) : inferredAssuranceRegime === "INDEPENDENT_EXAMINATION" ? (
                    <>
                      <p>To the trustees of {engagement?.legal_name}</p>
                      <h3>Responsibilities and basis of report</h3>
                      <p>
                        I report to the trustees on my examination of the accounts for the year ended{" "}
                        {engagement && formatDate(engagement.period_end, "Date unavailable")}. The examination
                        is carried out in accordance with the applicable statutory directions for
                        independent examination.
                      </p>
                      <h3>Independent examiner’s statement</h3>
                      <p className="document-placeholder">
                        [Insert the independently approved examiner’s statement, including any matters
                        requiring attention.]
                      </p>
                      <dl className="assurance-signature-grid">
                        <div><dt>Examiner</dt><dd className="document-placeholder">[name]</dd></div>
                        <div><dt>Qualification</dt><dd className="document-placeholder">[professional qualification, where required]</dd></div>
                        <div><dt>Address</dt><dd className="document-placeholder">[address]</dd></div>
                        <div><dt>Date</dt><dd className="document-placeholder">[date]</dd></div>
                      </dl>
                    </>
                  ) : (
                    <>
                      <h3>Basis for no external scrutiny report</h3>
                      <p>
                        The current financial thresholds indicate that an audit or independent
                        examination report may not be required. This must still be checked against the
                        governing document, funder requirements and company-law elections.
                      </p>
                    </>
                  )}
                  <div className="assurance-warning">
                    Draft control: bracketed fields are unresolved. Approval and final output remain
                    blocked until the applicable signed report or exemption evidence is recorded.
                  </div>
                </div>
              ) : selectedStatement ? (
                <>
                  {selectedStatement[0] === "SOFA" ? (
                    <div className="statutory-review-note" role="note">
                      Fund classifications and comparative figures require
                      completion before approval.
                    </div>
                  ) : null}
                  <table
                    className={
                      selectedStatement[0] === "SOFA" ? "sorp-sofa" : undefined
                    }
                  >
                  {selectedStatement[0] === "SOFA" ? (
                    <colgroup>
                      <col className="sofa-description-column" />
                      <col className="sofa-note-column" />
                      <col className="sofa-fund-column" />
                      <col className="sofa-fund-column" />
                      <col className="sofa-fund-column" />
                      <col className="sofa-total-column" />
                      <col className="sofa-prior-column" />
                    </colgroup>
                  ) : null}
                  <thead>
                    {selectedStatement[0] === "SOFA" ? (
                      <>
                        <tr>
                          <th rowSpan={2}> </th>
                          <th rowSpan={2}>Note</th>
                          <th colSpan={4} className="number">
                            Current year
                          </th>
                          <th className="number">Prior year</th>
                        </tr>
                        <tr>
                          <th className="number">Unrestricted</th>
                          <th className="number">Restricted</th>
                          <th className="number">Endowment</th>
                          <th className="number">Total 2026</th>
                          <th className="number">Total 2025</th>
                        </tr>
                        <tr className="currency-row">
                          <th> </th>
                          <th> </th>
                          <th className="number">£</th>
                          <th className="number">£</th>
                          <th className="number">£</th>
                          <th className="number">£</th>
                          <th className="number">£</th>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <th> </th>
                        <th>Note</th>
                        <th className="number">
                          2026
                          <br />£
                        </th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {selectedStatement[1].map((row, index, rows) => {
                      const section = /donation|income/i.test(row.caption)
                        ? "Income and endowments from:"
                        : /expenditure/i.test(row.caption)
                          ? "Expenditure on:"
                          : "";
                      const previousSection = index
                        ? /donation|income/i.test(rows[index - 1].caption)
                          ? "Income and endowments from:"
                          : /expenditure/i.test(rows[index - 1].caption)
                            ? "Expenditure on:"
                            : ""
                        : "";
                      return (
                        <React.Fragment key={row.code}>
                          {selectedStatement[0] === "SOFA" &&
                          section &&
                          section !== previousSection ? (
                            <tr className="statement-section-row">
                              <th colSpan={7}>{section}</th>
                            </tr>
                          ) : null}
                          <tr>
                            <td>
                              <FluentButton
                                appearance="transparent"
                                size="small"
                                className="statement-source-link"
                                title={`Open source mapping for ${row.caption}`}
                                onClick={onOpenSource}
                              >
                                {row.caption}
                              </FluentButton>
                            </td>
                            <td>—</td>
                            {selectedStatement[0] === "SOFA" ? (
                              <>
                                <td className="number">
                                  {row.fund_balances
                                    ? statementFigure(row.fund_balances.unrestricted)
                                    : "—"}
                                </td>
                                <td className="number">
                                  {row.fund_balances
                                    ? statementFigure(row.fund_balances.restricted)
                                    : "—"}
                                </td>
                                <td className="number">
                                  {row.fund_balances?.endowment
                                    ? statementFigure(row.fund_balances.endowment)
                                    : "—"}
                                </td>
                                <td className="number">
                                  {statementFigure(row.balance)}
                                </td>
                                <td className="number">
                                  {row.comparative_balance !== undefined
                                    ? statementFigure(row.comparative_balance)
                                    : "—"}
                                </td>
                              </>
                            ) : (
                              <td className="number">
                                {statementFigure(row.balance)}
                              </td>
                            )}
                          </tr>
                        </React.Fragment>
                      );
                    })}
                    {selectedStatement[0] === "SOFA" ? (
                      <>
                        <tr className="statement-section-row">
                          <th colSpan={7}>Reconciliation of funds</th>
                        </tr>
                        {[
                          "Total funds brought forward",
                          "Total funds carried forward",
                        ].map((caption) => (
                          <tr key={caption}>
                            <td>{caption}</td>
                            <td>—</td>
                            <td className="number review-required">—</td>
                            <td className="number review-required">—</td>
                            <td className="number review-required">—</td>
                            <td className="number review-required">—</td>
                            <td className="number review-required">—</td>
                          </tr>
                        ))}
                      </>
                    ) : null}
                  </tbody>
                  </table>
                </>
              ) : selectedDocument === "accounting-policies" ? (
                demoMode ? (
                  <div className="narrative-page accounting-note">
                    <header className="note-heading">
                      <span>1</span>
                      <h3>Accounting policies</h3>
                    </header>
                    {accountingPolicySections.map((policy) => (
                      <section className="note-section" key={policy.code}>
                        <h4>
                          <span>{policy.number}</span> {policy.title}
                        </h4>
                        <FluentButton
                          appearance="transparent"
                          className="editable-narrative"
                          onClick={() =>
                            beginDisclosureEdit(
                              policy.code,
                              policy.title,
                              policy.field,
                              policy.fallback,
                            )
                          }
                        >
                          {disclosureText(
                            policy.code,
                            policy.field,
                            policy.fallback,
                          )}
                          <span className="edit-cue">Edit</span>
                        </FluentButton>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="narrative-page">
                    <h3>Accounting policies require completion</h3>
                    <p>
                      No policy wording is generated automatically. Complete and
                      review the applicable versioned disclosures before
                      producing accounts for approval.
                    </p>
                  </div>
                )
              ) : demoMode ? (
                <div className="narrative-page">
                  <h3>Objectives and activities</h3>
                  <FluentButton
                    appearance="transparent"
                    className="editable-narrative"
                    onClick={() =>
                      beginWorkingPaperEdit(
                        "TRUSTEES_REPORT.OBJECTIVES",
                        "Trustees' report — objectives and activities",
                        "narrative",
                        "Northstar provides food support, mentoring and employability programmes in Bristol and neighbouring authorities.",
                      )
                    }
                  >
                    {workingPaperText(
                      "TRUSTEES_REPORT.OBJECTIVES",
                      "narrative",
                      "Northstar provides food support, mentoring and employability programmes in Bristol and neighbouring authorities.",
                    )}
                    <span className="edit-cue">Edit</span>
                  </FluentButton>
                  <h3>Achievements and performance</h3>
                  <FluentButton
                    appearance="transparent"
                    className="editable-narrative"
                    onClick={() =>
                      beginWorkingPaperEdit(
                        "TRUSTEES_REPORT.PERFORMANCE",
                        "Trustees' report — achievements and performance",
                        "narrative",
                        "During 2026 the charity supported 1,420 households and provided structured mentoring to 286 young people. Of those completing the employability programme, 81% progressed to education, training, volunteering or employment.",
                      )
                    }
                  >
                    {workingPaperText(
                      "TRUSTEES_REPORT.PERFORMANCE",
                      "narrative",
                      "During 2026 the charity supported 1,420 households and provided structured mentoring to 286 young people. Of those completing the employability programme, 81% progressed to education, training, volunteering or employment.",
                    )}
                    <span className="edit-cue">Edit</span>
                  </FluentButton>
                  <h3>Financial review</h3>
                  <FluentButton
                    appearance="transparent"
                    className="editable-narrative"
                    onClick={() =>
                      beginWorkingPaperEdit(
                        "TRUSTEES_REPORT.FINANCIAL_REVIEW",
                        "Trustees' report — financial review",
                        "narrative",
                        "Total income was £750,000 and expenditure was £681,000, giving net income of £69,000. Closing cash was £348,000. The trustees review unrestricted reserves quarterly against the approved operating budget.",
                      )
                    }
                  >
                    {workingPaperText(
                      "TRUSTEES_REPORT.FINANCIAL_REVIEW",
                      "narrative",
                      "Total income was £750,000 and expenditure was £681,000, giving net income of £69,000. Closing cash was £348,000. The trustees review unrestricted reserves quarterly against the approved operating budget.",
                    )}
                    <span className="edit-cue">Edit</span>
                  </FluentButton>
                </div>
              ) : (
                <div className="narrative-page">
                  <h3>Trustees&apos; report requires completion</h3>
                  <p>
                    No trustees&apos; report narrative is generated
                    automatically. Complete the versioned objectives, public
                    benefit, achievements, financial review, reserves and risk
                    disclosures before approval.
                  </p>
                </div>
              )}
              <footer>
                <span>{engagement?.legal_name}</span>
                <b>
                  {selectedDocument === "front-cover"
                    ? ""
                    : selectedDocument === "reference-details"
                      ? 1
                      : selectedDocument === "trustees-report"
                        ? 2
                        : selectedDocument === "assurance-report"
                          ? 3
                    : statements.findIndex(
                        ([code]) => code === selectedDocument,
                      ) + 4}
                </b>
              </footer>
            </article>
          </main>
          {inspectorVisible ? (
            <div
              className="builder-pane-resizer inspector-resizer"
              role="separator"
              aria-label="Resize review pane"
              aria-orientation="vertical"
              aria-valuemin={200}
              aria-valuemax={440}
              aria-valuenow={inspectorWidth}
              tabIndex={0}
              onPointerDown={(event) => startPaneResize("inspector", event)}
              onKeyDown={(event) => resizePaneFromKeyboard("inspector", event)}
            />
          ) : null}
          <aside
            className={`accounts-inspector ${mobilePanel === "inspector" ? "mobile-panel-open" : ""}`}
          >
            <FluentButton
              className="mobile-panel-close"
              appearance="subtle"
              onClick={() => setMobilePanel(null)}
            >
              Close inspector
            </FluentButton>
            <TabList
              className="inspector-tabs"
              size="small"
              selectedValue={inspector}
              onTabSelect={(_, data) =>
                setInspector(data.value as "review" | "provenance" | "edit")
              }
              aria-label="Accounts inspector"
            >
              <Tab value="review">Review</Tab>
              <Tab value="provenance">Provenance</Tab>
              {editingNarrative ? <Tab value="edit">Edit</Tab> : null}
            </TabList>
            {inspector === "review" ? (
              <>
                {editNotice ? (
                  <MessageBar intent="success">
                    <MessageBarBody>{editNotice}</MessageBarBody>
                  </MessageBar>
                ) : null}
                <div className="inspector-summary attention" role="status">
                  <WarningRegular aria-hidden="true" />
                  <span>Comparatives and fund analysis require review</span>
                </div>
                <dl>
                  <div>
                    <dt>Document status</dt>
                    <dd>Unaudited draft</dd>
                  </div>
                  <div>
                    <dt>Mapping</dt>
                    <dd>
                      {lines.filter((line) => line.canonical_account_id).length}
                      /{lines.length} accounts
                    </dd>
                  </div>
                  <div>
                    <dt>Rounding</dt>
                    <dd>{reportBalanceLabel(reportBalanced)}</dd>
                  </div>
                </dl>
                <Field
                  className="accounts-inspector-field"
                  label="Review note"
                  size="small"
                >
                  <Textarea
                    id="review-note"
                    resize="vertical"
                    rows={3}
                    placeholder="Add a point for the preparer"
                  />
                </Field>
                <FluentButton
                  type="button"
                  appearance="secondary"
                  size="small"
                  className="inspector-action"
                >
                  Raise review point
                </FluentButton>
              </>
            ) : inspector === "provenance" ? (
              <>
                <p className="inspector-copy">
                  Every figure remains linked to its canonical account and
                  imported source.
                </p>
                <dl>
                  <div>
                    <dt>Engagement version</dt>
                    <dd>{engagement?.version}</dd>
                  </div>
                  <div>
                    <dt>Report lines</dt>
                    <dd>{selectedStatement?.[1].length || "Narrative"}</dd>
                  </div>
                  <div>
                    <dt>Source accounts</dt>
                    <dd>
                      {selectedStatement?.[1].reduce(
                        (sum, row) => sum + row.source_account_ids.length,
                        0,
                      ) || "Policy source"}
                    </dd>
                  </div>
                  <div>
                    <dt>Framework</dt>
                    <dd>{title(engagement?.framework || "")}</dd>
                  </div>
                </dl>
                <p className="mono inspector-hash">
                  Provenance retained by the reporting service
                </p>
              </>
            ) : editingNarrative ? (
              <form
                className="document-edit-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveNarrative();
                }}
              >
                <div>
                  <p className="eyebrow">
                    {editingNarrative.kind === "disclosure"
                      ? "Disclosure"
                      : "Trustees’ report"}
                  </p>
                  <h3>{editingNarrative.title}</h3>
                  <small>
                    Saving creates a new version and reopens any affected
                    approval.
                  </small>
                </div>
                <Field label="Narrative" required>
                  <Textarea
                    value={editValue}
                    onChange={(event) => setEditValue(event.target.value)}
                    resize="vertical"
                    rows={12}
                    maxLength={10000}
                    autoFocus
                  />
                </Field>
                {editError ? (
                  <MessageBar intent="error">
                    <MessageBarBody>{editError}</MessageBarBody>
                  </MessageBar>
                ) : null}
                <div className="document-edit-actions">
                  <FluentButton
                    type="submit"
                    appearance="primary"
                    size="small"
                    disabled={editBusy || !editValue.trim()}
                  >
                    {editBusy ? "Saving…" : "Save new version"}
                  </FluentButton>
                  <FluentButton
                    type="button"
                    appearance="secondary"
                    size="small"
                    disabled={editBusy}
                    onClick={() => {
                      setEditingNarrative(null);
                      setInspector("review");
                      setEditError("");
                    }}
                  >
                    Cancel
                  </FluentButton>
                </div>
              </form>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}
function PanelError({
  heading,
  message,
  onRetry,
}: {
  heading: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <MessageBar className="panel-error" intent="error">
      <MessageBarBody>
        <b>{heading}</b> {message}
      </MessageBarBody>
      <MessageBarActions>
        <FluentButton appearance="transparent" onClick={onRetry}>
          Retry
        </FluentButton>
      </MessageBarActions>
    </MessageBar>
  );
}
function HistoryView({
  events,
  error,
  onRefresh,
}: {
  events: AuditEvent[];
  error: string;
  onRefresh: () => void;
}) {
  return (
    <section className="panel">
      <PanelHead
        eyebrow="Audit trail"
        heading="Engagement history"
        body="An immutable record of material activity."
      >
        <FluentButton type="button" onClick={onRefresh}>
          Refresh
        </FluentButton>
      </PanelHead>
      {error ? (
        <PanelError
          heading="History unavailable"
          message={error}
          onRetry={onRefresh}
        />
      ) : !events.length ? (
        <Empty
          heading="No history recorded"
          body="Import and mapping activity will appear here when it is committed."
        />
      ) : (
        <ol className="timeline">
          {events.map((event) => (
            <li key={event.event_id}>
              <span className="timeline-marker" aria-hidden="true" />
              <div className="timeline-content">
                <b>{title(event.event_type)}</b>
                <p>
                  {event.reason ||
                    `${title(event.object_type)} activity recorded`}
                </p>
                <small>Recorded by {actorDisplayLabel(event.actor_id)}</small>
              </div>
              <time dateTime={event.occurred_at_utc}>
                {formatDateTime(event.occurred_at_utc)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
