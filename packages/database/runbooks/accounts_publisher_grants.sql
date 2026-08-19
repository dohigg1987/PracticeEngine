-- Password-free publisher role setup for migration 0018.
-- Run as neondb_owner. The login role and secret are provisioned separately
-- and the secret must exist only in the publisher Hyperdrive binding.

BEGIN;

REVOKE ALL PRIVILEGES ON DATABASE neondb FROM accounts_publisher;
GRANT CONNECT ON DATABASE neondb TO accounts_publisher;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM accounts_publisher;
GRANT USAGE ON SCHEMA public TO accounts_publisher;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM accounts_publisher;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM accounts_publisher;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM accounts_publisher;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM accounts_publisher;

REVOKE ALL ON FUNCTION
  claim_outbox_events(text,integer),
  complete_outbox_event(uuid,text,text,jsonb),
  fail_outbox_event(uuid,text,text,text,timestamptz,boolean,jsonb)
FROM accounts_publisher;
GRANT EXECUTE ON FUNCTION
  claim_outbox_events(text,integer),
  complete_outbox_event(uuid,text,text,jsonb),
  fail_outbox_event(uuid,text,text,text,timestamptz,boolean,jsonb)
TO accounts_publisher;

COMMIT;

-- Create a separate LOGIN role outside this file, grant accounts_publisher to
-- it, and bind that login only to the scheduled publisher Worker. Never grant
-- accounts_publisher to accounts_app and never reuse the public API credential.
