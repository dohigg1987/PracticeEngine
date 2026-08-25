import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, Button, createTableColumn, DataGrid, DataGridBody, DataGridCell,
  DataGridHeader, DataGridHeaderCell, DataGridRow, Field, Input, MessageBar,
  MessageBarBody, Select, Skeleton, SkeletonItem, Tab, TabList, Table,
  TableBody, TableCell, TableHeader, TableHeaderCell, TableRow,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import { ArrowLeftRegular, OpenRegular } from "@fluentui/react-icons";
import {
  api, ApiContext, PracticeClientSummary, PracticeService, PracticeTask,
  PracticeWorkItem, PracticeWorkStatus, PracticeWorkTemplate,
} from "./api";
import { formatDate } from "./displayFormat";
import { statutoryLabel } from "./format";
import { statusBadgeProps } from "./statusBadge";
import "./practice-management.css";

export type PracticeManagementView = "work" | "work-detail" | "client-summary" | "settings";
type Props = {
  view: PracticeManagementView;
  context: ApiContext;
  clientId?: string;
  workItemId?: string;
  onOpenWork?: (id: string) => void;
  onOpenClient?: (id: string) => void;
  onBack?: () => void;
};

const label = statutoryLabel;
const date = (value?: string | null) => formatDate(value, "Not set");
const errorText = (value: unknown) => value instanceof Error ? value.message : "The request could not be completed.";
export const isOverdue = (value?: string | null, status?: PracticeWorkStatus, today = new Date()): boolean =>
  Boolean(value && status !== "completed" && status !== "cancelled" && new Date(`${value}T23:59:59`) < today);
export const filterPracticeWork = (items: PracticeWorkItem[], query: string, status: string, priority: string) => {
  const term = query.trim().toLowerCase();
  return items.filter((item) =>
    (!term || [item.client_name, item.service_name, item.title, item.period_reference, item.assigned_member_name, item.assigned_team_name]
      .some((value) => value?.toLowerCase().includes(term))) &&
    (!status || item.status === status) && (!priority || item.priority === priority));
};
export const practiceServiceCategories = ["accounts", "bookkeeping", "tax", "payroll", "company_secretarial", "assurance", "advisory", "other"] as const;
export const practiceServiceCreateInput = (name: string, category: string) => ({ name: name.trim(), category, status: "active" as const });
const internalIdentity = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|[^\s]+\|[^\s]+|[A-Za-z0-9_-]{24,})$/i;
export const safeAssignmentName = (value?: string | null): string => {
  const label = value?.trim() || "";
  return label && !internalIdentity.test(label) ? label : "";
};
export function assignmentDisplay(item: { assigned_member_id?: string | null; assigned_member_name?: string | null; assigned_team_id?: string | null; assigned_team_name?: string | null }): string {
  return safeAssignmentName(item.assigned_member_name) || (item.assigned_member_id ? "Assigned" : "") || safeAssignmentName(item.assigned_team_name) || (item.assigned_team_id ? "Assigned team" : "") || "Unassigned";
}
export function taskAssignmentDisplay(item: PracticeTask): string {
  return safeAssignmentName(item.assignee_name) || (item.assignee_member_id ? "Assigned" : "") || safeAssignmentName(item.team_name) || (item.team_id ? "Assigned team" : "") || "Unassigned";
}

function Loading({ text }: { text: string }) {
  return <Skeleton className="pm-loading" aria-label={text} role="status"><SkeletonItem size={24} /><SkeletonItem /><SkeletonItem /><SkeletonItem /></Skeleton>;
}
function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <MessageBar intent="error"><MessageBarBody>{message}</MessageBarBody><Button appearance="transparent" onClick={retry}>Retry</Button></MessageBar>;
}
function Status({ value }: { value: string }) {
  return <Badge {...statusBadgeProps(value)}>{label(value)}</Badge>;
}
function Head({ title, body, back }: { title: string; body: string; back?: () => void }) {
  return <header className="pm-head">{back && <Button appearance="subtle" icon={<ArrowLeftRegular />} aria-label="Back" onClick={back} />}<div><h1>{title}</h1><p>{body}</p></div></header>;
}

export default function PracticeManagement(props: Props) {
  if (props.view === "work-detail") return <WorkDetail {...props} />;
  if (props.view === "client-summary") return <ClientSummary {...props} />;
  if (props.view === "settings") return <PracticeSettings {...props} />;
  return <WorkList {...props} />;
}

