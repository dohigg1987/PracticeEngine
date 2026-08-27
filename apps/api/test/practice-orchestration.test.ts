import assert from "node:assert/strict";
import test from "node:test";
import { assertAutomationChain, assertReviewPointTransition, assertReviewTransition, assertStageTransition, automationConditionsMatch, boundedReplayRange, evaluateStageGates, validateAutomationDefinition, wouldCreateDependencyCycle } from "../src/practice-orchestration.ts";

const openGates = { mandatoryTasksIncomplete: 0, approvalRequired: false, approvalRecorded: false, predecessorIncomplete: false, specialistCompletionRequired: false, specialistCompletionRecorded: false, manualReleaseRequired: false, manualReleaseGranted: false };

test("workflow gates report each unmet constrained criterion", () => {
  assert.deepEqual(evaluateStageGates({ allMandatoryTasksComplete: true, requiredApproval: true, predecessorStageComplete: true, specialistCompletion: true, manualRelease: true }, { ...openGates, mandatoryTasksIncomplete: 2, predecessorIncomplete: true, specialistCompletionRequired: true, manualReleaseRequired: true }), ["mandatory_tasks_incomplete", "approval_required", "predecessor_stage_incomplete", "specialist_completion_required", "manual_release_required"]);
});
test("workflow transition accepts deterministic valid progression", () => assert.doesNotThrow(() => assertStageTransition("active", "completed", false, [])));
test("workflow transition rejects invalid progression", () => assert.throws(() => assertStageTransition("not_started", "completed", false, []), /Cannot move/));
test("workflow transition rejects unmet completion gates", () => assert.throws(() => assertStageTransition("active", "completed", false, ["approval_required"]), /gates are not met/));
test("workflow transition rejects skipping a mandatory stage", () => assert.throws(() => assertStageTransition("not_started", "skipped", false, []), /cannot be skipped/));
test("review lifecycle supports changes, resubmission and approval",()=>{assert.doesNotThrow(()=>assertReviewTransition("in_progress","changes_requested"));assert.doesNotThrow(()=>assertReviewTransition("changes_requested","reopened"));assert.doesNotThrow(()=>assertReviewTransition("reopened","in_progress"));assert.doesNotThrow(()=>assertReviewTransition("in_progress","approved"));});
test("review lifecycle rejects bypassing review",()=>assert.throws(()=>assertReviewTransition("requested","approved"),/Cannot move operational review/));
test("review point lifecycle requires address before clearance",()=>{assert.doesNotThrow(()=>assertReviewPointTransition("open","addressed"));assert.doesNotThrow(()=>assertReviewPointTransition("addressed","cleared"));assert.throws(()=>assertReviewPointTransition("open","cleared"),/Cannot move operational review point/);});

test("dependency graph accepts an acyclic edge", () => assert.equal(wouldCreateDependencyCycle([{ predecessor: "a", successor: "b" }], "b", "c"), false));
test("dependency graph rejects direct self-reference", () => assert.equal(wouldCreateDependencyCycle([], "a", "a"), true));
test("dependency graph rejects a transitive cycle", () => assert.equal(wouldCreateDependencyCycle([{ predecessor: "a", successor: "b" }, { predecessor: "b", successor: "c" }], "c", "a"), true));
test("resolved dependencies do not participate in cycle checks", () => assert.equal(wouldCreateDependencyCycle([{ predecessor: "a", successor: "b", resolved: true }], "b", "a"), false));

test("automation definition accepts constrained conditions and actions", () => assert.deepEqual(validateAutomationDefinition("work.created", [{ field: "workStatus", operator: "equals", value: "ready" }], [{ type: "assign_team", teamId: "x" }]).actions[0]?.type, "assign_team"));
test("automation rejects arbitrary trigger", () => assert.throws(() => validateAutomationDefinition("http.request", [], [{ type: "assign_team" }]), /trigger is not supported/));
test("automation rejects arbitrary condition field", () => assert.throws(() => validateAutomationDefinition("work.created", [{ field: "sql", operator: "equals", value: "x" }], [{ type: "assign_team" }]), /field or operator/));
test("automation rejects arbitrary action", () => assert.throws(() => validateAutomationDefinition("work.created", [], [{ type: "webhook" }]), /action is not supported/));
test("automation conditions support equality, membership, existence and numeric bounds", () => assert.equal(automationConditionsMatch([{ field: "workStatus", operator: "equals", value: "ready" }, { field: "stageType", operator: "in", value: ["preparation", "review"] }, { field: "assignedMemberId", operator: "exists" }, { field: "dueWithinDays", operator: "lte", value: 5 }], { workStatus: "ready", stageType: "preparation", assignedMemberId: "m", dueWithinDays: 3 }), true));
test("automation conditions fail closed", () => assert.equal(automationConditionsMatch([{ field: "workStatus", operator: "equals", value: "ready" }], { workStatus: "completed" }), false));
test("automation causation chain appends a new rule", () => assert.deepEqual(assertAutomationChain("r2", ["r1"]), ["r1", "r2"]));
test("automation causation chain prevents self recursion", () => assert.throws(() => assertAutomationChain("r1", ["r1"]), /loop/));
test("automation causation chain enforces maximum depth", () => assert.throws(() => assertAutomationChain("r9", ["1", "2", "3", "4", "5", "6", "7", "8"]), /maximum execution depth/));

test("bounded replay accepts a 93-day inclusive range", () => assert.equal(boundedReplayRange("2026-01-01", "2026-04-03").days, 93));
test("bounded replay rejects reversed ranges", () => assert.throws(() => boundedReplayRange("2026-02-01", "2026-01-01"), /between 1 and 93/));
test("bounded replay rejects unbounded history", () => assert.throws(() => boundedReplayRange("2025-01-01", "2026-01-01"), /between 1 and 93/));
test("bounded replay rejects non-ISO dates", () => assert.throws(() => boundedReplayRange("01/01/2026", "02/01/2026"), /ISO/));
