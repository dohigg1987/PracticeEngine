# Pilot retention and R2 reconciliation contract

## Trust boundary

Retention administration runs only as the migration owner or a future dedicated maintenance role. `accounts_app` has no privileges on retention policies, scopes, holds, candidates, decisions, eligibility functions, or the ready inventory view. Migration 0017 does not provide or execute a purge operation.

All policies, scopes, holds, hold releases, candidate inventories, and decisions are append-only. A hold is active until a separate immutable release row exists. Tenant-wide holds block every engagement in that tenant, while engagement holds block only their engagement. Candidate creation and approval require an expired retention scope and no applicable active hold. The ready view repeats that check live, so a hold imposed after approval immediately removes the candidate from ready inventory.

## Candidate workflow

1. Create a retention scope only when its clock is evidenced. The stored period must match a versioned policy and `retention_until` must exactly equal the clock plus that period.
2. Query the tenant-scoped database inventory in a read-only transaction.
3. Inventory referenced R2 keys and independently list objects under the tenant prefix. Never treat the database manifest alone as proof that an object exists or is unreferenced.
4. Canonicalise the database and R2 inventory documents and calculate a lowercase SHA-256 checksum over the combined evidence.
5. Insert one immutable `retention_purge_candidate`. The database rejects it when the scope is not due or an applicable hold is active.
6. Obtain independent approval and insert one immutable decision. Cancellation and approval are terminal alternatives.
7. Immediately before any future purge, query `retention_purge_ready_inventory` and repeat both inventories and the checksum. Absence from this view is a hard stop.
8. A future purge implementation must acquire tenant-scoped advisory or row locks, recheck eligibility inside the same transaction, use idempotent object deletion, record per-object results, and append completion evidence. It must never infer authorization from a stale candidate snapshot.

## R2 inventory document

`r2_inventory` is an object with a versioned contract:

```json
{
  "contractVersion": 1,
  "bucket": "binding-name-not-secret",
  "tenantPrefix": "tenants/tenant-uuid/",
  "listedAt": "2026-08-18T16:00:00Z",
  "referenced": [{"key": "...", "sha256": "...", "size": 123}],
  "unreferenced": [{"key": "...", "sha256": "...", "size": 123, "firstDetectedAt": "..."}],
  "missing": [{"key": "...", "expectedSha256": "..."}],
  "continuationComplete": true
}
```

The inventory is invalid when pagination is incomplete, a tenant prefix is not exact, hashes are unavailable for artefacts expected to be immutable, or any object belongs to another tenant. Orphan objects require a separate `R2_ORPHAN` scope whose detection clock has passed the quarantine period.

`database_inventory` must likewise contain `"contractVersion": 1` and `"queryComplete": true`, plus the query cutoff, per-table counts, selected identifiers, and source migration head. The database constraints reject either inventory unless its completeness flag is true.

## Operational work still required

- Build an owner-authenticated maintenance command or job that produces canonical database and R2 inventories without exposing the owner credential to the API Worker.
- Add dual approval and evidence storage outside the production database.
- Implement the future purge executor as a separately reviewed migration and operations tranche. It must not grant DELETE to `accounts_app`.
- Add Cloudflare R2 lifecycle rules only for prefixes whose lifecycle cannot race retained database references.
- Exercise hold, release, stale approval, cross-tenant inventory, R2 pagination, failure retry, and point-in-time recovery on a non-production branch.

Use `pilot_retention_inventory_signoff.md` for the exact owner-maintenance contract and `pilot_retention_operational_fixture.sql` for rollback-only database verification.
