# Platform Core implementation

## Implemented boundary

PM-001 keeps the existing `tenant` identifier as the practice boundary and expands it with legal/trading identity, organisation type, registration reference, address, locale, timezone, currency, status and branding metadata. Existing tenant creation and selection APIs remain compatible because all new values have safe defaults.

Neon Auth remains the authentication provider. `platform_user` records the global identity and `tenant_member.user_id` separates that identity from tenant-specific membership. A compatibility trigger resolves the existing verified `actor_id` into a platform user for onboarding and invitations. Membership status is explicit (`PENDING`, `ACTIVE`, `SUSPENDED`); the new Platform services accept active members only.

Tenant-specific roles, permission grants, member-role assignments, teams and team membership are additive. `OWNER`, `ADMIN` and `MEMBER` roles are seeded for existing and future tenants, and the legacy `tenant_member.role_code` is synchronized into the role assignment model while current routes migrate.

`tenant_setting` is the shared namespaced settings store. It supports tenant, user, team and module scopes. PM-001 exposes tenant-scope GET/PUT operations only; Ledgerly-specific settings remain in their existing stores.

## Server boundary

`apps/api/src/platform-core.ts` is an application-service boundary composed by the existing Worker. It authenticates through the existing dispatcher, establishes transaction-local actor/tenant context, evaluates permission and entitlement, performs tenant-qualified queries, and appends audit/outbox records in the same transaction.

Implemented endpoints are:

- `GET /v1/platform/context`
- `GET|POST /v1/platform/teams`
- `POST /v1/platform/teams/:id/members`
- `GET|PUT /v1/platform/settings/:namespace/:key`
- `GET /v1/platform/entitlements/:featureKey`
- canonical client/contact endpoints documented in `client-master.md`

No new UI was needed. The existing Fluent shell and all Ledgerly screens are unchanged.

## Data enforcement and rollback

Every new tenant-owned table has `tenant_id`, tenant-safe composite foreign keys where a referenced record is tenant-owned, forced RLS and runtime grants. Global catalogues are read-only to the runtime role. Rollback is to stop routing new Platform endpoints and restore from a pre-migration Neon branch/PITR point; no old table, column, route or identifier is removed.
