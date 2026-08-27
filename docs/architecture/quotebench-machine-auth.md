# QuoteBench machine authentication

## Signed request contract

QuoteBench proposal events use Ed25519 asymmetric request signing. PracticeEngine stores public JWKs in `quotebench_machine_key`; private keys are never sent to or stored by PracticeEngine. Keys are identified by a bounded key ID and may be active, retiring or revoked, with effective and expiry timestamps so rotation can overlap active and retiring keys safely.

The event request supplies tenant ID, key ID, event ID, signed timestamp, expiry and base64url signature headers. The canonical signed value is the newline-joined HTTP method, URL pathname, tenant ID, event ID, normalized signed timestamp, normalized expiry and SHA-256 payload hash. The payload is capped at 1 MiB. Any body, tenant, event, path or time change invalidates the signature.

The Worker accepts timestamps no more than five minutes old or one minute in the future and requires expiry after receipt but no more than five minutes after signing. It resolves only active/retiring effective public keys, verifies the Ed25519 signature, strips any caller authorization header, and forwards an internal verified marker plus hash/key/event metadata. The application actor becomes `quotebench:{key_id}`.

## Replay, tenancy and authorization

After cryptographic verification, the QuoteBench event transaction calls `claim_quotebench_request`. `quotebench_request_receipt` uniquely records tenant/event ID and tenant/key/payload/timestamp; duplicates and stale requests fail closed. The existing `specialist_event_receipt` remains the domain-event idempotency record, so transport replay protection and business event idempotency are distinct controls.

Machine requests are accepted only on `POST /v1/integrations/quotebench/events`. The tenant in the signature is also the transaction tenant. The application checks machine-safe `quotebench.enabled` and `quotebench.proposals` decisions, then validates all referenced Practice records in that tenant. Machine authentication does not confer staff permissions or bypass specialist entitlements.

No shared bearer secret, production key or production deployment is included. Key provisioning/revocation is an owner-controlled operational process. Tests cover missing/invalid signatures, payload alteration, time windows, replay, tenant/context mismatch and active/retiring/revoked key behavior.
