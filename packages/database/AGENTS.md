# Database instructions

- Migrations are forward-only, ordered, transactional where feasible and must record `schema_migration` according to existing convention.
- Never edit an applied migration. Use expand/migrate/contract with compatibility periods; no destructive consolidation without explicit later approval.
- Every tenant-owned table needs `tenant_id`, tenant-safe foreign keys where applicable, forced RLS and least-privilege grants.
- Global reference tables are explicit and read-only to runtime roles; tenant customization uses owned overlay tables.
- Auditable mutations retain actor, tenant, correlation and immutable event provenance.
- Test migrations and recovery on a disposable Neon branch; do not apply production migrations from ordinary implementation work.
- Keep grants, RLS inventory, verification runbooks and documented migration head in lockstep.
