import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, Button, createTableColumn, DataGrid, DataGridBody, DataGridCell,
  DataGridHeader, DataGridHeaderCell, DataGridRow, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger, Field, Input, MessageBar,
  MessageBarBody, Select, Skeleton, SkeletonItem, Tab, TabList, Table,
  TableBody, TableCell, TableHeader, TableHeaderCell, TableRow,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import { ArrowLeftRegular, OpenRegular } from "@fluentui/react-icons";
import {
  api, ApiContext, AutomationRule, PracticeClientSummary, PracticeReview, PracticeService, PracticeTask, ResourceProfile,
  PracticeWorkItem, PracticeWorkStage, PracticeWorkStatus, PracticeWorkTemplate, RecurrenceExecution, RecurringWorkSchedule,
} from "./api";
import { formatDate } from "./displayFormat";
import { statutoryLabel } from "./format";
import { statusBadgeProps } from "./statusBadge";
import ClientCollaboration from "./ClientCollaboration";
import "./practice-management.css";

export type PracticeManagementView = "work" | "work-detail" | "client-summary" | "settings";
type Props = {
  view: PracticeManagementView;
  initialTab?: "work" | "reviews" | "recurring" | "operations";
  settingsSection?: "services" | "work-templates" | "automation" | "resources" | "collaboration";
  canManageSettings?: boolean;
  context: ApiContext;
  clientId?: string;
  workItemId?: string;
  onOpenWork?: (id: string) => void;
  onOpenClient?: (id: string) => void;
  onOpenLedgerly?: (engagementId: string, clientId: string) => void;
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
  return <WorkOperations {...props} />;
}

function WorkOperations(props: Props) {
  const [tab, setTab] = useState<"work" | "reviews" | "recurring" | "operations">(props.initialTab ?? "work");
  useEffect(() => setTab(props.initialTab ?? "work"), [props.initialTab]);
  return <><TabList selectedValue={tab} onTabSelect={(_, data) => setTab(data.value as typeof tab)}><Tab value="work">Work items</Tab><Tab value="reviews">Review queue</Tab><Tab value="recurring">Recurring work</Tab><Tab value="operations">Generation operations</Tab></TabList>{tab === "work" ? <WorkList {...props} /> : tab === "reviews" ? <ReviewQueue {...props}/> : tab === "recurring" ? <RecurringWork {...props} /> : <RecurrenceOperations {...props}/>}</>;
}

function ReviewQueue({context}:Props){
  const[items,setItems]=useState<PracticeReview[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[status,setStatus]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{setItems((await api.practiceReviews(context,status)).items);}catch(e){setError(errorText(e));}finally{setLoading(false);}},[context,status]);useEffect(()=>{void load();},[load]);
  async function decide(id:string,next:PracticeReview["status"]){try{await api.decidePracticeReview(context,id,next,next==="changes_requested"?"Operational changes required":undefined);await load();}catch(e){setError(errorText(e));}}
  if(loading)return <Loading text="Loading review queue"/>;return <section className="pm-page"><Head title="Review queue" body="Operational reviews and approvals across Practice Management work."/>{error&&<Failure message={error} retry={load}/>}<div className="pm-filters"><Field label="Review status"><Select value={status} onChange={(_,data)=>setStatus(data.value)}><option value="">All active reviews</option>{["requested","in_progress","changes_requested","approved","reopened"].map(value=><option key={value} value={value}>{label(value)}</option>)}</Select></Field></div><div className="pm-grid-scroll"><Table aria-label="Practice review queue"><TableHeader><TableRow><TableHeaderCell>Client</TableHeaderCell><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Work / stage</TableHeaderCell><TableHeaderCell>Preparer</TableHeaderCell><TableHeaderCell>Reviewer</TableHeaderCell><TableHeaderCell>Due</TableHeaderCell><TableHeaderCell>Waiting</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Actions</TableHeaderCell></TableRow></TableHeader><TableBody>{items.map(item=><TableRow key={item.id}><TableCell>{item.client_name||"Client"}</TableCell><TableCell>{item.service_name||"Service"}</TableCell><TableCell><strong>{item.work_title||"Work"}</strong><small>{item.stage_name||"Operational review"}</small></TableCell><TableCell>{item.preparer_name||"Not set"}</TableCell><TableCell>{item.reviewer_name||"Unassigned"}</TableCell><TableCell>{date(item.due_date)}</TableCell><TableCell>{Math.round(item.waiting_hours||0)}h</TableCell><TableCell><Status value={item.status}/></TableCell><TableCell>{["requested","reopened"].includes(item.status)&&<Button size="small" onClick={()=>void decide(item.id,"in_progress")}>Start review</Button>}{item.status==="in_progress"&&<><Button size="small" onClick={()=>void decide(item.id,"approved")}>Approve</Button><Button size="small" appearance="subtle" onClick={()=>void decide(item.id,"changes_requested")}>Request changes</Button></>}{item.status==="changes_requested"&&<Button size="small" onClick={()=>void decide(item.id,"reopened")}>Resubmit</Button>}</TableCell></TableRow>)}</TableBody></Table></div></section>;
}

