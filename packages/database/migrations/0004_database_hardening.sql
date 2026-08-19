BEGIN;

-- Keep a database-side record even when migrations are applied by a simple SQL
-- runner. The legacy rows establish the baseline that must precede this file.
CREATE TABLE IF NOT EXISTS schema_migration(
  version text PRIMARY KEY,
  description text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user
);

INSERT INTO schema_migration(version,description) VALUES
  ('0001','initial schema'),
  ('0002','persisted imports'),
  ('0003','tenant membership and canonical seed')
ON CONFLICT(version) DO NOTHING;

ALTER TABLE tenant
  ADD CONSTRAINT tenant_name_not_blank_ck CHECK(btrim(name) <> '');

ALTER TABLE organisation
  ADD CONSTRAINT organisation_legal_name_not_blank_ck CHECK(btrim(legal_name) <> ''),
  ADD CONSTRAINT organisation_legal_form_not_blank_ck CHECK(btrim(legal_form) <> ''),
  ADD CONSTRAINT organisation_jurisdiction_not_blank_ck CHECK(btrim(jurisdiction) <> ''),
  ADD CONSTRAINT organisation_version_positive_ck CHECK(version > 0);

-- Composite candidate keys allow every tenant-owned foreign key below to bind
-- the tenant and object in one constraint. The original single-column foreign
-- keys remain in place for compatibility and as direct object-existence checks.
ALTER TABLE engagement
  ADD CONSTRAINT engagement_tenant_id_uq UNIQUE(tenant_id,id),
  ADD CONSTRAINT engagement_tenant_organisation_id_uq UNIQUE(tenant_id,organisation_id,id),
  ADD CONSTRAINT engagement_tenant_organisation_fk
    FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id),
  ADD CONSTRAINT engagement_version_positive_ck CHECK(version > 0),
  ADD CONSTRAINT engagement_framework_not_blank_ck CHECK(btrim(framework) <> '');

-- Taxonomy references must not silently join a canonical account to a report
-- line from another taxonomy version (or to a different legacy line code).
ALTER TABLE canonical_report_line
  ADD CONSTRAINT canonical_report_line_taxonomy_id_uq UNIQUE(taxonomy_version,id),
  ADD CONSTRAINT canonical_report_line_taxonomy_code_id_uq
    UNIQUE(taxonomy_version,line_code,id),
  ADD CONSTRAINT canonical_report_line_identity_not_blank_ck CHECK(
    btrim(taxonomy_version) <> '' AND btrim(line_code) <> ''
    AND btrim(caption) <> '' AND btrim(statement_code) <> ''
  ),
  ADD CONSTRAINT canonical_report_line_display_order_nonnegative_ck CHECK(display_order >= 0);

ALTER TABLE canonical_account
  ADD CONSTRAINT canonical_account_taxonomy_report_line_fk
    FOREIGN KEY(taxonomy_version,report_line,report_line_id)
    REFERENCES canonical_report_line(taxonomy_version,line_code,id),
  ADD CONSTRAINT canonical_account_identity_not_blank_ck CHECK(
    btrim(taxonomy_version) <> '' AND btrim(canonical_code) <> ''
    AND btrim(name) <> '' AND btrim(report_line) <> ''
  );

ALTER TABLE import_batch
  ADD CONSTRAINT import_batch_tenant_id_uq UNIQUE(tenant_id,id),
  ADD CONSTRAINT import_batch_tenant_engagement_id_uq UNIQUE(tenant_id,engagement_id,id),
  ADD CONSTRAINT import_batch_tenant_engagement_fk
    FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  ADD CONSTRAINT import_batch_content_hash_not_blank CHECK(btrim(content_hash) <> ''),
  ADD CONSTRAINT import_batch_storage_key_not_blank CHECK(btrim(storage_key) <> ''),
  ADD CONSTRAINT import_batch_commit_state_ck CHECK(
    (status = 'COMMITTED' AND committed_at IS NOT NULL)
    OR (status <> 'COMMITTED' AND committed_at IS NULL)
  ),
  ADD CONSTRAINT import_batch_engagement_content_uq
    UNIQUE(tenant_id,engagement_id,content_hash);

