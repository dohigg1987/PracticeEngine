# Secure portal messaging

## Thread model

`portal_thread` is tenant/client scoped and may carry engagement, work-item and request context. It has a bounded subject and open, closed or archived state. `portal_thread_participant` represents either one active tenant member or one portal principal; a database check prevents ambiguous participant identities and removed participants retain history.

Staff thread creation requires `portal_messages.send`, `practice.portal.messaging`, an accessible client and explicitly active portal principals for that same client. Portal listing and detail require both an active client access and a non-removed participant row. This prevents discovery or joining by a different client principal.

## Messages, attachments and read state

`portal_message` records immutable body, sender context/actor, optional reply-to reference, timestamp and a tenant/thread idempotency key. Sent content has no update grant. The current portal route permits replies only in open threads and requires contributor or approver access; staff compose/reply surfaces use the same aggregate boundary.

`portal_message_attachment` links a message to a portal document rather than storing bytes or creating another file system. Document visibility, scan release and client authorization continue to apply. `portal_thread_read` records per-actor last-read position and time without mutating messages.

## Evidence and notifications

Thread creation and message sending append immutable audit/outbox evidence; portal messages identify the actor context as client. Participant changes, closure, attachment sharing and read-position commands must use explicit application services so the material mutations can be audited without treating routine reads as evidence events.

`message.sent` is a normalized business fact. Notification policy may translate it to a bounded secure-message alert through the existing `notification.requested` outbox flow, but notification failure cannot roll back or rewrite the message.
