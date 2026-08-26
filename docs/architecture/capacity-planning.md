# Capacity planning

## Deterministic model

For resource `r` and period `p` the service calculates:

`remaining(r,p) = pattern capacity + availability adjustments - committed generated work`

Pattern capacity is the sum of weekday minutes from the effective working pattern clipped to the requested day, week or month. Adjustments are summed once per applicable date. Committed load is planned effort from confirmed generated work, distributed over its planned period. Task estimates are used only when the parent work item has no authoritative planned/estimated effort, preventing parent and child estimates from being counted twice.

Negative remaining capacity is valid and reported as over-allocation. The planner does not silently reject an authorized management decision because remaining capacity is below zero.

## Committed and forecast load

Generated `work_item` records are committed operational load. PM-003 `recurring_work_schedule` occurrences not yet generated may contribute a separate forecast load when a template estimate exists. Forecast load is never merged into committed load or described as assigned work. Generated work wins for the same schedule occurrence, so an occurrence cannot contribute to both buckets.

The capacity read model exposes available minutes, committed minutes, forecast minutes and committed-only remaining minutes separately. `forecastRemainingMinutes` and `forecastOverallocated` show the scenario after forecast load without changing the meaning of committed remaining capacity. Daily values aggregate deterministically into weekly and monthly views. The period, resource, team and source work/schedule identifiers provide drill-through and explainability.

## Value semantics

| Value | Classification | Rule |
| --- | --- | --- |
| Working pattern and adjustment | Transactional | Effective-dated source facts |
| Work/task estimates and planned effort | Transactional | Nullable; absence means unknown, not zero |
| Available, committed, forecast and remaining minutes | Derived | Recalculated from source facts for the requested period |
| Capacity query result | Cached only if needed | Cache is disposable and keyed by tenant, period and source version |
| Historical management report | Snapshot only when published | Retains source identifiers and calculation period |

Zero means a known calculation produced zero. `null`/unavailable means a required estimate or pattern does not exist. A missing estimate must not be treated as zero workload.

## Authorization and presentation

Reads require `practice.capacity` plus `capacity.view`; changes to patterns/adjustments require `capacity.manage`; allocation changes require `assignments.manage`. Resource/team scope is checked server-side. The Fluent UI view uses a dense DataGrid with accessible numeric load and semantic status, not decorative heatmaps or drag-and-drop.
