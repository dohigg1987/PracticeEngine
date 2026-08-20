export interface CsvRow {
  rowNo: number;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  rawRow: Record<string, string>;
}

export interface ParsedCsv {
  rows: CsvRow[];
  debitTotal: string;
  creditTotal: string;
  balanced: boolean;
}

export const TRIAL_BALANCE_FIELDS = [
  "accountCode",
  "accountName",
  "debit",
  "credit",
] as const;
export type TrialBalanceField = (typeof TRIAL_BALANCE_FIELDS)[number];
export type TrialBalanceColumnMapping = Record<TrialBalanceField, number>;

export interface TrialBalanceCsvInspection {
  headers: string[];
  rowCount: number;
  suggestedMapping: Partial<TrialBalanceColumnMapping>;
  rawPreview: Record<string, string>[];
}

export interface DecodedTrialBalanceCsv {
  text: string;
  encoding: "UTF-8" | "UTF-16 LE" | "UTF-16 BE" | "Windows-1252";
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function trialBalanceReadiness(
  accountCount: number,
  unmappedCount: number,
  debitTotal: string | number,
  creditTotal: string | number,
): { balanced: boolean; fullyMapped: boolean } {
  const hasAccounts = Number.isInteger(accountCount) && accountCount > 0;
  return {
    balanced: hasAccounts && String(debitTotal) === String(creditTotal),
    fullyMapped: hasAccounts && unmappedCount === 0,
  };
}

export function reportingRegimeError(
  framework: string,
  sectorProfile: string | null,
  legalForm = "",
): string | null {
  const entity = legalForm.trim().toLowerCase();
  const requiredProfile = /academy/.test(entity)
    ? "ACADEMIES_2026"
    : /(^|\b)llp(\b|$)|limited liability partnership/.test(entity)
      ? "LLP_SORP_2026"
      : /charit/.test(entity)
        ? "CHARITIES_SORP_2026"
        : null;
  if (requiredProfile && sectorProfile !== requiredProfile)
    return "The selected entity type requires its matching sector reporting profile";
  if (!sectorProfile || sectorProfile === "NONE") return null;
  if (framework !== "FRS_102")
    return "The selected sector reporting profile is only available with FRS 102";
  if (
    sectorProfile === "LLP_SORP_2026" &&
    entity &&
    !/(^|\b)llp(\b|$)|limited liability partnership/.test(entity)
  )
    return "The LLP SORP profile requires a limited liability partnership";
  return null;
}

export const REGULATOR_EVIDENCE_CONTENT_TYPES = [
  "application/json",
  "application/pdf",
  "application/xml",
  "application/zip",
  "image/jpeg",
  "image/png",
  "message/rfc822",
  "text/csv",
  "text/html",
  "text/plain",
  "text/xml",
] as const;

export const TEAM_INVITATION_ROLES = ["ADMIN", "MEMBER"] as const;

export function teamInvitationRole(
  body: Record<string, unknown>,
): (typeof TEAM_INVITATION_ROLES)[number] {
  const role = body.role;
  if (role !== "ADMIN" && role !== "MEMBER")
    throw new ApiError(400, "INVALID_REQUEST", "role must be ADMIN or MEMBER");
  return role;
}

export function teamInvitationExpiryHours(
  body: Record<string, unknown>,
): number {
  const value = body.expiresInHours ?? 72;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 168)
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "expiresInHours must be an integer from 1 to 168",
    );
  return Number(value);
}

export function teamInvitationToken(body: Record<string, unknown>): string {
  const token = body.token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "token is not a valid invitation token",
    );
  return token;
}

