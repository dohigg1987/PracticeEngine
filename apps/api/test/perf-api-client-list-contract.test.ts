import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const service = await readFile(new URL("apps/api/src/index.ts", root), "utf8");
const start = service.indexOf("async function listOrganisations");
const end = service.indexOf("async function createOrganisation", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const source = service.slice(start, end);

test("normal organisation list folds membership validation into its list statement", () => {
  const normalBranch = source.slice(source.indexOf("const rows = await tx`"));
  assert.match(normalBranch, /with actor_membership as/);
  assert.match(normalBranch, /tenant_id=\$\{ctx\.tenantId\} and actor_id=\$\{ctx\.actorId\}/);
  assert.match(normalBranch, /o\.lifecycle_status='ACTIVE'/);
  assert.match(normalBranch, /if \(!rows\[0\]\?\.__role_code\)/);
  assert.match(normalBranch, /Actor is not a member of this tenant/);
  assert.equal((normalBranch.match(/await tx`/g) ?? []).length, 1);
});

test("archived organisation visibility remains role-gated before its list query", () => {
  const archiveBranch = source.slice(source.indexOf("if (includeArchived)"), source.indexOf("const rows = await tx`"));
  const roleCheck = archiveBranch.indexOf("await tenantRole(tx, ctx)");
  const listQuery = archiveBranch.indexOf("await tx`");
  assert.ok(roleCheck >= 0 && listQuery > roleCheck);
  assert.match(archiveBranch, /role !== "OWNER" && role !== "ADMIN"/);
  assert.match(archiveBranch, /Only workspace owners and administrators can view archived clients/);
});

test("invalid archive filters retain membership-first error semantics", () => {
  const validation = source.slice(source.indexOf("if (rawIncludeArchived"), source.indexOf("const includeArchived"));
  assert.ok(validation.indexOf("await tenantRole(tx, ctx)") < validation.indexOf("throw new ApiError(400"));
});

test("organisation list response strips the internal membership marker", () => {
  assert.match(source, /const \{ __role_code, \.\.\.item \} = row/);
  assert.match(source, /return item\.id \? \[item\] : \[\]/);
  assert.doesNotMatch(source, /json\(\{ items: rows \}\)/);
});
