# Operational review and approval

`practice_review` is the generic operational review for professional-services delivery. It can reference a Practice task or workflow stage and records preparer, reviewer, optional approver, request, progress and decision evidence. It does not replace or write to Ledgerly review points, accounts versions or technical sign-offs.

Reviews progress through requested, in progress, changes requested, approved, rejected, completed and reopened. `practice_review_point` provides lightweight operational findings with open, addressed, cleared and reopened states. Approval is blocked while a point remains open or reopened.

Request, perform, approve and override permissions are separate. Where segregation is configured, the authenticated tenant member corresponding to the preparer cannot approve. This check is server-side and is reinforced by tenant-safe database constraints for designated members. Required approval gates prevent final work completion. Overrides require explicit permission and reason and append audit/outbox evidence.

The review queue is tenant-scoped and exposes client, service, work, stage, preparer, reviewer, due date, status and waiting time without authentication subjects.
