-- Read-only inventory used to scope a pilot retention request.
-- Replace the UUID only on an isolated copy of this file or as a bound psql
-- variable. The query performs no deletion.

BEGIN TRANSACTION READ ONLY;

-- psql usage: \set tenant_id '00000000-0000-0000-0000-000000000000'
SELECT :'tenant_id'::uuid AS tenant_id,
       (SELECT count(*) FROM organisation WHERE tenant_id=:'tenant_id'::uuid) AS organisations,
       (SELECT count(*) FROM engagement WHERE tenant_id=:'tenant_id'::uuid) AS engagements,
       (SELECT count(*) FROM audit_event WHERE tenant_id=:'tenant_id'::uuid) AS audit_events,
       (SELECT count(*) FROM outbox_event WHERE tenant_id=:'tenant_id'::uuid) AS outbox_events,
       (SELECT count(*) FROM tenant_invitation WHERE tenant_id=:'tenant_id'::uuid) AS invitations;

SELECT CASE
         WHEN accepted_at IS NOT NULL THEN 'ACCEPTED'
         WHEN revoked_at IS NOT NULL THEN 'REVOKED'
         WHEN expires_at <= now() THEN 'EXPIRED'
         ELSE 'ACTIVE'
       END AS invitation_state,
       count(*) AS invitation_count,
       min(expires_at) AS earliest_expiry,
       max(expires_at) AS latest_expiry
FROM tenant_invitation
WHERE tenant_id=:'tenant_id'::uuid
GROUP BY invitation_state
ORDER BY invitation_state;

SELECT count(*) FILTER (WHERE published_at IS NOT NULL
                          AND published_at < now()-interval '90 days')
         AS delivered_over_90_days,
       count(*) FILTER (WHERE published_at IS NULL) AS unresolved_events,
       min(created_at) AS oldest_event
FROM outbox_event
WHERE tenant_id=:'tenant_id'::uuid;

COMMIT;
