import { ApiError, requireObject } from "./core.ts";

export const OFFICER_TYPES = [
  "DIRECTOR",
  "TRUSTEE",
  "COMPANY_SECRETARY",
  "PARTNER",
  "DESIGNATED_MEMBER",
  "LLP_MEMBER",
  "OTHER",
] as const;

export const ADVISER_TYPES = [
  "ACCOUNTANT",
  "AUDITOR",
  "INDEPENDENT_EXAMINER",
  "BANKER",
  "SOLICITOR",
  "TAX_ADVISER",
  "INSURER",
  "INVESTMENT_MANAGER",
  "OTHER",
] as const;

export const LEGAL_FORMS = [
  "PRIVATE_LIMITED_COMPANY",
  "PUBLIC_LIMITED_COMPANY",
  "LIMITED_LIABILITY_PARTNERSHIP",
  "LIMITED_PARTNERSHIP",
  "GENERAL_PARTNERSHIP",
  "SOLE_TRADER",
  "CHARITABLE_COMPANY",
  "CHARITABLE_INCORPORATED_ORGANISATION",
  "CHARITABLE_TRUST",
  "COMMUNITY_INTEREST_COMPANY",
  "OTHER",
] as const;

const PROFILE_FIELDS = {
  tradingName: 255,
  companyRegistrationNumber: 32,
  charityRegistrationNumber: 32,
  registeredOfficeLine1: 255,
  registeredOfficeLine2: 255,
  registeredOfficeLocality: 120,
  registeredOfficeRegion: 120,
  registeredOfficePostalCode: 24,
  registeredOfficeCountryCode: 2,
  principalActivity: 1_000,
  website: 500,
  telephone: 50,
  notes: 5_000,
} as const;

const OFFICER_NAME_STYLES = ["FULL_NAME","TITLE_AND_SURNAME","INITIALS_AND_SURNAME","FULL_NAME_WITH_HONOURS"] as const;
const PROFESSIONAL_BODIES = ["ICAEW","ACCA","ICAS","CAI","AAT","ACIE","OTHER"] as const;
const REPORT_STYLES = ["GENERIC","ICAEW","ACCA","ICAS","CAI","CUSTOM_APPROVED"] as const;

const OFFICER_FIELDS = {
  displayName: 255,
  title: 40,
  givenNames: 160,
  middleNames: 160,
  familyName: 160,
  suffixHonours: 160,
  occupation: 160,
  nationality: 80,
  countryOfResidence: 80,
  serviceAddressLine1: 255,
  serviceAddressLine2: 255,
  serviceAddressLocality: 120,
  serviceAddressRegion: 120,
  serviceAddressPostalCode: 24,
  serviceAddressCountryCode: 2,
  email: 320,
  telephone: 50,
} as const;

const ADVISER_FIELDS = {
  firmName: 255,
  contactName: 255,
  addressLine1: 255,
  addressLine2: 255,
  addressLocality: 120,
  addressRegion: 120,
  addressPostalCode: 24,
  addressCountryCode: 2,
  email: 320,
  telephone: 50,
  reference: 160,
  contactQualifications: 160,
} as const;

type Parsed = Record<string, string | number | null>;

function invalid(message: string): never {
  throw new ApiError(400, "INVALID_REQUEST", message);
}

function optionalText(
  body: Record<string, unknown>,
  field: string,
  maximum: number,
): string | null | undefined {
  if (!(field in body)) return undefined;
  const input = body[field];
  if (input === null || input === "") return null;
  if (typeof input !== "string") invalid(`${field} must be a string or null`);
  const value = input.trim();
  if (!value) return null;
  if (value.length > maximum || /[\u0000-\u001f\u007f]/.test(value))
    invalid(`${field} must be at most ${maximum} characters and contain no control characters`);
  return value;
}

function requiredText(
  body: Record<string, unknown>,
  field: string,
  maximum: number,
): string {
  const value = optionalText(body, field, maximum);
  if (!value) invalid(`${field} is required`);
  return value;
}

function optionalEnum<T extends string>(
  body: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T | undefined {
  if (!(field in body)) return undefined;
  const value = body[field];
  if (typeof value !== "string" || !values.includes(value as T))
    invalid(`${field} must be one of ${values.join(", ")}`);
  return value as T;
}

function optionalDate(body: Record<string, unknown>, field: string): string | null | undefined {
  const value = optionalText(body, field, 10);
  if (value == null) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) invalid(`${field} must be an ISO date`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3]))
    invalid(`${field} must be an ISO date`);
  return value;
}

function copyTextFields(
  target: Parsed,
  body: Record<string, unknown>,
  fields: Record<string, number>,
): void {
  for (const [field, maximum] of Object.entries(fields)) {
    const value = optionalText(body, field, maximum);
    if (value !== undefined) target[field] = value;
  }
}

function countryCodes(target: Parsed): void {
  for (const field of Object.keys(target).filter((key) => key.endsWith("CountryCode"))) {
    const value = target[field];
    if (value !== null && (typeof value !== "string" || !/^[A-Za-z]{2}$/.test(value)))
      invalid(`${field} must be a two-letter country code`);
    if (typeof value === "string") target[field] = value.toUpperCase();
  }
}

