import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { build } from "esbuild";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "packages", "database", "migrations");
const accountsAppGrantsFile = path.join(root, "packages", "database", "runbooks", "accounts_app_grants.sql");
const verificationFile = path.join(root, "packages", "database", "runbooks", "neon_migration_verification.sql");
const practiceVerificationFile = path.join(root, "packages", "database", "runbooks", "practice_management_disposable_verification.sql");
const pm003VerificationFile = path.join(root, "packages", "database", "runbooks", "pm003_disposable_verification.sql");
const pm004VerificationFile = path.join(root, "packages", "database", "runbooks", "pm004_disposable_verification.sql");
const pm005VerificationFile = path.join(root, "packages", "database", "runbooks", "pm005_disposable_verification.sql");
const pm006VerificationFile = path.join(root, "packages", "database", "runbooks", "pm006_disposable_verification.sql");
const pm007VerificationFile = path.join(root, "packages", "database", "runbooks", "pm007_disposable_verification.sql");

export function validateDisposableTarget({ databaseUrl, target, confirmation }) {
  if (!databaseUrl) throw new Error("NEON_MIGRATION_DATABASE_URL is required");
  if (!target) throw new Error("NEON_MIGRATION_TARGET is required");
  if (confirmation !== target) throw new Error("NEON_MIGRATION_CONFIRM_DISPOSABLE must exactly match NEON_MIGRATION_TARGET");
  if (/(^|[-_])(prod|production|main|primary|default)([-_]|$)/i.test(target))
    throw new Error(`Refusing production-like migration target: ${target}`);

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("NEON_MIGRATION_DATABASE_URL must be a valid PostgreSQL URL"); }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) throw new Error("Migration target must use PostgreSQL");
  if (!parsed.hostname.endsWith(".neon.tech")) throw new Error("Migration target must be a Neon hostname");
  if (decodeURIComponent(parsed.username) !== "neondb_owner") throw new Error("Migrations must run as neondb_owner, never as the application role");
  return parsed;
}

async function executeScript(sql, script, label) {
  process.stdout.write(`Executing ${label} as one complete PostgreSQL script... `);
  await sql.unsafe(script, [], { prepare: false });
  console.log("passed");
}

