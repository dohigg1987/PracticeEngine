# Client requests and confirmations

## Request aggregate

`client_request` is the tenant-owned request aggregate. It belongs to a canonical client and may reference an engagement, work item and task. It records type (`information`, `document`, `confirmation`, `approval` or bounded `questionnaire`), title/description, responsible member/team, due date, priority, lifecycle status, completion mode, response requirements, reminder configuration and version.

`client_request_recipient` explicitly addresses the request to one `portal_client_access`; client access by itself is not enough to discover every request for that client. Staff creation validates that all recipient access rows belong to the selected tenant/client. Draft requests are not visible through the portal.

`client_request_response` preserves the portal principal, submitted time, request version and response kind. Text, structured data and boolean confirmation are mutually exclusive; document responses contain the new document/version identifiers. A tenant/request-scoped idempotency key makes replay return the existing response.

## Lifecycle and workflow

The schema supports `draft`, `open`, `viewed`, `responded`, `partially_complete`, `completed`, `cancelled` and `overdue`. The current API can create a draft or open request, accept portal responses while actionable, automatically complete only when `completion_mode=automatic`, and otherwise require the staff completion command. A document upload marks the request responded but never silently completes operational work.

Creation may put linked, non-terminal work into `waiting_on_client`. Portal response and completion emit `client_request.responded` and `client_request.completed` through the transactional outbox. Further unblock behavior belongs to the constrained workflow/automation boundary; the portal UI must not write work state directly.

Staff operations require `client_requests.view` or `client_requests.manage` plus `practice.enabled`, `practice.portal` and `practice.portal.requests`. Portal responses require an active addressed principal; uploads additionally require contributor or approver access.

## Generic client confirmations

`client_confirmation` preserves the addressed access row, relevant resource type/id, optional request, exact confirmation text/version, request provenance and one recorded response. A portal response requires approver access and changes the open item to confirmed or declined with actor and timestamp evidence. The command is idempotency-keyed and audited as `CLIENT_CONFIRMATION_COMPLETED` with outbox fact `client_confirmation.completed`.

This primitive records operational acknowledgement only. It is not an electronic-signature service and does not replace QuoteBench acceptance evidence or a specialist regulated-signature capability.
