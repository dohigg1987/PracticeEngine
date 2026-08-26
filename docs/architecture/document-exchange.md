# Portal document exchange

## Metadata and object ownership

Postgres stores authorization and evidence metadata; Cloudflare R2 stores bytes. `portal_document` is the stable document concept and records tenant/client plus optional engagement, work, task and request context, display filename, visibility, current version and archival state. `portal_document_version` is immutable evidential metadata for each object key, original filename, detected media type, byte size, SHA-256 hash, uploader context/actor, scan state and supersession.

Visibility is explicit: `internal`, `shared_with_client`, `client_uploaded` or `restricted`. Portal selection policies expose only shared or client-uploaded documents and still require explicit client access. Sharing an engagement never implicitly publishes its internal files.

## Upload controls

The implemented portal upload is request-scoped and requires an addressed contributor or approver. It accepts a bounded multipart file of at most 10 MiB, sanitizes path/control characters from the filename, applies an allowlist, checks file signatures for PDF/PNG/JPEG, hashes the bytes, and generates an opaque key under:

`tenants/{tenant}/clients/{client}/portal-documents/{document}/v{version}-{random}`

The Worker sets safe attachment disposition, MIME and private metadata on the R2 object. The database transaction creates the document, version and response provenance. If the database transaction fails after upload, the Worker attempts R2 orphan cleanup. Duplicate display names are safe because object identity is independent of the filename.

The schema permits versions without overwriting the prior object. New versions increment `version`, update the document pointer and mark earlier evidence as superseded; prior R2 objects and metadata are retained according to retention policy.

## Malware-scanning boundary and download

No malware vendor is selected. Every upload starts `pending`; the modeled states are `pending`, `accepted`, `quarantined` and `rejected`. This is an honest integration seam: only `accepted` content can be downloaded. Operational tooling/provider integration is still required to move content out of pending.

Buckets remain private and objects are not listed to portal users. The controlled Worker download re-authorizes the tenant, principal, client and visibility, verifies the expected key prefix, byte size and stored SHA-256 metadata, then streams with `private, no-store`, safe attachment disposition and `nosniff`. A mismatched or missing object fails closed.