async function main() {
  const databaseUrl = process.env.NEON_MIGRATION_DATABASE_URL ?? "";
  const target = process.env.NEON_MIGRATION_TARGET ?? "";
  validateDisposableTarget({ databaseUrl, target, confirmation: process.env.NEON_MIGRATION_CONFIRM_DISPOSABLE ?? "" });

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const [index, name] of migrationFiles.entries()) {
    const expected = String(index + 1).padStart(4, "0");
    if (!name.startsWith(`${expected}_`)) throw new Error(`Migration ordering is not contiguous: expected ${expected}, found ${name}`);
  }

  const sql = postgres(databaseUrl, { max: 1, ssl: "require", prepare: false, connect_timeout: 20, idle_timeout: 5 });
  let conversionBuildDirectory;
  try {
    const identity = await sql`select current_database() database_name,current_user role_name,current_setting('server_version') server_version`;
    console.log(`Disposable target ${target}: database=${identity[0].database_name}, role=${identity[0].role_name}, PostgreSQL=${identity[0].server_version}`);
    if (String(identity[0].role_name) !== "neondb_owner") throw new Error("Connected role is not neondb_owner");

    const migrationTable = await sql`select to_regclass('public.schema_migration') migration_table`;
    let migrationHistoryAvailable = Boolean(migrationTable[0].migration_table);
    const appliedRows = migrationHistoryAvailable
      ? await sql`select version from schema_migration order by version`
      : [];
    if (!migrationHistoryAvailable) {
      const baselineTable = await sql`select to_regclass('public.tenant') baseline_table`;
      if (baselineTable[0].baseline_table)
        throw new Error("Target contains a partial pre-0004 bootstrap without migration history; recreate or restore the branch before retrying");
    }
    const repositoryVersions = migrationFiles.map((name) => name.slice(0, 4));
    const applied = new Set(appliedRows.map((row) => String(row.version)));
    console.log(`Starting migration head: ${appliedRows.at(-1)?.version ?? "empty"}; repository head: ${repositoryVersions.at(-1)}`);
    const unknown = [...applied].filter((version) => !repositoryVersions.includes(version));
    if (unknown.length) throw new Error(`Target contains migrations absent from this repository: ${unknown.join(", ")}`);
    const firstMissing = repositoryVersions.findIndex((version) => !applied.has(version));
    if (firstMissing >= 0 && repositoryVersions.slice(firstMissing + 1).some((version) => applied.has(version)))
      throw new Error("Target migration history has a gap; refusing to guess ordering");

    // The operational runtime-grant baseline covers the schema through 0030.
    // Apply it at that boundary so later migrations can add their own focused
    // grants without a subsequent broad revoke removing them.
    if (applied.has("0030") && !applied.has("0031"))
      await executeScript(sql, await readFile(accountsAppGrantsFile, "utf8"), path.relative(root, accountsAppGrantsFile));

    for (const name of migrationFiles) {
      const version = name.slice(0, 4);
      if (applied.has(version)) continue;
      await executeScript(sql, await readFile(path.join(migrationsDirectory, name), "utf8"), name);
      // Migration 0004 creates schema_migration and backfills 0001-0003. A
      // genuinely empty database therefore cannot prove per-file history until
      // that bootstrap migration has completed.
      if (version === "0004") migrationHistoryAvailable = true;
      if (migrationHistoryAvailable) {
        const expectedRecorded = repositoryVersions.slice(0, Number(version));
        const recordedRows = await sql`select version from schema_migration where version = any(${expectedRecorded}) order by version`;
        const recorded = new Set(recordedRows.map((row) => String(row.version)));
        const missing = expectedRecorded.filter((expectedVersion) => !recorded.has(expectedVersion));
        if (missing.length) throw new Error(`${name} completed without recording schema_migration ${missing.join(", ")}`);
      }
      if (version === "0030")
        await executeScript(sql, await readFile(accountsAppGrantsFile, "utf8"), path.relative(root, accountsAppGrantsFile));
    }

    await executeScript(sql, await readFile(verificationFile, "utf8"), path.relative(root, verificationFile));
    await executeScript(sql, await readFile(practiceVerificationFile, "utf8"), path.relative(root, practiceVerificationFile));
    await executeScript(sql, await readFile(pm003VerificationFile, "utf8"), path.relative(root, pm003VerificationFile));
    await executeScript(sql, await readFile(pm004VerificationFile, "utf8"), path.relative(root, pm004VerificationFile));
    await executeScript(sql, await readFile(pm005VerificationFile, "utf8"), path.relative(root, pm005VerificationFile));
    await executeScript(sql, await readFile(pm006VerificationFile, "utf8"), path.relative(root, pm006VerificationFile));
    await executeScript(sql, await readFile(pm007VerificationFile, "utf8"), path.relative(root, pm007VerificationFile));
    conversionBuildDirectory = await mkdtemp(path.join(tmpdir(), "practiceengine-pm006-conversion-"));
    const conversionTestFile = path.join(conversionBuildDirectory, "pm006-conversion.database.test.mjs");
    await build({
      entryPoints: [path.join(root, "apps", "api", "integration", "pm006-conversion.database.test.ts")],
      outfile: conversionTestFile,
      bundle: true,
      platform: "node",
      format: "esm",
      sourcemap: "inline",
    });
    const conversionTest = spawnSync(process.execPath, ["--test", conversionTestFile], {
      cwd: root, stdio: "inherit", shell: false, env: { ...process.env, PM006_CONVERSION_DATABASE_URL: databaseUrl },
    });
    if (conversionTest.error) throw conversionTest.error;
    if (conversionTest.status !== 0) throw new Error("PM-006 database-backed QuoteBench conversion integration failed");
    console.log(`Neon migration verification passed through ${repositoryVersions.at(-1)} on disposable target ${target}.`);
  } finally {
    await sql.end({ timeout: 5 });
    if (conversionBuildDirectory) await rm(conversionBuildDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Neon migration verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
