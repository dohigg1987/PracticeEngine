# Deadline engine

`deadline_rule` stores a named, tenant-owned rule and bounded configuration. The engine supports days after period end, days before a reference date, a fixed calendar day, months after period end, months plus/minus days, explicit dates and a configurable months/days primitive. Calendar calculations use ISO dates and UTC arithmetic; practice timezone is retained on the tenant for future business-day and local-cutoff policies.

Generated work stores `calculated_due_date`, the effective `due_date`, rule ID and JSON calculation provenance containing the rule, inputs and calculation time. A manual override sets the effective date plus reason, actor and timestamp. Recalculation may update the calculated value but must never replace an effective date while `due_date_overridden` is true. Audit/outbox facts distinguish calculation, recalculation and override.