export function teamInvitationDatabaseError(error: unknown): ApiError | null {
  if (!error || typeof error !== "object") return null;
  const code = "code" in error ? String(error.code) : "";
  const constraint =
    "constraint_name" in error
      ? String(error.constraint_name)
      : "constraint" in error
        ? String(error.constraint)
        : "";
  if (code !== "23514") return null;
  if (
    constraint === "invitation_actor_id_valid_ck" ||
    constraint === "invitation_token_hash_valid_ck"
  )
    return new ApiError(
      400,
      "INVALID_INVITATION_REQUEST",
      "The invitation request is invalid",
    );
  if (constraint === "invitation_tenant_context_absent_ck")
    return new ApiError(
      500,
      "INVITATION_CONTEXT_INVALID",
      "Invitation acceptance could not be completed",
    );
  return null;
}

export function regulatorEvidenceStatus(
  value: unknown,
): "ACCEPTED" | "REJECTED" {
  if (value !== "ACCEPTED" && value !== "REJECTED")
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "status must be ACCEPTED or REJECTED",
    );
  return value;
}

export function regulatorEvidenceContentType(value: string): string {
  const contentType = value.split(";", 1)[0]!.trim().toLowerCase();
  if (
    !REGULATOR_EVIDENCE_CONTENT_TYPES.includes(
      contentType as (typeof REGULATOR_EVIDENCE_CONTENT_TYPES)[number],
    )
  )
    throw new ApiError(
      415,
      "UNSUPPORTED_EVIDENCE_TYPE",
      "The regulator response evidence file type is not supported",
    );
  return contentType;
}

export function regulatorEvidenceFilename(value: string): string {
  const filename = value.trim();
  if (
    !filename ||
    filename.length > 180 ||
    /[\u0000-\u001f\u007f\\/]/.test(filename)
  )
    throw new ApiError(
      400,
      "INVALID_EVIDENCE_FILENAME",
      "Evidence filename must be at most 180 characters and contain no path or control characters",
    );
  return filename;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted)
    throw new ApiError(
      422,
      "INVALID_CSV",
      "CSV contains an unterminated quoted value",
    );
  values.push(value.trim());
  return values;
}

function normaliseHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TRIAL_BALANCE_HEADER_ALIASES: Record<TrialBalanceField, readonly string[]> = {
  accountCode: [
    "account code", "account number", "account no", "account", "code",
    "nominal code", "nominal number", "nominal", "gl code", "g l code",
    "a c code", "acct code", "acc code", "ledger code",
  ],
  accountName: [
    "account name", "account description", "name", "description", "details",
    "nominal description", "nominal name", "ledger name",
  ],
  debit: ["debit", "debits", "debit amount", "dr", "dr amount"],
  credit: ["credit", "credits", "credit amount", "cr", "cr amount"],
};

function csvLines(csv: string): string[] {
  return csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
}

export function inspectTrialBalanceCsv(csv: string): TrialBalanceCsvInspection {
  const lines = csvLines(csv);
  if (lines.length < 2)
    throw new ApiError(
      422,
      "INVALID_CSV",
      "CSV must contain a header and at least one data row",
    );
  const headers = splitCsvLine(lines[0]!);
  if (headers.some((header) => header === ""))
    throw new ApiError(422, "INVALID_CSV", "CSV column headings must not be blank");
  const normalised = headers.map(normaliseHeader);
  const suggestedMapping: Partial<TrialBalanceColumnMapping> = {};
  for (const field of TRIAL_BALANCE_FIELDS) {
    const index = normalised.findIndex((header) =>
      TRIAL_BALANCE_HEADER_ALIASES[field].includes(header),
    );
    if (index >= 0) suggestedMapping[field] = index;
  }
  return {
    headers,
    rowCount: lines.length - 1,
    suggestedMapping,
    rawPreview: lines.slice(1, 6).map((line) => {
      const values = splitCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    }),
  };
}

