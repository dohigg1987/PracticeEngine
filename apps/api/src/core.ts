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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
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
    sectorProfile === "CHARITIES_SORP_2026" &&
    entity &&
    !/(charit|academy)/.test(entity)
  )
    return "The Charities SORP profile requires a charity or charitable entity";
  if (sectorProfile === "ACADEMIES_2026" && entity && !/academy/.test(entity))
    return "The Academies profile requires an academy trust entity";
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

export function parseTrialBalanceCsv(csv: string): ParsedCsv {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length < 2)
    throw new ApiError(
      422,
      "INVALID_CSV",
      "CSV must contain a header and at least one data row",
    );

  const originalHeaders = splitCsvLine(lines[0]!);
  const headers = originalHeaders.map(normaliseHeader);
  const find = (...candidates: string[]) =>
    headers.findIndex((header) => candidates.includes(header));
  const codeIndex = find("account code", "code", "nominal code", "account");
  const nameIndex = find(
    "account name",
    "name",
    "description",
    "nominal description",
  );
  const debitIndex = find("debit", "debits");
  const creditIndex = find("credit", "credits");
  if (
    [codeIndex, nameIndex, debitIndex, creditIndex].some((index) => index < 0)
  ) {
    throw new ApiError(
      422,
      "INVALID_CSV",
      "CSV requires account code, account name, debit and credit columns",
    );
  }

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
