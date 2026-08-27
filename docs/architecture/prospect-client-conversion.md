# Prospect-to-client conversion
The accepted QuoteBench event is processed in one tenant transaction. The proposal reference and opportunity are locked, the `specialist_event_receipt` event ID is checked, and `crm_conversion` records the deterministic result. Database uniqueness on the acceptance event, opportunity/proposal pair and opportunity-service activation is the final concurrency boundary.

For a prospect, conversion creates one canonical `organisation`, links existing `contact` records, activates each accepted `practice_service` as a `client_service`, activates one `practice_engagement`, starts an `onboarding_case`, optionally instantiates a published onboarding work template, and queues an in-application notification. For an opportunity already attached to an active client, the same process adds services and an engagement without creating another client.

Conversion provenance is retained on the prospect, organisation, proposal reference and `crm_conversion`. Mutable names/contact details remain owned by the canonical client/contact records after conversion. `client_service.delivery_readiness` distinguishes commercial acceptance, onboarding, ready-for-delivery and active delivery; an operationally active row may remain gated at onboarding until mandatory gates clear.

Ledgerly-backed service activation evaluates `ledgerly.enabled` plus the configured capability before any specialist-associated service is created. PM-005 does not create Ledgerly accounting structures. Recurring work remains owned by the existing recurrence service and is created only from a compatible published template/configuration, never as an unbounded series of work items.

Audit/outbox evidence covers proposal acceptance, prospect conversion, client creation, client-service activation, engagement activation, onboarding start/completion and notification queueing. Any failed step rolls the complete transaction back.
