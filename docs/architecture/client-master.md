# Canonical client master

## Canonical identity

The existing `organisation.id` is the canonical client ID. This avoids a second client identity and preserves every Ledgerly engagement, permanent-file, portal and accounting reference. The table is expanded additively with display name, universal entity type, client code, responsible member/team, primary contact/address, communication preferences and creation/update actors. Existing legal name/form, jurisdiction, lifecycle, version and timestamps remain authoritative.

Supported entity types are `COMPANY`, `PARTNERSHIP`, `SOLE_TRADER`, `INDIVIDUAL`, `CHARITY`, `TRUST` and `OTHER`. Accounting-specific fields remain outside the shared columns.

## Contacts and relationships

`contact` is tenant-owned and reusable across clients. `client_contact_relationship` connects a contact to a client with a relationship type, optional effective dates and primary-contact marker. Seeded types are director, trustee, owner, partner, employee, adviser, primary contact, billing contact and `OTHER`; `OTHER` requires a custom label.

The older `client_contact` table remains intact for portal compatibility. Migration `0029` backfills each legacy record into `contact`, retains `legacy_client_contact_id`, and creates a primary-contact relationship to its existing organisation. New records are written through the canonical API; migration of portal consumers is deferred.

Addresses are reusable tenant-owned records connected through `client_address`. The canonical client keeps optional primary address/contact references for efficient common reads.

## API and controls

- `GET|POST /v1/clients`
- `PATCH /v1/clients/:id`
- `POST /v1/clients/:id/archive`
- `GET|POST /v1/contacts` and `PATCH /v1/contacts/:id`
- `POST /v1/clients/:id/relationships`

Every route requires active tenant membership, a functional permission and `practice.clients`. Queries and mutations include the authenticated tenant ID. Mutations append hash-chained audit and outbox events transactionally. Existing `/v1/organisations` and permanent-file routes remain available unchanged.

Secondary ownership/collaboration is not implemented; responsible member/team and team membership provide the PM-001 foundation only.
