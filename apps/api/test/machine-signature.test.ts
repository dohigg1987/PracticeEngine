import assert from "node:assert/strict";
import test from "node:test";
import { canonicalMachineRequest, isMachineWindowValid, verifyMachineSignature } from "../src/machine-signature.ts";

const encode = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64url");

test("QuoteBench Ed25519 signature accepts the canonical request and rejects altered context", async () => {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const signedAt = new Date("2026-08-26T12:00:00.000Z"), expiresAt = new Date("2026-08-26T12:04:00.000Z");
  const canonical = canonicalMachineRequest("post", "/api/quotebench/events", "81000000-0000-0000-0000-000000000001", "81000000-0000-0000-0000-000000000010", signedAt, expiresAt, "a".repeat(64));
  const signature = encode(await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, new TextEncoder().encode(canonical)));
  assert.equal(await verifyMachineSignature(publicKey, signature, canonical), true);
  assert.equal(await verifyMachineSignature(publicKey, signature, canonical.replace("81000000-0000-0000-0000-000000000001", "82000000-0000-0000-0000-000000000001")), false);
  assert.equal(await verifyMachineSignature(publicKey, signature, canonical.replace("a".repeat(64), "b".repeat(64))), false);
  const otherKeys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  assert.equal(await verifyMachineSignature(await crypto.subtle.exportKey("jwk", otherKeys.publicKey), signature, canonical), false);
});

test("QuoteBench request window accepts fresh requests and rejects expired or excessive windows", () => {
  const now = Date.parse("2026-08-26T12:02:00.000Z");
  assert.equal(isMachineWindowValid(new Date("2026-08-26T12:00:00.000Z"), new Date("2026-08-26T12:04:00.000Z"), now), true);
  assert.equal(isMachineWindowValid(new Date("2026-08-26T11:50:00.000Z"), new Date("2026-08-26T12:04:00.000Z"), now), false);
  assert.equal(isMachineWindowValid(new Date("2026-08-26T12:00:00.000Z"), new Date("2026-08-26T12:10:00.000Z"), now), false);
});
