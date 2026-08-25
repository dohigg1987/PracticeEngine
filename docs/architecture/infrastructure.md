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

## Database change control

Migration `0030` is forward-only and additive. Every new tenant table has a tenant key, tenant-safe foreign keys, indexes, forced RLS and least-privilege `accounts_app` grants. A disposable-Neon verification script covers representative existing schema/data, cross-tenant denial, entitlement enforcement and migration-head checks; remote execution is pending because the current Neon baseline does not yet include migration `0029`. This implementation task does not promote the migration to production.

## Runtime and release control

The existing Wrangler JSONC configurations, observability, Hyperdrive and R2 bindings remain authoritative. Worker changes must pass TypeScript and `wrangler deploy --dry-run`. The repository's clean-main release guards remain the only deployment path. PM-002 performs no production deployment and does not hard-code production origins or credentials.
