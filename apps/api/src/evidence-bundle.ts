import { strToU8, zipSync, type Zippable } from "fflate";
import { canonicalJson } from "./workflow.ts";

export const EVIDENCE_BUNDLE_FORMAT_VERSION = "accounts-evidence-bundle-v1";
export const MAX_EVIDENCE_BUNDLE_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_EVIDENCE_BUNDLE_BYTES = 25 * 1024 * 1024;

const PRIVATE_FIELD =
  /^(?:authorization|cookie|password|secret|token(?:Hash)?|.*storage[_-]?key|connectionString)$/i;

function safeEvidenceValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(safeEvidenceValue);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, item]) => !PRIVATE_FIELD.test(key) && item !== undefined)
        .map(([key, item]) => [key, safeEvidenceValue(item)]),
    );
  return String(value);
}

export function evidenceJson(value: unknown): Uint8Array {
  return strToU8(`${canonicalJson(safeEvidenceValue(value))}\n`);
}

export interface EvidenceBundleFile {
  path: string;
  bytes: Uint8Array;
  compress?: boolean;
}

export function deterministicEvidenceZip(
  files: readonly EvidenceBundleFile[],
  modifiedAt: Date,
): Uint8Array {
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
  let sourceBytes = 0;
  const zippable: Zippable = {};
  for (const file of ordered) {
    if (
      !/^[a-z0-9][a-z0-9._/-]*$/i.test(file.path) ||
      file.path.includes("..") ||
      file.path.startsWith("/")
    )
      throw new Error("Evidence bundle contains an unsafe file path");
    sourceBytes += file.bytes.byteLength;
    if (sourceBytes > MAX_EVIDENCE_BUNDLE_SOURCE_BYTES)
      throw new Error("Evidence bundle source exceeds the bounded size");
    zippable[file.path] = [
      file.bytes,
      { mtime: modifiedAt, level: file.compress === false ? 0 : 6 },
    ];
  }
  const result = zipSync(zippable, { mtime: modifiedAt, level: 6 });
  if (result.byteLength > MAX_EVIDENCE_BUNDLE_BYTES)
    throw new Error("Evidence bundle output exceeds the bounded size");
  return result;
}
