export type WorkingPaperProfile = {
  legalForm: string;
  framework: string;
  sector: string | null;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** Built-in applicability is authoritative and cannot be widened by an override. */
export function workingPaperTemplateMatches(
  row: Record<string, unknown>,
  profile: WorkingPaperProfile,
): boolean {
  const legalForms = stringArray(row.legal_forms);
  const frameworks = stringArray(row.framework_codes);
  const sectors = stringArray(row.sector_codes);
  return (
    (!legalForms.length || legalForms.includes(profile.legalForm)) &&
    (!frameworks.length || frameworks.includes(profile.framework)) &&
    (!sectors.length || (!!profile.sector && sectors.includes(profile.sector)))
  );
}

export function incompatibleRequestedTemplateCodes(
  requested: ReadonlySet<string>,
  deployable: Iterable<string>,
): string[] {
  const allowed = new Set(deployable);
  return [...requested].filter((templateCode) => !allowed.has(templateCode)).sort();
}
