export const MAX_WORKING_PAPER_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const WORKING_PAPER_ASSERTIONS = [
  "EXISTENCE", "OCCURRENCE", "RIGHTS_AND_OBLIGATIONS", "COMPLETENESS",
  "ACCURACY", "VALUATION", "ALLOCATION", "CUTOFF", "CLASSIFICATION",
  "PRESENTATION", "DISCLOSURE",
] as const;
export const WORKING_PAPER_EVIDENCE_TYPES = [
  "SOURCE_DOCUMENT", "CALCULATION", "CONFIRMATION", "CORRESPONDENCE", "REPORT", "OTHER",
] as const;
export const WORKING_PAPER_EVIDENCE_MEDIA_TYPES = [
  "application/pdf", "text/plain", "text/csv", "application/csv", "image/png", "image/jpeg",
  "application/msword", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export function safeWorkingPaperEvidenceFilename(value: string): string {
  const filename = value.trim();
  if (!filename || filename.length > 255 || /[\u0000-\u001f\u007f\\/]/.test(filename) || filename === "." || filename === "..")
    throw new Error("INVALID_FILENAME");
  return filename;
}

function starts(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

export function workingPaperEvidenceSignatureMatches(mediaType: string, bytes: ArrayBuffer): boolean {
  const view = new Uint8Array(bytes);
  if (mediaType === "application/pdf") return starts(view, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (mediaType === "image/png") return starts(view, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mediaType === "image/jpeg") return starts(view, [0xff, 0xd8, 0xff]);
  if (mediaType.includes("openxmlformats-officedocument")) return starts(view, [0x50, 0x4b, 0x03, 0x04]);
  if (mediaType === "application/msword" || mediaType === "application/vnd.ms-excel")
    return starts(view, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (["text/plain", "text/csv", "application/csv"].includes(mediaType)) return view.length > 0 && !view.includes(0);
  return false;
}
