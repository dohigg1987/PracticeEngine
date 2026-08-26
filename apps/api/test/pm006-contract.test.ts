import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("packages/database/migrations/0034_client_portal_collaboration.sql", root), "utf8");
const service = await readFile(new URL("apps/api/src/client-collaboration.ts", root), "utf8");
const machine = await readFile(new URL("apps/api/src/quotebench-machine-auth.ts", root), "utf8");
const signature = await readFile(new URL("apps/api/src/machine-signature.ts", root), "utf8");
const crm = await readFile(new URL("apps/api/src/crm-onboarding.ts", root), "utf8");

test("PM-006 adds only sequential migration 0034", async () => {
  const migrations = (await readdir(new URL("packages/database/migrations/", root))).filter((name) => /^\d{4}_/.test(name)).sort();
  assert.equal(migrations.at(-1), "0034_client_portal_collaboration.sql");
  assert.match(migration, /VALUES\('0034','unified client portal requests documents messaging confirmations and machine authentication'\)/);
});

test("portal principals require explicit client-resource grants and support multi-client contacts", () => {
  for (const table of ["portal_principal", "portal_client_access", "portal_invitation"])
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\(`));
  assert.match(migration, /FOREIGN KEY\(tenant_id,contact_id\) REFERENCES contact\(tenant_id,id\)/);
  assert.match(migration, /UNIQUE NULLS NOT DISTINCT\(tenant_id,portal_principal_id,client_id,engagement_id,client_service_id\)/);
  assert.match(migration, /portal_actor_has_client_access/);
  assert.match(service, /PORTAL_RESOURCE_FORBIDDEN/);
});

test("requests retain recipients versions response provenance and workflow links", () => {
  for (const table of ["client_request", "client_request_recipient", "client_request_response"])
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\(`));
  assert.match(migration, /completion_mode text/);
  assert.match(migration, /request_version integer NOT NULL/);
  assert.match(migration, /UNIQUE\(tenant_id,client_request_id,idempotency_key\)/);
  assert.match(service, /status='waiting_on_client'/);
  for (const event of ["client_request.created", "client_request.responded", "client_request.completed"])
    assert.match(service, new RegExp(event.replaceAll(".", "\\.")));
});

test("R2 documents are private versioned hash checked and scan gated", () => {
  assert.match(migration, /CREATE TABLE portal_document_version/);
  assert.match(migration, /UNIQUE\(tenant_id,portal_document_id,version\)/);
  assert.match(migration, /scan_status IN \('pending','accepted','quarantined','rejected'\)/);
  assert.match(service, /await env\.ARTEFACTS\.put\(uploadedKey/);
  assert.match(service, /await env\.ARTEFACTS\.delete\(uploadedKey\)/);
  assert.match(service, /object\.customMetadata\?\.sha256/);
  assert.match(service, /DOCUMENT_NOT_RELEASED/);
  assert.match(service, /content-disposition.*attachment/si);
  assert.doesNotMatch(service, /publicUrl|r2\.dev/);
});

test("secure messaging has explicit participants immutable messages and read state", () => {
  for (const table of ["portal_thread", "portal_thread_participant", "portal_message", "portal_message_attachment", "portal_thread_read"])
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\(`));
  assert.match(service, /INVALID_PARTICIPANT/);
  assert.match(service, /message\.sent/);
  assert.doesNotMatch(migration, /GRANT UPDATE\([^)]*body[^)]*\) ON portal_message/);
  assert.doesNotMatch(migration, /GRANT DELETE ON portal_message/);
});

test("client confirmations are versioned idempotent evidence and not e-signatures", () => {
  assert.match(migration, /CREATE TABLE client_confirmation/);
  assert.match(migration, /confirmation_version integer/);
  assert.match(migration, /responded_by_principal_id/);
  assert.match(service, /client_confirmation\.completed/);
  assert.doesNotMatch(service, /electronic.?signature|esign/i);
});

test("new portal data is forced RLS and least privilege", () => {
  const inventory = ["portal_principal","portal_client_access","portal_invitation","client_request","client_request_recipient","client_request_response","portal_document","portal_document_version","portal_thread","portal_thread_participant","portal_message","portal_message_attachment","portal_thread_read","client_confirmation","quotebench_request_receipt"];
  for (const table of inventory) assert.match(migration, new RegExp(`['"]${table}['"]`));
  assert.match(migration, /ALTER TABLE %I FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /Portal policies add the client-resource dimension/);
  assert.match(migration, /REVOKE ALL ON portal_principal/);
  assert.doesNotMatch(migration, /GRANT DELETE ON/);
});

test("permissions and portal entitlements remain independent", () => {
  for (const key of ["practice.portal.requests","practice.portal.documents","practice.portal.messaging","portal.manage","portal.invite","portal.revoke","client_requests.view","client_requests.manage","documents.share","portal_messages.view","portal_messages.send","confirmations.request"])
    assert.match(migration, new RegExp(key.replaceAll(".", "\\.")));
  assert.match(service, /assertPlatformPermission\(tx, permission\)/);
  assert.match(service, /assertPlatformEntitled\(tx, feature\)/);
  assert.match(service, /portal_tenant_feature_enabled/);
  assert.doesNotMatch(service, /package(?:Name|_name)|premium_plan/i);
});

test("PM-006 tenant seeding preserves the PM-005 CRM stage catalogue", () => {
  assert.match(migration, /INSERT INTO public\.crm_stage_definition[\s\S]*'qualification'[\s\S]*'proposal'[\s\S]*'won'[\s\S]*'lost'/);
});

test("QuoteBench machine requests are Ed25519 signed expiring replay protected and tenant bound", () => {
  assert.match(migration, /algorithm='Ed25519'/);
  assert.match(migration, /CREATE TABLE quotebench_request_receipt/);
  assert.match(migration, /UNIQUE\(tenant_id,event_id\)/);
  assert.match(signature, /crypto\.subtle\.verify\(\{ name: "Ed25519" \}/);
  assert.match(machine + signature, /payloadHash.*canonical/s);
  assert.match(machine, /MACHINE_REQUEST_EXPIRED/);
  assert.match(machine, /x-tenant-id/);
  assert.match(crm, /claim_quotebench_request/);
  assert.match(crm, /MACHINE_REQUEST_REPLAYED/);
  assert.match(crm, /machineEventId !== eventId/);
  assert.doesNotMatch(machine, /Bearer|shared.?secret/i);
});

test("material portal actions use immutable audit and transactional outbox facts", () => {
  assert.match(service, /insert into audit_event/);
  assert.match(service, /insert into outbox_event/);
  for (const event of ["client_request.created","client_request.responded","client_request.completed","document.uploaded","message.sent","client_confirmation.completed"])
    assert.match(service, new RegExp(event.replaceAll(".", "\\.")));
});
