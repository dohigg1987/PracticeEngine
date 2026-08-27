# Unified client portal

## Ownership and scope

The client portal is a Platform/PracticeEngine collaboration capability shared by Practice Management and specialist modules. PracticeEngine owns portal identity, explicit client access, requests, document exchange, secure messages and operational confirmations. Specialist modules retain their own domain artefacts: QuoteBench proposal acceptance, for example, is not converted into a generic portal confirmation.

The portal is an access context, not another product-specific client master. Canonical `contact`, `organisation`, `client_service`, `practice_engagement`, `work_item` and `practice_task` records remain authoritative. The portal adds relationships to those records and never infers access from an email address or matching contact data.

## Runtime boundary

Authenticated requests still enter the Cloudflare Worker and use the established Neon Auth actor identity. Staff routes require active tenant membership, a functional permission and the relevant entitlement. Portal routes instead resolve an active `portal_principal` for `app.actor_id`, require an active `portal_client_access`, and apply the feature entitlement. This distinction is enforced in the API and forced-RLS policies; navigation visibility is not an authorization control.

The implemented collaboration routes cover staff request listing/creation/detail/completion, portal request listing and responses, request-scoped document upload/download, staff thread listing/creation, portal thread/message access and portal confirmation responses. Portal-access administration is represented by the migration `0034` data model and protected activation function; administrative invite/revoke HTTP workflows must use that boundary rather than writing identity state in the browser.

## Shared interaction model

`practice user -> client request/thread/confirmation -> explicitly addressed portal access -> client response/document/message -> audit + transactional outbox -> Practice workflow/automation`

Business records retain optional engagement, work, task or request context. This supports a single restrained portal surface across services while leaving workflow status changes in Practice Management application services.

## Security invariants

- A Neon Auth identity alone grants no portal resource access.
- Tenant, principal, client and recipient/participant checks are server-side and repeated in RLS.
- Revoked principals or client-access rows fail immediately on the next request; historical records remain.
- Staff permissions and tenant entitlements are separate from portal resource authorization.
- R2 objects are private and delivered only after database authorization, release-state and object-integrity checks.
- Mutations append immutable audit evidence and transactional outbox facts.

See [portal-identity-access.md](portal-identity-access.md), [client-requests.md](client-requests.md), [document-exchange.md](document-exchange.md) and [secure-messaging.md](secure-messaging.md).
