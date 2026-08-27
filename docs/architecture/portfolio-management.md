# Portfolio management

## Read model

Portfolio management is a Practice Management read model over existing ownership and work data. It does not introduce a second client owner, team, service, work or economics master. `organisation.responsible_user_id`/`responsible_team_id` and the current work assignment remain authoritative.

The portfolio query supports responsible owner, team, client, service and period filters and returns clients/services, assigned and overdue work, upcoming deadlines, waiting/review exceptions, committed and forecast capacity pressure, and WIP/margin only where those economic values are calculable.

## Decision-oriented metrics

Every field supports drill-through to operational evidence:

- workload to work item/task and assignment history;
- deadlines/ageing to due-date and workflow state;
- committed versus forecast pressure to generated work versus ungenerated recurrence;
- effort/cost to time entries and captured valuations;
- commercial/recovery values to their provenance records.

Unknown economics remain explicitly unavailable. Aggregations do not convert absent commercial or recovery data to zero, combine incompatible currencies or imply that a forecast occurrence is committed.

## Authorization and presentation

Portfolio access requires `practice.reporting` plus `portfolio.view`. Capacity fields additionally require `practice.capacity`/`capacity.view`; restricted economics require `practice.economics` and `economics.view`. The server removes fields the actor cannot see rather than relying on a hidden browser column.

The People, Capacity, Practice, Team and Partner/Portfolio surfaces use Fluent UI React v9 DataGrid/table patterns, left-aligned dense information, semantic status text and accessible numeric values. Charts are used only when they improve a management decision. Decorative cards, gradients, oversized metric blocks, arbitrary colours and consumer heatmaps remain prohibited.

Portfolio views are derived and may use a disposable cache. A formally published report may be snapshotted with source version and calculation period; neither cache nor snapshot becomes a second ownership model.
