BEGIN;

ALTER TABLE organisation_permanent_profile
  ADD COLUMN officer_name_style text NOT NULL DEFAULT 'FULL_NAME'
    CHECK(officer_name_style IN ('FULL_NAME','TITLE_AND_SURNAME','INITIALS_AND_SURNAME','FULL_NAME_WITH_HONOURS'));

ALTER TABLE organisation_officer
  ADD COLUMN title text,
  ADD COLUMN given_names text,
  ADD COLUMN middle_names text,
  ADD COLUMN family_name text,
  ADD COLUMN suffix_honours text;

ALTER TABLE organisation_professional_adviser
  ADD COLUMN contact_qualifications text,
  ADD COLUMN professional_body text
    CHECK(professional_body IS NULL OR professional_body IN ('ICAEW','ACCA','ICAS','CAI','AAT','ACIE','OTHER')),
  ADD COLUMN report_style text NOT NULL DEFAULT 'GENERIC'
    CHECK(report_style IN ('GENERIC','ICAEW','ACCA','ICAS','CAI','CUSTOM_APPROVED'));

GRANT UPDATE(officer_name_style) ON organisation_permanent_profile TO accounts_app;
GRANT INSERT(title,given_names,middle_names,family_name,suffix_honours) ON organisation_officer TO accounts_app;
GRANT UPDATE(title,given_names,middle_names,family_name,suffix_honours) ON organisation_officer TO accounts_app;
GRANT INSERT(contact_qualifications,professional_body,report_style) ON organisation_professional_adviser TO accounts_app;
GRANT UPDATE(contact_qualifications,professional_body,report_style) ON organisation_professional_adviser TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0023','Client name presentation and governed assurance-report style metadata');

COMMIT;
