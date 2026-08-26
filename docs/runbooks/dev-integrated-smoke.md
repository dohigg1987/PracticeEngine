# Integrated DEV smoke test

`npm run smoke:dev` validates the deployed PracticeEngine DEV web application and Worker without using Cloudflare or Neon administration credentials. It refuses to run until the operator explicitly confirms that the configured targets are non-production, both hostnames visibly contain a DEV/test/local marker, and neither target matches the repository's known production hosts or the optional denylist.

The base run checks web HTML delivery, `/health`, `/ready` database connectivity, the web origin's CORS path, unauthenticated rejection, an authenticated tenant context, cross-tenant denial, CRM, clients, services, work, review, automation, recurring work, staff portal surfaces, resources, capacity, time, portfolio economics, notification delivery state, Ledgerly capabilities/engagements, and rejection of an unsigned QuoteBench event.

## Prerequisites

Use a DEV staff account with the seeded owner/manager permissions and feature entitlements. Obtain its short-lived Neon Auth access token through the DEV web application's authenticated session. Never save tokens in Git or shell history.

Set these process environment variables:

- `DEV_WEB_URL`: stable DEV web origin.
- `DEV_API_URL`: DEV Worker origin.
- `DEV_AUTH_TOKEN`: short-lived DEV staff bearer token.
- `DEV_TENANT_ID`: seeded DEV tenant UUID.
- `DEV_SMOKE_CONFIRM_NON_PRODUCTION=yes`: explicit safety acknowledgement.
- `DEV_SMOKE_PRODUCTION_HOSTNAMES`: optional comma-separated production hostname denylist (recommended).

PowerShell example (supply values through the current secure shell/session):

```powershell
$env:DEV_WEB_URL = 'https://<dev-web-host>'
$env:DEV_API_URL = 'https://<dev-worker-host>'
$env:DEV_AUTH_TOKEN = '<short-lived-dev-token>'
$env:DEV_TENANT_ID = '<dev-tenant-uuid>'
$env:DEV_SMOKE_CONFIRM_NON_PRODUCTION = 'yes'
$env:DEV_SMOKE_PRODUCTION_HOSTNAMES = '<production-web-host>,<production-api-host>'
npm run smoke:dev
```

This first command is read-only. A successful `/ready` verifies the Worker can query its configured database; authenticated collection reads verify the runtime database role and tenant context.

## Audited mutation checks

Run `npm run smoke:dev -- --mutate` only against the isolated DEV environment. It creates a uniquely tagged `DEV_SMOKE` CRM prospect, verifies it by ID, then archives it. It performs a state-preserving write to the first seeded resource profile (writing its existing job title), which proves the resource mutation/audit path while leaving the profile's business value unchanged. It also executes the recurrence dry-run. The dry-run generates no work, but intentionally persists an observable recurrence execution plus audit/outbox facts.

For a full client-portal and R2 check, also set:

- `DEV_PORTAL_TOKEN`: short-lived DEV portal-user token.
- `DEV_PORTAL_TENANT_ID`: portal user's DEV tenant UUID (normally the same tenant).
- `DEV_PORTAL_REQUEST_ID`: open seeded document request whose portal access role is contributor or approver; enables upload in mutation mode.
- `DEV_PORTAL_DOCUMENT_ID`: seeded portal-visible document with `scan_status=accepted`; enables authorised R2 download.

An uploaded smoke document must return `scanStatus: pending`; this proves the safe notification/document posture does not falsely release unscanned content. Use `--require-complete` with `--mutate` for final acceptance so missing portal/R2 inputs fail instead of being reported as skips:

```powershell
npm run smoke:dev -- --mutate --require-complete
```

The test never invokes recurrence replay/generation, signed QuoteBench acceptance, notification delivery, deployment, migrations, Cloudflare administration, Neon administration, or production resources. QuoteBench is checked at the security seam by verifying an unsigned machine request is denied; a separate real QuoteBench DEV system and signing key are required for a positive signed-event test.
