# DEV showcase seed

This fixture is synthetic, repeatable and restricted to a visibly DEV-scoped database and API. It never copies production data. The SQL step exists only to associate already-created Neon Auth development identities with tenant memberships; all business records go through the Worker application services so permission, entitlement, audit and outbox behaviour remains active.

## Preconditions

- Migrations are applied through `0035`.
- The target database name contains `dev` and is not a production branch.
- The API hostname contains a distinct `dev`, `localhost`, or `127.0.0.1` label and points at the same tenant/database.
- The five Neon Auth identities listed below already exist. The seed never creates credentials or stores passwords.
- The owner token has the normal OWNER permissions. Do not weaken RLS or authorization.

Development identities: `owner.dev@practiceengine.invalid` (OWNER), `manager.dev@practiceengine.invalid` (ADMIN/manager), `reviewer.dev@practiceengine.invalid` (MEMBER/reviewer), `team.dev@practiceengine.invalid` (MEMBER), and `portal.dev@practiceengine.invalid` (portal principal).

The corresponding development actor IDs are `8f819a43-289a-4cd3-a399-b71512dc43ac`, `8be11ade-d563-4c5d-b76d-03526bfb4fd1`, `56ce384b-e155-46f8-8ac6-8c8017b155a4`, `4856b8c2-4da9-4552-b302-6988b90c5f78`, and `c0936b8c-c476-4b42-b8cb-fbf4a5de7bac`. These are identifiers, not credentials.

## Inputs (names only)

Membership bootstrap: `DATABASE_URL`, `PE_DEV_TENANT_ID`, `PE_DEV_ENVIRONMENT_NAME`, `PE_DEV_OWNER_ACTOR_ID`, `PE_DEV_MANAGER_ACTOR_ID`, `PE_DEV_REVIEWER_ACTOR_ID`, and `PE_DEV_MEMBER_ACTOR_ID`.

Application seed: `PE_DEV_API_URL`, `PE_DEV_AUTH_TOKEN`, `PE_DEV_TENANT_ID`, `PE_DEV_CONFIRM`. Optional completion inputs are `PE_DEV_PORTAL_AUTH_TOKEN`, `PE_DEV_LEDGERLY_ENGAGEMENT_ID`, and `PE_DEV_QUOTEBENCH_EVENT_FILE`. Tokens, database URLs and passwords must never be committed or logged.

## Run

Set `PGOPTIONS=-c practiceengine.environment=dev`, then invoke `psql` with `DATABASE_URL`, `-v environment_name=practiceengine-dev`, `-v tenant_id=...`, and `-v` values for each actor ID against `scripts/seed-dev-members.sql`. The explicit environment marker is required because Neon commonly names the database itself `neondb`; verify in the Neon console that the URL resolves to branch `practiceengine-dev` before continuing.

Set the application inputs, set `PE_DEV_CONFIRM=practiceengine-dev`, then run:

```text
npm run seed:dev
```

Re-run the same command to verify idempotence. Existing records are found by stable DEV codes/markers; memberships and team membership use conflict-safe writes. Never run the script with production credentials.

## Expected showcase

The API seed creates a delivery team; five service lines; five clients with varied service mixes; multiple work states including upcoming, overdue, waiting-on-client, review and completed; tasks with a dependency; prospects and open opportunities; a portal principal/access and sent client request; resource profiles, rates, time, WIP/commercial context and billing recovery. If a Ledgerly engagement ID is supplied, the supported link route binds accounts work to Ledgerly.

Accepted QuoteBench conversion must be supplied as a genuinely signed development event through the existing machine-auth route; the seed intentionally does not forge or bypass this protection. Portal document/message/confirmation responses likewise require the portal identity token and DEV R2. Missing optional inputs are reported as warnings, never papered over with direct SQL.

## Verify and rollback

Run `npm run test:seed:dev`, `npm run verify:fast`, and the integrated DEV smoke suite. Inspect API audit/outbox records and confirm RLS using a second tenant context. Fixture records carry `[DEV-ENV-001]`, `DEV-` client codes, or `DEV-ENV-001-*` source references. Rollback should use the same domain APIs; no bulk-delete SQL is provided because it could bypass audit and ownership rules.
