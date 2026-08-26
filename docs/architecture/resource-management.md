# Resource management

## Ownership and scope

Practice resource management extends Platform Core membership; it does not create an employee or HR identity. `tenant_member` remains the tenant-scoped person anchor and existing `team`/`team_member` records remain authoritative for team membership. `resource_profile` contributes only operational attributes: job title, status, manager, location code, skills, standard weekly capacity and utilisation/chargeability targets.

The profile deliberately excludes payroll, statutory leave, performance and other HR-sensitive records. A membership trigger creates the operational profile and maps non-active membership to an inactive resource. Inactivation never deletes historical work, time, rate or assignment records.

## Lifecycle and effective periods

Resource status is `active`, `inactive`, `unavailable` or `future_starter`. Allocation commands reject inactive and cross-tenant resources. Capacity may still show a future starter only within their effective profile/pattern period. Over-allocation is a visible management exception, not an automatic rejection.

`resource_working_pattern` stores effective-dated minutes for each weekday. Exclusion constraints prevent overlapping patterns for one tenant member. `resource_availability_adjustment` applies bounded positive or negative daily capacity for annual leave, training, internal commitments, unavailability, additional capacity or another explained operational adjustment. These records are operational availability, not an absence-management system.

## Assignment and provenance

Current work ownership continues to use `work_item.assigned_member_id` and `assigned_team_id`. PM-007 adds reviewer, planned period, planned/estimated/remaining effort and assignment state. `work_assignment_history` preserves previous and new member/team references, reviewer, planned values, state, reason, actor and time for every assignment decision.

Material profile, pattern, availability and assignment changes are authorized server-side, appended to the immutable audit chain in the same transaction and publish one normalized outbox fact when another consumer needs the change. History is append-only; a current-state update must not rewrite prior assignment provenance.

## Security

Every PM-007 resource table carries `tenant_id`, uses tenant-safe composite foreign keys, forced RLS and least-privilege grants. `practice.resources` is the commercial capability; `resources.view` and `resources.manage` are functional permissions. Capacity and assignment commands additionally require their own entitlement/permission decisions. UI visibility is never enforcement.