const workColumns: TableColumnDefinition<PracticeWorkItem>[] = [
  createTableColumn({ columnId: "client", compare: (a, b) => (a.client_name || "").localeCompare(b.client_name || ""), renderHeaderCell: () => "Client", renderCell: (item) => item.client_name || "Client" }),
  createTableColumn({ columnId: "service", compare: (a, b) => (a.service_name || "").localeCompare(b.service_name || ""), renderHeaderCell: () => "Service", renderCell: (item) => item.service_name || "Service" }),
  createTableColumn({ columnId: "work", compare: (a, b) => a.title.localeCompare(b.title), renderHeaderCell: () => "Work item", renderCell: (item) => <div className="pm-work-title"><span>{item.title}</span><small>{item.period_reference || "No period"}</small></div> }),
  createTableColumn({ columnId: "status", compare: (a, b) => a.status.localeCompare(b.status), renderHeaderCell: () => "Status", renderCell: (item) => <Status value={item.status} /> }),
  createTableColumn({ columnId: "owner", compare: (a, b) => assignmentDisplay(a).localeCompare(assignmentDisplay(b)), renderHeaderCell: () => "Assignee / team", renderCell: assignmentDisplay }),
  createTableColumn({ columnId: "due", compare: (a, b) => (a.due_date || "").localeCompare(b.due_date || ""), renderHeaderCell: () => "Due", renderCell: (item) => <span className={isOverdue(item.due_date, item.status) ? "pm-overdue" : ""}>{date(item.due_date)}</span> }),
  createTableColumn({ columnId: "priority", compare: (a, b) => a.priority.localeCompare(b.priority), renderHeaderCell: () => "Priority", renderCell: (item) => label(item.priority) }),
];

