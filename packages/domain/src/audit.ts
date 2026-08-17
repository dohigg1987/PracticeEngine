import { createHash } from "node:crypto";
export interface AuditEventInput { eventId:string; occurredAt:string; actorId:string; tenantId:string; eventType:string; objectType:string; objectId:string; correlationId:string; metadata?:Record<string,unknown>; }
export interface AuditEvent extends AuditEventInput { previousEventHash:string|null; eventHash:string; }
function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
export function appendAuditEvent(input: AuditEventInput, previous: AuditEvent|null): AuditEvent {
  const previousEventHash=previous?.eventHash ?? null;
  const eventHash=createHash("sha256").update(canonicalJson({...input,previousEventHash})).digest("hex");
  return {...input,previousEventHash,eventHash};
}
export function verifyAuditChain(events: AuditEvent[]): boolean {
  let previous:AuditEvent|null=null;
  for(const event of events){const recalculated=appendAuditEvent({eventId:event.eventId,occurredAt:event.occurredAt,actorId:event.actorId,tenantId:event.tenantId,eventType:event.eventType,objectType:event.objectType,objectId:event.objectId,correlationId:event.correlationId,metadata:event.metadata},previous);if(recalculated.eventHash!==event.eventHash||recalculated.previousEventHash!==event.previousEventHash)return false;previous=event;}return true;
}
