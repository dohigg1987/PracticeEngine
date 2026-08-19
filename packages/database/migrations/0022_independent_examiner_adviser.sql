BEGIN;

ALTER TABLE organisation_professional_adviser
  DROP CONSTRAINT organisation_professional_adviser_adviser_type_check;

ALTER TABLE organisation_professional_adviser
  ADD CONSTRAINT organisation_professional_adviser_adviser_type_check
  CHECK(adviser_type IN ('ACCOUNTANT','AUDITOR','INDEPENDENT_EXAMINER','BANKER','SOLICITOR','TAX_ADVISER','INSURER','INVESTMENT_MANAGER','OTHER'));

GRANT UPDATE(legal_form) ON organisation TO accounts_app;

INSERT INTO schema_migration(version,description)
VALUES('0022','Independent examiner adviser type and controlled legal-form maintenance');

COMMIT;
