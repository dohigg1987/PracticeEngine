import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationsDirectory = path.join(root, "packages", "database", "migrations");
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

const failures = [];
for (const [index, file] of migrationFiles.entries()) {
  const expected = String(index + 1).padStart(4, "0");
  const actual = file.slice(0, 4);
  if (actual !== expected) failures.push(`Expected migration ${expected}, found ${file}`);
  const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
  if (index >= 3 && !new RegExp(`schema_migration[\\s\\S]+['\"]${actual}['\"]`, "i").test(sql))
    failures.push(`${file} does not record schema_migration ${actual}`);
}

const baselineMigration = await readFile(
  path.join(migrationsDirectory, "0004_database_hardening.sql"),
  "utf8",
);
for (const baseline of ["0001", "0002", "0003"])
  if (!baselineMigration.includes(`('${baseline}'`))
    failures.push(`0004_database_hardening.sql does not baseline migration ${baseline}`);

const productionConfig = JSON.parse(
  await readFile(path.join(root, "apps", "api", "wrangler.production.jsonc"), "utf8"),
);
const serializedConfig = JSON.stringify(productionConfig);
if (/[<>]|\.example\b|REPLACE|PLACEHOLDER/i.test(serializedConfig))
  failures.push("Production Worker config contains a placeholder");
if (productionConfig.name !== "uk-accounts-api-production")
  failures.push("Production Worker name has drifted");
if (productionConfig.r2_buckets?.[0]?.bucket_name !== "uk-accounts-prod-artefacts")
  failures.push("Production R2 binding has drifted");
if (productionConfig.vars?.WEB_ORIGIN !== "https://ledgerly-accounts.pages.dev")
  failures.push("Production web origin has drifted");
if (!productionConfig.hyperdrive?.[0]?.id)
  failures.push("Production Hyperdrive binding is missing");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `Lockstep verified: migrations 0001-${migrationFiles.at(-1).slice(0, 4)}, production Worker, R2, Hyperdrive and web origin.`,
);
