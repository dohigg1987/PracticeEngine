import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  createTableColumn,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  useRestoreFocusTarget,
} from "@fluentui/react-components";
import type { TableColumnDefinition, TableColumnSizingOptions } from "@fluentui/react-components";
import { OpenRegular } from "@fluentui/react-icons";
import {
  api,
  type ApiContext,
  type PortalContact,
  type PracticeReview,
  type PracticeWorkItem,
  type PracticeWorkStage,
  type PracticeWorkStatus,
  type ResourceProfile,
} from "./api";
import {
  CommandBar,
  CompactFilterBar,
  EmptyState,
  ErrorState,
  LoadingState,
  MasterDetailWorkspace,
  OperationalDataGrid,
  PageHeader,
  PageShell,
  SavedViewBar,
  StatusTreatment,
  WorkingInspector,
} from "./CanonicalPatterns";
import { formatDate } from "./displayFormat";
import { statutoryLabel } from "./format";
import CreatePracticeWorkDialog from "./CreatePracticeWorkDialog";
import "./practice-work-workspace.css";

const workColumnSizing: TableColumnSizingOptions = {
  work: { minWidth: 160, idealWidth: 260 },
  due: { minWidth: 92, idealWidth: 104 },
  owner: { minWidth: 96, idealWidth: 132 },
  status: { minWidth: 104, idealWidth: 124 },
  priority: { minWidth: 72, idealWidth: 84 },
};

export type WorkSavedView = "my" | "all" | "this-week" | "due-soon" | "overdue" | "waiting-client" | "review";

export type WorkDetail = PracticeWorkItem & { stages?: PracticeWorkStage[]; reviews?: PracticeReview[] };

type Props = {
  context: ApiContext;
  routeSearch?: string;
  onNavigate?: (path: string, replace?: boolean) => void;
  onOpenClient?: (id: string) => void;
  onOpenLedgerly?: (engagementId: string, clientId: string) => void;
  onOpenWork?: (id: string) => void;
};

const statusOptions: PracticeWorkStatus[] = ["not_started", "ready", "in_progress", "waiting_on_client", "waiting_internal", "review", "completed", "cancelled"];
const date = (value?: string | null) => formatDate(value, "Not set");
const errorText = (value: unknown) => value instanceof Error ? value.message : "The request could not be completed.";
const internalIdentity = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|[^\s]+\|[^\s]+|[A-Za-z0-9_-]{24,})$/i;
const safeAssignmentName = (value?: string | null) => { const name = value?.trim() || ""; return name && !internalIdentity.test(name) ? name : ""; };
const assignmentDisplay = (item: PracticeWorkItem) => safeAssignmentName(item.assigned_member_name) || (item.assigned_member_id ? "Assigned" : "") || safeAssignmentName(item.assigned_team_name) || (item.assigned_team_id ? "Assigned team" : "") || "Unassigned";
const isOverdue = (value?: string | null, status?: PracticeWorkStatus, today = new Date()) => Boolean(value && status !== "completed" && status !== "cancelled" && new Date(`${value}T23:59:59`) < today);
const filterWork = (items: PracticeWorkItem[], state: ReturnType<typeof workWorkspaceState>) => {
  const term = state.query.trim().toLowerCase();
  return items.filter((item) =>
    (!term || [item.client_name, item.service_name, item.title, item.period_reference, item.assigned_member_name, item.assigned_team_name].some((value) => value?.toLowerCase().includes(term))) &&
    (!state.status || item.status === state.status) && (!state.priority || item.priority === state.priority) &&
    (!state.client || item.client_id === state.client) && (!state.service || item.client_service_id === state.service) &&
    (!state.assignee || (state.assignee === "unassigned" ? !item.assigned_member_id : item.assigned_member_id === state.assignee)) &&
    (!state.team || (state.team === "unassigned" ? !item.assigned_team_id : item.assigned_team_id === state.team || item.assigned_team_name === state.team)));
};

