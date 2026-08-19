import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const migrationSource = await readFile(
  new URL(
    "../../../packages/database/migrations/0028_organisation_archive_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);

test("organisation lists fail closed to active clients", () => {
  assert.match(indexSource, /includeArchived must be true or false/);
  assert.match(indexSource, /Only workspace owners and administrators can view archived clients/);
  assert.match(indexSource, /lifecycle_status='ACTIVE'/);
});

test("archival is owner-controlled, authenticated and auditable", () => {
  assert.match(migrationSource, /SECURITY DEFINER/);
  assert.match(migrationSource, /current_setting\(''app\.tenant_id'',true\)/);
  assert.match(migrationSource, /current_setting\(''app\.actor_id'',true\)/);
  assert.match(migrationSource, /tm\.role_code IN \(''OWNER'',''ADMIN''\)/);
  assert.match(migrationSource, /REVOKE ALL ON FUNCTION archive_authenticated_organisation/);
  assert.doesNotMatch(migrationSource, /GRANT UPDATE\([^)]*lifecycle_status/);
  assert.match(indexSource, /"ORGANISATION_ARCHIVED"/);
  assert.match(indexSource, /archive_authenticated_organisation/);
});

test("archived clients cannot receive new accounts periods", () => {
  assert.match(indexSource, /"ORGANISATION_ARCHIVED"/);
  assert.match(indexSource, /Archived clients cannot be used for new accounts periods/);
});

test("archive records are coherent and retained", () => {
  assert.match(migrationSource, /lifecycle_status IN \('ACTIVE','ARCHIVED'\)/);
  assert.match(migrationSource, /organisation_archive_coherence_ck/);
  assert.match(migrationSource, /version=target\.version\+1/);
  assert.doesNotMatch(migrationSource, /DELETE FROM organisation/i);
});