function WorkList({ context, onOpenWork }: Props) {
  const [items, setItems] = useState<PracticeWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems((await api.practiceWork(context)).items); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => filterPracticeWork(items, query, status, priority), [items, query, status, priority]);
  if (loading) return <Loading text="Loading practice work" />;
  return <section className="pm-page"><Head title="Work" body="Operational deliverables across clients, services and teams." />{error && <Failure message={error} retry={load} />}
    <div className="pm-filters" aria-label="Work filters">
      <Field label="Search"><Input value={query} onChange={(_, data) => setQuery(data.value)} placeholder="Client, service or work item" /></Field>
      <Field label="Status"><Select value={status} onChange={(_, data) => setStatus(data.value)}><option value="">All statuses</option>{["not_started","ready","in_progress","waiting_on_client","waiting_internal","review","completed","cancelled"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>
      <Field label="Priority"><Select value={priority} onChange={(_, data) => setPriority(data.value)}><option value="">All priorities</option>{["urgent","high","normal","low"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field>
    </div>
    <p className="pm-result-count" aria-live="polite">{visible.length} work item{visible.length === 1 ? "" : "s"}</p>
    {visible.length ? <div className="pm-grid-scroll"><DataGrid items={visible} columns={workColumns} sortable getRowId={(item) => item.id} aria-label="Practice work"><DataGridHeader><DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader><DataGridBody<PracticeWorkItem>>{({ item, rowId }) => <DataGridRow<PracticeWorkItem> key={rowId}>{({ renderCell, columnId }) => <DataGridCell>{columnId === "work" && onOpenWork ? <Button appearance="transparent" className="pm-open" icon={<OpenRegular />} iconPosition="after" onClick={() => onOpenWork(item.id)}>{renderCell(item)}</Button> : renderCell(item)}</DataGridCell>}</DataGridRow>}</DataGridBody></DataGrid></div> : <div className="pm-empty"><h2>No matching work</h2><p>Adjust the filters or create work from an active client service.</p></div>}
  </section>;
}

function WorkDetail({ context, workItemId = "", onBack, onOpenClient }: Props) {
  const [item, setItem] = useState<PracticeWorkItem | null>(null);
  const [tasks, setTasks] = useState<PracticeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => { if (!workItemId) return; setLoading(true); setError(""); try { const [work, taskData] = await Promise.all([api.practiceWorkItem(context, workItemId), api.practiceTasks(context, workItemId)]); setItem(work.item); setTasks(taskData.items.sort((a,b) => a.sequence-b.sequence)); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } }, [context, workItemId]);
  useEffect(() => { void load(); }, [load]);
  async function setWorkStatus(status: PracticeWorkStatus) { setBusy("work"); try { await api.updatePracticeWorkStatus(context, workItemId, status); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(""); } }
  async function setTaskStatus(id: string, status: PracticeTask["status"]) { setBusy(id); try { await api.updatePracticeTaskStatus(context, id, status); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(""); } }
  if (loading) return <Loading text="Loading work detail" />;
  if (!item) return <Failure message={error || "Work item not found."} retry={load} />;
  return <section className="pm-page"><Head title={item.title} body={[item.client_name, item.service_name, item.period_reference].filter(Boolean).join(" · ")} back={onBack} />{error && <Failure message={error} retry={load} />}
    <div className="pm-detail-layout"><section className="pm-section"><header><h2>Work summary</h2><Status value={item.status} /></header><dl className="pm-facts"><div><dt>Client</dt><dd>{onOpenClient ? <Button appearance="transparent" className="pm-inline-link" onClick={() => onOpenClient(item.client_id)}>{item.client_name || "Open client"}</Button> : item.client_name || "Client"}</dd></div><div><dt>Engagement</dt><dd>{item.engagement_name || "Not linked"}</dd></div><div><dt>Assignee</dt><dd>{safeAssignmentName(item.assigned_member_name) || (item.assigned_member_id ? "Assigned" : "Unassigned")}</dd></div><div><dt>Team</dt><dd>{safeAssignmentName(item.assigned_team_name) || (item.assigned_team_id ? "Assigned team" : "Unassigned")}</dd></div><div><dt>Planned start</dt><dd>{date(item.planned_start_date)}</dd></div><div><dt>Due</dt><dd className={isOverdue(item.due_date, item.status) ? "pm-overdue" : ""}>{date(item.due_date)}</dd></div></dl><Field label="Update status"><Select value={item.status} disabled={busy === "work"} onChange={(_, data) => void setWorkStatus(data.value as PracticeWorkStatus)}>{["not_started","ready","in_progress","waiting_on_client","waiting_internal","review","completed","cancelled"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field></section>
      <aside className="pm-section"><header><h2>Specialist module</h2></header>{item.specialist_module_key ? <><p><strong>{label(item.specialist_module_key)}</strong></p><p>{item.specialist_record_reference ? "Linked specialist record" : "Module selected; record not linked"}</p></> : <p>No specialist module is required for this work.</p>}</aside></div>
    <section className="pm-section"><header><div><h2>Tasks</h2><p>{tasks.filter((task) => task.status === "completed").length} of {tasks.length} complete</p></div></header>{tasks.length ? <Table aria-label="Work tasks"><TableHeader><TableRow><TableHeaderCell>Task</TableHeaderCell><TableHeaderCell>Assignee</TableHeaderCell><TableHeaderCell>Due</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{tasks.map((task) => <TableRow key={task.id}><TableCell><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}</TableCell><TableCell>{taskAssignmentDisplay(task)}</TableCell><TableCell>{date(task.due_date)}</TableCell><TableCell><Select aria-label={`Status for ${task.title}`} value={task.status} disabled={busy === task.id} onChange={(_, data) => void setTaskStatus(task.id, data.value as PracticeTask["status"])}>{["not_started","in_progress","blocked","review","completed","skipped"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></TableCell></TableRow>)}</TableBody></Table> : <div className="pm-empty"><h3>No tasks</h3><p>Add tasks directly or apply a work template.</p></div>}</section>
  </section>;
}

function ClientSummary({ context, clientId = "", onOpenWork, onBack }: Props) {
  const [summary, setSummary] = useState<PracticeClientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { if (!clientId) return; setLoading(true); setError(""); try { setSummary(await api.practiceClientSummary(context, clientId)); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } }, [context, clientId]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <Loading text="Loading client service summary" />;
  if (!summary) return <Failure message={error || "Client summary is unavailable."} retry={load} />;
  const clientName = summary.client.legal_name || summary.client.name || "Client";
  return <section className="pm-page"><Head title={clientName} body="Services, engagements and current delivery commitments." back={onBack} />{error && <Failure message={error} retry={load} />}
    <div className="pm-summary-strip"><div><strong>{summary.services.filter((item) => item.status === "active").length}</strong><span>Active services</span></div><div><strong>{summary.engagements.filter((item) => item.status === "active").length}</strong><span>Active engagements</span></div><div><strong>{summary.workItems.filter((item) => !["completed","cancelled"].includes(item.status)).length}</strong><span>Current work</span></div><div><strong>{summary.upcomingTasks.length}</strong><span>Upcoming tasks</span></div></div>
    <section className="pm-section"><header><h2>Active services</h2></header><Table aria-label="Client services"><TableHeader><TableRow><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Frequency</TableHeaderCell><TableHeaderCell>Responsible team</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{summary.services.map((service) => <TableRow key={service.id}><TableCell>{service.service_name || "Service"}</TableCell><TableCell>{service.frequency ? label(service.frequency) : "Not set"}</TableCell><TableCell>{service.responsible_team_id ? "Assigned" : "Unassigned"}</TableCell><TableCell><Status value={service.status} /></TableCell></TableRow>)}</TableBody></Table></section>
    <section className="pm-section"><header><h2>Current work and deadlines</h2></header><Table aria-label="Client work"><TableHeader><TableRow><TableHeaderCell>Work item</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Due</TableHeaderCell></TableRow></TableHeader><TableBody>{summary.workItems.map((work) => <TableRow key={work.id}><TableCell>{onOpenWork ? <Button appearance="transparent" className="pm-inline-link" onClick={() => onOpenWork(work.id)}>{work.title}</Button> : work.title}</TableCell><TableCell><Status value={work.status} /></TableCell><TableCell className={isOverdue(work.due_date, work.status) ? "pm-overdue" : ""}>{date(work.due_date)}</TableCell></TableRow>)}</TableBody></Table></section>
  </section>;
}

function PracticeSettings({ context }: Props) {
  const [tab, setTab] = useState<"services" | "templates">("services");
  const [services, setServices] = useState<PracticeService[]>([]);
  const [templates, setTemplates] = useState<PracticeWorkTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [serviceData, templateData] = await Promise.all([api.practiceServices(context), api.practiceWorkTemplates(context)]); setServices(serviceData.items); setTemplates(templateData.items); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  async function addService(event: React.FormEvent) { event.preventDefault(); if (!name.trim() || !category) return; try { await api.createPracticeService(context, practiceServiceCreateInput(name, category)); setName(""); setCategory(""); await load(); } catch (e) { setError(errorText(e)); } }
  if (loading) return <Loading text="Loading practice settings" />;
  return <section className="pm-page"><Head title="Practice Management settings" body="Configure the services and reusable work structures offered by this practice." />{error && <Failure message={error} retry={load} />}
    <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(data.value as typeof tab)}><Tab value="services">Services</Tab><Tab value="templates">Work templates</Tab></TabList>
    {tab === "services" ? <section className="pm-section"><header><div><h2>Service catalogue</h2><p>Services can support accounting and future specialist modules.</p></div></header><form className="pm-add-row" onSubmit={addService}><Field label="Service name" required><Input value={name} maxLength={160} onChange={(_, data) => setName(data.value)} /></Field><Field label="Category" required><Select value={category} onChange={(_, data) => setCategory(data.value)}><option value="">Select category</option><option value="accounts">Accounts</option><option value="bookkeeping">Bookkeeping</option><option value="tax">Tax</option><option value="payroll">Payroll</option><option value="company_secretarial">Company secretarial</option><option value="assurance">Assurance</option><option value="advisory">Advisory</option><option value="other">Other</option></Select></Field><Button appearance="primary" type="submit" disabled={!name.trim() || !category}>Add service</Button></form><Table aria-label="Service catalogue"><TableHeader><TableRow><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Category</TableHeaderCell><TableHeaderCell>Frequency</TableHeaderCell><TableHeaderCell>Module</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{services.map((service) => <TableRow key={service.id}><TableCell><strong>{service.name}</strong>{service.description && <small>{service.description}</small>}</TableCell><TableCell>{service.category ? label(service.category) : "General"}</TableCell><TableCell>{service.default_frequency ? label(service.default_frequency) : "Not set"}</TableCell><TableCell>{service.specialist_module_key ? label(service.specialist_module_key) : "Practice Management"}</TableCell><TableCell><Status value={service.status} /></TableCell></TableRow>)}</TableBody></Table></section> : <section className="pm-section"><header><div><h2>Work templates</h2><p>Ordered task structures that can be applied when work is created.</p></div></header><Table aria-label="Work templates"><TableHeader><TableRow><TableHeaderCell>Template</TableHeaderCell><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Version</TableHeaderCell><TableHeaderCell>Tasks</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{templates.map((template) => <TableRow key={template.id}><TableCell>{template.name}</TableCell><TableCell>{template.service_name || "Any service"}</TableCell><TableCell>{template.version}</TableCell><TableCell>{template.tasks?.length || 0}</TableCell><TableCell><Status value={template.status} /></TableCell></TableRow>)}</TableBody></Table></section>}
  </section>;
}