function RecurrenceOperations({context}:Props){
  const[items,setItems]=useState<RecurrenceExecution[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[from,setFrom]=useState("2027-01-01"),[to,setTo]=useState("2027-03-31"),[busy,setBusy]=useState("");
  const load=useCallback(async()=>{setLoading(true);try{setItems((await api.recurrenceOperations(context)).items);setError("");}catch(e){setError(errorText(e));}finally{setLoading(false);}},[context]);useEffect(()=>{void load();},[load]);
  async function run(mode:"dry"|"replay"){setBusy(mode);try{mode==="dry"?await api.dryRunRecurrence(context,from,to):await api.replayRecurrence(context,from,to);await load();}catch(e){setError(errorText(e));}finally{setBusy("");}}
  if(loading)return <Loading text="Loading recurrence operations"/>;return <section className="pm-page"><Head title="Generation operations" body="Tenant-scoped history, safe previews, failures and bounded replay."/>{error&&<Failure message={error} retry={load}/>}<div className="pm-add-row"><Field label="From"><Input type="date" value={from} onChange={(_,data)=>setFrom(data.value)}/></Field><Field label="To"><Input type="date" value={to} onChange={(_,data)=>setTo(data.value)}/></Field><Button disabled={Boolean(busy)} onClick={()=>void run("dry")}>Dry run</Button><Dialog><DialogTrigger disableButtonEnhancement><Button appearance="primary" disabled={Boolean(busy)}>Replay bounded range</Button></DialogTrigger><DialogSurface><DialogBody><DialogTitle>Confirm bounded replay</DialogTitle><DialogContent>Generate missing work between {date(from)} and {date(to)}. Review a dry run first; existing occurrence keys remain duplicate-safe.</DialogContent><DialogActions><DialogTrigger disableButtonEnhancement><Button appearance="secondary">Cancel</Button></DialogTrigger><DialogTrigger disableButtonEnhancement><Button appearance="primary" onClick={()=>void run("replay")}>Confirm replay</Button></DialogTrigger></DialogActions></DialogBody></DialogSurface></Dialog></div><div className="pm-grid-scroll"><Table aria-label="Recurrence execution history"><TableHeader><TableRow><TableHeaderCell>Started</TableHeaderCell><TableHeaderCell>Trigger</TableHeaderCell><TableHeaderCell>Range</TableHeaderCell><TableHeaderCell>Schedules</TableHeaderCell><TableHeaderCell>Generated</TableHeaderCell><TableHeaderCell>Blocked</TableHeaderCell><TableHeaderCell>Duplicates</TableHeaderCell><TableHeaderCell>Failures</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{items.map(item=><TableRow key={item.id}><TableCell>{date(item.started_at)}</TableCell><TableCell>{label(item.trigger_type)}</TableCell><TableCell>{item.range_from?`${date(item.range_from)} – ${date(item.range_to)}`:"Current horizon"}</TableCell><TableCell>{item.schedules_evaluated}</TableCell><TableCell>{item.work_generated}</TableCell><TableCell>{item.blocked_entitlement}</TableCell><TableCell>{item.skipped_idempotent}</TableCell><TableCell>{item.failures}</TableCell><TableCell><Status value={item.status}/></TableCell></TableRow>)}</TableBody></Table></div></section>;
}

function RecurringWork({ context }: Props) {
  const [items, setItems] = useState<RecurringWorkSchedule[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [status, setStatus] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems((await api.recurringSchedules(context)).items); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  async function generate(id: string) { try { await api.generateRecurringSchedule(context, id); await load(); } catch (e) { setError(errorText(e)); } }
  if (loading) return <Loading text="Loading recurring work" />;
  const visible = status ? items.filter((item) => item.status === status) : items;
  return <section className="pm-page"><Head title="Recurring work" body="Bounded future work generation from published templates and separate deadline rules." />{error && <Failure message={error} retry={load} />}<div className="pm-filters"><Field label="Status"><Select value={status} onChange={(_, data) => setStatus(data.value)}><option value="">All statuses</option>{["active","suspended","blocked_entitlement","archived"].map((value) => <option value={value} key={value}>{label(value)}</option>)}</Select></Field></div><div className="pm-grid-scroll"><Table aria-label="Recurring work schedules"><TableHeader><TableRow><TableHeaderCell>Client</TableHeaderCell><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Template</TableHeaderCell><TableHeaderCell>Frequency</TableHeaderCell><TableHeaderCell>Next occurrence</TableHeaderCell><TableHeaderCell>Next due</TableHeaderCell><TableHeaderCell>Owner / team</TableHeaderCell><TableHeaderCell>Module</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Action</TableHeaderCell></TableRow></TableHeader><TableBody>{visible.map((item) => <TableRow key={item.id}><TableCell>{item.client_name || "Client"}</TableCell><TableCell>{item.service_name || "Service"}</TableCell><TableCell>{item.template_name || "Template"}</TableCell><TableCell>{label(item.recurrence_rule?.frequency || "custom")}{item.recurrence_rule?.interval && item.recurrence_rule.interval > 1 ? ` · every ${item.recurrence_rule.interval}` : ""}</TableCell><TableCell>{date(item.next_occurrence_date)}</TableCell><TableCell>{date(item.next_due_date)}</TableCell><TableCell>{safeAssignmentName(item.owner_name) || safeAssignmentName(item.team_name) || "Unassigned"}</TableCell><TableCell>{item.specialist_module_key ? label(item.specialist_module_key) : "Practice"}</TableCell><TableCell><Status value={item.status} />{item.generation_block_reason && <small>{item.generation_block_reason}</small>}</TableCell><TableCell><Button size="small" disabled={item.status !== "active"} onClick={() => void generate(item.id)}>Generate</Button></TableCell></TableRow>)}</TableBody></Table></div></section>;
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
  if (loading) return <section className="pm-page"><Head title="Work" body="Operational deliverables across clients, services and teams." /><Loading text="Loading practice work" /></section>;
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

function WorkDetail({ context, workItemId = "", onBack, onOpenClient, onOpenLedgerly }: Props) {
  const [item, setItem] = useState<PracticeWorkItem | null>(null);
  const [tasks, setTasks] = useState<PracticeTask[]>([]);
  const [stages,setStages]=useState<PracticeWorkStage[]>([]),[reviews,setReviews]=useState<PracticeReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => { if (!workItemId) return; setLoading(true); setError(""); try { const [work, taskData] = await Promise.all([api.practiceWorkItem(context, workItemId), api.practiceTasks(context, workItemId)]); setItem(work.item); setTasks(taskData.items.sort((a,b) => a.sequence-b.sequence));setStages((work.item.stages||[]).sort((a,b)=>a.sequence-b.sequence));setReviews(work.item.reviews||[]); } catch (e) { setError(errorText(e)); } finally { setLoading(false); } }, [context, workItemId]);
  useEffect(() => { void load(); }, [load]);
  async function setWorkStatus(status: PracticeWorkStatus) { setBusy("work"); try { await api.updatePracticeWorkStatus(context, workItemId, status); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(""); } }
  async function setTaskStatus(id: string, status: PracticeTask["status"]) { setBusy(id); try { await api.updatePracticeTaskStatus(context, id, status); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(""); } }
  async function recalculateDeadline() { setBusy("deadline"); try { await api.recalculatePracticeDeadline(context, workItemId); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(""); } }
  async function advanceStage(stage:PracticeWorkStage,status:PracticeWorkStage["status"]){setBusy(stage.id);try{await api.advancePracticeStage(context,stage.id,status,status==="blocked"?"Operational dependency requires resolution":undefined);await load();}catch(e){setError(errorText(e));}finally{setBusy("");}}
  if (loading) return <Loading text="Loading work detail" />;
  if (!item) return <Failure message={error || "Work item not found."} retry={load} />;
  return <section className="pm-page"><Head title={item.title} body={[item.client_name, item.service_name, item.period_reference].filter(Boolean).join(" · ")} back={onBack} />{error && <Failure message={error} retry={load} />}
    <div className="pm-detail-layout"><section className="pm-section"><header><h2>Work summary</h2><div><Status value={item.status} />{onOpenLedgerly && item.specialist_module_key === "ledgerly" && item.specialist_record_reference && <Button size="small" icon={<OpenRegular />} onClick={() => onOpenLedgerly(item.specialist_record_reference!, item.client_id)}>Open in Ledgerly</Button>}</div></header><dl className="pm-facts"><div><dt>Client</dt><dd>{onOpenClient ? <Button appearance="transparent" className="pm-inline-link" onClick={() => onOpenClient(item.client_id)}>{item.client_name || "Open client"}</Button> : item.client_name || "Client"}</dd></div><div><dt>Engagement</dt><dd>{item.engagement_name || "Not linked"}</dd></div><div><dt>Assignee</dt><dd>{safeAssignmentName(item.assigned_member_name) || (item.assigned_member_id ? "Assigned" : "Unassigned")}</dd></div><div><dt>Team</dt><dd>{safeAssignmentName(item.assigned_team_name) || (item.assigned_team_id ? "Assigned team" : "Unassigned")}</dd></div><div><dt>Planned start</dt><dd>{date(item.planned_start_date)}</dd></div><div><dt>Due</dt><dd className={isOverdue(item.due_date, item.status) ? "pm-overdue" : ""}>{date(item.due_date)} · {item.due_date_overridden ? "Manually overridden" : item.calculated_due_date ? "Calculated" : "Entered directly"}</dd></div>{item.calculated_due_date && <div><dt>Calculated deadline</dt><dd>{date(item.calculated_due_date)}</dd></div>}{item.due_date_override_reason && <div><dt>Override reason</dt><dd>{item.due_date_override_reason}</dd></div>}{item.source_template_version && <div><dt>Template source</dt><dd>Version {item.source_template_version}</dd></div>}</dl><Field label="Update status"><Select value={item.status} disabled={busy === "work"} onChange={(_, data) => void setWorkStatus(data.value as PracticeWorkStatus)}>{["not_started","ready","in_progress","waiting_on_client","waiting_internal","review","completed","cancelled"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field></section>
      <aside className="pm-section"><header><h2>Specialist module</h2></header>{item.specialist_module_key ? <><p><strong>{label(item.specialist_module_key)}</strong></p><p>{item.specialist_record_reference ? "Linked specialist record" : "Module selected; record not linked"}</p></> : <p>No specialist module is required for this work.</p>}{item.calculated_due_date && <Button disabled={busy === "deadline"} onClick={() => void recalculateDeadline()}>Recalculate deadline</Button>}</aside></div>
    <section className="pm-section"><header><div><h2>Workflow</h2><p>{stages.filter(stage=>stage.status==="completed"||stage.status==="skipped").length} of {stages.length} stages cleared</p></div></header>{stages.length?<Table aria-label="Operational workflow stages"><TableHeader><TableRow><TableHeaderCell>Stage</TableHeaderCell><TableHeaderCell>Type</TableHeaderCell><TableHeaderCell>Template provenance</TableHeaderCell><TableHeaderCell>Blocker</TableHeaderCell><TableHeaderCell>Status / progression</TableHeaderCell></TableRow></TableHeader><TableBody>{stages.map(stage=><TableRow key={stage.id}><TableCell><strong>{stage.sequence}. {stage.name}</strong></TableCell><TableCell>{label(stage.stage_type)}</TableCell><TableCell>Version {stage.source_template_version}</TableCell><TableCell>{stage.block_reason||"None"}</TableCell><TableCell><Select aria-label={`Progress ${stage.name}`} value={stage.status} disabled={busy===stage.id||["completed","skipped"].includes(stage.status)} onChange={(_,data)=>void advanceStage(stage,data.value as PracticeWorkStage["status"])}>{["not_started","active","blocked","waiting","review","completed","skipped"].map(value=><option value={value} key={value}>{label(value)}</option>)}</Select></TableCell></TableRow>)}</TableBody></Table>:<div className="pm-empty"><h3>No workflow stages</h3><p>This work was not generated from a staged template.</p></div>}</section>
    <section className="pm-section"><header><div><h2>Tasks</h2><p>{tasks.filter((task) => task.status === "completed").length} of {tasks.length} complete</p></div></header>{tasks.length ? <Table aria-label="Work tasks"><TableHeader><TableRow><TableHeaderCell>Task</TableHeaderCell><TableHeaderCell>Assignee</TableHeaderCell><TableHeaderCell>Due</TableHeaderCell><TableHeaderCell>Blockers</TableHeaderCell><TableHeaderCell>Review</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{tasks.map((task) => <TableRow key={task.id}><TableCell><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}</TableCell><TableCell>{taskAssignmentDisplay(task)}</TableCell><TableCell>{date(task.due_date)}</TableCell><TableCell>{task.blockers?.length?task.blockers.map(blocker=>blocker.blockingReason||label(blocker.dependencyType)).join(", "):"None"}</TableCell><TableCell>{task.review_required?"Required":"Not required"}</TableCell><TableCell><Select aria-label={`Status for ${task.title}`} value={task.status} disabled={busy === task.id} onChange={(_, data) => void setTaskStatus(task.id, data.value as PracticeTask["status"])}>{["not_started","in_progress","blocked","review","completed","skipped"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></TableCell></TableRow>)}</TableBody></Table> : <div className="pm-empty"><h3>No tasks</h3><p>Add tasks directly or apply a work template.</p></div>}</section>
    <section className="pm-section"><header><div><h2>Operational reviews</h2><p>{reviews.reduce((count,review)=>count+(review.review_points?.filter(point=>point.status==="open"||point.status==="reopened").length||0),0)} outstanding review points</p></div></header>{reviews.length?<Table aria-label="Work operational reviews"><TableHeader><TableRow><TableHeaderCell>Requested</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Review points</TableHeaderCell></TableRow></TableHeader><TableBody>{reviews.map(review=><TableRow key={review.id}><TableCell>{date(review.requested_at)}</TableCell><TableCell><Status value={review.status}/></TableCell><TableCell>{review.review_points?.map(point=><div key={point.id}><strong>{point.description}</strong><small>{label(point.status)}</small></div>)||"None"}</TableCell></TableRow>)}</TableBody></Table>:<p>No operational review has been requested.</p>}</section>
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
    {(summary.client.originating_opportunity_id || summary.onboarding) && <section className="pm-section"><header><h2>Commercial provenance and onboarding</h2></header><dl className="pm-facts"><div><dt>Origin</dt><dd>{summary.client.originating_opportunity_id ? "Converted from an accepted opportunity" : "Existing client"}</dd></div><div><dt>Converted</dt><dd>{date(summary.client.converted_at)}</dd></div><div><dt>Onboarding</dt><dd>{summary.onboarding ? <Status value={summary.onboarding.status} /> : "Not required"}</dd></div><div><dt>Delivery gate</dt><dd>{summary.onboarding?.mandatory_gates_complete ? "Cleared" : summary.onboarding ? "Open" : "Not applicable"}</dd></div></dl></section>}
    <div className="pm-summary-strip"><div><strong>{summary.services.filter((item) => item.status === "active").length}</strong><span>Active services</span></div><div><strong>{summary.engagements.filter((item) => item.status === "active").length}</strong><span>Active engagements</span></div><div><strong>{summary.workItems.filter((item) => !["completed","cancelled"].includes(item.status)).length}</strong><span>Current work</span></div><div><strong>{summary.upcomingTasks.length}</strong><span>Upcoming tasks</span></div></div>
    <section className="pm-section"><header><h2>Active services</h2></header><Table aria-label="Client services"><TableHeader><TableRow><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Frequency</TableHeaderCell><TableHeaderCell>Responsible team</TableHeaderCell><TableHeaderCell>Delivery readiness</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{summary.services.map((service) => <TableRow key={service.id}><TableCell>{service.service_name || "Service"}</TableCell><TableCell>{service.frequency ? label(service.frequency) : "Not set"}</TableCell><TableCell>{service.responsible_team_id ? "Assigned" : "Unassigned"}</TableCell><TableCell>{service.delivery_readiness ? <Status value={service.delivery_readiness} /> : "Active"}</TableCell><TableCell><Status value={service.status} /></TableCell></TableRow>)}</TableBody></Table></section>
    <section className="pm-section"><header><h2>Current work and deadlines</h2></header><Table aria-label="Client work"><TableHeader><TableRow><TableHeaderCell>Work item</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Due</TableHeaderCell></TableRow></TableHeader><TableBody>{summary.workItems.map((work) => <TableRow key={work.id}><TableCell>{onOpenWork ? <Button appearance="transparent" className="pm-inline-link" onClick={() => onOpenWork(work.id)}>{work.title}</Button> : work.title}</TableCell><TableCell><Status value={work.status} /></TableCell><TableCell className={isOverdue(work.due_date, work.status) ? "pm-overdue" : ""}>{date(work.due_date)}</TableCell></TableRow>)}</TableBody></Table></section>
    <section className="pm-section"><header><h2>Recurring schedules</h2></header><Table aria-label="Client recurring schedules"><TableHeader><TableRow><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Template</TableHeaderCell><TableHeaderCell>Next work</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{(summary.recurringSchedules || []).map((schedule) => <TableRow key={schedule.id}><TableCell>{schedule.service_name || "Service"}</TableCell><TableCell>{schedule.template_name || "Template"}</TableCell><TableCell>{date(schedule.next_occurrence_date)}</TableCell><TableCell><Status value={schedule.status} /></TableCell></TableRow>)}</TableBody></Table></section>
    <ClientCollaboration context={context} clientId={clientId} engagementIds={summary.engagements.map((engagement) => engagement.id)} />
  </section>;
}

function PracticeSettings({ context, settingsSection = "services", canManageSettings = false }: Props) {
  const [services, setServices] = useState<PracticeService[]>([]);
  const [templates, setTemplates] = useState<PracticeWorkTemplate[]>([]);
  const [automation,setAutomation]=useState<AutomationRule[]>([]);
  const [resources, setResources] = useState<ResourceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [editingResource, setEditingResource] = useState<ResourceProfile | null>(null);
  const [resourceDraft, setResourceDraft] = useState({ jobTitle: "", status: "active", weeklyCapacityHours: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (settingsSection === "services") setServices((await api.practiceServices(context)).items);
      else if (settingsSection === "work-templates") setTemplates((await api.practiceWorkTemplates(context)).items);
      else if (settingsSection === "automation") setAutomation((await api.automationRules(context)).items);
      else if (settingsSection === "resources") setResources((await api.resourceProfiles(context)).items);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [context, settingsSection]);
  useEffect(() => { void load(); }, [load]);
  async function addService(event: React.FormEvent) { event.preventDefault(); if (!canManageSettings || !name.trim() || !category) return; setBusy(true); setFeedback(""); try { await api.createPracticeService(context, practiceServiceCreateInput(name, category)); setName(""); setCategory(""); setFeedback("Service added."); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  async function addAutomation(){if(!canManageSettings)return;setBusy(true);setFeedback("");try{await api.createAutomationRule(context,{name:"New operational automation",enabled:false,triggerType:"work.created",conditions:[],actions:[{type:"mark_blocked"}],priority:100});setFeedback("Disabled automation rule added.");await load();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  async function toggleAutomation(rule:AutomationRule){if(!canManageSettings)return;setBusy(true);setFeedback("");try{await api.updateAutomationRule(context,rule.id,{enabled:!rule.enabled});setFeedback(`Automation ${rule.enabled?"disabled":"enabled"}.`);await load();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  function editResource(resource: ResourceProfile) { setEditingResource(resource); setResourceDraft({ jobTitle: resource.role_title || "", status: resource.status, weeklyCapacityHours: String(resource.weekly_capacity_hours) }); setFeedback(""); }
  async function saveResource(event: React.FormEvent) { event.preventDefault(); if (!canManageSettings || !editingResource) return; const hours = Number(resourceDraft.weeklyCapacityHours); if (!Number.isFinite(hours) || hours < 0 || hours > 168) { setError("Weekly capacity must be between 0 and 168 hours."); return; } setBusy(true); setError(""); try { await api.updateResourceProfile(context, editingResource.id, { jobTitle: resourceDraft.jobTitle || null, status: resourceDraft.status, standardCapacityMinutesWeek: Math.round(hours * 60) }); setEditingResource(null); setFeedback("Resource settings saved."); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  if (loading) return <Loading text="Loading practice settings" />;
  return <section className="pm-page"><Head title="Practice Management settings" body="Configuration owned by the Practice Management application." />{error && <Failure message={error} retry={load} />}{feedback && <MessageBar intent="success"><MessageBarBody>{feedback}</MessageBarBody></MessageBar>}{!canManageSettings && settingsSection !== "collaboration" && <MessageBar intent="info"><MessageBarBody>Owner or administrator access is required to change these settings. The current values are read-only.</MessageBarBody></MessageBar>}
    {settingsSection === "services" ? <section className="pm-section"><header><div><h2>Service catalogue</h2><p>Services can support accounting and future specialist modules.</p></div></header>{canManageSettings && <form className="pm-add-row" onSubmit={addService}><Field label="Service name" required><Input value={name} maxLength={160} onChange={(_, data) => setName(data.value)} /></Field><Field label="Category" required><Select value={category} onChange={(_, data) => setCategory(data.value)}><option value="">Select category</option>{practiceServiceCategories.map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field><Button appearance="primary" type="submit" disabled={!name.trim() || !category || busy}>Save</Button><Button type="button" disabled={(!name && !category) || busy} onClick={() => { setName(""); setCategory(""); }}>Cancel</Button></form>}<Table aria-label="Service catalogue"><TableHeader><TableRow><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Category</TableHeaderCell><TableHeaderCell>Frequency</TableHeaderCell><TableHeaderCell>Module</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{services.map((service) => <TableRow key={service.id}><TableCell><strong>{service.name}</strong>{service.description && <small>{service.description}</small>}</TableCell><TableCell>{service.category ? label(service.category) : "General"}</TableCell><TableCell>{service.default_frequency ? label(service.default_frequency) : "Not set"}</TableCell><TableCell>{service.specialist_module_key ? label(service.specialist_module_key) : "Practice Management"}</TableCell><TableCell><Status value={service.status} /></TableCell></TableRow>)}</TableBody></Table></section>
    : settingsSection === "work-templates" ? <section className="pm-section"><header><div><h2>Work templates</h2><p>Versioned workflow structures used to generate historically reproducible work.</p></div></header><Table aria-label="Work templates"><TableHeader><TableRow><TableHeaderCell>Template</TableHeaderCell><TableHeaderCell>Service</TableHeaderCell><TableHeaderCell>Version</TableHeaderCell><TableHeaderCell>Stages</TableHeaderCell><TableHeaderCell>Tasks</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Action</TableHeaderCell></TableRow></TableHeader><TableBody>{templates.map((template) => <TableRow key={template.id}><TableCell>{template.name}</TableCell><TableCell>{template.service_name || "Any service"}</TableCell><TableCell>{template.version}</TableCell><TableCell>{template.stages?.length||0}</TableCell><TableCell>{template.tasks?.length || 0}</TableCell><TableCell><Status value={template.status} /></TableCell><TableCell>{canManageSettings && template.status === "draft" && <Button size="small" disabled={busy} onClick={() => { setBusy(true); setFeedback(""); void api.publishPracticeWorkTemplate(context, template.id).then(() => { setFeedback("Work template published."); return load(); }).catch((e) => setError(errorText(e))).finally(() => setBusy(false)); }}>Publish</Button>}</TableCell></TableRow>)}</TableBody></Table></section>
    : settingsSection === "automation" ? <section className="pm-section"><header><div><h2>Workflow &amp; automation</h2><p>Constrained event, condition and action rules. Arbitrary code and webhooks are not supported.</p></div>{canManageSettings && <Button appearance="primary" disabled={busy} onClick={()=>void addAutomation()}>Add disabled rule</Button>}</header><Table aria-label="Practice automation rules"><TableHeader><TableRow><TableHeaderCell>Rule</TableHeaderCell><TableHeaderCell>Trigger</TableHeaderCell><TableHeaderCell>Conditions</TableHeaderCell><TableHeaderCell>Actions</TableHeaderCell><TableHeaderCell>Priority</TableHeaderCell><TableHeaderCell>Last execution</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Action</TableHeaderCell></TableRow></TableHeader><TableBody>{automation.map(rule=><TableRow key={rule.id}><TableCell>{rule.name}</TableCell><TableCell>{label(rule.trigger_type)}</TableCell><TableCell>{rule.conditions.length}</TableCell><TableCell>{rule.actions.map(action=>label(String(action.type))).join(", ")}</TableCell><TableCell>{rule.priority}</TableCell><TableCell>{date(rule.last_executed_at)}</TableCell><TableCell><Status value={rule.enabled?"active":"inactive"}/>{rule.last_failure_code&&<small>{rule.last_failure_code}</small>}</TableCell><TableCell>{canManageSettings && <Button size="small" disabled={busy} onClick={()=>void toggleAutomation(rule)}>{rule.enabled?"Disable":"Enable"}</Button>}</TableCell></TableRow>)}</TableBody></Table></section>
    : settingsSection === "resources" ? <section className="pm-section"><header><div><h2>Resources &amp; economics</h2><p>Resource status, role and standard weekly capacity used by planning and economics.</p></div></header>{editingResource && canManageSettings && <form className="pm-add-row" onSubmit={saveResource}><Field label="Job title"><Input value={resourceDraft.jobTitle} onChange={(_, data) => setResourceDraft((current) => ({ ...current, jobTitle: data.value }))} /></Field><Field label="Status"><Select value={resourceDraft.status} onChange={(_, data) => setResourceDraft((current) => ({ ...current, status: data.value }))}>{["active","inactive","unavailable","leave_unavailable","future_starter"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</Select></Field><Field label="Weekly capacity (hours)" required><Input type="number" min={0} max={168} step={0.25} value={resourceDraft.weeklyCapacityHours} onChange={(_, data) => setResourceDraft((current) => ({ ...current, weeklyCapacityHours: data.value }))} /></Field><Button appearance="primary" type="submit" disabled={busy}>Save</Button><Button type="button" disabled={busy} onClick={() => setEditingResource(null)}>Cancel</Button></form>}<Table aria-label="Resource settings"><TableHeader><TableRow><TableHeaderCell>Resource</TableHeaderCell><TableHeaderCell>Team</TableHeaderCell><TableHeaderCell>Job title</TableHeaderCell><TableHeaderCell>Weekly capacity</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Action</TableHeaderCell></TableRow></TableHeader><TableBody>{resources.map((resource) => <TableRow key={resource.id}><TableCell>{resource.display_name}</TableCell><TableCell>{resource.team_name || "Unassigned"}</TableCell><TableCell>{resource.role_title || "Not set"}</TableCell><TableCell>{resource.weekly_capacity_hours} hours</TableCell><TableCell><Status value={resource.status} /></TableCell><TableCell>{canManageSettings && <Button size="small" onClick={() => editResource(resource)}>Edit</Button>}</TableCell></TableRow>)}</TableBody></Table></section>
    : <section className="pm-section"><header><div><h2>Portal &amp; collaboration</h2><p>Practice-wide defaults for client requests, documents and portal communication.</p></div></header><MessageBar intent="info"><MessageBarBody><b>Not available in Practice Management yet.</b> Client collaboration is supported per client and engagement, but no practice-wide collaboration settings contract is implemented.</MessageBarBody></MessageBar></section>}
  </section>;
}
