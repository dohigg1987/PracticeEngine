import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const relative = (value) => path.relative(root, value).replaceAll("\\", "/");

const requiredDocuments = [
  "docs/architecture/current-state.md",
  "docs/architecture/target-platform.md",
  "docs/architecture/domain-boundaries.md",
  "docs/architecture/events.md",
  "docs/architecture/ledgerly-integration.md",
  "docs/architecture/migration-roadmap.md",
  "docs/architecture/verification.md",
  "docs/architecture/platform-core.md",
  "docs/architecture/client-master.md",
  "docs/architecture/authorization.md",
  "docs/architecture/entitlements.md",
  "docs/architecture/audit.md",
  "docs/architecture/ledgerly-client-compatibility.md",
  "docs/architecture/practice-management.md",
  "docs/architecture/services.md",
  "docs/architecture/engagements.md",
  "docs/architecture/work-management.md",
  "docs/architecture/module-work-integration.md",
  "docs/architecture/infrastructure.md",
  "docs/architecture/recurring-work.md",
  "docs/architecture/deadline-engine.md",
  "docs/architecture/work-template-versioning.md",
  "docs/architecture/work-generation.md",
  "docs/architecture/cloudflare-scheduling.md",
  "docs/architecture/workflow-orchestration.md",
  "docs/architecture/automation-engine.md",
  "docs/architecture/crm.md",
  "docs/architecture/prospect-client-conversion.md",
  "docs/architecture/quotebench-integration.md",
  "docs/architecture/onboarding.md",
  "docs/architecture/notifications.md",
  "docs/architecture/client-portal.md",
  "docs/architecture/client-requests.md",
  "docs/architecture/document-exchange.md",
  "docs/architecture/secure-messaging.md",
  "docs/architecture/portal-identity-access.md",
  "docs/architecture/quotebench-machine-auth.md",
  "docs/architecture/resource-management.md",
  "docs/architecture/capacity-planning.md",
  "docs/architecture/time-capture.md",
  "docs/architecture/practice-economics.md",
  "docs/architecture/wip.md",
  "docs/architecture/portfolio-management.md",
  "docs/engineering/verification-strategy.md",
  "docs/design/DESIGN-CONSTITUTION.md",
  "docs/design/ANTI-PATTERNS.md",
  "AGENTS.md",
  "apps/web/AGENTS.md",
  "apps/api/AGENTS.md",
  "packages/domain/AGENTS.md",
  "packages/database/AGENTS.md"
];

for (const document of requiredDocuments) {
  try {
    const contents = await readFile(path.join(root, document), "utf8");
    if (!contents.trim()) failures.push(`${document} is empty`);
  } catch {
    failures.push(`${document} is missing`);
  }
}

const requiredRules = [
  ["docs/architecture/domain-boundaries.md", "Authorization is enforced server-side"],
  ["docs/architecture/domain-boundaries.md", "Licensing is controlled through entitlements"],
  ["docs/design/DESIGN-CONSTITUTION.md", "Fluent UI React v9 is the application design system"],
  ["docs/architecture/ledgerly-integration.md", "Preserve working behaviour"],
  ["AGENTS.md", "pre-platform-refactor-baseline"]
];

for (const [document, rule] of requiredRules) {
  try {
    const contents = await readFile(path.join(root, document), "utf8");
    if (!contents.includes(rule)) failures.push(`${document} does not contain required rule: ${rule}`);
  } catch {
    // Missing documents are reported above.
  }
}

