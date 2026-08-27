import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  createTableColumn,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Skeleton,
  SkeletonItem,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Textarea,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import {
  api,
  type ApiContext,
  type CapacityRow,
  type PortfolioEconomicsRow,
  type PracticeEconomicsOverview,
  type ResourceProfile,
  type TimeEntry,
  type WorkAllocation,
} from "./api";
import { formatDate } from "./displayFormat";
import { statutoryLabel } from "./format";
import { statusBadgeProps } from "./statusBadge";
import "./resource-economics.css";

export type ResourceEconomicsView = "resources" | "capacity" | "allocation" | "time" | "portfolio" | "management";

type Props = {
  context: ApiContext;
  view: ResourceEconomicsView;
  onOpenWork?: (id: string) => void;
};

type CapacityTone = "available" | "balanced" | "pressure" | "overallocated";

const label = statutoryLabel;
const date = (value?: string | null) => formatDate(value, "Not set");
const errorText = (value: unknown) => value instanceof Error ? value.message : "The request could not be completed.";
const hours = (value: number | null | undefined) => `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(value ?? 0)}h`;

function currentRange(now = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function capacityTone(remainingHours: number, availableHours: number): CapacityTone {
  if (remainingHours < 0) return "overallocated";
  if (availableHours > 0 && remainingHours / availableHours < 0.1) return "pressure";
  if (availableHours > 0 && remainingHours / availableHours < 0.25) return "balanced";
  return "available";
}

export function capacityDescription(remainingHours: number, availableHours: number): string {
  const tone = capacityTone(remainingHours, availableHours);
  if (tone === "overallocated") return `Over capacity by ${hours(Math.abs(remainingHours))}`;
  if (tone === "pressure") return `${hours(remainingHours)} remaining · Capacity pressure`;
  if (tone === "balanced") return `${hours(remainingHours)} remaining · Limited capacity`;
  return `${hours(remainingHours)} remaining · Available`;
}

export function formatEconomicValue(value: number | null | undefined, currency: string | undefined, state: string): string {
  if (value == null || state === "unavailable") return "Unavailable";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function filterResources(items: ResourceProfile[], query: string, team: string, status: string): ResourceProfile[] {
  const term = query.trim().toLocaleLowerCase();
  return items.filter((item) =>
    (!term || [item.display_name, item.team_name, item.role_title].some((value) => value?.toLocaleLowerCase().includes(term))) &&
    (!team || item.team_name === team) && (!status || item.status === status));
}

function Loading({ text }: { text: string }) {
  return <Skeleton className="re-loading" aria-label={text} role="status"><SkeletonItem size={24} /><SkeletonItem /><SkeletonItem /><SkeletonItem /></Skeleton>;
}

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <MessageBar intent="error"><MessageBarBody>{message}</MessageBarBody><Button appearance="transparent" onClick={retry}>Retry</Button></MessageBar>;
}

function Status({ value }: { value: string }) {
  return <Badge {...statusBadgeProps(value)}>{label(value)}</Badge>;
}

function Head({ title, body }: { title: string; body: string }) {
  return <header className="re-head"><h1>{title}</h1><p>{body}</p></header>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="re-empty">{children}</p>;
}

export default function ResourceEconomics({ view, ...props }: Props) {
  if (view === "capacity") return <CapacityView {...props} />;
  if (view === "allocation") return <AllocationView {...props} />;
  if (view === "time") return <TimeView {...props} />;
  if (view === "portfolio") return <PortfolioView {...props} />;
  if (view === "management") return <ManagementView {...props} />;
  return <ResourcesView {...props} />;
}

function ResourcesView({ context }: Omit<Props, "view">) {
  const [items, setItems] = useState<ResourceProfile[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [team, setTeam] = useState(""), [status, setStatus] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems((await api.resourceProfiles(context)).items); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => filterResources(items, query, team, status), [items, query, team, status]);
  const teams = useMemo(() => [...new Set(items.map((item) => item.team_name).filter((value): value is string => Boolean(value)))].sort(), [items]);
  const columns: TableColumnDefinition<ResourceProfile>[] = [
    createTableColumn({ columnId: "person", compare: (a, b) => a.display_name.localeCompare(b.display_name), renderHeaderCell: () => "Person", renderCell: (item) => <span className="re-primary-cell"><strong>{item.display_name}</strong><small>{item.role_title || "Role not set"}</small></span> }),
    createTableColumn({ columnId: "team", compare: (a, b) => (a.team_name || "").localeCompare(b.team_name || ""), renderHeaderCell: () => "Team", renderCell: (item) => item.team_name || "Unassigned" }),
    createTableColumn({ columnId: "availability", renderHeaderCell: () => "Available", renderCell: (item) => hours(item.available_hours) }),
    createTableColumn({ columnId: "workload", renderHeaderCell: () => "Assigned", renderCell: (item) => hours(item.assigned_hours) }),
    createTableColumn({ columnId: "capacity", renderHeaderCell: () => "Capacity", renderCell: (item) => hours(item.weekly_capacity_hours) }),
    createTableColumn({ columnId: "utilisation", renderHeaderCell: () => "Utilisation", renderCell: (item) => `${Math.round(item.utilisation_percentage)}%` }),
    createTableColumn({ columnId: "overdue", renderHeaderCell: () => "Overdue", renderCell: (item) => <span className={item.overdue_work > 0 ? "re-exception" : undefined}>{item.overdue_work}</span> }),
    createTableColumn({ columnId: "status", renderHeaderCell: () => "Status", renderCell: (item) => <Status value={item.status} /> }),
  ];
  if (loading) return <section className="re-page"><Head title="Resources" body="Operational capacity, workload and delivery exceptions for practice members." /><Loading text="Loading resources" /></section>;
  return <section className="re-page"><Head title="Resources" body="Operational capacity, workload and delivery exceptions for practice members." />{error && <Failure message={error} retry={load} />}
    <div className="re-filters"><Field label="Search"><Input type="search" value={query} onChange={(_, data) => setQuery(data.value)} placeholder="Person, role or team" /></Field><Field label="Team"><Select value={team} onChange={(_, data) => setTeam(data.value)}><option value="">All teams</option>{teams.map((value) => <option key={value}>{value}</option>)}</Select></Field><Field label="Status"><Select value={status} onChange={(_, data) => setStatus(data.value)}><option value="">All statuses</option>{["active", "unavailable", "future_starter", "inactive"].map((value) => <option value={value} key={value}>{label(value)}</option>)}</Select></Field></div>
    <p className="re-result-count" aria-live="polite">{visible.length} resource{visible.length === 1 ? "" : "s"}</p>
    {visible.length ? <div className="re-table-scroll"><DataGrid items={visible} columns={columns} sortable aria-label="Practice resources"><DataGridHeader><DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader><DataGridBody<ResourceProfile>>{({ item, rowId }) => <DataGridRow<ResourceProfile> key={rowId}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>}</DataGridBody></DataGrid></div> : <Empty>No resources match the current filters.</Empty>}
  </section>;
}

function CapacityView({ context }: Omit<Props, "view">) {
  const initial = useMemo(() => currentRange(), []);
  const [from, setFrom] = useState(initial.from), [to, setTo] = useState(initial.to), [items, setItems] = useState<CapacityRow[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems((await api.capacity(context, { from, to })).items); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, [context, from, to]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <section className="re-page"><Head title="Capacity" body="Available capacity less committed work and unavailable time. Forecast work is shown separately." /><Loading text="Loading capacity plan" /></section>;
  const periods = items[0]?.periods || [];
  return <section className="re-page"><Head title="Capacity" body="Available capacity less committed work and unavailable time. Forecast work is shown separately." />{error && <Failure message={error} retry={load} />}
    <div className="re-filters re-range"><Field label="From"><Input type="date" value={from} onChange={(_, data) => setFrom(data.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(_, data) => setTo(data.value)} /></Field></div>
    {items.length ? <div className="re-table-scroll"><Table aria-label="Resource capacity by period"><TableHeader><TableRow><TableHeaderCell>Resource</TableHeaderCell>{periods.map((period) => <TableHeaderCell key={period.key}>{period.label}</TableHeaderCell>)}</TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.resource_id}><TableCell><span className="re-primary-cell"><strong>{item.display_name}</strong><small>{item.team_name || "Unassigned"}</small></span></TableCell>{item.periods.map((period) => <TableCell key={period.key}><span className={`re-capacity re-capacity--${capacityTone(period.remaining_hours, period.available_hours)}`}><strong>{capacityDescription(period.remaining_hours, period.available_hours)}</strong><small>{hours(period.committed_hours)} committed · {hours(period.forecast_hours)} forecast · {hours(period.unavailable_hours)} unavailable</small></span></TableCell>)}</TableRow>)}</TableBody></Table></div> : <Empty>No capacity records are available for this period.</Empty>}
  </section>;
}

