-- PM-006 disposable Neon portal/client-resource RLS and replay verification. Fixtures roll back.
BEGIN;
GRANT accounts_app TO neondb_owner;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE version='0034') THEN RAISE EXCEPTION 'migration 0034 is not recorded'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('portal_principal'),('portal_client_access'),('portal_invitation'),('client_request'),('client_request_recipient'),('client_request_response'),
  ('portal_document'),('portal_document_version'),('portal_thread'),('portal_thread_participant'),('portal_message'),('portal_message_attachment'),
  ('portal_thread_read'),('client_confirmation'),('quotebench_request_receipt')) required(name)
  LEFT JOIN pg_class c ON c.relname=required.name LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'PM-006 forced-RLS inventory is incomplete'; END IF;
END $$;

INSERT INTO tenant(id,name,legal_name) VALUES
 ('70000000-0000-0000-0000-000000000001','PM006 tenant A','PM006 tenant A'),
 ('70000000-0000-0000-0000-000000000002','PM006 tenant B','PM006 tenant B');
INSERT INTO tenant_member(id,tenant_id,actor_id,role_code) VALUES
 ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','pm006-owner-a','OWNER'),
 ('71000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','pm006-owner-b','OWNER');
INSERT INTO organisation(id,tenant_id,legal_name,legal_form,jurisdiction,display_name,entity_type,created_by,updated_by) VALUES
 ('72000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Client A1','COMPANY','GB','Client A1','COMPANY','pm006-owner-a','pm006-owner-a'),
 ('72000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','Client A2','COMPANY','GB','Client A2','COMPANY','pm006-owner-a','pm006-owner-a'),
 ('72000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000002','Client B','COMPANY','GB','Client B','COMPANY','pm006-owner-b','pm006-owner-b');
INSERT INTO contact(id,tenant_id,display_name,email_normalized,status,created_by,updated_by) VALUES
 ('73000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Portal A','portal-a@example.test','ACTIVE','pm006-owner-a','pm006-owner-a'),
 ('73000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','Portal B','portal-b@example.test','ACTIVE','pm006-owner-b','pm006-owner-b');
INSERT INTO portal_principal(id,tenant_id,contact_id,auth_actor_id,status,activated_at,created_by) VALUES
 ('74000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','pm006-portal-a','active',now(),'pm006-owner-a'),
 ('74000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000002','pm006-portal-b','active',now(),'pm006-owner-b');
INSERT INTO portal_client_access(id,tenant_id,portal_principal_id,client_id,access_role,status,granted_by) VALUES
 ('75000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','contributor','active','pm006-owner-a'),
 ('75000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000003','approver','active','pm006-owner-b');
INSERT INTO client_request(id,tenant_id,client_id,request_type,title,status,created_by,updated_by) VALUES
 ('76000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','information','Visible request','open','pm006-owner-a','pm006-owner-a'),
 ('76000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002','information','Wrong client request','open','pm006-owner-a','pm006-owner-a'),
 ('76000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000003','information','Cross tenant request','open','pm006-owner-b','pm006-owner-b');
INSERT INTO client_request_recipient(id,tenant_id,client_request_id,portal_client_access_id) VALUES
 ('77000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','76000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000001'),
 ('77000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','76000000-0000-0000-0000-000000000003','75000000-0000-0000-0000-000000000002');
INSERT INTO portal_document(id,tenant_id,client_id,display_filename,visibility,current_version,created_by) VALUES
 ('78000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','Shared.pdf','shared_with_client',1,'pm006-owner-a'),
 ('78000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','Internal.pdf','internal',1,'pm006-owner-a');
INSERT INTO portal_document_version(id,tenant_id,portal_document_id,version,object_key,original_filename,media_type,byte_size,content_hash,uploader_context,uploader_actor_id,scan_status) VALUES
 ('79000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000001',1,'tenants/70000000-0000-0000-0000-000000000001/clients/72000000-0000-0000-0000-000000000001/portal-documents/shared/v1','Shared.pdf','application/pdf',10,repeat('a',64),'practice','pm006-owner-a','accepted'),
 ('79000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002',1,'tenants/70000000-0000-0000-0000-000000000001/clients/72000000-0000-0000-0000-000000000001/portal-documents/internal/v1','Internal.pdf','application/pdf',10,repeat('b',64),'practice','pm006-owner-a','accepted');

SET LOCAL ROLE accounts_app;
SET LOCAL app.tenant_id='70000000-0000-0000-0000-000000000001'; SET LOCAL app.actor_id='pm006-portal-a';
DO $$ BEGIN
 IF (SELECT count(*) FROM portal_client_access)<>1 THEN RAISE EXCEPTION 'explicit portal client access was not visible'; END IF;
 IF (SELECT count(*) FROM client_request)<>1 THEN RAISE EXCEPTION 'wrong-client or cross-tenant request escaped portal RLS'; END IF;
 IF (SELECT count(*) FROM portal_document)<>1 THEN RAISE EXCEPTION 'internal document visibility escaped portal RLS'; END IF;
 IF EXISTS(SELECT 1 FROM portal_document WHERE id='78000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'internal-only document was visible'; END IF;
END $$;
SET LOCAL app.tenant_id='70000000-0000-0000-0000-000000000001'; SET LOCAL app.actor_id='unrelated-valid-identity';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM client_request) OR EXISTS(SELECT 1 FROM portal_document) THEN RAISE EXCEPTION 'identity without client grant received portal access'; END IF; END $$;
RESET ROLE;

INSERT INTO quotebench_machine_key(key_id,public_key_jwk) VALUES('pm006-test-key','{"kty":"OKP","crv":"Ed25519","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb);
DO $$ BEGIN
 IF NOT claim_quotebench_request('70000000-0000-0000-0000-000000000001','pm006-test-key','event-one',repeat('c',64),now(),now()+interval '2 minutes') THEN RAISE EXCEPTION 'valid machine receipt was rejected'; END IF;
 IF claim_quotebench_request('70000000-0000-0000-0000-000000000001','pm006-test-key','event-one',repeat('c',64),now(),now()+interval '2 minutes') THEN RAISE EXCEPTION 'machine replay was accepted'; END IF;
END $$;
DO $$ BEGIN
 IF has_table_privilege('accounts_app','portal_message','DELETE') OR has_table_privilege('accounts_app','portal_document','DELETE') OR has_table_privilege('accounts_app','client_request','DELETE') THEN RAISE EXCEPTION 'runtime role has destructive PM-006 grants'; END IF;
END $$;
ROLLBACK;