const manifestPath = path.join(root, "docs/architecture/modules.json");
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const ids = new Set();
  const roots = new Set();
  for (const module of manifest.modules ?? []) {
    if (!module.id || !module.layer || !module.root) failures.push("Every module manifest entry requires id, layer and root");
    if (ids.has(module.id)) failures.push(`Duplicate module id: ${module.id}`);
    if (roots.has(module.root)) failures.push(`Duplicate module root: ${module.root}`);
    ids.add(module.id);
    roots.add(module.root);
    try { await stat(path.join(root, module.root)); }
    catch { failures.push(`Module root does not exist: ${module.root}`); }
  }
} catch (error) {
  failures.push(`Could not read module manifest: ${error.message}`);
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(full));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const sourceRoots = ["apps/web/src", "apps/api/src", "packages/domain/src", "packages/reporting/src", "packages/rules/src"];
for (const sourceRoot of sourceRoots) {
  for (const file of await sourceFiles(path.join(root, sourceRoot))) {
    const text = await readFile(file, "utf8");
    const imports = text.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g);
    for (const match of imports) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const target = relative(path.resolve(path.dirname(file), specifier));
      const owner = relative(file);
      if (owner.startsWith("packages/") && target.startsWith("apps/"))
        failures.push(`${owner} imports application implementation ${target}`);
      if (owner.startsWith("apps/web/") && (target.startsWith("apps/api/") || target.startsWith("packages/database/")))
        failures.push(`${owner} crosses the browser/server persistence boundary via ${target}`);
      if (owner.startsWith("apps/api/") && target.startsWith("apps/web/"))
        failures.push(`${owner} imports web implementation ${target}`);
    }
    if (/\b(?:if|switch)\s*\([^)]*package(?:Name|_name|Key|_key)/i.test(text))
      failures.push(`${relative(file)} contains package-name licensing logic; evaluate a feature entitlement instead`);
  }
}

