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

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Architecture verification passed: ${requiredDocuments.length} instruction/docs files, 6 module roots, ${migrations.length} migrations.`);
