# Retention inventory reconciliation

This owner-operated command creates read-only evidence comparing the R2 object
references in Postgres with a complete, paginated R2 listing. It does not insert
an `0017` purge candidate, approve a candidate, download object bodies, or expose
any delete/purge operation. Findings are always marked `REVIEW_ONLY`.

## Preconditions

- Migration `0017_pilot_retention_legal_hold.sql` is present on the target branch.
- Use a dedicated `neondb_owner` connection string with TLS. Never use the API
  Worker's `accounts_app`/Hyperdrive credential.
- Use an R2 S3 credential scoped to **Object Read** for the one intended bucket.
  The tool only calls `ListObjectsV2` and `HeadObject`.
- Create a retention scope through the separately controlled owner process. This
  command accepts its UUID and does not create or alter the scope.

Set secrets in the operator environment, not in source control or shell history:

```text
RETENTION_DATABASE_URL=<owner Neon connection string with sslmode=require>
RETENTION_EXPECTED_DATABASE_ROLE=neondb_owner
CLOUDFLARE_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<read-only R2 access key>
R2_SECRET_ACCESS_KEY=<read-only R2 secret>
R2_BUCKET_NAME=uk-accounts-prod-artefacts
```

## Run (dry-run is the only mode)

From `apps/api`:

```powershell
npm run retention:inventory -- --scope-id <uuid> --output retention-evidence.json
```

The output file is created with exclusive-create semantics and will not overwrite
an existing file. Omit `--output` to write JSON to stdout. `--apply`, `--write`,
`--delete`, and `--purge` are rejected. The listing fails closed if it is
incomplete, repeats a continuation cursor, or exceeds the configured object
safety limit (default and maximum: 100,000).

The command queries the scope and active holds in one repeatable-read,
read-only transaction. It inventories explicit keys from `import_batch`,
`import_snapshot`, `accounts_version`, and `filing_attempt`. Duplicate database
references are folded by key; disagreeing hashes are findings. A non-null iXBRL
key is explicitly `DATABASE_HASH_UNAVAILABLE`, because the current schema has no
paired iXBRL hash.

R2 SHA-256 comparison uses the object's `sha256` custom metadata returned by
`HeadObject`. It does not re-download and hash bytes, so the report describes a
metadata reconciliation rather than byte-level re-verification.

## Evidence and review

The JSON contains `databaseInventory.contractVersion=1` with
`queryComplete=true`, `r2Inventory.contractVersion=1` with
`continuationComplete=true`, canonical per-inventory hashes, findings, scope/hold
state, and a deterministic `inventoryChecksum`. This matches the evidence fields
expected by migration 0017, but insertion into `retention_purge_candidate` is a
separate owner-reviewed operation and is intentionally absent here.

An eligible scope or clean reconciliation is not deletion authority. Legal hold
changes after inventory generation, concurrent DB/R2 changes, and every finding
must be re-reviewed before any future candidate or disposition workflow.