function AllocationView({ context, onOpenWork }: Omit<Props, "view">) {
  const initial = useMemo(() => currentRange(), []);
  const [items, setItems] = useState<WorkAllocation[]>([]), [resources, setResources] = useState<ResourceProfile[]>([]);
  const [from, setFrom] = useState(initial.from), [to, setTo] = useState(initial.to), [team, setTeam] = useState(""), [resourceByWork, setResourceByWork] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [allocationData, resourceData] = await Promise.all([api.workAllocations(context, { from, to }), api.resourceProfiles(context)]); setItems(allocationData.items); setResources(resourceData.items); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, [context, from, to]);
  useEffect(() => { void load(); }, [load]);
  const teams = [...new Set(items.map((item) => item.team_name).filter((value): value is string => Boolean(value)))].sort();
  const visible = team ? items.filter((item) => item.team_name === team) : items;
  async function reassign(item: WorkAllocation) { const resourceId = resourceByWork[item.id]; if (!resourceId) return; setBusy(item.id); setError(""); try { await api.reassignWork(context, item.id, { resourceId }); await load(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(""); } }
  if (loading) return <Loading text="Loading work allocation" />;
  return <section className="re-page"><Head title="Work allocation" body="Upcoming work, planned effort and resource capacity for authorised assignment decisions." />{error && <Failure message={error} retry={load} />}
    <div className="re-filters"><Field label="From"><Input type="date" value={from} onChange={(_, data) => setFrom(data.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(_, data) => setTo(data.value)} /></Field><Field label="Team"><Select value={team} onChange={(_, data) => setTeam(data.value)}><option value="">All teams</option>{teams.map((value) => <option key={value}>{value}</option>)}</Select></Field></div>
    {visible.length ? <div className="re-table-scroll"><Table aria-label="Upcoming work allocation"><TableHeader><TableRow><TableHeaderCell>Work</TableHeaderCell><TableHeaderCell>Due</TableHeaderCell><TableHeaderCell>Planned</TableHeaderCell><TableHeaderCell>Current owner</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Reassign</TableHeaderCell></TableRow></TableHeader><TableBody>{visible.map((item) => <TableRow key={item.id}><TableCell><span className="re-primary-cell">{onOpenWork ? <Button appearance="transparent" className="re-link" onClick={() => onOpenWork(item.id)}>{item.work_title}</Button> : <strong>{item.work_title}</strong>}<small>{item.client_name} · {item.service_name}</small></span></TableCell><TableCell>{date(item.due_date)}</TableCell><TableCell>{hours(item.planned_hours)}<small>{item.remaining_hours == null ? "Remaining not set" : `${hours(item.remaining_hours)} remaining`}</small></TableCell><TableCell>{item.resource_name || item.team_name || "Unassigned"}</TableCell><TableCell><Status value={item.assignment_state || item.status} /></TableCell><TableCell><div className="re-row-action"><Select aria-label={`Resource for ${item.work_title}`} value={resourceByWork[item.id] || ""} onChange={(_, data) => setResourceByWork((current) => ({ ...current, [item.id]: data.value }))}><option value="">Select resource</option>{resources.filter((resource) => resource.status === "active").map((resource) => <option key={resource.id} value={resource.id}>{resource.display_name} · {hours(resource.available_hours)} available</option>)}</Select><Button size="small" disabled={!resourceByWork[item.id] || Boolean(busy)} onClick={() => void reassign(item)}>{busy === item.id ? "Saving…" : "Assign"}</Button></div></TableCell></TableRow>)}</TableBody></Table></div> : <Empty>No upcoming work matches the current period and team.</Empty>}
  </section>;
}

function TimeView({ context }: Omit<Props, "view">) {
  const initial = useMemo(() => currentRange(), []);
  const [items, setItems] = useState<TimeEntry[]>([]), [resources, setResources] = useState<ResourceProfile[]>([]), [work, setWork] = useState<WorkAllocation[]>([]);
  const [from, setFrom] = useState(initial.from), [to, setTo] = useState(initial.to), [entryDate, setEntryDate] = useState(initial.from), [resourceId, setResourceId] = useState(""), [workItemId, setWorkItemId] = useState(""), [duration, setDuration] = useState(""), [description, setDescription] = useState(""), [billable, setBillable] = useState(true);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [timeData, resourceData, workData] = await Promise.all([api.timeEntries(context, { from, to }), api.resourceProfiles(context), api.workAllocations(context, { from, to })]); setItems(timeData.items); setResources(resourceData.items); setWork(workData.items); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, [context, from, to]);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: React.FormEvent) { event.preventDefault(); const durationHours = Number(duration), selectedWork = work.find((item) => item.id === workItemId); if (!resourceId || !selectedWork?.client_id || !selectedWork.client_service_id || !entryDate || !Number.isFinite(durationHours) || durationHours <= 0) return; setSaving(true); setError(""); try { await api.createTimeEntry(context, { resourceId, workItemId, clientId: selectedWork.client_id, clientServiceId: selectedWork.client_service_id, date: entryDate, durationHours, description: description.trim(), billable }); setDuration(""); setDescription(""); await load(); } catch (reason) { setError(errorText(reason)); } finally { setSaving(false); } }
  if (loading) return <Loading text="Loading time entries" />;
  return <section className="re-page"><Head title="Time" body="Lightweight effort capture against accessible client work. Approval remains optional." />{error && <Failure message={error} retry={load} />}
    <form className="re-time-form" onSubmit={submit}><Field label="Date" required><Input type="date" value={entryDate} onChange={(_, data) => setEntryDate(data.value)} /></Field><Field label="Resource" required><Select value={resourceId} onChange={(_, data) => setResourceId(data.value)}><option value="">Select resource</option>{resources.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</Select></Field><Field label="Work item" required><Select value={workItemId} onChange={(_, data) => setWorkItemId(data.value)}><option value="">Select work</option>{work.map((item) => <option key={item.id} value={item.id}>{item.client_name} · {item.work_title}</option>)}</Select></Field><Field label="Duration (hours)" required><Input type="number" min="0.1" step="0.1" value={duration} onChange={(_, data) => setDuration(data.value)} /></Field><Field label="Narrative" className="re-time-narrative"><Textarea value={description} maxLength={1000} onChange={(_, data) => setDescription(data.value)} /></Field><Checkbox checked={billable} onChange={(_, data) => setBillable(Boolean(data.checked))} label="Billable" /><Button appearance="primary" type="submit" disabled={saving || !resourceId || !workItemId || !duration}>{saving ? "Saving…" : "Add time"}</Button></form>
    <div className="re-filters re-range"><Field label="From"><Input type="date" value={from} onChange={(_, data) => setFrom(data.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(_, data) => setTo(data.value)} /></Field></div>
    {items.length ? <div className="re-table-scroll"><Table aria-label="Time entries"><TableHeader><TableRow><TableHeaderCell>Date</TableHeaderCell><TableHeaderCell>Resource</TableHeaderCell><TableHeaderCell>Client / work</TableHeaderCell><TableHeaderCell>Duration</TableHeaderCell><TableHeaderCell>Classification</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell>{date(item.date)}</TableCell><TableCell>{item.resource_name}</TableCell><TableCell><span className="re-primary-cell"><strong>{item.client_name}</strong><small>{item.work_title || item.service_name || "General work"}</small></span></TableCell><TableCell>{hours(item.duration_hours)}</TableCell><TableCell>{item.billable ? "Billable" : "Non-billable"}</TableCell><TableCell><Status value={item.status} /></TableCell></TableRow>)}</TableBody></Table></div> : <Empty>No time has been recorded for this period.</Empty>}
  </section>;
}

