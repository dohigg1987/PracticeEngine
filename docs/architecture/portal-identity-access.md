# Portal identity and access

## Principal model

`portal_principal` binds one canonical tenant `contact` to one Neon Auth actor reference. It records invited, active, suspended or revoked state; activation, last-access and revocation timestamps; and creator/revoker provenance. The tenant-scoped uniqueness rules prevent two principal rows for one contact or actor.

`portal_client_access` is the required authorization relationship between a principal and a canonical client organisation. Its optional `practice_engagement` and `client_service` references narrow business context, while `viewer`, `contributor` and `approver` roles control action strength. One principal can hold explicit relationships to multiple clients; matching contact details never create a relationship.

Portal principal status and access status must both be active. The API updates `last_access_at` only after resolving an active principal and checks the requested client and required role for each command. Revocation is therefore effective on the next transaction without deleting audit history.

## Invitations and activation

`portal_invitation` belongs to a single access row, stores only a SHA-256 token hash, expires within seven days, and records pending, accepted, revoked or expired state. `accept_portal_invitation(token_hash)` runs as a constrained security-definer function under the request tenant and actor context. It locks the invitation, access and principal rows; rejects expired, revoked, reused, cross-tenant or conflicting-actor activation; and atomically activates all three records.

The raw invitation token is an application-delivery concern and must never be persisted or logged. A resend command must create a new protected invitation and revoke or expire the prior active token. Neon Auth remains responsible for authentication; PM-006 does not add passwords or a second identity provider.

## Authorization and RLS

`portal_actor_has_client_access(tenant_id, client_id, access_id)` derives access from `app.tenant_id` and `app.actor_id`. Portal RLS policies add recipient, visibility or thread-participant checks on top of that client relationship. Portal feature evaluation uses `portal_tenant_feature_enabled`; it does not require or manufacture a `tenant_member` record.

The `accounts_app` role receives only listed table operations and constrained helper execution. Every new tenant-owned collaboration table is forced-RLS. The disposable PM-006 fixture verifies that a valid portal identity sees its explicitly authorized client and cannot see a second tenant or an ungranted client.

## Staff administration

Staff administration uses `portal.manage`, `portal.invite` and `portal.revoke`. These functional permissions do not grant a portal user access, and commercial `practice.portal` entitlement does not replace either staff permission or resource authorization.
