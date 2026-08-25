BEGIN;

-- PM-001 expands the established identifiers; it does not replace Ledgerly data.
ALTER TABLE tenant
  ADD COLUMN legal_name text,
  ADD COLUMN trading_name text,
  ADD COLUMN organisation_type text NOT NULL DEFAULT 'PRACTICE',
  ADD COLUMN registration_reference text,
  ADD COLUMN primary_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN locale text NOT NULL DEFAULT 'en-GB',
  ADD COLUMN timezone text NOT NULL DEFAULT 'Europe/London',
  ADD COLUMN currency_code text NOT NULL DEFAULT 'GBP',
  ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN branding_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT tenant_organisation_type_ck CHECK(organisation_type ~ '^[A-Z][A-Z0-9_]{1,49}$'),
  ADD CONSTRAINT tenant_currency_ck CHECK(currency_code ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT tenant_status_ck CHECK(status IN ('ACTIVE','SUSPENDED','CLOSED'));
UPDATE tenant SET legal_name=name WHERE legal_name IS NULL;
ALTER TABLE tenant ALTER COLUMN legal_name SET NOT NULL;

CREATE TABLE platform_user(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider text NOT NULL DEFAULT 'NEON_AUTH',
  external_subject text NOT NULL CHECK(btrim(external_subject)<>'' AND char_length(external_subject)<=320),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(auth_provider,external_subject)
);
ALTER TABLE tenant_member
  ADD COLUMN user_id uuid,
  ADD COLUMN membership_status text NOT NULL DEFAULT 'ACTIVE' CHECK(membership_status IN ('PENDING','ACTIVE','SUSPENDED')),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT tenant_member_tenant_id_id_uq UNIQUE(tenant_id,id);
INSERT INTO platform_user(auth_provider,external_subject)
SELECT 'NEON_AUTH',actor_id FROM tenant_member ON CONFLICT DO NOTHING;
UPDATE tenant_member tm SET user_id=u.id FROM platform_user u
WHERE u.auth_provider='NEON_AUTH' AND u.external_subject=tm.actor_id;
ALTER TABLE tenant_member ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT tenant_member_user_fk FOREIGN KEY(user_id) REFERENCES platform_user(id),
  ADD CONSTRAINT tenant_member_tenant_user_uq UNIQUE(tenant_id,user_id);

CREATE FUNCTION resolve_platform_user_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  INSERT INTO public.platform_user(auth_provider,external_subject) VALUES('NEON_AUTH',NEW.actor_id)
  ON CONFLICT(auth_provider,external_subject) DO UPDATE SET external_subject=excluded.external_subject
  RETURNING id INTO NEW.user_id;
  NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER tenant_member_resolve_platform_user BEFORE INSERT OR UPDATE OF actor_id ON tenant_member
FOR EACH ROW EXECUTE FUNCTION resolve_platform_user_membership();

CREATE TABLE permission_definition(
  permission_key text PRIMARY KEY CHECK(permission_key ~ '^[a-z][a-z0-9_.]{2,99}$'),
  description text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tenant_role(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  role_key text NOT NULL CHECK(role_key ~ '^[A-Z][A-Z0-9_]{1,49}$'),display_name text NOT NULL CHECK(btrim(display_name)<>''),
  system_role boolean NOT NULL DEFAULT false,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  created_by text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,role_key)
);
CREATE TABLE tenant_role_permission(
  tenant_id uuid NOT NULL,role_id uuid NOT NULL,permission_key text NOT NULL REFERENCES permission_definition(permission_key),
  granted_at timestamptz NOT NULL DEFAULT now(),granted_by text,PRIMARY KEY(tenant_id,role_id,permission_key),
  FOREIGN KEY(tenant_id,role_id) REFERENCES tenant_role(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE tenant_member_role(
  tenant_id uuid NOT NULL,tenant_member_id uuid NOT NULL,role_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),assigned_by text,PRIMARY KEY(tenant_id,tenant_member_id,role_id),
  FOREIGN KEY(tenant_id,tenant_member_id) REFERENCES tenant_member(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,role_id) REFERENCES tenant_role(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE team(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(btrim(name)<>'' AND char_length(name)<=160),status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,name)
);
CREATE TABLE team_member(
  tenant_id uuid NOT NULL,team_id uuid NOT NULL,tenant_member_id uuid NOT NULL,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,team_id,tenant_member_id),
  FOREIGN KEY(tenant_id,team_id) REFERENCES team(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,tenant_member_id) REFERENCES tenant_member(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE contact(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  contact_kind text NOT NULL DEFAULT 'PERSON' CHECK(contact_kind IN ('PERSON','ORGANISATION')),
  display_name text NOT NULL CHECK(btrim(display_name)<>'' AND char_length(display_name)<=255),given_name text,family_name text,
  email_normalized text CHECK(email_normalized IS NULL OR email_normalized=lower(btrim(email_normalized)) AND email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  telephone text,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  communication_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,legacy_client_contact_id uuid,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,legacy_client_contact_id),
  FOREIGN KEY(tenant_id,legacy_client_contact_id) REFERENCES client_contact(tenant_id,id)
);
CREATE TABLE relationship_type_definition(
  relationship_type_key text PRIMARY KEY CHECK(relationship_type_key ~ '^[A-Z][A-Z0-9_]{1,49}$'),
  display_name text NOT NULL,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE client_contact_relationship(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,client_id uuid NOT NULL,contact_id uuid NOT NULL,
  relationship_type_key text NOT NULL REFERENCES relationship_type_definition(relationship_type_key),custom_relationship_label text,
  is_primary boolean NOT NULL DEFAULT false,start_date date,end_date date,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ENDED')),
  created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,contact_id) REFERENCES contact(tenant_id,id),CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date),
  CHECK((relationship_type_key='OTHER')=(custom_relationship_label IS NOT NULL)),
  CHECK(custom_relationship_label IS NULL OR btrim(custom_relationship_label)<>'')
);
CREATE UNIQUE INDEX client_primary_contact_uq ON client_contact_relationship(tenant_id,client_id) WHERE is_primary AND status='ACTIVE';
CREATE TABLE address(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  line1 text NOT NULL CHECK(btrim(line1)<>''),line2 text,locality text,region text,postal_code text,
  country_code text NOT NULL CHECK(country_code ~ '^[A-Z]{2}$'),created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id)
);
CREATE TABLE client_address(
  tenant_id uuid NOT NULL,client_id uuid NOT NULL,address_id uuid NOT NULL,
  address_type text NOT NULL DEFAULT 'PRIMARY' CHECK(address_type IN ('PRIMARY','REGISTERED','TRADING','BILLING','OTHER')),
  is_primary boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,client_id,address_id,address_type),FOREIGN KEY(tenant_id,client_id) REFERENCES organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,address_id) REFERENCES address(tenant_id,id)
);
ALTER TABLE organisation
  ADD COLUMN display_name text,ADD COLUMN entity_type text NOT NULL DEFAULT 'OTHER',ADD COLUMN client_code text,
  ADD COLUMN responsible_member_id uuid,ADD COLUMN responsible_team_id uuid,ADD COLUMN primary_contact_id uuid,ADD COLUMN primary_address_id uuid,
  ADD COLUMN communication_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,ADD COLUMN created_by text,ADD COLUMN updated_by text,
  ADD CONSTRAINT organisation_entity_type_ck CHECK(entity_type IN ('COMPANY','PARTNERSHIP','SOLE_TRADER','INDIVIDUAL','CHARITY','TRUST','OTHER')),
  ADD CONSTRAINT organisation_client_code_ck CHECK(client_code IS NULL OR btrim(client_code)<>'' AND char_length(client_code)<=80),
  ADD CONSTRAINT organisation_responsible_member_fk FOREIGN KEY(tenant_id,responsible_member_id) REFERENCES tenant_member(tenant_id,id),
  ADD CONSTRAINT organisation_responsible_team_fk FOREIGN KEY(tenant_id,responsible_team_id) REFERENCES team(tenant_id,id),
  ADD CONSTRAINT organisation_primary_contact_fk FOREIGN KEY(tenant_id,primary_contact_id) REFERENCES contact(tenant_id,id),
  ADD CONSTRAINT organisation_primary_address_fk FOREIGN KEY(tenant_id,primary_address_id) REFERENCES address(tenant_id,id);
