import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRestoreFocusTarget, useRestoreFocusSource, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Select, Tab, TabList, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Textarea } from "@fluentui/react-components";
import { api, type ApiContext, type PracticeReview, type PracticeReviewPoint, type PracticeTask, type PracticeWorkItem, type PracticeWorkStage, type ResourceProfile } from "./api";
import { EmptyState, ErrorState, LoadingState, PageHeader, PageShell, StatusTreatment } from "./CanonicalPatterns";
import { formatDate } from "./displayFormat";
import { statutoryLabel as label } from "./format";
import PracticeClientRequestDialog from "./PracticeClientRequestDialog";
import "./practice-delivery.css";

export type DeliveryWork = PracticeWorkItem & { tasks?: PracticeTask[]; stages?: PracticeWorkStage[]; reviews?: PracticeReview[] };
type Area = "tasks" | "workflow" | "reviews";
const closed = (status: string) => ["completed", "cancelled"].includes(status);
const cleared = (status: string) => ["completed", "skipped"].includes(status);
const approved = (status: string) => ["approved", "completed"].includes(status);
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "The change could not be saved.";
export const stageChoices: Record<PracticeWorkStage["status"], PracticeWorkStage["status"][]> = {
  not_started: ["active", "blocked", "waiting"], active: ["blocked", "waiting", "review", "completed"],
  blocked: ["active", "waiting"], waiting: ["active", "blocked", "review"], review: ["active", "blocked", "completed"],
  completed: [], skipped: [],
};

export function deliveryNextAction(item: DeliveryWork): { title: string; description: string; area: Area; action: "start" | "inspect" | "complete" | "none" } {
  if (closed(item.status)) return { title: item.status === "completed" ? "Delivery complete" : "Work cancelled", description: "This work is closed. Its tasks and review history remain available.", area: "tasks", action: "none" };
  const tasks = item.tasks || [], stages = item.stages || [], reviews = item.reviews || [];
  const blocked = stages.find(stage => stage.status === "blocked");
  if (blocked) return { title: "Resolve the blocker", description: blocked.block_reason || blocked.name, area: "workflow", action: "inspect" };
  const changes = reviews.find(review => ["changes_requested", "rejected"].includes(review.status));
  if (changes) return { title: "Address the review feedback", description: changes.decision_reason || "Resolve the review points, then resubmit the review.", area: "reviews", action: "inspect" };
  if (item.status === "waiting_on_client") return { title: "Waiting on your client", description: "Check their response before resuming work.", area: "tasks", action: "inspect" };
  if (reviews.some(review => !approved(review.status))) return { title: "Review the work", description: "The reviewer needs to resolve any points and record a decision.", area: "reviews", action: "inspect" };
  if (["not_started", "ready"].includes(item.status)) return { title: "Ready to begin", description: tasks.length ? "Check the tasks and start delivery." : "Start work, then add the tasks needed to deliver it.", area: "tasks", action: "start" };
  const remaining = tasks.filter(task => !cleared(task.status));
  if (remaining.length) return { title: "Continue the tasks", description: `${remaining.length} task${remaining.length === 1 ? "" : "s"} remaining. ${remaining[0]!.title}`, area: "tasks", action: "inspect" };
  const missingReview = tasks.find(task => task.review_required && !reviews.some(review => review.practice_task_id === task.id && approved(review.status)));
  if (missingReview) return { title: "Request the required review", description: missingReview.title, area: "reviews", action: "inspect" };
  const stage = stages.find(entry => !cleared(entry.status));
  if (stage) return { title: "Progress the workflow", description: stage.name, area: "workflow", action: "inspect" };
  return { title: "Ready to complete", description: "Tasks, workflow stages and required reviews are clear. Confirm that delivery is finished.", area: "tasks", action: "complete" };
}

