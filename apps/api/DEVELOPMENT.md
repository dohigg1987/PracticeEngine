# PracticeEngine development deployment

`wrangler.dev.jsonc` is the isolated, non-production Worker configuration. It
targets the `practiceengine-api-dev` Worker, the PracticeEngine development
Pages origin, the development Neon Auth service, R2 bucket and Hyperdrive
configuration. `APP_VERSION` identifies the immutable application baseline in
`/health`; scheduled recurrence execution remains disabled.

Before deploying the Pages project, configure these variables in its
development environment:

```text
ENVIRONMENT=dev
NEON_AUTH_URL=https://ep-broad-firefly-zahbgsmb.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth
VITE_NEON_AUTH_URL=https://ep-broad-firefly-zahbgsmb.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth
VITE_API_URL=https://practiceengine-api-dev.<account-subdomain>.workers.dev
VITE_DEMO_MODE=false
```

`NEON_AUTH_URL` is read at request time by the Pages Function; the `VITE_`
variables are read at build time. An explicit development deployment returns
503 from `/neon-auth/*` when `NEON_AUTH_URL` is absent or invalid rather than
falling back to production authentication. Deployments without a development
marker retain the existing production fallback for compatibility.

Run non-deploying validation from the repository root:

```powershell
node --test apps/web/functions/neon-auth/neon-auth-proxy.test.mjs
npx wrangler deploy --config apps/api/wrangler.dev.jsonc --dry-run --outdir apps/api/.wrangler/dev-dry-run
```

Inspect the dry-run binding table before any authorized deployment. Never use
the production release commands or production resources for this environment.
