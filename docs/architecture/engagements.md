# Practice engagements

## Meaning

`practice_engagement` represents the professional or commercial arrangement under which one or more active client services are delivered. It is distinct from the existing Ledgerly `engagement`, which remains a period-specific accounting workspace.

An engagement belongs to one canonical client and records reference, name, dates, owner/partner, responsible team, acceptance state and lifecycle metadata. `practice_engagement_service` connects it to one or more client services and enforces that the engagement and every service relationship belong to the same tenant and client.

## Lifecycle

The initial lifecycle is `draft -> proposed -> active`, with supported suspension, reactivation, completion and termination paths. Completed and terminated engagements are terminal. Acceptance is recorded as a separate state rather than implied by a status label. PM-002 does not generate engagement letters.

Reads require `engagements.view`; creation and lifecycle changes require `engagements.manage`. Every lifecycle command emits immutable audit evidence. Creation, activation and completion also emit normalized `engagement.created`, `engagement.activated` and `engagement.completed` facts through the existing transactional outbox.

## Ledgerly compatibility

No existing accounts engagement is migrated or widened. A Practice work item created under a generic engagement can link to one existing Ledgerly engagement through the explicit module-work contract documented in `module-work-integration.md`.