ALTER TABLE import_snapshot
  ADD CONSTRAINT import_snapshot_tenant_id_uq UNIQUE(tenant_id,id),
  ADD CONSTRAINT import_snapshot_tenant_engagement_id_uq UNIQUE(tenant_id,engagement_id,id),
  ADD CONSTRAINT import_snapshot_tenant_engagement_fk
    FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  ADD CONSTRAINT import_snapshot_tenant_batch_fk
    FOREIGN KEY(tenant_id,engagement_id,import_batch_id)
    REFERENCES import_batch(tenant_id,engagement_id,id),
  ADD CONSTRAINT import_snapshot_sequence_positive_ck CHECK(sequence_no > 0),
  ADD CONSTRAINT import_snapshot_record_count_nonnegative_ck CHECK(record_count >= 0),
  ADD CONSTRAINT import_snapshot_content_hash_not_blank_ck CHECK(btrim(content_hash) <> ''),
  ADD CONSTRAINT import_snapshot_storage_key_not_blank_ck CHECK(btrim(storage_key) <> ''),
  ADD CONSTRAINT import_snapshot_totals_nonnegative_ck CHECK(debit_total >= 0 AND credit_total >= 0);

ALTER TABLE source_account
  ADD CONSTRAINT source_account_tenant_id_uq UNIQUE(tenant_id,id),
  ADD CONSTRAINT source_account_tenant_organisation_fk
    FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id),
  ADD CONSTRAINT source_account_code_not_blank_ck CHECK(btrim(account_code) <> ''),
  ADD CONSTRAINT source_account_name_not_blank_ck CHECK(btrim(account_name) <> '');

ALTER TABLE account_mapping
  ADD CONSTRAINT account_mapping_tenant_engagement_fk
    FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  ADD CONSTRAINT account_mapping_tenant_source_account_fk
    FOREIGN KEY(tenant_id,source_account_id) REFERENCES source_account(tenant_id,id),
  ADD CONSTRAINT account_mapping_version_positive_ck CHECK(version > 0),
  ADD CONSTRAINT account_mapping_mapping_source_not_blank_ck CHECK(btrim(mapping_source) <> ''),
  ADD CONSTRAINT account_mapping_status_not_blank_ck CHECK(btrim(status) <> '');

-- Mapping history is immutable and versioned. Partial indexes make the
-- tenant-default and engagement-specific version sequences explicit.
CREATE UNIQUE INDEX account_mapping_engagement_source_version_uq
  ON account_mapping(tenant_id,engagement_id,source_account_id,version)
  WHERE engagement_id IS NOT NULL;
CREATE UNIQUE INDEX account_mapping_default_source_version_uq
  ON account_mapping(tenant_id,source_account_id,version)
  WHERE engagement_id IS NULL;

ALTER TABLE trial_balance
  ADD CONSTRAINT trial_balance_tenant_id_uq UNIQUE(tenant_id,id),
  ADD CONSTRAINT trial_balance_tenant_engagement_fk
    FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  ADD CONSTRAINT trial_balance_tenant_snapshot_fk
    FOREIGN KEY(tenant_id,engagement_id,source_import_snapshot_id)
    REFERENCES import_snapshot(tenant_id,engagement_id,id),
  ADD CONSTRAINT trial_balance_version_positive_ck CHECK(version_no > 0),
  ADD CONSTRAINT trial_balance_content_hash_not_blank_ck CHECK(btrim(content_hash) <> '');

ALTER TABLE trial_balance_line
  ADD CONSTRAINT trial_balance_line_tenant_balance_fk
    FOREIGN KEY(tenant_id,trial_balance_id) REFERENCES trial_balance(tenant_id,id),
  ADD CONSTRAINT trial_balance_line_tenant_source_account_fk
    FOREIGN KEY(tenant_id,source_account_id) REFERENCES source_account(tenant_id,id),
  ADD CONSTRAINT trial_balance_line_dimensions_object_ck
    CHECK(jsonb_typeof(dimensions) = 'object'),
  ADD CONSTRAINT trial_balance_line_amounts_finite_ck
    CHECK(debit <> 'NaN'::numeric AND credit <> 'NaN'::numeric);

