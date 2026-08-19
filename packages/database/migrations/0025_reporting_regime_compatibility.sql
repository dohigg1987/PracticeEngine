BEGIN;

ALTER TABLE engagement
  ADD CONSTRAINT engagement_reporting_regime_compatibility_ck
  CHECK (
    sector_profile IS NULL
    OR sector_profile = 'NONE'
    OR (
      framework = 'FRS_102'
      AND sector_profile IN (
        'CHARITIES_SORP_2026',
        'ACADEMIES_2026',
        'LLP_SORP_2026'
      )
    )
  );

INSERT INTO schema_migration(version,description)
VALUES('0025','Prevent incompatible framework and sector reporting profiles');

COMMIT;
