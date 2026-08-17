BEGIN;

CREATE TABLE import_batch(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  engagement_id uuid NOT NULL REFERENCES engagement(id),
  source_type text NOT NULL CHECK(source_type IN ('CSV','XLSX','XERO','QUICKBOOKS','SAGE','FREEAGENT','API')),
  original_filename text,
  status text NOT NULL DEFAULT 'UPLOADED' CHECK(status IN ('UPLOADED','VALIDATED','COMMITTED','REJECTED','SUPERSEDED')),
  content_hash text NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);
CREATE INDEX import_batch_engagement_idx ON import_batch(tenant_id,engagement_id,created_at DESC);

ALTER TABLE import_snapshot ADD COLUMN import_batch_id uuid REFERENCES import_batch(id);

CREATE TABLE import_row(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  import_batch_id uuid NOT NULL REFERENCES import_batch(id),
  row_no integer NOT NULL,
  account_code text NOT NULL,
  account_name text NOT NULL,
  debit numeric(30,2) NOT NULL DEFAULT 0,
  credit numeric(30,2) NOT NULL DEFAULT 0,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(debit >= 0 AND credit >= 0),
  CHECK(NOT (debit > 0 AND credit > 0)),
  UNIQUE(import_batch_id,row_no)
);

CREATE TABLE canonical_report_line(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxonomy_version text NOT NULL,
  line_code text NOT NULL,
  caption text NOT NULL,
  statement_code text NOT NULL,
  display_order integer NOT NULL,
  UNIQUE(taxonomy_version,line_code)
);

ALTER TABLE canonical_account ADD COLUMN report_line_id uuid REFERENCES canonical_report_line(id);

CREATE TABLE engagement_member(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  engagement_id uuid NOT NULL REFERENCES engagement(id),
  actor_id text NOT NULL,
  role_code text NOT NULL CHECK(role_code IN ('PARTNER','MANAGER','REVIEWER','PREPARER','FILER','READ_ONLY')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(engagement_id,actor_id,role_code)
);

CREATE TABLE outbox_event(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished_idx ON outbox_event(created_at) WHERE published_at IS NULL;

COMMIT;
