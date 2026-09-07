import { describe, expect, it } from "vitest";
import { deliveryNextAction, type DeliveryWork } from "./practice-delivery";
import { eligibleRequestRecipients } from "./practice-delivery";
const work: DeliveryWork = { id: "work", client_id: "client", client_service_id: "service", title: "Delivery", status: "in_progress", priority: "normal", tasks: [], reviews: [], stages: [] };
describe("delivery guidance", () => {
  it("directs a blocked stage to workflow instead of offering completion", () => {
    expect(deliveryNextAction({ ...work, stages: [{ id: "stage", work_item_id: "work", name: "Prepare", sequence: 1, stage_type: "preparation", status: "blocked", source_template_version: 1, block_reason: "Missing evidence" }] })).toMatchObject({ title: "Resolve the blocker", area: "workflow", action: "inspect", description: "Missing evidence" });
  });
  it("keeps unfinished tasks actionable and only offers completion when prerequisites are clear", () => {
    expect(deliveryNextAction({ ...work, tasks: [{ id: "task", work_item_id: "work", title: "Check figures", sequence: 1, status: "in_progress" }] }).action).toBe("inspect");
    expect(deliveryNextAction(work).action).toBe("complete");
  });
  it("does not mistake an unrelated approval for a required task review", () => {
    const task = { id: "task", work_item_id: "work", title: "Check figures", sequence: 1, status: "completed" as const, review_required: true };
    const review = { id: "review", work_item_id: "work", practice_task_id: "different", status: "approved" as const, requested_at: "2026-09-07" };
    expect(deliveryNextAction({ ...work, tasks: [task], reviews: [review] })).toMatchObject({ title: "Request the required review", area: "reviews" });
    expect(deliveryNextAction({ ...work, tasks: [task], reviews: [{ ...review, practice_task_id: "task" }] }).action).toBe("complete");
  });
  it("prioritises review feedback and never offers actions on closed work", () => {
    expect(deliveryNextAction({ ...work, reviews: [{ id: "review", work_item_id: "work", status: "changes_requested", requested_at: "2026-09-07", decision_reason: "Explain the variance" }] })).toMatchObject({ area: "reviews", description: "Explain the variance" });
    expect(deliveryNextAction({ ...work, status: "completed" }).action).toBe("none");
  });
});
describe("client request recipients", () => {
  const recipient = { id: "canonical-access", display_name: "Client", email_normalized: "client@example.test", status: "active", principal_status: "active" };
  it("allows client-wide and matching service access but rejects revoked or unrelated scopes", () => {
    expect(eligibleRequestRecipients([recipient, { ...recipient, id: "service-access", client_service_id: "service" }, { ...recipient, id: "wrong-service", client_service_id: "other" }, { ...recipient, id: "wrong-engagement", engagement_id: "other" }, { ...recipient, id: "revoked", status: "revoked" }], work).map(item => item.id)).toEqual(["canonical-access", "service-access"]);
  });
  it("does not offer engagement-scoped access for a general client request", () => {
    expect(eligibleRequestRecipients([{ ...recipient, engagement_id: "engagement" }])).toEqual([]);
  });
});
