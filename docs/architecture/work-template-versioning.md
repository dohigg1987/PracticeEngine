# Work-template versioning

Template versions use `draft`, `published`, `superseded` and `archived`. Drafts may be edited. Publishing requires at least one ordered task, supersedes the previous published member of the template family and makes the version historical. Published, superseded and used versions are immutable through the application service.

Generated `work_item` rows retain `source_template_id` and `source_template_version`; generated tasks retain `source_template_task_id`, sequence and mandatory state. Responsibility resolves the template role to an active member deterministically, then falls back to schedule member/team defaults. Task dates apply the template offset to the calculated work deadline or period end. Later template versions cannot rewrite existing work or tasks.
