import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateDisposableTarget } from "./verify-neon-migrations.mjs";

const valid = {
  databaseUrl: "postgresql://neondb_owner:secret@ep-disposable.eu-west-2.aws.neon.tech/neondb?sslmode=require",
  target: "pm-003-validation-123",
  confirmation: "pm-003-validation-123",
};

test("requires an explicitly confirmed disposable Neon owner target", () => {
  assert.equal(validateDisposableTarget(valid).hostname, "ep-disposable.eu-west-2.aws.neon.tech");
  for (const overrides of [
    { target: "production", confirmation: "production" },
    { target: "pm-primary-copy", confirmation: "pm-primary-copy" },
    { confirmation: "another-target" },
    { databaseUrl: "postgresql://neondb_owner:secret@example.com/neondb" },
    { databaseUrl: "postgresql://accounts_app:secret@ep-disposable.eu-west-2.aws.neon.tech/neondb" },
  ]) assert.throws(() => validateDisposableTarget({ ...valid, ...overrides }));
});

test("migration executor never splits PostgreSQL scripts on semicolons", async () => {
  const source = await readFile(new URL("./verify-neon-migrations.mjs", import.meta.url), "utf8");
  assert.match(source, /sql\.unsafe\(script, \[\], \{ prepare: false \}\)/);
  assert.doesNotMatch(source, /split\([^\n]+;|splitStatements|parseStatements/);
});
