import { describe, expect, it } from "vitest";
import type {
  AccountsVersion,
  Journal,
  Reconciliation,
  TrialBalanceLine,
  WorkflowTask,
} from "./api";
import {
  adjustmentsStageState,
  isMappedTrialBalanceLine,
  isOpenWorkflowTask,
  isOutstandingReconciliation,
  mappingPopulation,
  reviewApprovalStageState,
  taskProgress,
} from "./workflowCorrectness";

const journal = (status: Journal["status"]): Journal => ({
  id: `journal-${status}`,
  description: status,
  status,
});
const reconciliation = (
  status: Reconciliation["status"],
): Reconciliation => ({ id: `reconciliation-${status}`, status });
const task = (status: WorkflowTask["status"]): WorkflowTask => ({
  id: `task-${status}`,
  title: status,
  status,
});
const accountsVersion = (
  version: number,
  status: AccountsVersion["status"],
): AccountsVersion => ({
  id: `version-${version}`,
  version,
  status,
  trial_balance_id: "trial-balance",
  framework_pack_id: "FRS_102",
  content_manifest: {},
  content_hash: "hash",
  generated_by: "actor",
  generated_at: "2026-01-01T00:00:00Z",
});

describe("workflow correctness selectors", () => {
  it("derives review readiness from the latest accounts version, not task progress", () => {
    expect(reviewApprovalStageState(false, [])).toBe("pending");
    expect(
      reviewApprovalStageState(false, [accountsVersion(1, "REVIEWED")]),
    ).toBe("attention");
    expect(
      reviewApprovalStageState(false, [accountsVersion(1, "APPROVED")]),
    ).toBe("ready");
    expect(
      reviewApprovalStageState(false, [
        accountsVersion(1, "APPROVED"),
        accountsVersion(2, "DRAFT"),
      ]),
    ).toBe("attention");
    expect(
      reviewApprovalStageState(true, [accountsVersion(1, "APPROVED")]),
    ).toBe("attention");
  });

  it("does not mark adjustments ready while a journal is unposted", () => {
    expect(adjustmentsStageState([], [])).toBe("pending");
    expect(adjustmentsStageState([journal("DRAFT")], [])).toBe("attention");
    expect(adjustmentsStageState([journal("APPROVED")], [])).toBe(
      "attention",
    );
    expect(
      adjustmentsStageState(
        [journal("POSTED")],
        [reconciliation("RECONCILED")],
      ),
    ).toBe("ready");
  });

  it("uses the persisted canonical account id as the sole mapping predicate", () => {
    const displayOnly = {
      canonical_code: "1000",
    } as TrialBalanceLine;
    const persisted = {
      canonical_account_id: "canonical-id",
    } as TrialBalanceLine;
    expect(isMappedTrialBalanceLine(displayOnly)).toBe(false);
    expect(isMappedTrialBalanceLine(persisted)).toBe(true);
    expect(mappingPopulation([displayOnly, persisted])).toEqual({
      mapped: 1,
      unmapped: 1,
    });
  });

  it("uses one non-cancelled task population for counts and percentage", () => {
    expect(
      taskProgress([
        task("COMPLETE"),
        task("OPEN"),
        task("CANCELLED"),
      ]),
    ).toEqual({
      completedTasks: 1,
      totalTasks: 2,
      openTasks: 1,
      percent: 50,
    });
    expect(isOpenWorkflowTask(task("CANCELLED"))).toBe(false);
    expect(isOpenWorkflowTask(task("COMPLETE"))).toBe(false);
    expect(isOpenWorkflowTask(task("BLOCKED"))).toBe(true);
  });

  it("treats reconciled and reviewed reconciliations as terminal", () => {
    expect(isOutstandingReconciliation(reconciliation("RECONCILED"))).toBe(
      false,
    );
    expect(isOutstandingReconciliation(reconciliation("REVIEWED"))).toBe(
      false,
    );
    expect(isOutstandingReconciliation(reconciliation("EXCEPTION"))).toBe(
      true,
    );
  });
});
