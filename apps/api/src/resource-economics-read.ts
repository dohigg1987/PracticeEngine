import type { PlatformTX } from "./platform-core.ts";
import { calculateEconomicPosition } from "./resource-economics-core.ts";

export function loadResourceListRows(tx:PlatformTX,tenantId:string){
  return tx`
    with work_load as(
      select tenant_id,assigned_member_id,
        sum(coalesce(planned_effort_minutes,remaining_effort_minutes,estimated_effort_minutes,0)) assigned_minutes,
        count(*) filter(where due_date<current_date)::int overdue_work
      from work_item
      where tenant_id=${tenantId} and assigned_member_id is not null and status not in ('completed','cancelled')
      group by tenant_id,assigned_member_id
    )
    select rp.tenant_member_id id,tm.display_name,string_agg(distinct t.name,', ' order by t.name) team_name,
      rp.job_title role_title,rp.resource_status status,round(rp.standard_capacity_minutes_week/60.0,2)::float8 weekly_capacity_hours,
      round(coalesce(load.assigned_minutes,0)/60.0,2)::float8 assigned_hours,
      round((rp.standard_capacity_minutes_week-coalesce(load.assigned_minutes,0))/60.0,2)::float8 available_hours,
      case when rp.standard_capacity_minutes_week=0 then 0 else round(coalesce(load.assigned_minutes,0)*100.0/rp.standard_capacity_minutes_week,2)::float8 end utilisation_percentage,
      coalesce(load.overdue_work,0)::int overdue_work
    from resource_profile rp join tenant_member tm on tm.tenant_id=rp.tenant_id and tm.id=rp.tenant_member_id
    left join team_member tmm on tmm.tenant_id=rp.tenant_id and tmm.tenant_member_id=rp.tenant_member_id
    left join team t on t.tenant_id=tmm.tenant_id and t.id=tmm.team_id
    left join work_load load on load.tenant_id=rp.tenant_id and load.assigned_member_id=rp.tenant_member_id
    where rp.tenant_id=${tenantId}
    group by rp.tenant_id,rp.tenant_member_id,tm.id,load.assigned_minutes,load.overdue_work
    order by tm.display_name,rp.tenant_member_id`;
}

export function loadEconomicsOverviewRow(tx:PlatformTX,tenantId:string){
  return tx`
    with work_stats as(
      select count(*) filter(where due_date between current_date and current_date+6)::int due_this_week,
        count(*) filter(where due_date<current_date and status not in ('completed','cancelled'))::int overdue_work,
        count(*) filter(where status='waiting_on_client')::int waiting_on_client,
        count(*) filter(where status='review')::int review_queue
      from work_item where tenant_id=${tenantId}
    ),
    resource_work_load as(
      select tenant_id,assigned_member_id,
        sum(coalesce(remaining_effort_minutes,planned_effort_minutes,estimated_effort_minutes,0)) assigned_minutes
      from work_item
      where tenant_id=${tenantId} and assigned_member_id is not null and status not in ('completed','cancelled')
      group by tenant_id,assigned_member_id
    ),
    resource_stats as(
      select coalesce(sum(rp.standard_capacity_minutes_week),0)::bigint capacity_minutes,
        coalesce(sum(load.assigned_minutes),0)::bigint assigned_minutes
      from resource_profile rp
      left join resource_work_load load on load.tenant_id=rp.tenant_id and load.assigned_member_id=rp.tenant_member_id
      where rp.tenant_id=${tenantId} and rp.resource_status='active'
    ),
    time_stats as(
      select tenant_id,client_service_id,
        case when count(*) filter(where cost_amount_snapshot is null)>0 then null else coalesce(sum(cost_amount_snapshot),0) end internal_cost,
        case when count(*) filter(where classification='billable' and billable_value_snapshot is null)>0 then null else sum(billable_value_snapshot) end billable_value,
        max(currency) currency
      from time_entry where tenant_id=${tenantId} and status<>'rejected' group by tenant_id,client_service_id
    ),
    commercial_stats as(
      select tenant_id,client_service_id,sum(agreed_value) accepted_revenue,max(currency) currency
      from work_commercial_context
      where tenant_id=${tenantId} and effective_from<=current_date and (effective_to is null or effective_to>=current_date)
      group by tenant_id,client_service_id
    ),
    recovery_stats as(
      select tenant_id,client_service_id,sum(amount) filter(where recovery_type='billed') billed_amount,max(currency) currency
      from billing_recovery where tenant_id=${tenantId} group by tenant_id,client_service_id
    ),
    service_economics as(
      select o.display_name client_name,ps.name service_name,ts.internal_cost,ts.billable_value,
        cms.accepted_revenue,rs.billed_amount,coalesce(ts.currency,cms.currency,rs.currency,'GBP') currency
      from organisation o join client_service cs on cs.tenant_id=o.tenant_id and cs.client_id=o.id
      join practice_service ps on ps.tenant_id=cs.tenant_id and ps.id=cs.service_id
      left join time_stats ts on ts.tenant_id=cs.tenant_id and ts.client_service_id=cs.id
      left join commercial_stats cms on cms.tenant_id=cs.tenant_id and cms.client_service_id=cs.id
      left join recovery_stats rs on rs.tenant_id=cs.tenant_id and rs.client_service_id=cs.id
      where o.tenant_id=${tenantId}
    ),
    economics_summary as(
      select json_agg(json_build_object(
          'internal_cost',internal_cost,'billable_value',billable_value,'accepted_revenue',accepted_revenue,
          'billed_amount',billed_amount,'currency',currency
        ) order by client_name,service_name) economics_items
      from service_economics
    )
    select w.due_this_week,w.overdue_work,w.waiting_on_client,w.review_queue,
      r.capacity_minutes,r.assigned_minutes,e.economics_items
    from work_stats w cross join resource_stats r cross join economics_summary e`;
}

export function buildEconomicsOverviewItem(overview:Record<string,unknown>|undefined){
  const capacityMinutes=Number(overview?.capacity_minutes??0),assignedMinutes=Number(overview?.assigned_minutes??0);
  const rows=(overview?.economics_items as Record<string,unknown>[]|null)??[];
  const positions=rows.map(row=>calculateEconomicPosition({
    actualMinutes:0,
    internalCost:row.internal_cost===null?null:Number(row.internal_cost),
    billableValue:row.billable_value===null?null:Number(row.billable_value),
    acceptedRevenue:row.accepted_revenue===null?null:Number(row.accepted_revenue),
    billedAmount:row.billed_amount===null?null:Number(row.billed_amount),
  }));
  const wipUnavailable=positions.some(position=>position.wipBalance===null);
  return {
    due_this_week:Number(overview?.due_this_week??0),
    overdue_work:Number(overview?.overdue_work??0),
    waiting_on_client:Number(overview?.waiting_on_client??0),
    review_queue:Number(overview?.review_queue??0),
    capacity_utilisation_percentage:capacityMinutes===0?0:Number((assignedMinutes*100/capacityMinutes).toFixed(2)),
    forecast_capacity_hours:Number(((capacityMinutes-assignedMinutes)/60).toFixed(2)),
    wip_amount:wipUnavailable?null:positions.reduce((sum,position)=>sum+(position.wipBalance??0),0),
    economic_exceptions:positions.filter(position=>position.status.cost==="unavailable"||position.status.revenue==="unavailable").length,
    currency:rows.length?String(rows[0]!.currency):undefined,
  };
}
