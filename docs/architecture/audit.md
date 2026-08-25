# Shared audit implementation

The existing `audit_event` hash chain and transactional `outbox_event` remain Platform Core infrastructure. PM-001's application service serializes each tenant audit head, records tenant, actor, action, object type/ID, optional client scope, timestamp, correlation ID and structured non-secret metadata, then writes the matching outbox event in the mutation transaction.

New events cover client create/update/archive, contact create, client-contact relationship change, team create/assignment and setting change. Existing routes continue to emit their established tenant, invitation, membership-role, permanent-file and Ledgerly events.

The original update/delete rules silently ignored attempted audit mutation. Migration `0029` replaces them with a `BEFORE UPDATE OR DELETE` trigger that raises `audit_event is immutable`. Runtime grants still do not include update/delete. Audit metadata contains changed field names or bounded business values and never credentials, invitation hashes or storage secrets.

Entitlement override mutation is not exposed in PM-001, so no public entitlement mutation exists to audit. Any future mutation service must append `ENTITLEMENT_CHANGED` in the same transaction.