ALTER TABLE import_row
  ADD CONSTRAINT import_row_tenant_batch_fk
    FOREIGN KEY(tenant_id,import_batch_id) REFERENCES import_batch(tenant_id,id),
  ADD CONSTRAINT import_row_number_positive_ck CHECK(row_no > 0),
  ADD CONSTRAINT import_row_account_code_not_blank_ck CHECK(btrim(account_code) <> ''),
  ADD CONSTRAINT import_row_account_name_not_blank_ck CHECK(btrim(account_name) <> ''),
  ADD CONSTRAINT import_row_documents_object_ck
    CHECK(jsonb_typeof(dimensions) = 'object' AND jsonb_typeof(raw_row) = 'object'),
  ADD CONSTRAINT import_row_amounts_finite_ck
    CHECK(debit <> 'NaN'::numeric AND credit <> 'NaN'::numeric);

ALTER TABLE engagement_member
  ADD CONSTRAINT engagement_member_tenant_engagement_fk
    FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  ADD CONSTRAINT engagement_member_actor_not_blank_ck CHECK(btrim(actor_id) <> '');

ALTER TABLE tenant_member
  ADD CONSTRAINT tenant_member_actor_not_blank_ck CHECK(btrim(actor_id) <> '');

-- Audit rows are tenant-consistent, structurally valid, and hash-deduplicated.
-- The append-only UPDATE/DELETE rules created in 0001 remain authoritative.
ALTER TABLE audit_event
  ADD CONSTRAINT audit_event_tenant_organisation_fk
    FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id),
  ADD CONSTRAINT audit_event_tenant_engagement_fk
    FOREIGN KEY(tenant_id,engagement_id) REFERENCES engagement(tenant_id,id),
  ADD CONSTRAINT audit_event_tenant_organisation_engagement_fk
    FOREIGN KEY(tenant_id,organisation_id,engagement_id)
    REFERENCES engagement(tenant_id,organisation_id,id),
  ADD CONSTRAINT audit_event_metadata_object_ck CHECK(jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT audit_event_clock_skew_ck
    CHECK(occurred_at_utc <= recorded_at_utc + interval '5 minutes'),
  ADD CONSTRAINT audit_event_identity_not_blank_ck CHECK(
    btrim(actor_type) <> '' AND btrim(actor_id) <> ''
    AND btrim(event_type) <> '' AND btrim(object_type) <> ''
    AND btrim(object_id) <> '' AND btrim(correlation_id) <> ''
    AND btrim(event_hash) <> ''
  ),
  ADD CONSTRAINT audit_event_versions_nonnegative_ck CHECK(
    (version_before IS NULL OR version_before >= 0)
    AND (version_after IS NULL OR version_after >= 0)
  ),
  ADD CONSTRAINT audit_event_tenant_hash_uq UNIQUE(tenant_id,event_hash);

-- Callers should supply a stable domain key. The UUID default preserves
-- compatibility for existing inserts while still making every row deduplicable.
ALTER TABLE outbox_event
  ADD COLUMN idempotency_key text NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN last_error text,
  ADD CONSTRAINT outbox_event_idempotency_key_not_blank_ck CHECK(btrim(idempotency_key) <> ''),
  ADD CONSTRAINT outbox_event_identity_not_blank_ck CHECK(
    btrim(aggregate_type) <> '' AND btrim(aggregate_id) <> ''
    AND btrim(event_type) <> '' AND btrim(correlation_id) <> ''
  ),
  ADD CONSTRAINT outbox_event_payload_object_ck CHECK(jsonb_typeof(payload) = 'object'),
  ADD CONSTRAINT outbox_event_attempt_count_nonnegative_ck CHECK(attempt_count >= 0),
  ADD CONSTRAINT outbox_event_tenant_idempotency_uq UNIQUE(tenant_id,idempotency_key);

DROP INDEX outbox_unpublished_idx;
CREATE INDEX outbox_delivery_idx
  ON outbox_event(available_at,created_at,id)
  WHERE published_at IS NULL;

-- PUBLIC normally has no mutation privileges, but make the append-only intent
-- explicit and also cover TRUNCATE (which rewrite rules do not intercept).
REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM PUBLIC;

INSERT INTO schema_migration(version,description)
VALUES('0004','tenant integrity, idempotency, audit and outbox hardening')
ON CONFLICT(version) DO NOTHING;

COMMIT;

-- Optional post-apply verification (expected result: no rows):
-- SELECT conrelid::regclass AS table_name, conname
-- FROM pg_constraint
-- WHERE conname LIKE '%_tenant_%_fk' AND NOT convalidated;
--
-- SELECT version,description,applied_at,applied_by
-- FROM schema_migration ORDER BY version;