function completeTrialBalanceMapping(
  inspection: TrialBalanceCsvInspection,
  mapping?: Partial<TrialBalanceColumnMapping>,
): TrialBalanceColumnMapping {
  const effective = mapping ?? inspection.suggestedMapping;
  const missing = TRIAL_BALANCE_FIELDS.filter((field) => !Number.isInteger(effective[field]));
  if (missing.length)
    throw new ApiError(
      422,
      "CSV_MAPPING_REQUIRED",
      `Choose columns for ${missing.map((field) => field.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ")}`,
    );
  const result = Object.fromEntries(
    TRIAL_BALANCE_FIELDS.map((field) => [field, Number(effective[field])]),
  ) as unknown as TrialBalanceColumnMapping;
  const indexes = Object.values(result);
  if (indexes.some((index) => index < 0 || index >= inspection.headers.length))
    throw new ApiError(422, "INVALID_CSV_MAPPING", "A selected CSV column is not available");
  if (new Set(indexes).size !== indexes.length)
    throw new ApiError(422, "INVALID_CSV_MAPPING", "Each trial-balance field must use a different CSV column");
  return result;
}

export function trialBalanceColumnMapping(
  value: unknown,
): Partial<TrialBalanceColumnMapping> | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  let input: unknown = value;
  if (typeof value === "string") {
    try {
      input = JSON.parse(value);
    } catch {
      throw new ApiError(400, "INVALID_CSV_MAPPING", "Column mapping must be valid JSON");
    }
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ApiError(400, "INVALID_CSV_MAPPING", "Column mapping must be an object");
  const record = input as Record<string, unknown>;
  const mapping: Partial<TrialBalanceColumnMapping> = {};
  for (const field of TRIAL_BALANCE_FIELDS) {
    const index = record[field];
    if (index === undefined) continue;
    if (!Number.isInteger(index) || Number(index) < 0)
      throw new ApiError(400, "INVALID_CSV_MAPPING", `${field} must identify a CSV column`);
    mapping[field] = Number(index);
  }
  return mapping;
}

function decodedTextIsSafe(text: string): boolean {
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0081\u008D\u008F\u0090\u009D]/.test(text);
}

export function decodeTrialBalanceCsv(
  input: ArrayBuffer | Uint8Array,
): DecodedTrialBalanceCsv {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length)
    throw new ApiError(422, "INVALID_CSV", "CSV file is empty");
  const decode = (label: string, start = 0) =>
    new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(start));
  let decoded: DecodedTrialBalanceCsv | null = null;
  try {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
      decoded = { text: decode("utf-8", 3), encoding: "UTF-8" };
    else if (bytes[0] === 0xff && bytes[1] === 0xfe)
      decoded = { text: decode("utf-16le", 2), encoding: "UTF-16 LE" };
    else if (bytes[0] === 0xfe && bytes[1] === 0xff)
      decoded = { text: decode("utf-16be", 2), encoding: "UTF-16 BE" };
    else {
      const pairs = Math.floor(bytes.length / 2);
      let evenNulls = 0;
      let oddNulls = 0;
      for (let index = 0; index < pairs * 2; index += 2) {
        if (bytes[index] === 0) evenNulls++;
        if (bytes[index + 1] === 0) oddNulls++;
      }
      if (pairs > 0 && oddNulls / pairs > 0.3 && evenNulls / pairs < 0.05)
        decoded = { text: decode("utf-16le"), encoding: "UTF-16 LE" };
      else if (pairs > 0 && evenNulls / pairs > 0.3 && oddNulls / pairs < 0.05)
        decoded = { text: decode("utf-16be"), encoding: "UTF-16 BE" };
      else {
        try {
          decoded = { text: decode("utf-8"), encoding: "UTF-8" };
        } catch {
          decoded = { text: decode("windows-1252"), encoding: "Windows-1252" };
        }
      }
    }
  } catch {
    throw new ApiError(422, "INVALID_CSV_ENCODING", "CSV uses an unsupported or damaged text encoding");
  }
  if (!decodedTextIsSafe(decoded.text))
    throw new ApiError(422, "INVALID_CSV_BINARY", "The selected file appears to be binary, not CSV text");
  return decoded;
}

