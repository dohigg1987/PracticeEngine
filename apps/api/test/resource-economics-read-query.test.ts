import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildEconomicsOverviewItem, loadEconomicsOverviewRow, loadResourceListRows } from "../src/resource-economics-read.ts";

function queryRecorder(result:unknown[]=[]){
  const queries:string[]=[],parameters:unknown[][]=[];
  const tx=(strings:TemplateStringsArray,...values:unknown[])=>{
    queries.push(strings.join("?"));parameters.push(values);return Promise.resolve(result);
  };
  return {tx:tx as never,queries,parameters};
}

test("resource list uses one tenant-scoped pre-aggregated projection",async()=>{
  const record=queryRecorder([{id:"member-1",display_name:"Ada",assigned_hours:10}]);
  const rows=await loadResourceListRows(record.tx,"tenant-a");
  assert.equal(record.queries.length,1);
  assert.deepEqual(rows,[{id:"member-1",display_name:"Ada",assigned_hours:10}]);
  assert.match(record.queries[0]!,/with work_load as/);
  assert.match(record.queries[0]!,/group by tenant_id,assigned_member_id/);
  assert.match(record.queries[0]!,/load\.tenant_id=rp\.tenant_id/);
  assert.doesNotMatch(record.queries[0]!,/lateral/);
  assert.ok(record.parameters[0]!.every(value=>value==="tenant-a"));
  for(const field of ["role_title","weekly_capacity_hours","assigned_hours","available_hours","utilisation_percentage","overdue_work"])
    assert.match(record.queries[0]!,new RegExp(field));
});

test("economics overview uses one tenant-scoped summary projection",async()=>{
  const record=queryRecorder([{due_this_week:3}]);
  const rows=await loadEconomicsOverviewRow(record.tx,"tenant-a");
  assert.equal(record.queries.length,1);
  assert.deepEqual(rows,[{due_this_week:3}]);
  assert.ok(record.parameters[0]!.every(value=>value==="tenant-a"));
  for(const cte of ["work_stats as","resource_work_load as","resource_stats as","time_stats as","commercial_stats as","recovery_stats as","economics_summary as"])
    assert.ok(record.queries[0]!.includes(cte),cte);
  assert.doesNotMatch(record.queries[0]!,/lateral/);
  for(const join of ["ts.tenant_id=cs.tenant_id","cms.tenant_id=cs.tenant_id","rs.tenant_id=cs.tenant_id"])
    assert.ok(record.queries[0]!.includes(join),join);
  for(const field of ["due_this_week","capacity_minutes","assigned_minutes","economics_items","internal_cost","billable_value","accepted_revenue","billed_amount","currency"])
    assert.match(record.queries[0]!,new RegExp(field));
});

test("economics overview preserves response arithmetic and unknown WIP",()=>{
  assert.deepEqual(buildEconomicsOverviewItem({due_this_week:"3",overdue_work:"2",waiting_on_client:"1",review_queue:"4",capacity_minutes:"2250",assigned_minutes:"1125",economics_items:[
    {internal_cost:"100.0000",billable_value:"250.0000",accepted_revenue:"300.00",billed_amount:"150.00",currency:"GBP"},
    {internal_cost:null,billable_value:null,accepted_revenue:null,billed_amount:null,currency:"GBP"},
  ]}),{
    due_this_week:3,overdue_work:2,waiting_on_client:1,review_queue:4,capacity_utilisation_percentage:50,
    forecast_capacity_hours:18.75,wip_amount:null,economic_exceptions:1,currency:"GBP",
  });
  assert.deepEqual(buildEconomicsOverviewItem(undefined),{
    due_this_week:0,overdue_work:0,waiting_on_client:0,review_queue:0,capacity_utilisation_percentage:0,
    forecast_capacity_hours:0,wip_amount:0,economic_exceptions:0,currency:undefined,
  });
});

test("portfolio economics remains one set-based query with no per-row database loop",async()=>{
  const service=await readFile(new URL("../src/resource-economics.ts",import.meta.url),"utf8");
  const block=service.slice(service.indexOf("async function economicsRows"),service.indexOf("export async function handleResourceEconomicsRoute"));
  assert.equal(block.match(/await tx`/g)?.length,1);
  for(const cte of ["work_stats as","time_stats as","commercial_stats as","recovery_stats as"])
    assert.ok(block.includes(cte),cte);
  assert.doesNotMatch(block,/for\s*\([^)]*(row|position)/);
});
