# Approved PracticeEngine infrastructure

## Fixed architecture

PracticeEngine's approved runtime is:

- Cloudflare Workers for the server/API composition root;
- Cloudflare Pages for the React web application;
- Cloudflare R2 for private object and artefact storage;
- Cloudflare Hyperdrive for pooled Worker access to Neon Postgres;
- Neon Postgres for relational data and PostgreSQL row-level security;
- Neon Auth for user authentication;
- GitHub `dohigg1987/PracticeEngine` as the authoritative source repository.

PM-002 introduces no alternative host, database, identity provider or event broker. It uses the existing Worker bindings, environment separation, R2 integration, Neon Auth JWT verification, Hyperdrive connection and transactional outbox. No new Cloudflare binding is required.

PM-005 retains the same platform. The notification consumer is a second Worker entrypoint intended to use the existing publisher-only Hyperdrive role; it adds no database, queue model, long-running server or email vendor. Production scheduling and credentials remain unconfigured.

PM-006 uses the same API Worker, Neon Auth context, Hyperdrive transaction boundary and private `ARTEFACTS` R2 binding. Portal upload keys include opaque tenant/client/document/version segments; buckets are never public. Download is a controlled Worker response after tenant/client/visibility/scan authorization and object metadata integrity checks. The malware scan state is an explicit provider seam; no unapproved scanner or email provider is introduced.

QuoteBench now authenticates event requests with Ed25519 public keys stored in Neon and a short validity window. No private/production key is checked in. Replay receipts and business-event receipts are relational, forced-RLS protected records; no new broker or credential service is introduced.

## Database change control

Migrations through `0034` are forward-only and additive. Every new tenant table has a tenant key, tenant-safe foreign keys, indexes, forced RLS and least-privilege `accounts_app` grants. Global machine-key material is owner-only and request receipts are tenant-owned. `npm run verify:neon-migrations` executes complete SQL scripts and PM-006 behavioral fixtures on an explicitly confirmed disposable Neon target. No PM-006 migration is promoted to production.

## Runtime and release control

The existing Wrangler JSONC configurations, observability, Hyperdrive and R2 bindings remain authoritative. Worker changes must pass TypeScript and `wrangler deploy --dry-run`. The repository's clean-main release guards remain the only deployment path. PM-002 performs no production deployment and does not hard-code production origins or credentials.
