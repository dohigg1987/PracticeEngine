import type { PlatformTX } from "./platform-core.ts";
import { evaluateRecurrence, type RecurrenceRule } from "./practice-scheduling.ts";
import {
  calculateDailyCapacity,
  rollupCapacity,
  selectWorkEstimate,
  type AvailabilityAdjustment,
  type CapacityCommitment,
  type WorkingPattern,
} from "./resource-economics-core.ts";

function databaseDate(value:unknown):string{
  if(value instanceof Date)return value.toISOString().slice(0,10);
  const text=String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text)?text.slice(0,10):text;
}

export async function loadCapacityRows(tx:PlatformTX,tenantId:string,from:string,to:string,filter:string|null){
  const [profiles,patterns,adjustments,works,schedules]=await Promise.all([
    tx`select rp.tenant_member_id,tm.display_name,string_agg(distinct t.name,', ' order by t.name) team_name
      from resource_profile rp join tenant_member tm on tm.tenant_id=rp.tenant_id and tm.id=rp.tenant_member_id
      left join team_member tmm on tmm.tenant_id=rp.tenant_id and tmm.tenant_member_id=rp.tenant_member_id
      left join team t on t.tenant_id=tmm.tenant_id and t.id=tmm.team_id
      where rp.tenant_id=${tenantId} and (${filter}::uuid is null or rp.tenant_member_id=${filter})
      group by rp.tenant_id,rp.tenant_member_id,tm.id order by tm.display_name`,
    tx`select tenant_member_id,effective_from,effective_to,monday_minutes,tuesday_minutes,wednesday_minutes,
        thursday_minutes,friday_minutes,saturday_minutes,sunday_minutes
      from resource_working_pattern
      where tenant_id=${tenantId} and (${filter}::uuid is null or tenant_member_id=${filter})
        and effective_from<=${to} and (effective_to is null or effective_to>=${from})
      order by tenant_member_id,effective_from`,
    tx`select tenant_member_id,starts_on,ends_on,capacity_delta_minutes
      from resource_availability_adjustment
      where tenant_id=${tenantId} and (${filter}::uuid is null or tenant_member_id=${filter})
        and starts_on<=${to} and ends_on>=${from}
      order by tenant_member_id,starts_on,id`,
    tx`select w.id,w.assigned_member_id tenant_member_id,w.planned_start_date,w.planned_end_date,w.due_date,
        w.planned_effort_minutes,w.estimated_effort_minutes,
        array_agg(pt.estimated_effort_minutes order by pt.id) filter(where pt.id is not null) task_estimates
      from work_item w left join practice_task pt on pt.tenant_id=w.tenant_id and pt.work_item_id=w.id
      where w.tenant_id=${tenantId} and (${filter}::uuid is null or w.assigned_member_id=${filter})
        and w.assigned_member_id is not null and w.status not in ('completed','cancelled')
        and coalesce(w.planned_start_date,w.due_date)<=${to}
        and coalesce(w.planned_end_date,w.due_date,w.planned_start_date)>=${from}
      group by w.id order by w.assigned_member_id,w.id`,
    tx`select r.id,r.default_assignee_member_id tenant_member_id,r.recurrence_rule,r.effective_from,r.effective_to,
        r.next_occurrence_date,wt.estimated_effort_minutes,
        coalesce(array_agg(g.occurrence_date order by g.occurrence_date)
          filter(where g.occurrence_date is not null),'{}'::date[]) generated_occurrence_dates
      from recurring_work_schedule r join work_template wt on wt.tenant_id=r.tenant_id and wt.id=r.work_template_id
      left join recurrence_generation g on g.tenant_id=r.tenant_id and g.recurring_schedule_id=r.id
        and g.status='generated' and g.occurrence_date between ${from} and ${to}
      where r.tenant_id=${tenantId} and (${filter}::uuid is null or r.default_assignee_member_id=${filter})
        and r.default_assignee_member_id is not null and r.status='active' and r.effective_from<=${to}
        and (r.effective_to is null or r.effective_to>=${from})
      group by r.id,r.default_assignee_member_id,r.recurrence_rule,r.effective_from,r.effective_to,
        r.next_occurrence_date,wt.estimated_effort_minutes
      order by r.default_assignee_member_id,r.id`,
  ]);
  return {profiles,patterns,adjustments,works,schedules};
}

