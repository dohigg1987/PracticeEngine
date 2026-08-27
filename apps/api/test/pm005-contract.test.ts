import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { notificationDeliveryAdapter } from "../src/publisher.ts";

const root = new URL("../../../", import.meta.url);
const migration = await readFile(new URL("packages/database/migrations/0033_crm_onboarding_notifications.sql", root), "utf8");
const service = await readFile(new URL("apps/api/src/crm-onboarding.ts", root), "utf8");
const platform = await readFile(new URL("apps/api/src/platform-core.ts", root), "utf8");
const worker = await readFile(new URL("apps/api/src/notification-worker.ts", root), "utf8");
const publisher = await readFile(new URL("apps/api/src/publisher.ts", root), "utf8");
const ui = await readFile(new URL("apps/web/src/CrmOnboarding.tsx", root), "utf8");

test("PM-005 adds only the next sequential migration", async () => {
  const migrations = (await import("node:fs/promises")).readdir(new URL("packages/database/migrations/", root));
  assert.ok((await migrations).includes("0033_crm_onboarding_notifications.sql"));
  assert.match(migration, /VALUES\('0033','CRM QuoteBench acceptance conversion onboarding and durable notifications'\)/);
});

test("CRM reuses canonical contacts services and clients", () => {
  for (const table of ["prospect", "prospect_contact_relationship", "opportunity", "opportunity_service", "crm_activity"])
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\(`));
  assert.match(migration, /REFERENCES contact\(tenant_id,id\)/);
  assert.match(migration, /REFERENCES practice_service\(tenant_id,id\)/);
  assert.match(migration, /converted_client_id uuid/);
  assert.doesNotMatch(migration, /CREATE TABLE (?:crm_)?contact\(/);
  assert.doesNotMatch(migration, /CREATE TABLE proposal_document|CREATE TABLE pricing_rule/);
});

test("QuoteBench is an entitled specialist boundary with stable references and events", () => {
  for (const key of ["quotebench.enabled", "quotebench.proposals", "quotebench.pricing", "quotebench.templates", "quotebench.esign"])
    assert.match(migration, new RegExp(key.replace(".", "\\.")));
  assert.match(migration, /CREATE TABLE quotebench_proposal_reference/);
  assert.match(service, /assertPlatformEntitled\(tx, "quotebench\.enabled"\)/);
  for (const event of ["created", "sent", "viewed", "accepted", "declined", "expired"])
    assert.match(service, new RegExp(`quotebench\\.proposal\\.${event}`));
  assert.match(service, /sharedContext: \{ tenantId: ctx\.tenantId, opportunityId/);
});

test("acceptance conversion has database idempotency and canonical activation mappings", () => {
  assert.match(migration, /UNIQUE\(tenant_id,acceptance_event_id\)/);
  assert.match(migration, /UNIQUE\(tenant_id,module_key,event_id\)/);
  assert.match(migration, /client_service_opportunity_service_uq/);
  assert.match(migration, /UNIQUE\(tenant_id,opportunity_id,proposal_reference_id\)/);
  assert.match(service, /for update of o/);
  assert.match(service, /insert into organisation/);
  assert.match(service, /insert into client_service/);
  assert.match(service, /insert into practice_engagement/);
  assert.match(service, /insert into practice_engagement_service/);
  assert.match(service, /insert into recurring_work_schedule/);
  assert.match(service, /evaluateRecurrence/);
  assert.match(service, /insert into crm_conversion/);
  assert.match(service, /existing_client_id/);
});

test("onboarding uses work templates workflow instances and delivery gates", () => {
  for (const table of ["onboarding_case", "onboarding_case_service", "onboarding_blocker"])
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\(`));
  assert.match(migration, /work_template_id uuid/);
  assert.match(migration, /work_item_id uuid/);
  assert.match(service, /insert into work_item/);
  assert.match(service, /insert into work_stage/);
  assert.match(service, /insert into practice_task/);
  assert.match(service, /ONBOARDING_GATES_OPEN/);
  assert.match(service, /delivery_readiness=.*ready_for_delivery/);
});

test("new tenant data is forced-RLS protected and least-privilege granted", () => {
  const inventory = ["crm_stage_definition", "prospect", "prospect_contact_relationship", "opportunity", "opportunity_service", "crm_activity", "quotebench_proposal_reference", "specialist_event_receipt", "onboarding_case", "onboarding_case_service", "onboarding_blocker", "crm_conversion"];
  for (const table of inventory) assert.match(migration, new RegExp(`['\"]${table}['\"]`));
  assert.match(migration, /ALTER TABLE %I FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /tenant_id::text=nullif\(current_setting\(''app\.tenant_id''/);
  assert.match(migration, /REVOKE ALL ON crm_stage_definition/);
});

test("functional permissions and commercial entitlements remain separate", () => {
  for (const permission of ["crm.view", "crm.manage", "prospects.create", "opportunities.convert", "onboarding.view", "onboarding.complete", "notifications.view"])
    assert.match(migration, new RegExp(permission.replace(".", "\\.")));
  assert.match(service, /assertPlatformRouteAccess\(tx, permission, "practice\.enabled", feature\)/);
  assert.match(platform, /actor_has_permission\(\$\{permissionKey\}::text\) allowed/);
  assert.match(platform, /tenant_feature_decision\(\$\{routeFeatureKey\}::text\)/);
  assert.doesNotMatch(service, /package(?:Name|_name)|professional_plan|premium_plan/i);
});

test("durable notification delivery claims only notification outbox facts", async () => {
  assert.match(migration, /CREATE FUNCTION claim_notification_events/);
  assert.match(migration, /event_type=''notification\.requested''/);
  assert.match(migration, /outbox_delivery_attempt/);
  assert.match(migration, /delivery_status='DELIVERED'/);
  assert.match(migration, /delivery_status=CASE WHEN terminal_at IS NULL THEN 'RETRY' ELSE 'FAILED' END/);
  assert.match(worker, /runPublisherBatch/);
  assert.match(publisher, /EMAIL_PROVIDER_NOT_CONFIGURED/);
  const event = { id: "event-1", tenantId: "tenant-1", eventType: "notification.requested", attemptCount: 1, maxAttempts: 8, payload: { channel: "IN_APP", recipientReference: "actor-1", templateCode: "proposal.accepted", payload: {} } };
  assert.equal((await notificationDeliveryAdapter().deliver(event)).providerMessageId, "in-app:event-1");
  await assert.rejects(() => notificationDeliveryAdapter().deliver({ ...event, payload: { ...event.payload, channel: "EMAIL" } }), /EMAIL_PROVIDER_NOT_CONFIGURED/);
});

test("material lifecycle mutations write immutable audit and normalized outbox facts", () => {
  for (const event of ["prospect.created", "opportunity.created", "opportunity.stage_changed", "proposal.linked", "proposal.accepted", "prospect.converted", "client.created_from_prospect", "client_service.activated_from_proposal", "engagement.activated_from_proposal", "onboarding.started", "onboarding.completed"])
    assert.match(service, new RegExp(event.replaceAll(".", "\\.")));
  assert.match(service, /insert into audit_event/);
  assert.match(service, /insert into outbox_event/);
});

test("CRM and onboarding UI uses Fluent operational tables", () => {
  assert.match(ui, /from "@fluentui\/react-components"/);
  for (const label of ["CRM prospects", "CRM opportunities", "Opportunity proposed services", "Onboarding work", "Onboarding required actions"])
    assert.match(ui, new RegExp(label));
  assert.doesNotMatch(ui, /<button|<select|<input/);
});
