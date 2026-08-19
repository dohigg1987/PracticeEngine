# Authenticated workspace onboarding contract

Call `select * from create_authenticated_workspace($1::text)` as `accounts_app`
inside a transaction after setting `app.actor_id` from the verified JWT subject.
Do not set `app.tenant_id` for this actor-only onboarding transaction.

The function returns one row with `tenant_id`, `name`, `role_code`, and
`created`. `role_code` is always `OWNER`. A retry by the same actor using the
same case-insensitive whitespace-normalized name returns the existing workspace
with `created=false`.

Invalid calls use SQLSTATE `23514` and a stable constraint name:

- `onboarding_actor_id_valid_ck` for a missing, blank, or oversized actor
- `onboarding_tenant_context_absent_ck` when tenant context is present
- `onboarding_workspace_name_valid_ck` for a missing, blank, or oversized name

The caller cannot supply a tenant identifier. The generated identifier and
initial owner membership are inserted atomically by the fixed-search-path
security-definer function. The private `workspace_onboarding` row provides an
owner-readable creation record and the duplicate key used for retry safety.
