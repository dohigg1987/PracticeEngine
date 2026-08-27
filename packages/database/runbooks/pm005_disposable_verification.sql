-- PM-005 disposable Neon forced-RLS and idempotency verification. Fixtures roll back.
BEGIN;
GRANT accounts_app TO neondb_owner;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE version='0033') THEN RAISE EXCEPTION 'migration 0033 is not recorded'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('crm_stage_definition'),('prospect'),('prospect_contact_relationship'),('opportunity'),('opportunity_service'),
  ('crm_activity'),('quotebench_proposal_reference'),('specialist_event_receipt'),('onboarding_case'),
  ('onboarding_case_service'),('onboarding_blocker'),('crm_conversion')) required(name)
  LEFT JOIN pg_class c ON c.relname=required.name LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'PM-005 forced-RLS inventory is incomplete'; END IF;
END $$;

INSERT INTO tenant(id,name,legal_name) VALUES
 ('60000000-0000-0000-0000-000000000001','PM005 tenant A','PM005 tenant A'),
 ('60000000-0000-0000-0000-000000000002','PM005 tenant B','PM005 tenant B');
INSERT INTO tenant_member(id,tenant_id,actor_id,role_code) VALUES
 ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','pm005-owner-a','OWNER'),
 ('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','pm005-owner-b','OWNER');
SELECT seed_tenant_platform_defaults(id) FROM tenant
WHERE id IN ('60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002');
INSERT INTO contact(id,tenant_id,display_name,email_normalized,status,created_by,updated_by) VALUES
 ('62000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Contact A','contact-a@example.test','ACTIVE','pm005-owner-a','pm005-owner-a'),
 ('62000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','Contact B','contact-b@example.test','ACTIVE','pm005-owner-b','pm005-owner-b');
INSERT INTO prospect(id,tenant_id,display_name,entity_type,primary_contact_id,status,created_by,updated_by) VALUES
 ('63000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Prospect A','COMPANY','62000000-0000-0000-0000-000000000001','qualified','pm005-owner-a','pm005-owner-a'),
 ('63000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','Prospect B','COMPANY','62000000-0000-0000-0000-000000000002','qualified','pm005-owner-b','pm005-owner-b');
INSERT INTO prospect_contact_relationship(tenant_id,prospect_id,contact_id,relationship_type,is_primary,created_by) VALUES
 ('60000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','PRIMARY_CONTACT',true,'pm005-owner-a'),
 ('60000000-0000-0000-0000-000000000002','63000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000002','PRIMARY_CONTACT',true,'pm005-owner-b');
INSERT INTO practice_service(id,tenant_id,name,category,created_by,updated_by) VALUES
 ('64000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Advisory A','advisory','pm005-owner-a','pm005-owner-a'),
 ('64000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','Advisory B','advisory','pm005-owner-b','pm005-owner-b');
INSERT INTO opportunity(id,tenant_id,prospect_id,name,stage_key,currency,status,created_by,updated_by) VALUES
 ('65000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001','Opportunity A','proposal','GBP','open','pm005-owner-a','pm005-owner-a'),
 ('65000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','63000000-0000-0000-0000-000000000002','Opportunity B','proposal','GBP','open','pm005-owner-b','pm005-owner-b');
INSERT INTO opportunity_service(id,tenant_id,opportunity_id,service_id,created_by) VALUES
 ('66000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000001','pm005-owner-a'),
 ('66000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','65000000-0000-0000-0000-000000000002','64000000-0000-0000-0000-000000000002','pm005-owner-b');
INSERT INTO quotebench_proposal_reference(id,tenant_id,opportunity_id,proposal_id,proposal_version,status,created_by,updated_by) VALUES
 ('67000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001','QB-A','1','sent','pm005-owner-a','pm005-owner-a');
INSERT INTO specialist_event_receipt(id,tenant_id,module_key,event_id,event_type,status,subject_reference,correlation_id) VALUES
 ('68000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','quotebench','68000000-0000-0000-0000-000000000099','quotebench.proposal.sent','processed','QB-A','68000000-0000-0000-0000-000000000098');
DO $$ BEGIN BEGIN
 INSERT INTO specialist_event_receipt(id,tenant_id,module_key,event_id,event_type,status,subject_reference,correlation_id) VALUES
 ('68000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','quotebench','68000000-0000-0000-0000-000000000099','quotebench.proposal.sent','processed','QB-A','68000000-0000-0000-0000-000000000097');
 RAISE EXCEPTION 'duplicate specialist event was accepted'; EXCEPTION WHEN unique_violation THEN NULL; END; END $$;

SET LOCAL ROLE accounts_app;
SET LOCAL app.tenant_id='60000000-0000-0000-0000-000000000001'; SET LOCAL app.actor_id='pm005-owner-a';
DO $$ BEGIN IF (SELECT count(*) FROM prospect)<>1 OR (SELECT count(*) FROM opportunity)<>1 OR (SELECT count(*) FROM quotebench_proposal_reference)<>1 THEN RAISE EXCEPTION 'tenant A PM-005 records are not visible'; END IF; END $$;
SET LOCAL app.tenant_id='60000000-0000-0000-0000-000000000002'; SET LOCAL app.actor_id='pm005-owner-b';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM quotebench_proposal_reference) OR EXISTS(SELECT 1 FROM specialist_event_receipt) THEN RAISE EXCEPTION 'cross-tenant PM-005 records are visible'; END IF; IF (SELECT count(*) FROM prospect)<>1 OR (SELECT count(*) FROM opportunity)<>1 THEN RAISE EXCEPTION 'tenant B PM-005 records are not visible'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN IF has_table_privilege('accounts_app','prospect','DELETE') OR has_table_privilege('accounts_app','opportunity','DELETE') OR has_table_privilege('accounts_app','onboarding_case','DELETE') OR has_table_privilege('accounts_app','crm_conversion','DELETE') THEN RAISE EXCEPTION 'runtime role has destructive PM-005 grants'; END IF; END $$;
ROLLBACK;
