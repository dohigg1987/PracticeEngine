import { createHash } from "node:crypto";

export type Regulator = "COMPANIES_HOUSE" | "HMRC" | "CCEW" | "OSCR" | "CCNI" | "DFE";

export interface FilingPayload {
  regulator: Regulator;
  engagementId: string;
  accountsVersionId: string;
  mediaType: string;
  bytes: Uint8Array;
  metadata: Record<string, string>;
}

export interface PreparedFilingEvidence {
  regulator: Regulator;
  payloadHash: string;
  payloadSize: number;
  mediaType: string;
  metadata: Record<string, string>;
}

export interface SubmissionReceipt {
  regulator: Regulator;
  externalSubmissionId: string;
  submittedAt: string;
  status: "SUBMITTED" | "ACCEPTED" | "REJECTED";
  responseBytes: Uint8Array;
}

export interface FilingAdapter {
  readonly regulator: Regulator;
  readonly supportsDirectSubmission: boolean;
  prepare(payload: FilingPayload): Promise<PreparedFilingEvidence>;
  submit(payload: FilingPayload, idempotencyKey: string): Promise<SubmissionReceipt>;
  poll(externalSubmissionId: string): Promise<SubmissionReceipt>;
}

export function prepareFilingEvidence(payload: FilingPayload): PreparedFilingEvidence {
  if (!payload.bytes.byteLength) throw new Error("FILING_PAYLOAD_EMPTY");
  if (!payload.mediaType.trim()) throw new Error("FILING_MEDIA_TYPE_REQUIRED");
  return {
    regulator: payload.regulator,
    payloadHash: createHash("sha256").update(payload.bytes).digest("hex"),
    payloadSize: payload.bytes.byteLength,
    mediaType: payload.mediaType,
    metadata: { ...payload.metadata },
  };
}

export function assertReceiptMatches(adapter: FilingAdapter, receipt: SubmissionReceipt): void {
  if (adapter.regulator !== receipt.regulator) throw new Error("FILING_RECEIPT_REGULATOR_MISMATCH");
  if (!receipt.externalSubmissionId.trim() || !receipt.responseBytes.byteLength) throw new Error("FILING_RECEIPT_EVIDENCE_INCOMPLETE");
}

export class ManualPortalAdapter implements FilingAdapter {
  readonly supportsDirectSubmission = false;
  constructor(readonly regulator: Regulator) {}
  async prepare(payload: FilingPayload): Promise<PreparedFilingEvidence> { return prepareFilingEvidence(payload); }
  async submit(): Promise<SubmissionReceipt> { throw new Error(`DIRECT_SUBMISSION_UNAVAILABLE:${this.regulator}`); }
  async poll(): Promise<SubmissionReceipt> { throw new Error(`DIRECT_SUBMISSION_UNAVAILABLE:${this.regulator}`); }
}
