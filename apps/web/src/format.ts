export function statutoryLabel(value?: string | null): string {
  if (!value) return "—";
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
