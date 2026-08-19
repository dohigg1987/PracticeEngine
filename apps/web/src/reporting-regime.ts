export const REPORTING_FRAMEWORKS = [
  "FRS_101",
  "FRS_102",
  "FRS_102_1A",
  "FRS_105",
] as const;

export const SECTOR_PROFILES = [
  { value: "NONE", label: "None" },
  { value: "CHARITIES_SORP_2026", label: "Charities SORP 2026" },
  { value: "ACADEMIES_2026", label: "Academies Accounts Direction 2026" },
  { value: "LLP_SORP_2026", label: "LLP SORP 2026" },
] as const;

export function requiredSectorProfile(legalForm: string): string | null {
  const entity = legalForm.trim().toLocaleLowerCase();
  if (/academy/.test(entity)) return "ACADEMIES_2026";
  if (/(^|\b)llp(\b|$)|limited liability partnership/.test(entity))
    return "LLP_SORP_2026";
  if (/charit/.test(entity)) return "CHARITIES_SORP_2026";
  return null;
}

export function permittedFrameworks(legalForm: string) {
  return requiredSectorProfile(legalForm)
    ? REPORTING_FRAMEWORKS.filter((framework) => framework === "FRS_102")
    : [...REPORTING_FRAMEWORKS];
}

export function reportingRegimeError(
  framework: string,
  sectorProfile: string,
  legalForm = "",
): string | null {
  const requiredProfile = requiredSectorProfile(legalForm);
  if (requiredProfile && sectorProfile !== requiredProfile) {
    const label = SECTOR_PROFILES.find(
      (item) => item.value === requiredProfile,
    )?.label;
    return `${legalForm} accounts require the ${label} profile.`;
  }
  if (sectorProfile === "NONE") return null;
  if (framework !== "FRS_102") {
    return `${SECTOR_PROFILES.find((item) => item.value === sectorProfile)?.label ?? sectorProfile} is only available with FRS 102.`;
  }
  const entity = legalForm.trim().toLocaleLowerCase();
  if (
    sectorProfile === "LLP_SORP_2026" &&
    entity &&
    !/(^|\b)llp(\b|$)|limited liability partnership/.test(entity)
  )
    return "The LLP SORP profile requires a limited liability partnership.";
  return null;
}

export function permittedSectorProfiles(framework: string, legalForm: string) {
  const requiredProfile = requiredSectorProfile(legalForm);
  if (requiredProfile)
    return SECTOR_PROFILES.filter((profile) => profile.value === requiredProfile);
  if (framework === "FRS_102") {
    // Legal structure and sector classification are separate facts. A charity or
    // academy trust may use a corporate legal form, so an ordinary company form
    // must not silently suppress those reporting profiles.
    return SECTOR_PROFILES.filter(
      (profile) => profile.value !== "LLP_SORP_2026",
    );
  }
  return SECTOR_PROFILES.filter(
    (profile) => !reportingRegimeError(framework, profile.value, legalForm),
  );
}
