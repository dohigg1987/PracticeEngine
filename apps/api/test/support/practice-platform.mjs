export const state = { queries: [], permissions: [], events: [], committed: false, ended: false, deny: null, respond: () => [] };
export function reset(respond) { Object.assign(state, { queries: [], permissions: [], events: [], committed: false, ended: false, deny: null, respond }); }
const tx = Object.assign(async (strings, ...values) => {
  const sql = strings.join("?");
  state.queries.push({ sql, values });
  if (sql.startsWith("insert into audit_event")) state.events.push(values[6]);
  return state.respond(sql, values);
}, { json: value => value });
export const platformContext = (request, actorId) => ({ tenantId: request.headers.get("x-tenant-id"), actorId, correlationId: "delivery-test" });
export const platformDatabase = () => ({ end: async () => { state.ended = true; } });
export async function platformTransaction(_sql, _ctx, operation) {
  try { const result = await operation(tx); state.committed = true; return result; }
  catch (error) { state.events = []; throw error; }
}
export async function assertPlatformPermission(_tx, permission) { state.permissions.push(permission); if (state.deny === permission) throw new Error("PERMISSION_DENIED"); }
export const assertPlatformEntitled = async () => {};
export const assertPlatformRouteAccess = async (sql, permission) => assertPlatformPermission(sql, permission);