UPDATE organisation SET display_name=legal_name WHERE display_name IS NULL;
ALTER TABLE organisation ALTER COLUMN display_name SET NOT NULL;
CREATE UNIQUE INDEX organisation_tenant_client_code_uq ON organisation(tenant_id,client_code) WHERE client_code IS NOT NULL;
CREATE INDEX organisation_tenant_owner_idx ON organisation(tenant_id,responsible_member_id) WHERE lifecycle_status='ACTIVE';
CREATE INDEX organisation_tenant_team_idx ON organisation(tenant_id,responsible_team_id) WHERE lifecycle_status='ACTIVE';
INSERT INTO relationship_type_definition(relationship_type_key,display_name) VALUES
 ('DIRECTOR','Director'),('TRUSTEE','Trustee'),('OWNER','Owner'),('PARTNER','Partner'),('EMPLOYEE','Employee'),
 ('ADVISER','Adviser'),('PRIMARY_CONTACT','Primary contact'),('BILLING_CONTACT','Billing contact'),('OTHER','Other');
INSERT INTO contact(tenant_id,display_name,email_normalized,status,legacy_client_contact_id,created_by,updated_by,created_at,updated_at)
SELECT tenant_id,display_name,email_normalized,status,id,created_by,created_by,created_at,updated_at FROM client_contact;
INSERT INTO client_contact_relationship(tenant_id,client_id,contact_id,relationship_type_key,is_primary,created_by,updated_by)
SELECT cc.tenant_id,cc.organisation_id,c.id,'PRIMARY_CONTACT',
 row_number() OVER(PARTITION BY cc.tenant_id,cc.organisation_id ORDER BY cc.created_at,cc.id)=1,cc.created_by,cc.created_by
