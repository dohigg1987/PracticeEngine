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

## Database change control

Migrations through `0033` are forward-only and additive. Every new tenant table has a tenant key, tenant-safe foreign keys, indexes, forced RLS and least-privilege `accounts_app` grants. `npm run verify:neon-migrations` executes complete SQL scripts and behavioral fixtures on an explicitly confirmed disposable Neon target. No PM-005 migration is promoted to production.

## Runtime and release control

The existing Wrangler JSONC configurations, observability, Hyperdrive and R2 bindings remain authoritative. Worker changes must pass TypeScript and `wrangler deploy --dry-run`. The repository's clean-main release guards remain the only deployment path. PM-002 performs no production deployment and does not hard-code production origins or credentials.
