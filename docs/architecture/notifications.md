# Durable notification delivery
PM-005 extends, rather than replaces, the existing `outbox_event`, `notification` and `outbox_delivery_attempt` foundations. The flow is:

`domain transaction -> notification.requested outbox fact -> durable claimant -> channel adapter -> immutable delivery attempt -> notification delivery state`.

`claim_notification_events` claims only due notification facts with `FOR UPDATE SKIP LOCKED`. Existing completion/failure functions now synchronize the notification projection while retaining immutable attempts. Every item is handled independently by `runPublisherBatch`, so malformed or failed delivery cannot poison unrelated events. Attempts are bounded, retries use exponential backoff, dead letters remain visible and the outbox/notification idempotency keys prevent duplicate delivery.

`apps/api/src/notification-worker.ts` is an independently deployable Cloudflare scheduled Worker entrypoint using a publisher-only Hyperdrive credential. No production Cron Trigger or credential is checked in or deployed by PM-005. In-application delivery is implemented. Email is a provider-neutral `EmailDeliveryPort`; without an approved provider it fails visibly and recoverably rather than pretending delivery or hard-coding a vendor.

The user inbox retains recipient-scoped read state. `GET /v1/notifications/delivery` exposes bounded tenant delivery status to actors with `notifications.view`; raw credentials, provider secrets and internal storage keys are excluded.
