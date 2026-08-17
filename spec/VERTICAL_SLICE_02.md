# Vertical Slice 2: persisted accounts preparation

This slice turns the accounting-core prototype into the first persisted application path.

## Scope

1. Tenant and organisation records are authoritative database objects.
2. An engagement is period-specific and pins framework/sector state.
3. A CSV source file is stored as an immutable R2 artefact before its parsed content is committed.
4. Import rows preserve raw source values and transformed accounting values.
5. Source accounts are matched to canonical reporting accounts.
6. A committed import creates a versioned IMPORTED trial balance.
7. Mapping exceptions remain explicit and block controlled workflow gates where configured.
8. Material writes create an `audit_event` and transactional `outbox_event`.
9. Report lines retain provenance to source accounts and import snapshot.

## Import command transaction

```text
Authorise tenant + engagement
→ hash original bytes
→ store original in R2
→ create import_batch
→ parse/validate rows
→ create import_row records
→ create/reuse source_account records
→ create import_snapshot
→ create IMPORTED trial_balance + lines
→ append IMPORT_COMMITTED audit event
→ append outbox event
→ COMMIT
```

Database failure after R2 upload leaves an unreferenced object eligible for scheduled garbage collection. Database state must never reference an object that has not been successfully written.

## Mapping command transaction

```text
Authorise PREPARER/MANAGER
→ resolve source account within tenant/organisation
→ resolve canonical account
→ create new mapping version
→ update affected TB line canonical references
→ append MAPPING_CHANGED audit event
→ append outbox event
→ COMMIT
```

No mapping operation may mutate a FINAL or FILED trial balance.

## Next implementation gate

The slice is complete when a user can create an engagement, upload the fixture TB, see the imported rows, map the accounts, obtain a balanced mapped TB, inspect provenance and view the immutable history through the web application.
