# Authorization implementation

## Decision layers

Authentication, membership, permission and entitlement are separate checks:

1. Neon Auth verifies the bearer token and supplies the global subject.
2. `platform_user` maps that subject to identity; `tenant_member` proves active membership in the selected tenant.
3. `tenant_member_role` -> `tenant_role_permission` supplies functional permissions.
4. `tenant_feature_decision` supplies commercial entitlement when the capability is licensable.

The API never treats UI visibility as authorization. Canonical client operations check both permission and `practice.clients`; team and settings operations use their specific permissions. Permission checks use permission keys rather than branching on role display names.

## Initial permission catalogue

The catalogue includes client view/create/edit/archive, contact management, user management, team management, settings management, audit view, Ledgerly view/edit and entitlement view. Standard owner/admin roles receive all PM-001 permissions. The transitional member role receives client view, Ledgerly view and entitlement view. Custom tenant roles can be added without changing application code.

Legacy routes still use existing OWNER/ADMIN and engagement-role checks. A compatibility trigger mirrors changes to `tenant_member.role_code` into the new assignment table, so those routes can migrate incrementally.

## Enforcement

New tables use forced RLS with active actor/tenant context. Composite foreign keys prevent relationships that pair a tenant with a record owned by another tenant. The service also qualifies every resource lookup by `tenant_id`; a cross-tenant identifier therefore resolves as not found and cannot be mutated.