FROM client_contact cc JOIN contact c ON c.tenant_id=cc.tenant_id AND c.legacy_client_contact_id=cc.id;
UPDATE organisation o SET primary_contact_id=r.contact_id FROM client_contact_relationship r
WHERE r.tenant_id=o.tenant_id AND r.client_id=o.id AND r.is_primary;

CREATE TABLE product_definition(product_key text PRIMARY KEY CHECK(product_key ~ '^[a-z][a-z0-9_]{1,49}$'),display_name text NOT NULL,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')));
CREATE TABLE module_definition(module_key text PRIMARY KEY CHECK(module_key ~ '^[a-z][a-z0-9_]{1,49}$'),product_key text NOT NULL REFERENCES product_definition(product_key),display_name text NOT NULL,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')));
CREATE TABLE feature_definition(feature_key text PRIMARY KEY CHECK(feature_key ~ '^[a-z][a-z0-9_.]{2,99}$'),module_key text NOT NULL REFERENCES module_definition(module_key),display_name text NOT NULL,value_type text NOT NULL DEFAULT 'BOOLEAN' CHECK(value_type IN ('BOOLEAN','NUMBER','TEXT')),status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')));
CREATE TABLE tenant_entitlement(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,feature_key text NOT NULL REFERENCES feature_definition(feature_key),
 enabled boolean NOT NULL,value jsonb,source text NOT NULL CHECK(source IN ('TRANSITIONAL','SUBSCRIPTION','TRIAL','MANUAL')),
 valid_from timestamptz NOT NULL DEFAULT now(),valid_until timestamptz,created_by text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),CHECK(valid_until IS NULL OR valid_until>valid_from)
);
CREATE TABLE tenant_entitlement_override(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,feature_key text NOT NULL REFERENCES feature_definition(feature_key),
 enabled boolean NOT NULL,value jsonb,reason text NOT NULL CHECK(btrim(reason)<>''),valid_from timestamptz NOT NULL DEFAULT now(),valid_until timestamptz,
 created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
 CHECK(valid_until IS NULL OR valid_until>valid_from)
);
CREATE INDEX tenant_entitlement_effective_idx ON tenant_entitlement(tenant_id,feature_key,valid_from DESC);
CREATE INDEX tenant_entitlement_override_effective_idx ON tenant_entitlement_override(tenant_id,feature_key,valid_from DESC);
CREATE TABLE tenant_setting(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 scope_type text NOT NULL DEFAULT 'TENANT' CHECK(scope_type IN ('TENANT','USER','TEAM','MODULE')),scope_reference text NOT NULL DEFAULT '',
 namespace text NOT NULL CHECK(namespace ~ '^[a-z][a-z0-9_.]{1,79}$'),setting_key text NOT NULL CHECK(setting_key ~ '^[a-z][a-z0-9_.]{1,79}$'),
 setting_value jsonb NOT NULL,created_by text NOT NULL CHECK(btrim(created_by)<>''),created_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL CHECK(btrim(updated_by)<>''),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,scope_type,scope_reference,namespace,setting_key),
 CHECK((scope_type='TENANT' AND scope_reference='') OR (scope_type<>'TENANT' AND btrim(scope_reference)<>''))
);
INSERT INTO permission_definition(permission_key,description) VALUES
 ('clients.view','View clients'),('clients.create','Create clients'),('clients.edit','Edit clients'),('clients.archive','Archive clients'),
 ('contacts.manage','Manage contacts'),('users.manage','Manage memberships and roles'),('teams.manage','Manage teams'),
 ('settings.manage','Manage settings'),('audit.view','View audit'),('ledgerly.view','View Ledgerly'),('ledgerly.edit','Edit Ledgerly'),
 ('entitlements.view','View entitlements');
INSERT INTO product_definition VALUES('ledgerly','Ledgerly','ACTIVE'),('practice','Practice Management','ACTIVE');
INSERT INTO module_definition VALUES('ledgerly','ledgerly','Ledgerly','ACTIVE'),('practice','practice','Practice Management','ACTIVE');
INSERT INTO feature_definition(feature_key,module_key,display_name) VALUES
 ('ledgerly.enabled','ledgerly','Ledgerly'),('ledgerly.ledger','ledgerly','Ledger'),('ledgerly.accounts','ledgerly','Accounts'),('ledgerly.filing','ledgerly','Filing'),
 ('practice.enabled','practice','Practice Management'),('practice.clients','practice','Clients'),('practice.work','practice','Work'),
 ('practice.workflow','practice','Workflow'),('practice.portal','practice','Portal');

CREATE FUNCTION seed_tenant_platform_defaults(p_tenant_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE key text;
BEGIN
 FOREACH key IN ARRAY ARRAY['OWNER','ADMIN','MEMBER'] LOOP
  INSERT INTO public.tenant_role(tenant_id,role_key,display_name,system_role) VALUES(p_tenant_id,key,initcap(lower(key)),true) ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO public.tenant_role_permission(tenant_id,role_id,permission_key)
 SELECT r.tenant_id,r.id,p.permission_key FROM public.tenant_role r CROSS JOIN public.permission_definition p
 WHERE r.tenant_id=p_tenant_id AND (r.role_key IN ('OWNER','ADMIN') OR (r.role_key='MEMBER' AND p.permission_key IN ('clients.view','ledgerly.view','entitlements.view'))) ON CONFLICT DO NOTHING;
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,f.feature_key,true,'TRANSITIONAL' FROM public.feature_definition f WHERE f.module_key='ledgerly'
 AND NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key=f.feature_key);
 INSERT INTO public.tenant_entitlement(tenant_id,feature_key,enabled,source)
 SELECT p_tenant_id,'practice.clients',true,'TRANSITIONAL' WHERE NOT EXISTS(SELECT 1 FROM public.tenant_entitlement e WHERE e.tenant_id=p_tenant_id AND e.feature_key='practice.clients');
END $$;
SELECT seed_tenant_platform_defaults(id) FROM tenant;
INSERT INTO tenant_member_role(tenant_id,tenant_member_id,role_id,assigned_by)
SELECT tm.tenant_id,tm.id,r.id,tm.actor_id FROM tenant_member tm JOIN tenant_role r ON r.tenant_id=tm.tenant_id AND r.role_key=tm.role_code;
CREATE FUNCTION seed_new_tenant_platform_defaults() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN PERFORM public.seed_tenant_platform_defaults(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER tenant_platform_defaults AFTER INSERT ON tenant FOR EACH ROW EXECUTE FUNCTION seed_new_tenant_platform_defaults();
CREATE FUNCTION sync_legacy_member_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 DELETE FROM public.tenant_member_role WHERE tenant_id=NEW.tenant_id AND tenant_member_id=NEW.id;
 INSERT INTO public.tenant_member_role(tenant_id,tenant_member_id,role_id,assigned_by)
 SELECT NEW.tenant_id,NEW.id,r.id,nullif(current_setting('app.actor_id',true),'') FROM public.tenant_role r WHERE r.tenant_id=NEW.tenant_id AND r.role_key=NEW.role_code;
 RETURN NEW;
END $$;
CREATE TRIGGER tenant_member_role_compatibility AFTER INSERT OR UPDATE OF role_code ON tenant_member FOR EACH ROW EXECUTE FUNCTION sync_legacy_member_role();
CREATE FUNCTION tenant_actor_is_active(p_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.tenant_member tm WHERE tm.tenant_id=p_tenant_id AND tm.actor_id=nullif(current_setting('app.actor_id',true),'') AND tm.membership_status='ACTIVE') $$;
CREATE FUNCTION actor_has_permission(p_permission_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.tenant_member tm JOIN public.tenant_member_role mr ON mr.tenant_id=tm.tenant_id AND mr.tenant_member_id=tm.id
 JOIN public.tenant_role_permission rp ON rp.tenant_id=mr.tenant_id AND rp.role_id=mr.role_id
 WHERE tm.tenant_id::text=nullif(current_setting('app.tenant_id',true),'') AND tm.actor_id=nullif(current_setting('app.actor_id',true),'')
 AND tm.membership_status='ACTIVE' AND rp.permission_key=p_permission_key) $$;
CREATE FUNCTION tenant_feature_decision(p_feature_key text) RETURNS TABLE(enabled boolean,value jsonb,source text,decision_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH context AS (SELECT nullif(current_setting('app.tenant_id',true),'')::uuid tenant_id WHERE public.tenant_actor_is_active(nullif(current_setting('app.tenant_id',true),'')::uuid)),
 override_decision AS (SELECT o.enabled,o.value,'OVERRIDE'::text source,o.id decision_id,1 precedence,o.valid_from FROM public.tenant_entitlement_override o JOIN context c ON c.tenant_id=o.tenant_id WHERE o.feature_key=p_feature_key AND o.valid_from<=now() AND (o.valid_until IS NULL OR o.valid_until>now()) ORDER BY o.valid_from DESC,o.id DESC LIMIT 1),
 base_decision AS (SELECT e.enabled,e.value,e.source,e.id decision_id,2 precedence,e.valid_from FROM public.tenant_entitlement e JOIN context c ON c.tenant_id=e.tenant_id WHERE e.feature_key=p_feature_key AND e.valid_from<=now() AND (e.valid_until IS NULL OR e.valid_until>now()) ORDER BY e.valid_from DESC,e.id DESC LIMIT 1),
 effective AS (SELECT * FROM override_decision UNION ALL SELECT * FROM base_decision)
 SELECT e.enabled,e.value,e.source,e.decision_id FROM effective e ORDER BY e.precedence LIMIT 1 $$;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['tenant_role','tenant_role_permission','tenant_member_role','team','team_member','contact','client_contact_relationship','address','client_address','tenant_entitlement','tenant_entitlement_override','tenant_setting'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I_tenant_actor ON %I TO accounts_app USING(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id)) WITH CHECK(tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''') AND tenant_actor_is_active(tenant_id))',table_name,table_name);
  EXECUTE format('CREATE POLICY %I_owner ON %I TO neondb_owner USING(true) WITH CHECK(true)',table_name,table_name);
 END LOOP;
END $$;
ALTER TABLE platform_user ENABLE ROW LEVEL SECURITY;ALTER TABLE platform_user FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_user_self ON platform_user FOR SELECT TO accounts_app USING(auth_provider='NEON_AUTH' AND external_subject=nullif(current_setting('app.actor_id',true),''));
CREATE POLICY platform_user_owner ON platform_user TO neondb_owner USING(true) WITH CHECK(true);
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['permission_definition','relationship_type_definition','product_definition','module_definition','feature_definition'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I_authenticated ON %I FOR SELECT TO accounts_app USING(tenant_actor_is_active(nullif(current_setting(''app.tenant_id'',true),'''')::uuid))',table_name,table_name);
  EXECUTE format('CREATE POLICY %I_owner ON %I TO neondb_owner USING(true) WITH CHECK(true)',table_name,table_name);
 END LOOP;
END $$;

DROP RULE audit_event_no_update ON audit_event;DROP RULE audit_event_no_delete ON audit_event;
CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_event is immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON audit_event FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

REVOKE ALL ON platform_user,permission_definition,tenant_role,tenant_role_permission,tenant_member_role,team,team_member,contact,
 relationship_type_definition,client_contact_relationship,address,client_address,product_definition,module_definition,feature_definition,
 tenant_entitlement,tenant_entitlement_override,tenant_setting FROM PUBLIC,accounts_app;
GRANT SELECT ON platform_user,permission_definition,tenant_role,tenant_role_permission,tenant_member_role,team,team_member,contact,
 relationship_type_definition,client_contact_relationship,address,client_address,product_definition,module_definition,feature_definition,
 tenant_entitlement,tenant_entitlement_override,tenant_setting TO accounts_app;
GRANT INSERT,UPDATE ON team,team_member,contact,client_contact_relationship,address,client_address,tenant_setting TO accounts_app;
GRANT INSERT,UPDATE ON tenant_role,tenant_role_permission,tenant_member_role TO accounts_app;
GRANT SELECT,INSERT,UPDATE ON tenant_entitlement_override TO accounts_app;
GRANT INSERT(id,tenant_id,legal_name,legal_form,jurisdiction,display_name,entity_type,client_code,responsible_member_id,responsible_team_id,primary_contact_id,primary_address_id,communication_preferences,created_by,updated_by) ON organisation TO accounts_app;
GRANT UPDATE(legal_name,legal_form,jurisdiction,display_name,entity_type,client_code,responsible_member_id,responsible_team_id,primary_contact_id,primary_address_id,communication_preferences,updated_by,updated_at,version) ON organisation TO accounts_app;
REVOKE ALL ON FUNCTION resolve_platform_user_membership(),seed_tenant_platform_defaults(uuid),seed_new_tenant_platform_defaults(),sync_legacy_member_role(),tenant_actor_is_active(uuid),actor_has_permission(text),tenant_feature_decision(text),reject_audit_event_mutation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_actor_is_active(uuid),actor_has_permission(text),tenant_feature_decision(text) TO accounts_app,neondb_owner;
INSERT INTO schema_migration(version,description) VALUES('0029','platform core canonical client authorization settings and entitlements') ON CONFLICT(version) DO NOTHING;
COMMIT;
