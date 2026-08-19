BEGIN;

ALTER TABLE reporting_framework_pack
  ADD COLUMN lifecycle_status text NOT NULL DEFAULT 'BASELINE'
    CHECK(lifecycle_status IN ('BASELINE','DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED')),
  ADD COLUMN source_checksum text,
  ADD COLUMN reviewed_by text,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_evidence_id uuid,
  ADD COLUMN review_evidence_type text,
  ADD COLUMN review_evidence_decision text,
  ADD COLUMN approved_by text,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approval_evidence_id uuid,
  ADD COLUMN approval_evidence_type text,
  ADD COLUMN approval_evidence_decision text,
  ADD CONSTRAINT reporting_framework_pack_source_checksum_ck
    CHECK(source_checksum IS NULL OR source_checksum ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT reporting_framework_pack_review_pair_ck
    CHECK((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  ADD CONSTRAINT reporting_framework_pack_approval_pair_ck
    CHECK((approved_by IS NULL) = (approved_at IS NULL)),
  ADD CONSTRAINT reporting_framework_pack_review_evidence_pair_ck
    CHECK(
      (review_evidence_id IS NULL) = (review_evidence_type IS NULL)
      AND (review_evidence_id IS NULL) = (review_evidence_decision IS NULL)
    ),
  ADD CONSTRAINT reporting_framework_pack_approval_evidence_pair_ck
    CHECK(
      (approval_evidence_id IS NULL) = (approval_evidence_type IS NULL)
      AND (approval_evidence_id IS NULL) = (approval_evidence_decision IS NULL)
    ),
  ADD CONSTRAINT reporting_framework_pack_review_evidence_kind_ck
    CHECK(
      review_evidence_type IS NULL
      OR review_evidence_type IN ('SOURCE_VERIFICATION','TECHNICAL_REVIEW')
    ),
  ADD CONSTRAINT reporting_framework_pack_approval_evidence_kind_ck
    CHECK(
      approval_evidence_type IS NULL
      OR approval_evidence_type IN ('COMPLIANCE_APPROVAL','PUBLICATION_APPROVAL')
    ),
  ADD CONSTRAINT reporting_framework_pack_evidence_decision_ck
    CHECK(
      (review_evidence_decision IS NULL OR review_evidence_decision='APPROVED')
      AND (approval_evidence_decision IS NULL OR approval_evidence_decision='APPROVED')
    ),
  ADD CONSTRAINT reporting_framework_pack_reviewer_not_blank_ck
    CHECK(reviewed_by IS NULL OR btrim(reviewed_by) <> ''),
  ADD CONSTRAINT reporting_framework_pack_approver_not_blank_ck
    CHECK(approved_by IS NULL OR btrim(approved_by) <> ''),
  ADD CONSTRAINT reporting_framework_pack_approval_order_ck
    CHECK(approved_at IS NULL OR (reviewed_at IS NOT NULL AND approved_at >= reviewed_at)),
  ADD CONSTRAINT reporting_framework_pack_lifecycle_evidence_ck
    CHECK(
      lifecycle_status NOT IN ('APPROVED','PUBLISHED','RETIRED')
      OR (
        source_checksum IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND review_evidence_id IS NOT NULL
        AND approved_at IS NOT NULL
        AND approval_evidence_id IS NOT NULL
      )
    ),
  ADD CONSTRAINT reporting_framework_pack_certification_evidence_ck
    CHECK(
      certification_status <> 'REGULATOR_CERTIFIED'
      OR (
        lifecycle_status IN ('PUBLISHED','RETIRED')
        AND source_checksum IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND review_evidence_id IS NOT NULL
        AND approved_at IS NOT NULL
        AND approval_evidence_id IS NOT NULL
      )
    );

CREATE TABLE reporting_framework_pack_review(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES reporting_framework_pack(id),
  review_cycle integer NOT NULL CHECK(review_cycle > 0),
  review_type text NOT NULL CHECK(review_type IN (
    'SOURCE_VERIFICATION','TECHNICAL_REVIEW','COMPLIANCE_APPROVAL',
    'PUBLICATION_APPROVAL','RETIREMENT'
  )),
  decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED','SUPERSEDED')),
  reviewer_actor_id text NOT NULL CHECK(btrim(reviewer_actor_id) <> ''),
  decided_at timestamptz NOT NULL,
  evidence_reference jsonb NOT NULL CHECK(jsonb_typeof(evidence_reference)='object'),
  evidence_checksum text NOT NULL CHECK(evidence_checksum ~ '^[0-9a-f]{64}$'),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(framework_pack_id,review_cycle,review_type),
  UNIQUE(framework_pack_id,id,review_type,decision)
);

CREATE RULE reporting_framework_pack_review_no_update AS
  ON UPDATE TO reporting_framework_pack_review DO INSTEAD NOTHING;
CREATE RULE reporting_framework_pack_review_no_delete AS
  ON DELETE TO reporting_framework_pack_review DO INSTEAD NOTHING;

ALTER TABLE reporting_framework_pack
  ADD CONSTRAINT reporting_framework_pack_review_evidence_fk
    FOREIGN KEY(id,review_evidence_id,review_evidence_type,review_evidence_decision)
    REFERENCES reporting_framework_pack_review(framework_pack_id,id,review_type,decision),
  ADD CONSTRAINT reporting_framework_pack_approval_evidence_fk
    FOREIGN KEY(id,approval_evidence_id,approval_evidence_type,approval_evidence_decision)
    REFERENCES reporting_framework_pack_review(framework_pack_id,id,review_type,decision);

CREATE TABLE taxonomy_release(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxonomy_code text NOT NULL CHECK(btrim(taxonomy_code) <> ''),
  version_code text NOT NULL CHECK(btrim(version_code) <> ''),
  title text NOT NULL CHECK(btrim(title) <> ''),
  authority_name text NOT NULL CHECK(btrim(authority_name) <> ''),
  effective_from date NOT NULL,
  effective_to date,
  source_uri text NOT NULL CHECK(btrim(source_uri) <> ''),
  source_checksum text NOT NULL CHECK(source_checksum ~ '^[0-9a-f]{64}$'),
  imported_by text NOT NULL CHECK(btrim(imported_by) <> ''),
  imported_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  UNIQUE(taxonomy_code,version_code),
  UNIQUE(id,version_code),
  CHECK(effective_to IS NULL OR effective_to >= effective_from)
);

CREATE RULE taxonomy_release_no_update AS
  ON UPDATE TO taxonomy_release DO INSTEAD NOTHING;
CREATE RULE taxonomy_release_no_delete AS
  ON DELETE TO taxonomy_release DO INSTEAD NOTHING;

CREATE TABLE taxonomy_release_review(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxonomy_release_id uuid NOT NULL REFERENCES taxonomy_release(id),
  review_cycle integer NOT NULL CHECK(review_cycle > 0),
  review_type text NOT NULL CHECK(review_type IN (
    'SOURCE_VERIFICATION','SCHEMA_VALIDATION','TECHNICAL_REVIEW',
    'COMPLIANCE_APPROVAL','PUBLICATION_APPROVAL','RETIREMENT'
  )),
  decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED','SUPERSEDED')),
  reviewer_actor_id text NOT NULL CHECK(btrim(reviewer_actor_id) <> ''),
  decided_at timestamptz NOT NULL,
  evidence_reference jsonb NOT NULL CHECK(jsonb_typeof(evidence_reference)='object'),
  evidence_checksum text NOT NULL CHECK(evidence_checksum ~ '^[0-9a-f]{64}$'),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(taxonomy_release_id,review_cycle,review_type)
);

CREATE RULE taxonomy_release_review_no_update AS
  ON UPDATE TO taxonomy_release_review DO INSTEAD NOTHING;
CREATE RULE taxonomy_release_review_no_delete AS
  ON DELETE TO taxonomy_release_review DO INSTEAD NOTHING;

ALTER TABLE taxonomy_concept_mapping
  ADD COLUMN taxonomy_release_id uuid NOT NULL,
  ADD CONSTRAINT taxonomy_concept_mapping_release_fk
    FOREIGN KEY(taxonomy_release_id,taxonomy_version)
    REFERENCES taxonomy_release(id,version_code);

CREATE INDEX reporting_framework_pack_review_lookup_idx
  ON reporting_framework_pack_review(framework_pack_id,review_cycle,review_type);
CREATE INDEX taxonomy_release_review_lookup_idx
  ON taxonomy_release_review(taxonomy_release_id,review_cycle,review_type);

ALTER TABLE reporting_framework_pack_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_framework_pack_review FORCE ROW LEVEL SECURITY;
CREATE POLICY reporting_framework_pack_review_authenticated_actor
  ON reporting_framework_pack_review FOR SELECT TO accounts_app
  USING(EXISTS(
    SELECT 1 FROM tenant_member app_tm
    WHERE app_tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
      AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')
  ));
CREATE POLICY reporting_framework_pack_review_migration_owner
  ON reporting_framework_pack_review TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE taxonomy_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_release FORCE ROW LEVEL SECURITY;
CREATE POLICY taxonomy_release_authenticated_actor
  ON taxonomy_release FOR SELECT TO accounts_app
  USING(EXISTS(
    SELECT 1 FROM tenant_member app_tm
    WHERE app_tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
      AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')
  ));
CREATE POLICY taxonomy_release_migration_owner
  ON taxonomy_release TO neondb_owner USING(true) WITH CHECK(true);

ALTER TABLE taxonomy_release_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_release_review FORCE ROW LEVEL SECURITY;
CREATE POLICY taxonomy_release_review_authenticated_actor
  ON taxonomy_release_review FOR SELECT TO accounts_app
  USING(EXISTS(
    SELECT 1 FROM tenant_member app_tm
    WHERE app_tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'')
      AND app_tm.actor_id=nullif(current_setting('app.actor_id',true),'')
  ));
CREATE POLICY taxonomy_release_review_migration_owner
  ON taxonomy_release_review TO neondb_owner USING(true) WITH CHECK(true);

REVOKE ALL ON reporting_framework_pack_review,taxonomy_release,taxonomy_release_review
  FROM PUBLIC,accounts_app;
GRANT SELECT ON reporting_framework_pack_review,taxonomy_release,taxonomy_release_review
  TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0016','compliance content lifecycle and immutable taxonomy release governance')
ON CONFLICT(version) DO NOTHING;

COMMIT;
