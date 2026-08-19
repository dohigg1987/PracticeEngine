export interface WorkingPaperReadinessInput {
  applicability: string;
  objective: string | null;
  narrative: unknown;
  requirements: {
    reportLineRequired: boolean;
    assertionRequired: boolean;
    riskRequired: boolean;
    themeRequired: boolean;
    evidenceRequired: boolean;
  };
  counts: {
    reportLines: number;
    assertions: number;
    risks: number;
    themes: number;
    evidence: number;
  };
}

export function workingPaperReadinessBlocks(input: WorkingPaperReadinessInput): string[] {
  const blocks: string[] = [];
  if (input.applicability !== "APPLICABLE") blocks.push("WORKING_PAPER_NOT_APPLICABLE");
  if (!input.objective?.trim()) blocks.push("OBJECTIVE_REQUIRED");
  if (typeof input.narrative !== "string" || !input.narrative.trim()) blocks.push("NARRATIVE_REQUIRED");
  if (input.requirements.reportLineRequired && input.counts.reportLines === 0) blocks.push("REPORT_LINE_REQUIRED");
  if (input.requirements.assertionRequired && input.counts.assertions === 0) blocks.push("ASSERTION_REQUIRED");
  if (input.requirements.riskRequired && input.counts.risks === 0) blocks.push("RISK_REQUIRED");
  if (input.requirements.themeRequired && input.counts.themes === 0) blocks.push("THEME_REQUIRED");
  if (input.requirements.evidenceRequired && input.counts.evidence === 0) blocks.push("CURRENT_VERSION_EVIDENCE_REQUIRED");
  return blocks;
}
