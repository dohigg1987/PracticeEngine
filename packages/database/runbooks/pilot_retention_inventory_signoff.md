# Retention inventory and sign-off procedure

## Decision

Migration 0017 already exposes the required owner-only contract. No additional view, function, role grant, or migration is required for the inventory CLI. The CLI must not run in the public API Worker, use the `accounts_app` credential, or perform deletion.

## Database contract

The CLI reads `retention_policy`, `retention_scope`, `legal_hold`, `legal_hold_release`, `retention_purge_candidate`, `retention_candidate_decision`, and `retention_purge_ready_inventory`. It may call `retention_scope_is_eligible(uuid)` and `retention_candidate_is_approvable(uuid)` as `neondb_owner`. Every retained evidence row is append-only.

An inventory run starts a `REPEATABLE READ, READ ONLY` transaction and records:

- project, branch, database, migration head, transaction timestamp, tenant ID, and optional engagement ID
- per-table row counts and stable primary identifiers for the selected scope
- minimum and maximum accounting/event timestamps where present
- all explicit database-to-R2 references and their stored hashes
- query completion state and any query error

The database inventory JSON must include `"contractVersion": 1` and `"queryComplete": true`. A failed or partial query must set completion false and cannot become a candidate.

## Explicit R2 references

Inventory these columns, always filtered by the exact tenant and optional engagement:

| Source | Object key | Stored hash |
| --- | --- | --- |
| `import_batch` | `storage_key` | `content_hash` |
| `import_snapshot` | `storage_key` | `content_hash` |
| `accounts_version` HTML | `html_storage_key` | `html_content_hash` |
| `accounts_version` PDF | `pdf_storage_key` | `pdf_content_hash` |
| `accounts_version` iXBRL | `ixbrl_storage_key` | none currently |
| `filing_attempt` payload | `payload_storage_key` | `payload_hash` |
| `filing_attempt` response | `response_storage_key` | `response_content_hash` |

Deduplicate by exact object key. A key associated with conflicting tenant IDs, object classes, or non-equal hashes is a hard failure. A non-null iXBRL key is currently a hard readiness failure because the schema has no paired immutable iXBRL hash. Do not infer object keys from arbitrary JSON manifests.

The R2 inventory must list with an exact tenant prefix until pagination is exhausted and include `"contractVersion": 1` and `"continuationComplete": true`. Record key, byte size, ETag, available custom SHA-256 metadata, last-modified time, and whether the key is referenced, missing, or unreferenced. Cross-tenant keys and incomplete pagination are hard failures.

## Canonical checksum

Construct this document:

```json
{"database": {}, "r2": {}}
```

Replace the values with the completed inventory objects, canonicalise using RFC 8785 JSON Canonicalization Scheme, encode as UTF-8 without a byte-order mark or trailing newline, and calculate SHA-256. Store the lowercase 64-character hex digest as `inventory_checksum`. Store the exact canonical bytes in external immutable evidence so another operator can reproduce the digest.

## Sign-off sequence

1. Operator verifies the target is a disposable branch for drills or the approved production read-only inventory target.
2. Operator records the retention scope and confirms its versioned policy, clock evidence, and `retention_until`.
3. Operator checks active tenant-wide and engagement holds directly and calls `retention_scope_is_eligible`.
4. Operator completes database and R2 inventories, reconciles every explicit key, and records the canonical checksum.
5. A different approver reviews the legal basis, cutoff, hold result, counts, missing/conflicting keys, R2 pagination evidence, and checksum reproduction.
6. Only the owner-maintenance workflow may insert a candidate and decision. Approval is prohibited when any exception remains.
7. Immediately before any future destructive workflow, query `retention_purge_ready_inventory` again and repeat the inventory. Absence from the live view is an unconditional stop.
8. Store operator, approver, UTC timestamps, evidence URI, checksum, Neon recovery point, and exceptions in the external sign-off record.

There is intentionally no purge step here. A future purge executor requires separate design, migration, failure recovery, dual authorization, and non-production verification.

## Verification evidence

Before operational acceptance, run `pilot_retention_operational_fixture.sql` as `neondb_owner` on a disposable Neon branch. It must return `PASS` and then roll back all fixtures. Attach its output and confirm the branch contains no fixture IDs afterward.