type DialogAction =
  | { kind: "task" } | { kind: "review"; taskId?: string } | { kind: "reschedule" }
  | { kind: "stage"; stage: PracticeWorkStage; status: PracticeWorkStage["status"] }
  | { kind: "decision"; review: PracticeReview; status: PracticeReview["status"] }
  | { kind: "point"; review: PracticeReview }
  | { kind: "point-status"; point: PracticeReviewPoint; status: PracticeReviewPoint["status"] }
  | { kind: "complete" };

export default function PracticeWorkDetail({ context, workItemId, onBack, onOpenClient }: {
  context: ApiContext; workItemId?: string; onBack?: () => void; onOpenClient?: (id: string) => void;
}) {
  const restoreFocusTarget = useRestoreFocusTarget();
  const [item, setItem] = useState<DeliveryWork | null>(null);
  const [resources, setResources] = useState<ResourceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [peopleError, setPeopleError] = useState("");
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState<Area>("tasks");
  const [dialog, setDialog] = useState<DialogAction | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setError("");
    if (!workItemId) { setLoading(false); setError("Choose a work item from the work queue."); return; }
    const [work, people] = await Promise.allSettled([api.practiceWorkItem(context, workItemId), api.resourceProfiles(context)]);
    if (request !== generation.current) return;
    if (work.status === "fulfilled" && work.value.item) setItem(work.value.item);
    else setError(work.status === "rejected" ? errorText(work.reason) : "This work item could not be found.");
    if (people.status === "fulfilled") { setResources(people.value.items); setPeopleError(""); }
    else { setResources([]); setPeopleError("People could not be loaded. Assignment and reviewer selection are unavailable."); }
    setLoading(false);
  }, [context, workItemId]);
  useEffect(() => { setItem(null); setLoading(true); setDialog(null); setRequestOpen(false); setNotice(""); setArea("tasks"); void load(); return () => { ++generation.current; }; }, [load]);
  async function mutate(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await load(); setNotice(message); } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  if (loading) return <LoadingState title="Work" description="Loading tasks, workflow and reviews." />;
  if (!item) return <PageShell><PageHeader title="Work unavailable" back={onBack} /><ErrorState message={error || "Work not found."} retry={load} /></PageShell>;
  const tasks = item.tasks || [], stages = item.stages || [], reviews = item.reviews || [];
  const next = deliveryNextAction(item);
  const isClosed = closed(item.status);
  const nextLabel = next.action === "start" ? "Start work" : next.action === "complete" ? "Complete work" : next.area === "reviews" ? "View reviews" : next.area === "workflow" ? "View workflow" : "View tasks";
  function nextClick() {
    if (!item) return;
    if (next.action === "start") void mutate(() => api.updatePracticeWorkStatus(context, item.id, "in_progress"), "Work started.");
    else if (next.action === "complete") setDialog({ kind: "complete" });
    else setArea(next.area);
  }
  return <PageShell className="pd-page">
    <PageHeader title={item.title} description={`${item.client_name || "Client"} · ${item.service_name || "Service"}`} back={onBack} backLabel="Back to work"
      meta={<StatusTreatment value={item.status} />} secondaryActions={<div className="pd-actions"><Button onClick={() => void load()} disabled={busy}>Refresh</Button>{!isClosed && <Button onClick={() => setRequestOpen(true)} disabled={busy}>Request from client</Button>}</div>} />
    {error && <ErrorState title="The work could not be updated" message={error} retry={load} />}
    {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}
    {peopleError && <MessageBar intent="warning"><MessageBarBody>{peopleError}</MessageBarBody></MessageBar>}
    <dl className="pd-facts">
      <div><dt>Client</dt><dd><Button appearance="transparent" onClick={() => onOpenClient?.(item.client_id)}>{item.client_name || "Open client"}</Button></dd></div>
      <div><dt>Owner</dt><dd>{item.assigned_member_name || item.assigned_team_name || "Unassigned"}</dd></div>
      <div><dt>Due date</dt><dd>{formatDate(item.due_date, "Not set")}{!isClosed && <Button size="small" appearance="transparent" onClick={() => setDialog({ kind: "reschedule" })}>Reschedule</Button>}</dd></div>
      <div><dt>Priority</dt><dd>{label(item.priority)}</dd></div>
      {item.period_reference && <div><dt>Period</dt><dd>{item.period_reference}</dd></div>}
    </dl>
    <section className="pd-next" aria-label="Next action"><div><h2>{next.title}</h2><p>{next.description}</p></div>{next.action !== "none" && <Button {...restoreFocusTarget} appearance="primary" disabled={busy} onClick={nextClick}>{nextLabel}</Button>}</section>
    {!isClosed && <div className="pd-actions">
      <Field label="Work owner"><Select disabled={busy || !resources.length} value={item.assigned_member_id || ""} onChange={(_, data) => { if (data.value && data.value !== item.assigned_member_id) void mutate(() => api.reassignWork(context, item.id, { resourceId: data.value }), "Owner updated."); }}><option value="">Choose owner</option>{resources.filter(person => person.status === "active").map(person => <option value={person.id} key={person.id}>{person.display_name}</option>)}</Select></Field>
      {["waiting_internal", "waiting_on_client"].includes(item.status) && <Button disabled={busy} onClick={() => void mutate(() => api.updatePracticeWorkStatus(context, item.id, "in_progress"), "Work resumed.")}>Resume work</Button>}
    </div>}
    <TabList className="pd-tabs" aria-label="Work details" selectedValue={area} onTabSelect={(_, data) => setArea(data.value as Area)}>
      <Tab value="tasks">Tasks · {tasks.filter(task => cleared(task.status)).length}/{tasks.length}</Tab>
      <Tab value="workflow">Workflow · {stages.filter(stage => cleared(stage.status)).length}/{stages.length}</Tab>
      <Tab value="reviews">Reviews · {reviews.filter(review => !approved(review.status)).length} open</Tab>
    </TabList>
    {area === "tasks" && <section className="pd-section" aria-label="Tasks">
      <header><div><h2>Tasks</h2><span className="pd-muted">The steps needed to deliver this work.</span></div>{!isClosed && <Button {...restoreFocusTarget} disabled={busy} onClick={() => setDialog({ kind: "task" })}>Add task</Button>}</header>
      {tasks.length ? <div className="pd-table-scroll" tabIndex={0} role="region" aria-label="Task table"><Table aria-label="Work tasks"><TableHeader><TableRow><TableHeaderCell>Task</TableHeaderCell><TableHeaderCell>Owner / due</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Action</TableHeaderCell></TableRow></TableHeader><TableBody>{tasks.map(task => <TableRow key={task.id}>
        <TableCell><span className="pd-primary"><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}{task.blockers?.length ? <small>Blocked: {task.blockers.map(blocker => blocker.blockingReason || label(blocker.dependencyType)).join(", ")}</small> : null}{task.review_required && <small>Review required</small>}</span></TableCell>
        <TableCell><span className="pd-primary">{task.assignee_name || resources.find(person => person.id === task.assignee_member_id)?.display_name || "Unassigned"}<small>{formatDate(task.due_date, "No due date")}</small></span></TableCell>
        <TableCell><StatusTreatment value={task.status} /></TableCell>
        <TableCell><div className="pd-actions">{!isClosed && !cleared(task.status) && <>
          {["not_started", "blocked"].includes(task.status) && <Button disabled={busy || Boolean(task.blockers?.length)} onClick={() => void mutate(() => api.updatePracticeTaskStatus(context, task.id, "in_progress"), "Task started.")}>Start</Button>}
          {["in_progress", "review"].includes(task.status) && <Button disabled={busy || Boolean(task.blockers?.length)} onClick={() => void mutate(() => api.updatePracticeTaskStatus(context, task.id, "completed"), "Task completed.")}>Complete task</Button>}
        </>}{!isClosed && task.review_required && !reviews.some(review => review.practice_task_id === task.id) && <Button {...restoreFocusTarget} disabled={busy} onClick={() => setDialog({ kind: "review", taskId: task.id })}>Request review</Button>}</div></TableCell>
      </TableRow>)}</TableBody></Table></div> : <div className="pd-empty"><h3>No tasks yet</h3><p>Add the first task so the team knows what needs doing.</p>{!isClosed && <Button {...restoreFocusTarget} onClick={() => setDialog({ kind: "task" })}>Add first task</Button>}</div>}
    </section>}
    {area === "workflow" && <section className="pd-section" aria-label="Workflow">
      <header><div><h2>Workflow</h2><span className="pd-muted">Stage progression follows the work template's delivery controls.</span></div></header>
      {stages.length ? <div className="pd-table-scroll" tabIndex={0} role="region" aria-label="Workflow table"><Table aria-label="Operational workflow stages"><TableHeader><TableRow><TableHeaderCell>Stage</TableHeaderCell><TableHeaderCell>Progress</TableHeaderCell><TableHeaderCell>Action</TableHeaderCell></TableRow></TableHeader><TableBody>{stages.map(stage => <TableRow key={stage.id}><TableCell><span className="pd-primary"><strong>{stage.sequence}. {stage.name}</strong><small>{label(stage.stage_type)}</small>{stage.block_reason && <small>{stage.block_reason}</small>}</span></TableCell><TableCell><StatusTreatment value={stage.status} /></TableCell><TableCell>{!isClosed && stageChoices[stage.status].length > 0 && <Select aria-label={`Progress ${stage.name}`} disabled={busy} value="" onChange={(_, data) => { if (data.value) setDialog({ kind: "stage", stage, status: data.value as PracticeWorkStage["status"] }); }}><option value="">Choose next step</option>{stageChoices[stage.status].map(status => <option key={status} value={status}>{status === "active" ? "Start / resume" : label(status)}</option>)}</Select>}</TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState title="No staged workflow" description="This work uses its task list. Stages are included when work is generated from a staged template." />}
    </section>}
    {area === "reviews" && <section className="pd-section" aria-label="Reviews">
      <header><div><h2>Reviews</h2><span className="pd-muted">Record feedback and decisions against a specific task or stage.</span></div>{!isClosed && <Button disabled={busy || !(tasks.length || stages.length)} onClick={() => setDialog({ kind: "review" })}>Request review</Button>}</header>
      {reviews.length ? <div aria-label="Work operational reviews">{reviews.map(review => <article className="pd-review" key={review.id}>
        <header><div><h3>{tasks.find(task => task.id === review.practice_task_id)?.title || stages.find(stage => stage.id === review.work_stage_id)?.name || review.stage_name || "Work review"}</h3><span className="pd-muted">{review.reviewer_name || resources.find(person => person.id === review.reviewer_member_id)?.display_name || "Review team"} · Requested {formatDate(review.requested_at)}</span></div><StatusTreatment value={review.status} /></header>
        {review.decision_reason && <p>{review.decision_reason}</p>}
        {!isClosed && <div className="pd-actions">
          {["requested", "reopened"].includes(review.status) && <Button disabled={busy} onClick={() => void mutate(() => api.decidePracticeReview(context, review.id, "in_progress"), "Review started.")}>Start review</Button>}
          {review.status === "in_progress" && <><Button disabled={busy || review.review_points?.some(point => point.status !== "cleared")} onClick={() => setDialog({ kind: "decision", review, status: "approved" })}>Approve review</Button><Button {...restoreFocusTarget} disabled={busy} onClick={() => setDialog({ kind: "decision", review, status: "changes_requested" })}>Request changes</Button></>}
          {["changes_requested", "rejected"].includes(review.status) && <Button disabled={busy} onClick={() => void mutate(() => api.decidePracticeReview(context, review.id, "reopened"), "Review resubmitted.")}>Resubmit review</Button>}
          {!approved(review.status) && <Button {...restoreFocusTarget} disabled={busy} onClick={() => setDialog({ kind: "point", review })}>Add review point</Button>}
        </div>}
        {review.review_points?.length ? <ul>{review.review_points.map(point => <li className="pd-point" key={point.id}><div><strong>{point.description}</strong>{point.resolution && <p>{point.resolution}</p>}<StatusTreatment value={point.status} /></div>{!isClosed && !approved(review.status) && <div className="pd-actions">
          {["open", "reopened"].includes(point.status) && <Button {...restoreFocusTarget} disabled={busy} onClick={() => setDialog({ kind: "point-status", point, status: "addressed" })}>Address point</Button>}
          {point.status === "addressed" && <><Button {...restoreFocusTarget} disabled={busy} onClick={() => setDialog({ kind: "point-status", point, status: "cleared" })}>Clear point</Button><Button {...restoreFocusTarget} disabled={busy} onClick={() => setDialog({ kind: "point-status", point, status: "reopened" })}>Reopen point</Button></>}
        </div>}</li>)}</ul> : <p className="pd-muted">No review points recorded.</p>}
      </article>)}</div> : <EmptyState title="No review requested" description={tasks.length || stages.length ? "Choose a task or stage and a reviewer to begin." : "Add a task before requesting a review."} />}
    </section>}
    {dialog && <DeliveryDialog key={JSON.stringify(dialog)} action={dialog} item={item} resources={resources} context={context} onClose={() => setDialog(null)} onSaved={async message => { setDialog(null); await load(); setNotice(message); }} />}
    {requestOpen && <PracticeClientRequestDialog context={context} clientId={item.client_id} work={item} onClose={() => setRequestOpen(false)} onCreated={async () => { setRequestOpen(false); await load(); setNotice("Client request sent."); }} />}
  </PageShell>;
}

function DeliveryDialog({ action, item, context, resources, onClose, onSaved }: { action: DialogAction; item: DeliveryWork; context: ApiContext; resources: ResourceProfile[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const restoreFocusSource = useRestoreFocusSource();
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(item.due_date || "");
  const [person, setPerson] = useState("");
  const [target, setTarget] = useState(action.kind === "review" && action.taskId ? `task:${action.taskId}` : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogTitle = action.kind === "task" ? "Add task" : action.kind === "review" ? "Request review" : action.kind === "reschedule" ? "Reschedule work" : action.kind === "stage" ? `${label(action.status)}: ${action.stage.name}` : action.kind === "decision" ? action.status === "approved" ? "Approve review" : "Request changes" : action.kind === "point" ? "Add review point" : action.kind === "point-status" ? `${label(action.status)} review point` : "Complete work";
  const reasonRequired = action.kind === "reschedule" || action.kind === "point" || action.kind === "point-status" || (action.kind === "stage" && action.status === "blocked") || (action.kind === "decision" && action.status === "changes_requested");
  const invalid = (reasonRequired && !reason.trim()) || (action.kind === "task" && !title.trim()) || (action.kind === "review" && (!target || !person)) || (action.kind === "reschedule" && (!date || date === item.due_date));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || busy) return;
    setBusy(true); setError("");
    try {
      if (action.kind === "task") await api.createPracticeTask(context, item.id, { title: title.trim(), description: reason.trim() || undefined, sequence: Math.max(0, ...(item.tasks || []).map(task => task.sequence)) + 1, dueDate: date || undefined, assigneeMemberId: person || undefined });
      else if (action.kind === "review") {
        const [kind, id] = target.split(":");
        const preparer = kind === "task" ? item.tasks?.find(task => task.id === id)?.assignee_member_id : item.assigned_member_id;
        await api.requestPracticeReview(context, { workItemId: item.id, ...(kind === "task" ? { taskId: id } : { stageId: id }), reviewerMemberId: person, preparerMemberId: preparer || undefined });
      } else if (action.kind === "reschedule") await api.overridePracticeDeadline(context, item.id, date, reason.trim());
      else if (action.kind === "stage") await api.advancePracticeStage(context, action.stage.id, action.status, reason.trim() || undefined);
      else if (action.kind === "decision") await api.decidePracticeReview(context, action.review.id, action.status, reason.trim() || undefined);
      else if (action.kind === "point") await api.createPracticeReviewPoint(context, action.review.id, reason.trim());
      else if (action.kind === "point-status") await api.updatePracticeReviewPoint(context, action.point.id, action.status, reason.trim());
      else await api.updatePracticeWorkStatus(context, item.id, "completed");
      await onSaved(action.kind === "task" ? "Task added." : action.kind === "review" ? "Review requested." : action.kind === "complete" ? "Work completed." : "Change saved.");
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  }
  const reviewTargets = [
    ...(item.tasks || []).map(task => ({ value: `task:${task.id}`, label: `Task · ${task.title}`, available: !(item.reviews || []).some(review => review.practice_task_id === task.id && !approved(review.status)) })),
    ...(item.stages || []).map(stage => ({ value: `stage:${stage.id}`, label: `Stage · ${stage.name}`, available: !(item.reviews || []).some(review => review.work_stage_id === stage.id && !approved(review.status)) })),
  ];
  return <Dialog open onOpenChange={(_, data) => { if (!data.open && !busy) onClose(); }}><DialogSurface {...restoreFocusSource}><form onSubmit={event => void save(event)}><DialogBody><DialogTitle>{dialogTitle}</DialogTitle><DialogContent className="pd-form">
    {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    {action.kind === "complete" && <p>Confirm that this work has been delivered. The server will check required tasks, stages and reviews before closing it.</p>}
    {action.kind === "task" && <Field label="Task title" required><Input disabled={busy} maxLength={240} value={title} onChange={(_, data) => setTitle(data.value)} /></Field>}
    {action.kind === "review" && <><Field label="Task or stage" required><Select disabled={busy} value={target} onChange={(_, data) => setTarget(data.value)}><option value="">Choose what to review</option>{reviewTargets.filter(entry => entry.available).map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</Select></Field><p>The reviewer must be able to review this work. A preparer cannot approve their own review.</p></>}
    {(action.kind === "task" || action.kind === "review") && <Field label={action.kind === "review" ? "Reviewer" : "Assignee"} required={action.kind === "review"}><Select disabled={busy} value={person} onChange={(_, data) => setPerson(data.value)}><option value="">Choose a person</option>{resources.filter(resource => resource.status === "active").map(resource => <option key={resource.id} value={resource.id}>{resource.display_name}</option>)}</Select></Field>}
    {(action.kind === "task" || action.kind === "reschedule") && <Field label="Due date" required={action.kind === "reschedule"}><Input type="date" disabled={busy} value={date} onChange={(_, data) => setDate(data.value)} /></Field>}
    {action.kind !== "review" && action.kind !== "complete" && <Field label={action.kind === "task" ? "Description" : action.kind === "point" ? "Review point" : action.kind === "point-status" ? "Resolution / reason" : "Reason / notes"} required={reasonRequired}><Textarea disabled={busy} maxLength={action.kind === "reschedule" ? 500 : action.kind === "task" || action.kind === "decision" ? 2000 : 4000} value={reason} onChange={(_, data) => setReason(data.value)} resize="vertical" /></Field>}
  </DialogContent><DialogActions><Button type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" appearance="primary" disabled={busy || invalid}>{busy ? "Saving…" : action.kind === "complete" ? "Complete work" : action.kind === "task" ? "Add task" : action.kind === "review" ? "Request review" : "Save"}</Button></DialogActions></DialogBody></form></DialogSurface></Dialog>;
}