function contactValues(target: Parsed): void {
  if (typeof target.email === "string") {
    target.email = target.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(target.email)) invalid("email must be a valid email address");
  }
  if (typeof target.website === "string" && !/^https?:\/\/[^\s]+$/i.test(target.website))
    invalid("website must be an http or https URL");
}

function nonEmpty(value: Parsed): Parsed {
  if (!Object.keys(value).length) invalid("At least one supported field is required");
  return value;
}

export function permanentProfileCommand(input: unknown): Parsed {
  const body = requireObject(input), result: Parsed = {};
  const legalForm = optionalEnum(body, "legalForm", LEGAL_FORMS);
  if (legalForm !== undefined) result.legalForm = legalForm;
  const officerNameStyle = optionalEnum(body, "officerNameStyle", OFFICER_NAME_STYLES);
  if (officerNameStyle !== undefined) result.officerNameStyle = officerNameStyle;
  copyTextFields(result, body, PROFILE_FIELDS);
  for (const field of ["accountingReferenceMonth", "accountingReferenceDay"] as const) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value === null) result[field] = null;
    else if (!Number.isInteger(value)) invalid(`${field} must be an integer or null`);
    else result[field] = value as number;
  }
  const month = result.accountingReferenceMonth;
  const day = result.accountingReferenceDay;
  if (typeof month === "number" && (month < 1 || month > 12))
    invalid("accountingReferenceMonth must be from 1 to 12");
  if (typeof day === "number" && (day < 1 || day > 31))
    invalid("accountingReferenceDay must be from 1 to 31");
  if (("accountingReferenceMonth" in result) !== ("accountingReferenceDay" in result))
    invalid("accountingReferenceMonth and accountingReferenceDay must be supplied together");
  if ((month === null) !== (day === null))
    invalid("accountingReferenceMonth and accountingReferenceDay must both be set or both be null");
  countryCodes(result);
  contactValues(result);
  return nonEmpty(result);
}

export function officerCreateCommand(input: unknown): Parsed {
  const body = requireObject(input), result: Parsed = {
    officerType: optionalEnum(body, "officerType", OFFICER_TYPES) ?? invalid("officerType is required"),
    displayName: requiredText(body, "displayName", OFFICER_FIELDS.displayName),
    appointedOn: requiredText(body, "appointedOn", 10),
  };
  result.appointedOn = optionalDate({ appointedOn: result.appointedOn }, "appointedOn")!;
  copyTextFields(result, body, OFFICER_FIELDS);
  result.resignedOn = optionalDate(body, "resignedOn") ?? null;
  countryCodes(result);
  contactValues(result);
  if (result.resignedOn && result.resignedOn < result.appointedOn!)
    invalid("resignedOn must not be before appointedOn");
  return result;
}

export function officerPatchCommand(input: unknown): Parsed {
  const body = requireObject(input), result: Parsed = {};
  const officerType = optionalEnum(body, "officerType", OFFICER_TYPES);
  if (officerType !== undefined) result.officerType = officerType;
  copyTextFields(result, body, OFFICER_FIELDS);
  const appointedOn = optionalDate(body, "appointedOn");
  const resignedOn = optionalDate(body, "resignedOn");
  if (appointedOn !== undefined) result.appointedOn = appointedOn;
  if (resignedOn !== undefined) result.resignedOn = resignedOn;
  countryCodes(result);
  contactValues(result);
  return nonEmpty(result);
}

export function adviserCreateCommand(input: unknown): Parsed {
  const body = requireObject(input), result: Parsed = {
    adviserType: optionalEnum(body, "adviserType", ADVISER_TYPES) ?? invalid("adviserType is required"),
    firmName: requiredText(body, "firmName", ADVISER_FIELDS.firmName),
  };
  copyTextFields(result, body, ADVISER_FIELDS);
  result.professionalBody = body.professionalBody === null ? null : optionalEnum(body, "professionalBody", PROFESSIONAL_BODIES) ?? null;
  result.reportStyle = optionalEnum(body, "reportStyle", REPORT_STYLES) ?? "GENERIC";
  result.activeFrom = optionalDate(body, "activeFrom") ?? invalid("activeFrom is required");
  result.activeTo = optionalDate(body, "activeTo") ?? null;
  countryCodes(result);
  contactValues(result);
  if (result.activeFrom && result.activeTo && result.activeTo < result.activeFrom)
    invalid("activeTo must not be before activeFrom");
  return result;
}

export function adviserPatchCommand(input: unknown): Parsed {
  const body = requireObject(input), result: Parsed = {};
  const adviserType = optionalEnum(body, "adviserType", ADVISER_TYPES);
  if (adviserType !== undefined) result.adviserType = adviserType;
  copyTextFields(result, body, ADVISER_FIELDS);
  const professionalBody = body.professionalBody === null ? null : optionalEnum(body, "professionalBody", PROFESSIONAL_BODIES);
  const reportStyle = optionalEnum(body, "reportStyle", REPORT_STYLES);
  if (professionalBody !== undefined) result.professionalBody = professionalBody;
  if (reportStyle !== undefined) result.reportStyle = reportStyle;
  const activeFrom = optionalDate(body, "activeFrom");
  const activeTo = optionalDate(body, "activeTo");
  if (activeFrom !== undefined) result.activeFrom = activeFrom;
  if (activeTo !== undefined) result.activeTo = activeTo;
  countryCodes(result);
  contactValues(result);
  return nonEmpty(result);
}