type CapacityRows=Awaited<ReturnType<typeof loadCapacityRows>>;

function rowsByMember(rows:readonly Record<string,unknown>[]):Map<string,Record<string,unknown>[]>{
  const grouped=new Map<string,Record<string,unknown>[]>();
  for(const row of rows){
    const memberId=String(row.tenant_member_id),members=grouped.get(memberId)??[];
    members.push(row);grouped.set(memberId,members);
  }
  return grouped;
}

export function buildCapacityItems(data:CapacityRows,from:string,to:string,grain:"day"|"week"|"month"){
  const patternsByMember=rowsByMember(data.patterns),adjustmentsByMember=rowsByMember(data.adjustments),
    worksByMember=rowsByMember(data.works),schedulesByMember=rowsByMember(data.schedules);
  return data.profiles.map(profile=>{
    const memberId=String(profile.tenant_member_id);
    const patterns=patternsByMember.get(memberId)??[],adjustments=adjustmentsByMember.get(memberId)??[],
      works=worksByMember.get(memberId)??[],schedules=schedulesByMember.get(memberId)??[];
    const commitments:CapacityCommitment[]=works.map(row=>{
      const selected=selectWorkEstimate(row.planned_effort_minutes===null?Number(row.estimated_effort_minutes):Number(row.planned_effort_minutes),(row.task_estimates as unknown[]|null??[]).map(value=>value===null?null:Number(value)));
      return{id:String(row.id),startsOn:databaseDate(row.planned_start_date??row.due_date),endsOn:databaseDate(row.planned_end_date??row.due_date??row.planned_start_date),minutes:selected.minutes,source:"generated"};
    });
    for(const schedule of schedules){
      const generated=new Set((schedule.generated_occurrence_dates as unknown[]|null??[]).map(databaseDate));
      for(const occurrence of evaluateRecurrence(schedule.recurrence_rule as unknown as RecurrenceRule,databaseDate(schedule.effective_from),to,schedule.effective_to?databaseDate(schedule.effective_to):null)){
        if(occurrence.occurrenceDate>=from&&!generated.has(occurrence.occurrenceDate))commitments.push({id:`forecast:${schedule.id}:${occurrence.occurrenceDate}`,startsOn:occurrence.occurrenceDate,endsOn:occurrence.occurrenceDate,minutes:Number(schedule.estimated_effort_minutes??0),source:"forecast"});
      }
    }
    const normalizedPatterns:WorkingPattern[]=patterns.map(row=>({effectiveFrom:databaseDate(row.effective_from),effectiveTo:row.effective_to?databaseDate(row.effective_to):null,mondayMinutes:Number(row.monday_minutes),tuesdayMinutes:Number(row.tuesday_minutes),wednesdayMinutes:Number(row.wednesday_minutes),thursdayMinutes:Number(row.thursday_minutes),fridayMinutes:Number(row.friday_minutes),saturdayMinutes:Number(row.saturday_minutes),sundayMinutes:Number(row.sunday_minutes)}));
    const normalizedAdjustments:AvailabilityAdjustment[]=adjustments.map(row=>({startsOn:databaseDate(row.starts_on),endsOn:databaseDate(row.ends_on),capacityDeltaMinutes:Number(row.capacity_delta_minutes)}));
    const periods=rollupCapacity(calculateDailyCapacity(from,to,normalizedPatterns,normalizedAdjustments,commitments),grain).map(value=>{
      const start="date" in value?value.date:value.periodStart,end="date" in value?value.date:value.periodEnd;
      return {key:start,label:start===end?start:`${start} – ${end}`,available_hours:Number((value.availableMinutes/60).toFixed(2)),committed_hours:Number((value.committedMinutes/60).toFixed(2)),forecast_hours:Number((value.forecastMinutes/60).toFixed(2)),unavailable_hours:Number((Math.max(0,-value.adjustmentMinutes)/60).toFixed(2)),remaining_hours:Number((value.remainingMinutes/60).toFixed(2)),forecast_remaining_hours:Number((value.forecastRemainingMinutes/60).toFixed(2)),overallocated:value.overallocated,forecast_overallocated:value.forecastOverallocated};
    });
    return {resource_id:memberId,display_name:String(profile.display_name),team_name:profile.team_name?String(profile.team_name):null,periods};
  });
}