function parseMoney(value: string, rowNo: number): bigint {
  const cleaned = value.trim().replace(/[\u00a3,$]/g, "");
  if (cleaned === "") return 0n;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match)
    throw new ApiError(
      422,
      "INVALID_CSV",
      `Row ${rowNo} contains an invalid monetary value`,
    );
  return (
    BigInt(match[1]!) * 100n + BigInt(((match[2] ?? "") + "00").slice(0, 2))
  );
}

export function decimal(minorUnits: bigint): string {
  return `${minorUnits / 100n}.${(minorUnits % 100n).toString().padStart(2, "0")}`;
}

export function parseTrialBalanceCsv(
  csv: string,
  mapping?: Partial<TrialBalanceColumnMapping>,
): ParsedCsv {
  const lines = csvLines(csv);
  const inspection = inspectTrialBalanceCsv(csv);
  const originalHeaders = inspection.headers;
  const selected = completeTrialBalanceMapping(inspection, mapping);
  const codeIndex = selected.accountCode;
  const nameIndex = selected.accountName;
  const debitIndex = selected.debit;
  const creditIndex = selected.credit;

  let debitTotal = 0n;
  let creditTotal = 0n;
  const rows = lines.slice(1).map((line, index): CsvRow => {
    const rowNo = index + 2;
    const values = splitCsvLine(line);
    const accountCode = values[codeIndex]?.trim() ?? "";
    const accountName = values[nameIndex]?.trim() ?? "";
    if (!accountCode || !accountName)
      throw new ApiError(
        422,
        "INVALID_CSV",
        `Row ${rowNo} requires account code and name`,
      );
    const debitMinor = parseMoney(values[debitIndex] ?? "", rowNo);
    const creditMinor = parseMoney(values[creditIndex] ?? "", rowNo);
    if (debitMinor > 0n && creditMinor > 0n)
      throw new ApiError(
        422,
        "INVALID_CSV",
        `Row ${rowNo} cannot contain both debit and credit`,
      );
    debitTotal += debitMinor;
    creditTotal += creditMinor;
    return {
      rowNo,
      accountCode,
      accountName,
      debit: decimal(debitMinor),
      credit: decimal(creditMinor),
      rawRow: Object.fromEntries(
        originalHeaders.map((header, column) => [header, values[column] ?? ""]),
      ),
    };
  });
  return {
    rows,
    debitTotal: decimal(debitTotal),
    creditTotal: decimal(creditTotal),
    balanced: debitTotal === creditTotal,
  };
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "INVALID_REQUEST", "A JSON object is required");
  return value as Record<string, unknown>;
}

export function requiredString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "")
    throw new ApiError(400, "INVALID_REQUEST", `${field} is required`);
  return value.trim();
}

export function workspaceName(body: Record<string, unknown>): string {
  const name = requiredString(body, "name").replace(/\s+/g, " ");
  if (name.length > 160 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "name must be at most 160 characters and contain no control characters",
    );
  }
  return name;
}

export function workspaceOnboardingDatabaseError(
  error: unknown,
): ApiError | null {
  if (!error || typeof error !== "object") return null;
  const code = "code" in error ? String(error.code) : "";
  const constraint =
    "constraint_name" in error
      ? String(error.constraint_name)
      : "constraint" in error
        ? String(error.constraint)
        : "";
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const onboardingConstraints = new Set([
    "onboarding_actor_id_valid_ck",
    "onboarding_workspace_name_valid_ck",
    "onboarding_tenant_context_absent_ck",
  ]);
  if (code === "23514" && onboardingConstraints.has(constraint))
    return new ApiError(
      400,
      "WORKSPACE_ONBOARDING_INVALID",
      message || "Workspace onboarding request is invalid",
    );
  if (code === "23505")
    return new ApiError(
      409,
      "WORKSPACE_CONFLICT",
      "A conflicting workspace already exists",
    );
  return null;
}
