import type { WorkingPaper, WorkingPaperCategory } from "./api";

export const workingPaperAreas = [
  "Engagement and planning",
  "Records and balances",
  "Reporting and completion",
] as const;

type WorkingPaperArea = (typeof workingPaperAreas)[number];

export function workingPaperArea(
  category?: WorkingPaperCategory,
): WorkingPaperArea {
  if (category === "ACCEPTANCE" || category === "PLANNING")
    return "Engagement and planning";
  if (category === "REPORTING" || category === "COMPLETION")
    return "Reporting and completion";
  return "Records and balances";
}

export function workingPaperStatusSummary(items: WorkingPaper[]): string {
  const counts = items.reduce<Record<string, number>>((result, item) => {
    const label =
      item.applicability === "NOT_APPLICABLE"
        ? "Not applicable"
        : item.status === "REVIEWED"
          ? "Reviewed"
          : item.status === "PREPARED"
            ? "Ready for review"
            : item.status === "IN_PROGRESS"
              ? "In preparation"
              : "Not started";
    result[label] = (result[label] || 0) + 1;
    return result;
  }, {});
  return [
    "Reviewed",
    "Ready for review",
    "In preparation",
    "Not started",
    "Not applicable",
  ]
    .filter((label) => counts[label])
    .map((label) => `${counts[label]} ${label.toLowerCase()}`)
    .join(" · ");
}
