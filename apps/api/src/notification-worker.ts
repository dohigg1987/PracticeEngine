import postgres, { type Sql } from "postgres";
import {
  runPublisherBatch,
  notificationDeliveryAdapter,
  type ClaimedOutboxEvent,
  type OutboxPublisherStore,
  type PublisherBatchResult,
} from "./publisher.js";

type Database = Sql<Record<string, never>>;

function notificationStore(sql: Database): OutboxPublisherStore {
  return {
    async claim(workerId, limit) {
      const rows = await sql`select * from claim_notification_events(${workerId},${limit})`;
      return rows.map((row): ClaimedOutboxEvent => ({
        id: String(row.id), tenantId: String(row.tenant_id), eventType: String(row.event_type),
        payload: row.payload as Record<string, unknown>, attemptCount: Number(row.attempt_count), maxAttempts: Number(row.max_attempts),
      }));
    },
    async complete(eventId, workerId, providerMessageId, metadata) {
      const rows = await sql`select complete_outbox_event(${eventId},${workerId},${providerMessageId},${sql.json(metadata as postgres.JSONValue)}) completed`;
      return rows[0]?.completed === true;
    },
    async fail(eventId, workerId, errorCode, errorMessage, retryAt, deadLetter, metadata) {
      const rows = await sql`select fail_outbox_event(${eventId},${workerId},${errorCode},${errorMessage},${retryAt},${deadLetter},${sql.json(metadata as postgres.JSONValue)}) failed`;
      return rows[0]?.failed === true;
    },
  };
}

export async function runNotificationDelivery(env: Env, occurredAt: string, workerId = `notification-${crypto.randomUUID()}`): Promise<PublisherBatchResult> {
  const sql = postgres(env.HYPERDRIVE.connectionString, { prepare: false, max: 2 });
  try {
    return await runPublisherBatch({ store: notificationStore(sql), adapter: notificationDeliveryAdapter(), workerId, occurredAt, limit: 50 });
  } finally { await sql.end(); }
}

// This is an independently deployable least-privilege Worker entrypoint. PM-005
// does not add a production Cron Trigger; a reviewed publisher-only Hyperdrive
// credential is required before operational activation.
export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const result = await runNotificationDelivery(env, new Date(controller.scheduledTime).toISOString(), `notification-${controller.scheduledTime}`);
    console.log(JSON.stringify({ event: "notification_delivery_batch", scheduledTime: controller.scheduledTime, ...result }));
  },
} satisfies ExportedHandler<Env>;
