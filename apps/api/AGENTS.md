# API instructions

- Treat the Worker as a composition root. Add application-service/domain seams incrementally; do not relocate the route dispatcher wholesale.
- Authenticate first, establish tenant/actor context, enforce permission and entitlement server-side, then mutate.
- Every auditable mutation appends its audit record in the same transaction; enqueue reliable external effects through the outbox.
- Validate tenant ownership at every lookup and never expose R2 keys, credentials or sensitive request content.
- Preserve current API contracts through versioned adapters when introducing Platform or Practice services.
- Run API tests, TypeScript/Wrangler dry-run and relevant database contract checks.