export function workWorkspaceState(search = "") {
  const parameters = new URLSearchParams(search);
  const requestedView = parameters.get("view") || (parameters.get("due") === "overdue" ? "overdue" : parameters.get("due") === "this-week" ? "this-week" : "all");
  return {
    view: (["my", "all", "this-week", "due-soon", "overdue", "waiting-client", "review"].includes(requestedView) ? requestedView : "all") as WorkSavedView,
    query: parameters.get("q") || "",
    status: statusOptions.includes(parameters.get("status") as PracticeWorkStatus) ? parameters.get("status")! : "",
    priority: ["urgent", "high", "normal", "low"].includes(parameters.get("priority") || "") ? parameters.get("priority")! : "",
    client: parameters.get("client") || "",
    service: parameters.get("service") || "",
    assignee: parameters.get("assignee") || "",
    team: parameters.get("team") || "",
    sort: ["due", "client", "title"].includes(parameters.get("sort") || "") ? parameters.get("sort")! : "due",
    selected: parameters.get("selected") || "",
  };
}

export function workViewItems(items: PracticeWorkItem[], view: WorkSavedView, now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const dueSoonEnd = new Date(now); dueSoonEnd.setHours(23, 59, 59, 999); dueSoonEnd.setDate(dueSoonEnd.getDate() + (view === "this-week" ? 6 - ((now.getDay() + 6) % 7) : 7));
  return items.filter((item) => {
    if (view === "all") return true;
    if (view === "my") return Boolean(item.assigned_member_id || safeAssignmentName(item.assigned_member_name));
    if (view === "overdue") return isOverdue(item.due_date, item.status, now);
    if (view === "waiting-client") return item.status === "waiting_on_client";
    if (view === "review") return item.status === "review";
    return Boolean(item.due_date && !["completed", "cancelled"].includes(item.status) && new Date(`${item.due_date}T23:59:59`) >= start && new Date(`${item.due_date}T23:59:59`) <= dueSoonEnd);
  });
}

function selectedWorkPath(search: string | undefined, changes: Record<string, string>) {
  const parameters = new URLSearchParams(search || "");
  for (const [key, value] of Object.entries(changes)) value ? parameters.set(key, value) : parameters.delete(key);
  const query = parameters.toString();
  return `/practice/work${query ? `?${query}` : ""}`;
}

const columns: TableColumnDefinition<PracticeWorkItem>[] = [
  createTableColumn({ columnId: "work", compare: (a, b) => a.title.localeCompare(b.title), renderHeaderCell: () => "Work", renderCell: (item) => <span className="pww-primary"><strong>{item.title}</strong><small>{item.client_name || "Client"} · {item.service_name || "Service"}</small></span> }),
  createTableColumn({ columnId: "due", compare: (a, b) => (a.due_date || "").localeCompare(b.due_date || ""), renderHeaderCell: () => "Due", renderCell: (item) => <span className={isOverdue(item.due_date, item.status) ? "pww-overdue" : undefined}>{date(item.due_date)}</span> }),
  createTableColumn({ columnId: "owner", compare: (a, b) => assignmentDisplay(a).localeCompare(assignmentDisplay(b)), renderHeaderCell: () => "Owner", renderCell: assignmentDisplay }),
  createTableColumn({ columnId: "status", compare: (a, b) => a.status.localeCompare(b.status), renderHeaderCell: () => "State", renderCell: (item) => <StatusTreatment value={item.status} /> }),
  createTableColumn({ columnId: "priority", compare: (a, b) => ["urgent", "high", "normal", "low"].indexOf(a.priority) - ["urgent", "high", "normal", "low"].indexOf(b.priority), renderHeaderCell: () => "Priority", renderCell: (item) => statutoryLabel(item.priority) }),
];

