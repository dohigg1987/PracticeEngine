export interface ClaimedOutboxEvent {
  id: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
}

export interface OutboxPublisherStore {
  claim(workerId: string, limit: number): Promise<ClaimedOutboxEvent[]>;
  complete(eventId: string, workerId: string, providerMessageId: string | null, metadata: Record<string, unknown>): Promise<boolean>;
  fail(eventId: string, workerId: string, errorCode: string, errorMessage: string, retryAt: string, deadLetter: boolean, metadata: Record<string, unknown>): Promise<boolean>;
}

export interface NotificationDeliveryAdapter {
  deliver(event: ClaimedOutboxEvent): Promise<{ providerMessageId: string | null; metadata?: Record<string, unknown> }>;
}

export interface EmailDeliveryPort {
  deliver(input: {
    tenantId: string;
    recipientReference: string;
    templateCode: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string; metadata?: Record<string, unknown> }>;
}

function requiredDeliveryText(value: unknown, code: string, max = 240): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw Object.assign(new Error(code), { code });
  return value.trim();
}

export function notificationDeliveryAdapter(email?: EmailDeliveryPort): NotificationDeliveryAdapter {
  return {
    async deliver(event) {
      const channel = requiredDeliveryText(event.payload.channel, "NOTIFICATION_CHANNEL_INVALID", 20);
      const recipientReference = requiredDeliveryText(event.payload.recipientReference, "NOTIFICATION_RECIPIENT_INVALID");
      const templateCode = requiredDeliveryText(event.payload.templateCode, "NOTIFICATION_TEMPLATE_INVALID", 120);
      const payload = event.payload.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw Object.assign(new Error("NOTIFICATION_PAYLOAD_INVALID"), { code: "NOTIFICATION_PAYLOAD_INVALID" });
      if (channel === "IN_APP") return { providerMessageId: `in-app:${event.id}`, metadata: { channel } };
      if (channel !== "EMAIL") throw Object.assign(new Error("NOTIFICATION_CHANNEL_UNSUPPORTED"), { code: "NOTIFICATION_CHANNEL_UNSUPPORTED" });
      if (!email) throw Object.assign(new Error("EMAIL_PROVIDER_NOT_CONFIGURED"), { code: "EMAIL_PROVIDER_NOT_CONFIGURED" });
      return email.deliver({ tenantId: event.tenantId, recipientReference, templateCode, payload: payload as Record<string, unknown>, idempotencyKey: event.id });
    },
  };
}

export interface PublisherBatchResult {
  claimed: number;
  delivered: number;
  retry: number;
  deadLetter: number;
}

function safeError(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : "DELIVERY_FAILED";
  const message = raw.trim().slice(0, 500) || "Delivery failed";
  const code = (error && typeof error === "object" && "code" in error ? String(error.code) : "DELIVERY_FAILED")
    .trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 120) || "DELIVERY_FAILED";
  return { code, message };
}

export function publisherRetryAt(occurredAt: string, attemptCount: number): string {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) throw new Error("DELIVERY_ATTEMPT_INVALID");
  const occurred = new Date(occurredAt);
  if (!Number.isFinite(occurred.valueOf())) throw new Error("DELIVERY_TIMESTAMP_INVALID");
  const delaySeconds = Math.min(3_600, 30 * 2 ** Math.max(0, attemptCount - 1));
  occurred.setUTCSeconds(occurred.getUTCSeconds() + delaySeconds);
  return occurred.toISOString();
}

export async function runPublisherBatch(input: {
  store: OutboxPublisherStore;
  adapter: NotificationDeliveryAdapter;
  workerId: string;
  occurredAt: string;
  limit?: number;
}): Promise<PublisherBatchResult> {
  const workerId = input.workerId.trim();
  const limit = input.limit ?? 25;
  if (!workerId || workerId.length > 120) throw new Error("PUBLISHER_WORKER_ID_INVALID");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("PUBLISHER_LIMIT_INVALID");
  const events = await input.store.claim(workerId, limit);
  const result: PublisherBatchResult = { claimed: events.length, delivered: 0, retry: 0, deadLetter: 0 };
  for (const event of events) {
    try {
      const delivery = await input.adapter.deliver(event);
      if (!(await input.store.complete(event.id, workerId, delivery.providerMessageId, delivery.metadata ?? {})))
        throw Object.assign(new Error("The outbox claim was lost before completion"), { code: "OUTBOX_CLAIM_LOST" });
      result.delivered += 1;
    } catch (error) {
      const normalized = safeError(error), deadLetter = event.attemptCount >= event.maxAttempts;
      const retryAt = publisherRetryAt(input.occurredAt, event.attemptCount);
      await input.store.fail(event.id, workerId, normalized.code, normalized.message, retryAt, deadLetter, {});
      if (deadLetter) result.deadLetter += 1;
      else result.retry += 1;
    }
  }
  return result;
}
