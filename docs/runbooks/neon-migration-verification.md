# Disposable Neon migration verification

Run this gate only against a disposable child branch. Never supply the production, primary, default or main branch. Create the branch from the repository-compatible baseline and configure an expiry before retrieving its direct, unpooled `neondb_owner` connection string.

Set these process-local environment variables without writing credentials to the repository:

```text
NEON_MIGRATION_DATABASE_URL=<disposable owner connection URL>
NEON_MIGRATION_TARGET=<disposable branch name or id>
NEON_MIGRATION_CONFIRM_DISPOSABLE=<exact same branch name or id>
```

Then run `npm run verify:neon-migrations`.

The command rejects production-like target labels, non-Neon hosts, non-owner roles and mismatched confirmation. It checks repository ordering and target migration history, sends every pending migration as a complete script through PostgreSQL's simple-query protocol, verifies each migration record, and runs the repository migration/security and Practice Management tenant-isolation fixtures. It never splits SQL on semicolons, so dollar-quoted functions, tagged dollar quotes, procedures, triggers and `DO` blocks remain intact.

Record the branch ID, parent branch ID/LSN, expiry, starting migration head, command output and final head with the change evidence. Delete the disposable branch after verification if it is no longer needed; expiry is the recovery fallback. A failure is a release blocker and must not be retried against production.