export default function PracticeWorkWorkspace({ context, routeSearch, onNavigate, onOpenClient, onOpenLedgerly, onOpenWork }: Props) {
  const urlState = useMemo(() => workWorkspaceState(routeSearch), [routeSearch]);
  const [items, setItems] = useState<PracticeWorkItem[]>([]);
  const [resources, setResources] = useState<ResourceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moreFilters, setMoreFilters] = useState(false);
  const [addingWork, setAddingWork] = useState(false);
  const addWorkFocusTarget = useRestoreFocusTarget();
  const [detail, setDetail] = useState<WorkDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailRevision, setDetailRevision] = useState(0);
  const selectedRef = useRef(urlState.selected);
  selectedRef.current = urlState.selected;
  const detailRequest = useRef(0);
  const loaded = useRef(false);
  const listRequest = useRef(0);
  const [resourceError, setResourceError] = useState("");
  const load = useCallback(async () => {
    const request = ++listRequest.current;
    if (!loaded.current) setLoading(true);
    setError(""); setResourceError("");
    const [work, people] = await Promise.allSettled([api.practiceWork(context), api.resourceProfiles(context)]);
    if (request !== listRequest.current) return;
    if (work.status === "fulfilled") { setItems(work.value.items); loaded.current = true; }
    else setError(errorText(work.reason));
    if (people.status === "fulfilled") setResources(people.value.items);
    else { setResources([]); setResourceError("Assignment options are unavailable. You can still view and update work."); }
    setLoading(false);
  }, [context]);
  useEffect(() => { void load(); return () => { ++listRequest.current; }; }, [load]);
  useEffect(() => {
    let live = true;
    setDetail(null); setDetailError(""); setDetailLoading(false);
    const request = ++detailRequest.current;
    if (!urlState.selected) return () => { live = false; };
    setDetailLoading(true);
    void api.practiceWorkItem(context, urlState.selected)
      .then(result => { if (live && request === detailRequest.current) {
        if (!result.item) setDetailError("The selected work item could not be found.");
        else setDetail(result.item);
      } })
      .catch(reason => { if (live && request === detailRequest.current) setDetailError(errorText(reason)); })
      .finally(() => { if (live && request === detailRequest.current) setDetailLoading(false); });
    return () => { live = false; };
  }, [context, urlState.selected, detailRevision]);

  const updateUrl = (changes: Record<string, string>) => onNavigate?.(selectedWorkPath(routeSearch, changes), !("selected" in changes || "view" in changes));
  const clearFilters = () => updateUrl({ q: "", status: "", priority: "", client: "", service: "", assignee: "", team: "", sort: "due" });
  const byView = useMemo(() => workViewItems(items, urlState.view), [items, urlState.view]);
  const visible = useMemo(() => {
    const filtered = filterWork(byView, urlState);
    return [...filtered].sort((a, b) => urlState.sort === "title" ? a.title.localeCompare(b.title) : urlState.sort === "client" ? (a.client_name || "").localeCompare(b.client_name || "") : (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  }, [byView, urlState]);
  const clients = useMemo(() => [...new Map(items.map((item) => [item.client_id, item.client_name || "Client"])).entries()], [items]);
  const services = useMemo(() => [...new Map(items.map((item) => [item.client_service_id, item.service_name || "Service"])).entries()], [items]);
  const teams = useMemo(() => [...new Map(items.filter((item) => item.assigned_team_name).map((item) => [item.assigned_team_id || item.assigned_team_name!, item.assigned_team_name!])).entries()], [items]);
  const views = useMemo(() => ([
    ["my", "Assigned work"], ["all", "All work"], ["this-week", "Due this week"], ["due-soon", "Due soon"], ["overdue", "Overdue"], ["waiting-client", "Waiting on client"], ["review", "Review"],
  ] as const).map(([value, label]) => ({ value, label, count: workViewItems(items, value).length })), [items]);

  if (loading) return <LoadingState title="Work" description="Delivery queues and actions." />;
  const inspector = detailLoading ? <div className="pww-inspector-loading" role="status">Loading selected work…</div> : detailError ? <ErrorState title="Selected work is unavailable" message={detailError} retry={() => setDetailRevision(value => value + 1)} secondaryAction={<Button onClick={() => updateUrl({ selected: "" })}>Close</Button>} /> : detail && detail.id === urlState.selected ? <WorkInspector
    key={`${context.tenantId}:${detail.id}`}
    context={context}
    item={detail}
    resources={resources}
    onChanged={async () => {
      const request = detailRequest.current;
      await load();
      const result = await api.practiceWorkItem(context, detail.id);
      if (selectedRef.current === detail.id && request === detailRequest.current) setDetail(result.item);
    }}
    onClose={() => updateUrl({ selected: "" })}
    onOpenClient={onOpenClient}
    onOpenLedgerly={onOpenLedgerly}
    onOpenWork={onOpenWork}
  /> : undefined;

  return <PageShell className="pww-page">
    <PageHeader title="Work" description="Delivery queues and actions." primaryAction={<Button {...addWorkFocusTarget} appearance="primary" onClick={() => setAddingWork(true)}>Add work</Button>} />
    <SavedViewBar views={views} selectedValue={urlState.view} onSelect={(view) => updateUrl({ view, due: "", selected: "" })} />
    <CommandBar><Button appearance="subtle" onClick={() => void load()}>Refresh</Button></CommandBar>
    {error && <ErrorState title="Some work data may be out of date" message={error} retry={load} />}
    {resourceError && <MessageBar intent="warning"><MessageBarBody>{resourceError}</MessageBarBody><Button appearance="transparent" onClick={() => void load()}>Retry</Button></MessageBar>}
    <CompactFilterBar
      advancedOpen={moreFilters}
      onAdvancedToggle={() => setMoreFilters((current) => !current)}
      summary={`${visible.length} work item${visible.length === 1 ? "" : "s"}`}
      reset={clearFilters}
      advanced={<>
        <Field label="Client"><Select value={urlState.client} onChange={(_, data) => updateUrl({ client: data.value })}><option value="">All clients</option>{clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></Field>
        <Field label="Service"><Select value={urlState.service} onChange={(_, data) => updateUrl({ service: data.value })}><option value="">All services</option>{services.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></Field>
        <Field label="Assignee"><Select value={urlState.assignee} onChange={(_, data) => updateUrl({ assignee: data.value })}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.display_name}</option>)}</Select></Field>
        <Field label="Team"><Select value={urlState.team} onChange={(_, data) => updateUrl({ team: data.value })}><option value="">All teams</option><option value="unassigned">Unassigned</option>{teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></Field>
        <Field label="Sort"><Select value={urlState.sort} onChange={(_, data) => updateUrl({ sort: data.value })}><option value="due">Due date</option><option value="client">Client</option><option value="title">Work title</option></Select></Field>
      </>}
    >
      <Field label="Search"><Input value={urlState.query} placeholder="Work, client or service" onChange={(_, data) => updateUrl({ q: data.value })} /></Field>
      <Field label="Status"><Select value={urlState.status} onChange={(_, data) => updateUrl({ status: data.value })}><option value="">All states</option>{statusOptions.map((value) => <option key={value} value={value}>{statutoryLabel(value)}</option>)}</Select></Field>
      <Field label="Priority"><Select value={urlState.priority} onChange={(_, data) => updateUrl({ priority: data.value })}><option value="">All priorities</option>{["urgent", "high", "normal", "low"].map((value) => <option key={value} value={value}>{statutoryLabel(value)}</option>)}</Select></Field>
    </CompactFilterBar>
    <MasterDetailWorkspace selected={Boolean(inspector)} inspector={inspector}>
      <OperationalDataGrid items={visible} columns={columns} label="Practice work" getRowId={(item) => item.id} primaryColumnId="work" getItemHref={(item) => selectedWorkPath(routeSearch, { selected: item.id })} onOpenItem={(item) => updateUrl({ selected: item.id })} columnSizingOptions={workColumnSizing} empty={error ? undefined : <EmptyState title="No work in this view" description="Change the saved view or clear filters." />} />
    </MasterDetailWorkspace>
    {addingWork && <CreatePracticeWorkDialog context={context} onClose={() => setAddingWork(false)} onCreated={async id => {
      setAddingWork(false); await load();
      updateUrl({ view: "all", q: "", status: "", priority: "", client: "", service: "", assignee: "", team: "", selected: id });
    }} />}
  </PageShell>;
}

export function WorkInspector({ context, item, resources, onChanged, onClose, onOpenClient, onOpenLedgerly, onOpenWork }: {
  context: ApiContext;
  item: WorkDetail;
  resources: ResourceProfile[];
  onChanged: () => Promise<void>;
  onClose: () => void;
  onOpenClient?: (id: string) => void;
  onOpenLedgerly?: (engagementId: string, clientId: string) => void;
  onOpenWork?: (id: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dueDate, setDueDate] = useState(item.due_date || "");
  const [requestOpen, setRequestOpen] = useState(false);
  useEffect(() => setDueDate(item.due_date || ""), [item.due_date]);
  useEffect(() => { setError(""); setFeedback(""); setRequestOpen(false); }, [item.id]);
  const mutate = async (key: string, action: () => Promise<unknown>) => { setBusy(key); setError(""); setFeedback(""); try { await action(); await onChanged(); setFeedback("Work updated."); } catch (reason) { setError(errorText(reason)); } finally { setBusy(""); } };
  const openStages = (item.stages || []).filter((stage) => !["completed", "skipped"].includes(stage.status));
  const blocker = openStages.find((stage) => stage.status === "blocked" || stage.block_reason);
  const review = (item.reviews || []).find((entry) => !["approved", "completed"].includes(entry.status));
  const nextAction = blocker ? "Resolve blocker" : item.status === "waiting_on_client" ? "Follow up with client" : review ? "Complete review" : item.status === "ready" ? "Start work" : "Continue work";
  return <WorkingInspector
    title={item.title}
    subtitle={`${item.client_name || "Client"} · ${item.service_name || "Service"}`}
    status={<StatusTreatment value={item.status} />}
    onClose={onClose}
    footer={<><Button onClick={() => onOpenWork?.(item.id)}>Open work</Button>{item.specialist_module_key === "ledgerly" && item.specialist_record_reference && onOpenLedgerly && <Button icon={<OpenRegular />} onClick={() => onOpenLedgerly(item.specialist_record_reference!, item.client_id)}>Open in Ledgerly</Button>}</>}
  >
    {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    {feedback && <MessageBar intent="success"><MessageBarBody>{feedback}</MessageBarBody></MessageBar>}
    <dl className="pww-facts">
      <div><dt>Client</dt><dd><Button appearance="transparent" onClick={() => onOpenClient?.(item.client_id)}>{item.client_name || "Open client"}</Button></dd></div>
      <div><dt>Service</dt><dd>{item.service_name || "Service"}</dd></div>
      <div><dt>Owner</dt><dd>{assignmentDisplay(item)}</dd></div>
      <div><dt>Next action</dt><dd>{nextAction}</dd></div>
      <div><dt>Blocker</dt><dd>{blocker?.block_reason || (blocker ? blocker.name : "None")}</dd></div>
      <div><dt>Review</dt><dd>{review ? statutoryLabel(review.status) : "Not waiting"}</dd></div>
    </dl>
    <Field label="Assign"><Select value={item.assigned_member_id || ""} disabled={Boolean(busy)} onChange={(_, data) => data.value && void mutate("assign", () => api.reassignWork(context, item.id, { resourceId: data.value }))}><option value="">Unassigned</option>{resources.filter((resource) => resource.status === "active").map((resource) => <option key={resource.id} value={resource.id}>{resource.display_name} · {resource.available_hours}h available</option>)}</Select></Field>
    <div className="pww-inline-field"><Field label="Due date"><Input type="date" value={dueDate} disabled={Boolean(busy)} onChange={(_, data) => setDueDate(data.value)} /></Field><Button disabled={!dueDate || Boolean(busy)} onClick={() => void mutate("due", () => api.overridePracticeDeadline(context, item.id, dueDate, "Rescheduled from the Work inspector"))}>Reschedule</Button></div>
    <Field label="Status"><Select value={item.status} disabled={Boolean(busy)} onChange={(_, data) => void mutate("status", () => api.updatePracticeWorkStatus(context, item.id, data.value as PracticeWorkStatus))}>{statusOptions.map((value) => <option key={value} value={value}>{statutoryLabel(value)}</option>)}</Select></Field>
    <div className="pww-actions">
      <Button disabled={!openStages.length || Boolean(busy)} onClick={() => { const stage = openStages[0]; if (stage) void mutate("block", () => api.advancePracticeStage(context, stage.id, "blocked", "Blocked from the Work inspector")); }}>Mark blocked</Button>
      <Button disabled={Boolean(busy)} onClick={() => setRequestOpen(true)}>Request from client</Button>
      <Button disabled={item.status === "review" || Boolean(busy)} onClick={() => void mutate("review", () => api.updatePracticeWorkStatus(context, item.id, "review"))}>Send to review</Button>
    </div>
    {requestOpen && <ClientRequestDialog context={context} item={item} onClose={() => setRequestOpen(false)} onCreated={async () => { setRequestOpen(false); await onChanged(); }} />}
  </WorkingInspector>;
}

function ClientRequestDialog({ context, item, onClose, onCreated }: { context: ApiContext; item: WorkDetail; onClose: () => void; onCreated: () => Promise<void> }) {
  const [contacts, setContacts] = useState<PortalContact[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [title, setTitle] = useState(`Information needed for ${item.title}`);
  const [dueAt, setDueAt] = useState(item.due_date || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!item.engagement_id) return; void api.portalContacts(context, item.engagement_id).then((result) => { const available = result.items.filter((contact) => ["ACTIVE", "INVITED"].includes(contact.accessStatus)); setContacts(available); setRecipientId(available[0]?.id || ""); }).catch((reason) => setError(errorText(reason))); }, [context, item.engagement_id]);
  async function create() { setBusy(true); setError(""); try { await api.createClientRequest(context, { clientId: item.client_id, engagementId: item.engagement_id || undefined, workItemId: item.id, recipientAccessIds: [recipientId], requestType: "document", title: title.trim(), dueAt: dueAt ? `${dueAt}T17:00:00.000Z` : undefined, send: true, waitingOnClient: true }); await onCreated(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); } }
  return <Dialog open><DialogSurface><DialogBody><DialogTitle>Request from client</DialogTitle><DialogContent className="pww-request-form">
    {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    {!item.engagement_id ? <p>This work has no client access context. Open the client workspace to configure portal access.</p> : <>
      <Field label="Recipient"><Select value={recipientId} onChange={(_, data) => setRecipientId(data.value)}><option value="">Select client contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName} · {contact.email}</option>)}</Select></Field>
      <Field label="Request"><Input value={title} onChange={(_, data) => setTitle(data.value)} /></Field>
      <Field label="Due"><Input type="date" value={dueAt} onChange={(_, data) => setDueAt(data.value)} /></Field>
    </>}
  </DialogContent><DialogActions><Button onClick={onClose}>Cancel</Button><Button appearance="primary" disabled={busy || !recipientId || !title.trim()} onClick={() => void create()}>{busy ? "Sending…" : "Send request"}</Button></DialogActions></DialogBody></DialogSurface></Dialog>;
}