const migrationDirectory = path.join(root, "packages/database/migrations");
const migrations = (await readdir(migrationDirectory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
for (const [index, migration] of migrations.entries()) {
  const expected = String(index + 1).padStart(4, "0");
  if (!migration.startsWith(`${expected}_`)) failures.push(`Expected migration ${expected}, found ${migration}`);
}

const platformMigrationName = migrations.find((name) => name.includes("platform_core_client_entitlements"));
if (platformMigrationName) {
  const platformMigration = await readFile(path.join(migrationDirectory, platformMigrationName), "utf8");
  const tenantOwnedTables = [
    "tenant_role", "tenant_role_permission", "tenant_member_role", "team", "team_member",
    "contact", "client_contact_relationship", "address", "client_address",
    "tenant_entitlement", "tenant_entitlement_override", "tenant_setting"
  ];
  for (const table of tenantOwnedTables) {
    const declaration = new RegExp(`CREATE TABLE ${table}\\([\\s\\S]*?tenant_id uuid NOT NULL`, "i");
    if (!declaration.test(platformMigration)) failures.push(`${platformMigrationName}: ${table} lacks a required tenant_id`);
    if (!platformMigration.includes(`'${table}'`)) failures.push(`${platformMigrationName}: ${table} is missing from the forced-RLS inventory`);
  }
  for (const required of ["actor_has_permission", "tenant_feature_decision", "audit_event_immutable"])
    if (!platformMigration.includes(required)) failures.push(`${platformMigrationName} is missing ${required}`);
}

const practiceMigrationName = migrations.find((name) => name.includes("practice_management_work_foundation"));
if (practiceMigrationName) {
  const practiceMigration = await readFile(path.join(migrationDirectory, practiceMigrationName), "utf8");
  const tenantOwnedTables = [
    "practice_service", "client_service", "practice_engagement", "practice_engagement_service",
    "work_template", "work_template_task", "work_item", "practice_task", "work_item_ledgerly_link"
  ];
  for (const table of tenantOwnedTables) {
    const declaration = new RegExp(`CREATE TABLE ${table}\\([\\s\\S]*?tenant_id uuid NOT NULL`, "i");
    if (!declaration.test(practiceMigration)) failures.push(`${practiceMigrationName}: ${table} lacks a required tenant_id`);
    if (!practiceMigration.includes(`'${table}'`)) failures.push(`${practiceMigrationName}: ${table} is missing from the forced-RLS inventory`);
  }
  for (const permission of [
    "services.view", "services.manage", "engagements.view", "engagements.manage",
    "work.view", "work.create", "work.edit", "work.assign", "work.complete",
    "tasks.view", "tasks.manage", "worktemplates.manage"
  ])
    if (!practiceMigration.includes(`'${permission}'`)) failures.push(`${practiceMigrationName} is missing ${permission}`);
}

const recurringMigrationName = migrations.find((name) => name.includes("recurring_work_deadline_engine"));
if (recurringMigrationName) {
  const recurringMigration = await readFile(path.join(migrationDirectory, recurringMigrationName), "utf8");
  for (const table of ["deadline_rule", "recurring_work_schedule", "recurrence_generation", "practice_task_dependency"]) {
    const declaration = new RegExp(`CREATE TABLE ${table}\\([\\s\\S]*?tenant_id uuid NOT NULL`, "i");
    if (!declaration.test(recurringMigration)) failures.push(`${recurringMigrationName}: ${table} lacks a required tenant_id`);
    if (!recurringMigration.includes(`'${table}'`)) failures.push(`${recurringMigrationName}: ${table} is missing from the forced-RLS inventory`);
  }
  for (const permission of ["recurrence.view", "recurrence.manage", "deadlines.view", "deadlines.override", "work.generate", "worktemplates.publish"])
    if (!recurringMigration.includes(`'${permission}'`)) failures.push(`${recurringMigrationName} is missing ${permission}`);
  for (const invariant of ["client_service_active_period_excl", "recurring_schedule_id,occurrence_date", "due_date_override_reason"])
    if (!recurringMigration.includes(invariant)) failures.push(`${recurringMigrationName} is missing ${invariant}`);
}

const crmMigrationName = migrations.find((name) => name.includes("crm_onboarding_notifications"));
if (crmMigrationName) {
  const crmMigration = await readFile(path.join(migrationDirectory, crmMigrationName), "utf8");
  const tenantOwnedTables = [
    "crm_stage_definition", "prospect", "prospect_contact_relationship", "opportunity", "opportunity_service",
    "crm_activity", "quotebench_proposal_reference", "specialist_event_receipt", "onboarding_case",
    "onboarding_case_service", "onboarding_blocker", "crm_conversion"
  ];
  for (const table of tenantOwnedTables) {
    const declaration = new RegExp(`CREATE TABLE ${table}\\([\\s\\S]*?tenant_id uuid NOT NULL`, "i");
    if (!declaration.test(crmMigration)) failures.push(`${crmMigrationName}: ${table} lacks a required tenant_id`);
    if (!crmMigration.includes(`'${table}'`)) failures.push(`${crmMigrationName}: ${table} is missing from the forced-RLS inventory`);
  }
  for (const permission of ["crm.view", "crm.manage", "prospects.create", "prospects.edit", "opportunities.create", "opportunities.edit", "opportunities.convert", "onboarding.view", "onboarding.manage", "onboarding.complete", "notifications.view"])
    if (!crmMigration.includes(`'${permission}'`)) failures.push(`${crmMigrationName} is missing ${permission}`);
  for (const entitlement of ["quotebench.enabled", "quotebench.proposals", "quotebench.pricing", "quotebench.templates", "quotebench.esign"])
    if (!crmMigration.includes(`'${entitlement}'`)) failures.push(`${crmMigrationName} is missing ${entitlement}`);
  for (const invariant of ["client_service_opportunity_service_uq", "UNIQUE(tenant_id,acceptance_event_id)", "claim_notification_events", "FOR UPDATE SKIP LOCKED"])
    if (!crmMigration.includes(invariant)) failures.push(`${crmMigrationName} is missing ${invariant}`);
}

const portalMigrationName = migrations.find((name) => name.includes("client_portal_collaboration"));
if (portalMigrationName) {
  const portalMigration = await readFile(path.join(migrationDirectory, portalMigrationName), "utf8");
  const tenantOwnedTables = [
    "portal_principal", "portal_client_access", "portal_invitation",
    "client_request", "client_request_recipient", "client_request_response",
    "portal_document", "portal_document_version", "portal_thread", "portal_thread_participant",
    "portal_message", "portal_message_attachment", "portal_thread_read", "client_confirmation",
    "quotebench_request_receipt"
  ];
  for (const table of tenantOwnedTables) {
    const declaration = new RegExp(`CREATE TABLE ${table}\\([\\s\\S]*?tenant_id uuid NOT NULL`, "i");
    if (!declaration.test(portalMigration)) failures.push(`${portalMigrationName}: ${table} lacks a required tenant_id`);
    if (!portalMigration.includes(`'${table}'`)) failures.push(`${portalMigrationName}: ${table} is missing from the forced-RLS inventory`);
  }
  for (const permission of [
    "portal.manage", "portal.invite", "portal.revoke", "client_requests.view", "client_requests.manage",
    "documents.share", "portal_messages.view", "portal_messages.send", "confirmations.request"
  ])
    if (!portalMigration.includes(`'${permission}'`)) failures.push(`${portalMigrationName} is missing ${permission}`);
  for (const entitlement of ["practice.portal.requests", "practice.portal.documents", "practice.portal.messaging"])
    if (!portalMigration.includes(`'${entitlement}'`)) failures.push(`${portalMigrationName} is missing ${entitlement}`);
  for (const invariant of [
    "portal_actor_has_client_access", "portal_tenant_feature_enabled", "accept_portal_invitation",
    "quotebench_machine_key_for_request", "claim_quotebench_request", "machine_tenant_feature_enabled",
    "ALTER TABLE quotebench_machine_key ENABLE ROW LEVEL SECURITY", "UNIQUE(tenant_id,client_request_id,idempotency_key)"
  ])
    if (!portalMigration.includes(invariant)) failures.push(`${portalMigrationName} is missing ${invariant}`);
} else failures.push("Migration 0034 client portal collaboration is missing");

const resourceEconomicsMigrationName = migrations.find((name) => name.includes("resource_capacity_time_economics"));
if (resourceEconomicsMigrationName) {
  const migration = await readFile(path.join(migrationDirectory, resourceEconomicsMigrationName), "utf8");
  const tenantOwnedTables = [
    "resource_profile", "resource_working_pattern", "resource_availability_adjustment", "work_assignment_history",
    "resource_cost_rate", "time_entry", "work_commercial_context", "billing_recovery"
  ];
  for (const table of tenantOwnedTables) {
    const declaration = new RegExp(`CREATE TABLE ${table}\\([\\s\\S]*?tenant_id uuid NOT NULL`, "i");
    if (!declaration.test(migration)) failures.push(`${resourceEconomicsMigrationName}: ${table} lacks a required tenant_id`);
    if (!migration.includes(`'${table}'`) && !migration.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
      failures.push(`${resourceEconomicsMigrationName}: ${table} is missing from the forced-RLS inventory`);
  }
  for (const permission of [
    "resources.view", "resources.manage", "capacity.view", "capacity.manage", "assignments.manage",
    "time.view", "time.enter", "time.manage", "time.approve", "costrates.view", "costrates.manage",
    "economics.view", "economics.manage", "portfolio.view"
  ]) if (!migration.includes(`'${permission}'`)) failures.push(`${resourceEconomicsMigrationName} is missing ${permission}`);
  for (const entitlement of [
    "practice.resources", "practice.capacity", "practice.time", "practice.wip", "practice.economics", "practice.reporting"
  ]) if (!migration.includes(`'${entitlement}'`)) failures.push(`${resourceEconomicsMigrationName} is missing ${entitlement}`);
  for (const invariant of [
    "resource_working_pattern_period_excl", "resource_cost_rate_period_excl", "cost_rate_snapshot",
    "proposal_reference_id", "ALTER TABLE %I FORCE ROW LEVEL SECURITY", "REVOKE ALL ON resource_profile"
  ]) if (!migration.includes(invariant)) failures.push(`${resourceEconomicsMigrationName} is missing ${invariant}`);
} else failures.push("Migration 0035 resource capacity time economics is missing");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Architecture verification passed: ${requiredDocuments.length} instruction/docs files, 6 module roots, ${migrations.length} migrations.`);
