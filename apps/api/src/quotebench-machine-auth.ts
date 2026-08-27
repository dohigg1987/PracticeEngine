import { ApiError } from "./core.js";
import { platformDatabase } from "./platform-core.js";
import { canonicalMachineRequest, isMachineWindowValid, verifyMachineSignature } from "./machine-signature.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9._-]{3,80}$/;
const MAX_EVENT_BYTES = 1024 * 1024;

function requiredHeader(request: Request, name: string, maximum = 240): string {
  const value = request.headers.get(name)?.trim();
  if (!value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value))
    throw new ApiError(401, "MACHINE_SIGNATURE_REQUIRED", `A valid ${name} header is required`);
  return value;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export interface VerifiedMachineRequest { actorId: string; request: Request }

export async function verifyQuoteBenchMachineRequest(request: Request, env: Env): Promise<VerifiedMachineRequest> {
  const tenantId = requiredHeader(request, "x-tenant-id");
  const keyId = requiredHeader(request, "x-quotebench-key-id", 80);
  const eventId = requiredHeader(request, "x-quotebench-event-id", 240);
  const signedAt = requiredHeader(request, "x-quotebench-timestamp", 40);
  const expiresAt = requiredHeader(request, "x-quotebench-expires", 40);
  const signature = requiredHeader(request, "x-quotebench-signature", 512);
  if (!UUID.test(tenantId) || !KEY_ID.test(keyId)) throw new ApiError(401, "MACHINE_CONTEXT_INVALID", "The machine request context is invalid");
  const signedDate = new Date(signedAt), expiryDate = new Date(expiresAt), now = Date.now();
  if (!isMachineWindowValid(signedDate, expiryDate, now)) throw new ApiError(401, "MACHINE_REQUEST_EXPIRED", "The machine request is outside its validity window");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_EVENT_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "QuoteBench event is too large");
  const payload = await request.arrayBuffer();
  if (payload.byteLength > MAX_EVENT_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "QuoteBench event is too large");
  const payloadHash = await sha256(payload), url = new URL(request.url);
  const canonical = canonicalMachineRequest(request.method, url.pathname, tenantId, eventId, signedDate, expiryDate, payloadHash);
  const sql = platformDatabase(env);
  try {
    const keys = await sql`select * from quotebench_machine_key_for_request(${keyId},${tenantId}::uuid)`;
    if (!keys.length) throw new ApiError(401, "MACHINE_KEY_UNKNOWN", "The machine signing key is not recognised");
    const jwk = keys[0]!.public_key_jwk;
    if (!jwk || typeof jwk !== "object" || Array.isArray(jwk)) throw new ApiError(500, "MACHINE_KEY_INVALID", "The configured machine key is invalid");
    let verified = false;
    try {
      verified = await verifyMachineSignature(jwk as JsonWebKey, signature, canonical);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(401, "MACHINE_SIGNATURE_INVALID", "The machine signature is invalid");
    }
    if (!verified) throw new ApiError(401, "MACHINE_SIGNATURE_INVALID", "The machine signature is invalid");
  } finally { await sql.end(); }
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  headers.set("x-practiceengine-machine-verified", "quotebench");
  headers.set("x-practiceengine-payload-hash", payloadHash);
  headers.set("x-practiceengine-machine-key-id", keyId);
  headers.set("x-practiceengine-machine-event-id", eventId);
  headers.set("x-practiceengine-machine-signed-at", signedDate.toISOString());
  headers.set("x-practiceengine-machine-expires-at", expiryDate.toISOString());
  return { actorId: `quotebench:${keyId}`, request: new Request(request, { headers, body: payload }) };
}
