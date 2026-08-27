import assert from "node:assert/strict";
import test from "node:test";
import { buildCapacityItems, loadCapacityRows } from "../src/resource-economics-capacity.ts";

test("capacity loading stays at five concurrent queries regardless of resource count",async()=>{
  const queries:string[]=[],parameters:unknown[][]=[];
  let active=0,maxActive=0;
  const tx=(strings:TemplateStringsArray,...values:unknown[])=>{
    queries.push(strings.join("?"));parameters.push(values);active++;maxActive=Math.max(maxActive,active);
    const result=queries.length===1
      ?Array.from({length:40},(_,index)=>({tenant_member_id:`member-${index}`,display_name:`Member ${index}`,team_name:null}))
      :[];
    return new Promise<unknown[]>(resolve=>queueMicrotask(()=>{active--;resolve(result);}));
  };

  const rows=await loadCapacityRows(tx as never,"tenant-a","2027-01-01","2027-03-31",null);

  assert.equal(queries.length,5);
  assert.equal(maxActive,5);
  assert.equal(rows.profiles.length,40);
  assert.ok(queries.every(query=>/tenant_id=\?/.test(query)));
  assert.ok(parameters.every(values=>values.includes("tenant-a")));
  assert.equal(queries.filter(query=>query.includes("recurrence_generation")).length,1);
});

test("batched capacity rows preserve working-pattern, adjustment, commitment and forecast arithmetic",()=>{
  const items=buildCapacityItems({
    profiles:[{tenant_member_id:"member-1",display_name:"Ada",team_name:"Advisory"}],
    patterns:[{tenant_member_id:"member-1",effective_from:"2027-01-01",effective_to:null,monday_minutes:480,tuesday_minutes:480,wednesday_minutes:480,thursday_minutes:480,friday_minutes:480,saturday_minutes:0,sunday_minutes:0}],
    adjustments:[{tenant_member_id:"member-1",starts_on:"2027-01-05",ends_on:"2027-01-05",capacity_delta_minutes:-120}],
    works:[{id:"work-1",tenant_member_id:"member-1",planned_start_date:"2027-01-04",planned_end_date:"2027-01-06",due_date:"2027-01-06",planned_effort_minutes:600,estimated_effort_minutes:900,task_estimates:[120,180]}],
    schedules:[{id:"schedule-1",tenant_member_id:"member-1",recurrence_rule:{frequency:"weekly"},effective_from:"2027-01-04",effective_to:null,next_occurrence_date:"2027-01-04",estimated_effort_minutes:120,generated_occurrence_dates:["2027-01-04"]}],
  } as never,"2027-01-04","2027-01-11","week");

  assert.deepEqual(items,[{
    resource_id:"member-1",display_name:"Ada",team_name:"Advisory",periods:[
      {key:"2027-01-04",label:"2027-01-04 – 2027-01-10",available_hours:38,committed_hours:10,forecast_hours:0,unavailable_hours:2,remaining_hours:28,forecast_remaining_hours:28,overallocated:false,forecast_overallocated:false},
      {key:"2027-01-11",label:"2027-01-11",available_hours:8,committed_hours:0,forecast_hours:2,unavailable_hours:0,remaining_hours:8,forecast_remaining_hours:6,overallocated:false,forecast_overallocated:false},
    ],
  }]);
});
