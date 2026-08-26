# Authorization implementation

## Decision layers

Authentication, membership, permission and entitlement are separate checks:

1. Neon Auth verifies the bearer token and supplies the global subject.
2. `platform_user` maps that subject to identity; `tenant_member` proves active membership in the selected tenant.
3. `tenant_member_role` -> `tenant_role_permission` supplies functional permissions.
4. `tenant_feature_decision` supplies commercial entitlement when the capability is licensable.

The API never treats UI visibility as authorization. Canonical client operations check both permission and `practice.clients`; team and settings operations use their specific permissions. Permission checks use permission keys rather than branching on role display names.

## Initial permission catalogue

The catalogue includes client view/create/edit/archive, contact management, user management, team management, settings management, audit view, Ledgerly view/edit, entitlement view, recurrence view/manage, deadline view/override, work generation and template publication. Standard owner/admin roles receive all permissions. The transitional member role receives read-only Practice recurrence/deadline access alongside its existing client, work, task, Ledgerly and entitlement views. Custom tenant roles can be added without changing application code.

Legacy routes still use existing OWNER/ADMIN and engagement-role checks. A compatibility trigger mirrors changes to `tenant_member.role_code` into the new assignment table, so those routes can migrate incrementally.

PM-005 adds CRM view/manage, prospect create/edit, opportunity create/edit/convert, onboarding view/manage/complete and notification-delivery visibility. Conversion requires both `opportunities.convert` and the applicable Practice/QuoteBench entitlements. Onboarding completion is deliberately separate from ordinary onboarding management.

## Enforcement

New tables use forced RLS with active actor/tenant context. Composite foreign keys prevent relationships that pair a tenant with a record owned by another tenant. The service also qualifies every resource lookup by `tenant_id`; a cross-tenant identifier therefore resolves as not found and cannot be mutated.

## PM-007 permission matrix

| Capability | Read/entry | Management |
| --- | --- | --- |
| Resource profiles | `resources.view` | `resources.manage` |
| Capacity and availability | `capacity.view` | `capacity.manage` |
| Work allocation | existing work reads | `assignments.manage` |
| Time | `time.view`, `time.enter` | `time.manage`, `time.approve` |
| Internal cost rates | `costrates.view` | `costrates.manage` |
| Economics/WIP | `economics.view` | `economics.manage` |
| Portfolio reporting | `portfolio.view` | source-domain permissions still apply |

Ordinary resource/work access does not imply cost-rate or profitability access. The API applies field-level economic restrictions before returning portfolio/time data. Self-entry is constrained to the actor's tenant-member record and accessible work; broader correction or approval requires its explicit permission. Inactive and cross-tenant assignees are rejected, while over-allocation is returned as a visible exception rather than treated as an authorization failure.
