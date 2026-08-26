export function canonicalMachineRequest(method: string, pathname: string, tenantId: string, eventId: string, signedAt: Date, expiresAt: Date, payloadHash: string): string {
  return [method.toUpperCase(), pathname, tenantId, eventId, signedAt.toISOString(), expiresAt.toISOString(), payloadHash].join("\n");
}

export function isMachineWindowValid(signedAt: Date, expiresAt: Date, now = Date.now()): boolean {
  return Number.isFinite(signedAt.valueOf()) && Number.isFinite(expiresAt.valueOf())
    && signedAt.valueOf() >= now - 300_000 && signedAt.valueOf() <= now + 60_000
    && expiresAt.valueOf() > now && expiresAt.valueOf() <= signedAt.valueOf() + 300_000;
}

function base64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url signature");
  const standard = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const decoded = atob(standard), bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

export async function verifyMachineSignature(publicKeyJwk: JsonWebKey, signature: string, canonical: string): Promise<boolean> {
  const publicKey = await crypto.subtle.importKey("jwk", publicKeyJwk, { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, publicKey, base64Url(signature), new TextEncoder().encode(canonical));
}
