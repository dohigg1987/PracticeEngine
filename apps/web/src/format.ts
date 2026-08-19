const professionalLabels: Record<string, string> = {
  ACCA: "ACCA",
  ACIE: "ACIE",
  AAT: "AAT",
  CAI: "Chartered Accountants Ireland",
  CCEW: "Charity Commission for England and Wales",
  CCNI: "Charity Commission for Northern Ireland",
  COMPANIES_HOUSE: "Companies House",
  CSV: "CSV upload",
  DFE: "Department for Education",
  FREEAGENT: "FreeAgent",
  HMRC: "HM Revenue & Customs",
  ICAEW: "ICAEW",
  ICAS: "ICAS",
  LIMITED_LIABILITY_PARTNERSHIP: "Limited liability partnership",
  OSCR: "Scottish Charity Regulator (OSCR)",
  PRIVATE_LIMITED_COMPANY: "Private limited company",
  PUBLIC_LIMITED_COMPANY: "Public limited company",
  QUICKBOOKS: "QuickBooks Online",
  SAGE: "Sage",
  XLSX: "Excel upload",
  XERO: "Xero",
};

export function statutoryLabel(value?: string | null): string {
  if (!value) return "—";
  const exact = professionalLabels[value.toUpperCase()];
  if (exact) return exact;
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
    .replace(/\bFrs\b/g, "FRS")
    .replace(/\bSorp\b/g, "SORP")
    .replace(/\bLlp\b/g, "LLP")
    .replace(/\bUk\b/g, "UK")
    .replace(/\bHmrc\b/g, "HMRC")
    .replace(/\bIas\b/g, "IAS")
    .replace(/\b1a\b/g, "1A")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOf\b/g, "of");
}

export function personDisplayName(
  person: { displayName: string; title?: string | null; givenNames?: string | null; middleNames?: string | null; familyName?: string | null; suffixHonours?: string | null },
  style = "FULL_NAME",
): string {
  if (!person.familyName) return person.displayName;
  const initials = [person.givenNames, person.middleNames]
    .flatMap((part) => (part || "").split(/\s+/))
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}.`)
    .join(" ");
  if (style === "TITLE_AND_SURNAME") return [person.title, person.familyName].filter(Boolean).join(" ");
  if (style === "INITIALS_AND_SURNAME") return [initials, person.familyName].filter(Boolean).join(" ");
  const full = [person.title, person.givenNames, person.middleNames, person.familyName].filter(Boolean).join(" ");
  return style === "FULL_NAME_WITH_HONOURS" && person.suffixHonours ? `${full}, ${person.suffixHonours}` : full;
}
