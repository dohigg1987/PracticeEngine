BEGIN;

CREATE FUNCTION organisation_actor_can_manage(p_tenant_id uuid,p_organisation_id uuid)
RETURNS boolean LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS 'SELECT p_tenant_id::text=nullif(current_setting(''app.tenant_id'',true),'''')
  AND EXISTS(SELECT 1 FROM public.organisation o WHERE o.tenant_id=p_tenant_id AND o.id=p_organisation_id)
  AND (
    EXISTS(SELECT 1 FROM public.tenant_member tm
      WHERE tm.tenant_id=p_tenant_id
        AND tm.actor_id=nullif(btrim(current_setting(''app.actor_id'',true)),'''')
        AND tm.role_code IN (''OWNER'',''ADMIN''))
    OR EXISTS(SELECT 1 FROM public.engagement e
      JOIN public.engagement_member em ON em.tenant_id=e.tenant_id AND em.engagement_id=e.id
      WHERE e.tenant_id=p_tenant_id AND e.organisation_id=p_organisation_id
        AND em.actor_id=nullif(btrim(current_setting(''app.actor_id'',true)),'''')
        AND em.role_code IN (''PARTNER'',''MANAGER''))
  )';

CREATE TABLE organisation_permanent_profile(
  tenant_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  trading_name text,
  company_registration_number text,
  charity_registration_number text,
  registered_office_line1 text,
  registered_office_line2 text,
  registered_office_locality text,
  registered_office_region text,
  registered_office_postal_code text,
  registered_office_country_code text,
  accounting_reference_month smallint,
  accounting_reference_day smallint,
  principal_activity text,
  website text,
  telephone text,
  notes text,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,organisation_id),
  FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id),
  CHECK(trading_name IS NULL OR btrim(trading_name)<>''),
  CHECK(company_registration_number IS NULL OR btrim(company_registration_number)<>'' AND char_length(company_registration_number)<=50),
  CHECK(charity_registration_number IS NULL OR btrim(charity_registration_number)<>'' AND char_length(charity_registration_number)<=50),
  CHECK((registered_office_line1 IS NULL AND registered_office_line2 IS NULL AND registered_office_locality IS NULL AND registered_office_region IS NULL AND registered_office_postal_code IS NULL AND registered_office_country_code IS NULL)
    OR (btrim(coalesce(registered_office_line1,''))<>'' AND registered_office_country_code ~ '^[A-Z]{2}$')),
  CHECK((accounting_reference_month IS NULL)=(accounting_reference_day IS NULL)),
  CHECK(accounting_reference_month IS NULL OR accounting_reference_month BETWEEN 1 AND 12),
  CHECK(accounting_reference_day IS NULL OR accounting_reference_day BETWEEN 1 AND CASE accounting_reference_month WHEN 2 THEN 29 WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END),
  CHECK(principal_activity IS NULL OR btrim(principal_activity)<>'' AND char_length(principal_activity)<=1000),
  CHECK(website IS NULL OR website ~ '^https?://[^[:space:]]+$'),
  CHECK(telephone IS NULL OR btrim(telephone)<>''),
  CHECK(notes IS NULL OR btrim(notes)<>'' AND char_length(notes)<=5000),
  CHECK(updated_at>=created_at)
);

CREATE TABLE organisation_officer(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  officer_type text NOT NULL CHECK(officer_type IN ('DIRECTOR','TRUSTEE','COMPANY_SECRETARY','PARTNER','DESIGNATED_MEMBER','LLP_MEMBER','OTHER')),
  display_name text NOT NULL CHECK(btrim(display_name)<>''),
  appointed_on date NOT NULL,
  resigned_on date,
  occupation text,
  nationality text,
  country_of_residence text,
  service_address_line1 text,
  service_address_line2 text,
  service_address_locality text,
  service_address_region text,
  service_address_postal_code text,
  service_address_country_code text,
  email text,
  telephone text,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,organisation_id,id),
  FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id),
  CHECK(resigned_on IS NULL OR resigned_on>=appointed_on),
  CHECK(occupation IS NULL OR btrim(occupation)<>''),
  CHECK(nationality IS NULL OR btrim(nationality)<>''),
  CHECK(country_of_residence IS NULL OR btrim(country_of_residence)<>''),
  CHECK((service_address_line1 IS NULL AND service_address_line2 IS NULL AND service_address_locality IS NULL AND service_address_region IS NULL AND service_address_postal_code IS NULL AND service_address_country_code IS NULL)
    OR (btrim(coalesce(service_address_line1,''))<>'' AND service_address_country_code ~ '^[A-Z]{2}$')),
  CHECK(email IS NULL OR email=lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  CHECK(telephone IS NULL OR btrim(telephone)<>''),
  CHECK(updated_at>=created_at)
);

CREATE TABLE organisation_professional_adviser(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  adviser_type text NOT NULL CHECK(adviser_type IN ('ACCOUNTANT','AUDITOR','BANKER','SOLICITOR','TAX_ADVISER','INSURER','INVESTMENT_MANAGER','OTHER')),
  firm_name text NOT NULL CHECK(btrim(firm_name)<>''),
  contact_name text,
  address_line1 text,
  address_line2 text,
  address_locality text,
  address_region text,
  address_postal_code text,
  address_country_code text,
  email text,
  telephone text,
  reference text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ENDED')),
  active_from date NOT NULL,
  active_to date,
  created_by text NOT NULL CHECK(btrim(created_by)<>''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK(btrim(updated_by)<>''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,organisation_id,id),
  FOREIGN KEY(tenant_id,organisation_id) REFERENCES organisation(tenant_id,id),
  CHECK(contact_name IS NULL OR btrim(contact_name)<>''),
  CHECK((address_line1 IS NULL AND address_line2 IS NULL AND address_locality IS NULL AND address_region IS NULL AND address_postal_code IS NULL AND address_country_code IS NULL)
    OR (btrim(coalesce(address_line1,''))<>'' AND address_country_code ~ '^[A-Z]{2}$')),
  CHECK(email IS NULL OR email=lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  CHECK(telephone IS NULL OR btrim(telephone)<>''),
  CHECK(reference IS NULL OR btrim(reference)<>''),
  CHECK((status='ACTIVE' AND active_to IS NULL) OR (status='ENDED' AND active_to IS NOT NULL)),
  CHECK(active_to IS NULL OR active_to>=active_from),
  CHECK(updated_at>=created_at)
);

CREATE INDEX organisation_officer_active_idx ON organisation_officer(tenant_id,organisation_id,officer_type,display_name) WHERE resigned_on IS NULL;
CREATE INDEX organisation_adviser_active_idx ON organisation_professional_adviser(tenant_id,organisation_id,adviser_type,firm_name) WHERE status='ACTIVE';

CREATE RULE organisation_permanent_profile_no_delete AS ON DELETE TO organisation_permanent_profile DO INSTEAD NOTHING;
CREATE RULE organisation_officer_no_delete AS ON DELETE TO organisation_officer DO INSTEAD NOTHING;
CREATE RULE organisation_professional_adviser_no_delete AS ON DELETE TO organisation_professional_adviser DO INSTEAD NOTHING;

ALTER TABLE organisation_permanent_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_permanent_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE organisation_officer ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_officer FORCE ROW LEVEL SECURITY;
ALTER TABLE organisation_professional_adviser ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_professional_adviser FORCE ROW LEVEL SECURITY;

CREATE POLICY permanent_profile_read ON organisation_permanent_profile FOR SELECT TO accounts_app
USING(organisation_actor_can_manage(tenant_id,organisation_id));
CREATE POLICY permanent_profile_insert ON organisation_permanent_profile FOR INSERT TO accounts_app
WITH CHECK(organisation_actor_can_manage(tenant_id,organisation_id) AND created_by=nullif(current_setting('app.actor_id',true),'') AND updated_by=created_by);
CREATE POLICY permanent_profile_update ON organisation_permanent_profile FOR UPDATE TO accounts_app
USING(organisation_actor_can_manage(tenant_id,organisation_id))
WITH CHECK(organisation_actor_can_manage(tenant_id,organisation_id) AND updated_by=nullif(current_setting('app.actor_id',true),''));

CREATE POLICY organisation_officer_read ON organisation_officer FOR SELECT TO accounts_app
USING(organisation_actor_can_manage(tenant_id,organisation_id));
CREATE POLICY organisation_officer_insert ON organisation_officer FOR INSERT TO accounts_app
WITH CHECK(organisation_actor_can_manage(tenant_id,organisation_id) AND created_by=nullif(current_setting('app.actor_id',true),'') AND updated_by=created_by);
CREATE POLICY organisation_officer_update ON organisation_officer FOR UPDATE TO accounts_app
USING(organisation_actor_can_manage(tenant_id,organisation_id))
WITH CHECK(organisation_actor_can_manage(tenant_id,organisation_id) AND updated_by=nullif(current_setting('app.actor_id',true),''));

CREATE POLICY organisation_adviser_read ON organisation_professional_adviser FOR SELECT TO accounts_app
USING(organisation_actor_can_manage(tenant_id,organisation_id));
CREATE POLICY organisation_adviser_insert ON organisation_professional_adviser FOR INSERT TO accounts_app
WITH CHECK(organisation_actor_can_manage(tenant_id,organisation_id) AND created_by=nullif(current_setting('app.actor_id',true),'') AND updated_by=created_by);
CREATE POLICY organisation_adviser_update ON organisation_professional_adviser FOR UPDATE TO accounts_app
USING(organisation_actor_can_manage(tenant_id,organisation_id))
WITH CHECK(organisation_actor_can_manage(tenant_id,organisation_id) AND updated_by=nullif(current_setting('app.actor_id',true),''));

CREATE POLICY permanent_profile_owner ON organisation_permanent_profile TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY organisation_officer_owner ON organisation_officer TO neondb_owner USING(true) WITH CHECK(true);
CREATE POLICY organisation_adviser_owner ON organisation_professional_adviser TO neondb_owner USING(true) WITH CHECK(true);

REVOKE ALL ON organisation_permanent_profile,organisation_officer,organisation_professional_adviser FROM PUBLIC,accounts_app;
GRANT SELECT ON organisation_permanent_profile,organisation_officer,organisation_professional_adviser TO accounts_app;
GRANT INSERT(tenant_id,organisation_id,trading_name,company_registration_number,charity_registration_number,registered_office_line1,registered_office_line2,registered_office_locality,registered_office_region,registered_office_postal_code,registered_office_country_code,accounting_reference_month,accounting_reference_day,principal_activity,website,telephone,notes,created_by,updated_by) ON organisation_permanent_profile TO accounts_app;
GRANT UPDATE(trading_name,company_registration_number,charity_registration_number,registered_office_line1,registered_office_line2,registered_office_locality,registered_office_region,registered_office_postal_code,registered_office_country_code,accounting_reference_month,accounting_reference_day,principal_activity,website,telephone,notes,updated_by,updated_at) ON organisation_permanent_profile TO accounts_app;
GRANT INSERT(id,tenant_id,organisation_id,officer_type,display_name,appointed_on,resigned_on,occupation,nationality,country_of_residence,service_address_line1,service_address_line2,service_address_locality,service_address_region,service_address_postal_code,service_address_country_code,email,telephone,created_by,updated_by) ON organisation_officer TO accounts_app;
GRANT UPDATE(officer_type,display_name,appointed_on,resigned_on,occupation,nationality,country_of_residence,service_address_line1,service_address_line2,service_address_locality,service_address_region,service_address_postal_code,service_address_country_code,email,telephone,updated_by,updated_at) ON organisation_officer TO accounts_app;
GRANT INSERT(id,tenant_id,organisation_id,adviser_type,firm_name,contact_name,address_line1,address_line2,address_locality,address_region,address_postal_code,address_country_code,email,telephone,reference,status,active_from,active_to,created_by,updated_by) ON organisation_professional_adviser TO accounts_app;
GRANT UPDATE(adviser_type,firm_name,contact_name,address_line1,address_line2,address_locality,address_region,address_postal_code,address_country_code,email,telephone,reference,status,active_from,active_to,updated_by,updated_at) ON organisation_professional_adviser TO accounts_app;

REVOKE ALL ON FUNCTION organisation_actor_can_manage(uuid,uuid) FROM PUBLIC,accounts_app;
GRANT EXECUTE ON FUNCTION organisation_actor_can_manage(uuid,uuid) TO accounts_app,neondb_owner;

INSERT INTO schema_migration(version,description)
VALUES('0019','client permanent profile officers and professional advisers')
ON CONFLICT(version) DO NOTHING;

COMMIT;
