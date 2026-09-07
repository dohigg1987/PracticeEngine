import type { ClientRequestRecipient, PracticeWorkItem, PracticeTask, PracticeWorkStage, PracticeReview } from "./api";
export type DeliveryWork = PracticeWorkItem & { tasks?: PracticeTask[]; stages?: PracticeWorkStage[]; reviews?: PracticeReview[] };
type Area = "tasks" | "workflow" | "reviews";
const closed = (status: string) => ["completed", "cancelled"].includes(status);
const cleared = (status: string) => ["completed", "skipped"].includes(status);
const approved = (status: string) => ["approved", "completed"].includes(status);

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


export function eligibleRequestRecipients(items: ClientRequestRecipient[], work?: PracticeWorkItem): ClientRequestRecipient[] {
  return items.filter(item => ["active", "invited"].includes(item.status) && ["active", "invited"].includes(item.principal_status)
    && (!item.engagement_id || item.engagement_id === work?.engagement_id)
    && (!item.client_service_id || item.client_service_id === work?.client_service_id));
}