function PortfolioView({ context }: Omit<Props, "view">) {
  const [items, setItems] = useState<PortfolioEconomicsRow[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [team, setTeam] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems((await api.portfolioEconomics(context)).items); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  const teams = [...new Set(items.map((item) => item.team_name).filter((value): value is string => Boolean(value)))].sort();
  const visible = team ? items.filter((item) => item.team_name === team) : items;
  if (loading) return <section className="re-page"><Head title="Portfolio economics" body="Workload, delivery pressure and explainable economic performance by client." /><Loading text="Loading portfolio economics" /></section>;
  return <section className="re-page"><Head title="Portfolio economics" body="Workload, delivery pressure and explainable economic performance by client." />{error && <Failure message={error} retry={load} />}
    <div className="re-filters re-single-filter"><Field label="Team"><Select value={team} onChange={(_, data) => setTeam(data.value)}><option value="">All teams</option>{teams.map((value) => <option key={value}>{value}</option>)}</Select></Field></div>
    {visible.length ? <div className="re-table-scroll"><Table aria-label="Client portfolio economics"><TableHeader><TableRow><TableHeaderCell>Client / service</TableHeaderCell><TableHeaderCell>Owner</TableHeaderCell><TableHeaderCell>Workload</TableHeaderCell><TableHeaderCell>Delivery</TableHeaderCell><TableHeaderCell>WIP</TableHeaderCell><TableHeaderCell>Revenue / value</TableHeaderCell><TableHeaderCell>Cost</TableHeaderCell><TableHeaderCell>Contribution</TableHeaderCell><TableHeaderCell>Margin</TableHeaderCell><TableHeaderCell>Basis</TableHeaderCell></TableRow></TableHeader><TableBody>{visible.map((item) => <TableRow key={item.id}><TableCell><span className="re-primary-cell"><strong>{item.client_name}</strong><small>{item.service_name || "All active services"}</small></span></TableCell><TableCell>{item.owner_name || item.team_name || "Unassigned"}</TableCell><TableCell>{hours(item.workload_hours)}</TableCell><TableCell><span className={item.overdue_work > 0 || item.capacity_pressure === "overallocated" ? "re-exception" : undefined}>{item.overdue_work} overdue · {label(item.capacity_pressure)}</span></TableCell><TableCell>{formatEconomicValue(item.wip_amount, item.currency, item.commercial_value_state)}</TableCell><TableCell>{formatEconomicValue(item.revenue_amount, item.currency, item.commercial_value_state)}</TableCell><TableCell>{formatEconomicValue(item.cost_amount, item.currency, item.commercial_value_state)}</TableCell><TableCell>{formatEconomicValue(item.contribution_amount, item.currency, item.commercial_value_state)}</TableCell><TableCell>{item.margin_percentage == null || item.commercial_value_state === "unavailable" ? "Unavailable" : `${Math.round(item.margin_percentage)}%`}</TableCell><TableCell><Status value={item.commercial_value_state} /></TableCell></TableRow>)}</TableBody></Table></div> : <Empty>No portfolio records match the current team.</Empty>}
  </section>;
}

function ManagementView({ context }: Omit<Props, "view">) {
  const [overview, setOverview] = useState<PracticeEconomicsOverview | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setOverview(await api.practiceEconomicsOverview(context)); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <section className="re-page"><Head title="Practice overview" body="A decision-focused view of delivery, capacity and economics across the practice." /><Loading text="Loading practice overview" /></section>;
  if (!overview) return <section className="re-page"><Head title="Practice overview" body="Operational exceptions that require a management decision." /><Failure message={error || "The practice overview is unavailable."} retry={load} /></section>;
  const measures = [
    ["Due this week", overview.due_this_week, "Work requiring scheduling"],
    ["Overdue work", overview.overdue_work, "Delivery exception"],
    ["Waiting on client", overview.waiting_on_client, "Follow-up decision"],
    ["Review queue", overview.review_queue, "Reviewer capacity"],
    ["Capacity utilisation", `${Math.round(overview.capacity_utilisation_percentage)}%`, "Current period"],
    ["Forecast capacity", hours(overview.forecast_capacity_hours), "Remaining capacity"],
    ["Operational WIP", overview.wip_amount == null ? "Unavailable" : formatEconomicValue(overview.wip_amount, overview.currency, "known"), overview.wip_amount == null ? "No reliable billing source" : "Known or calculated"],
    ["Economic exceptions", overview.economic_exceptions, "Review source data"],
  ] as const;
  return <section className="re-page"><Head title="Practice overview" body="Operational exceptions and capacity signals that support management decisions." />{error && <Failure message={error} retry={load} />}<dl className="re-measures">{measures.map(([name, value, help]) => <div key={name}><dt>{name}</dt><dd>{value}</dd><span>{help}</span></div>)}</dl></section>;
}
