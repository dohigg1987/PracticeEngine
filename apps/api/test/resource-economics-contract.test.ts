import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service=await readFile(new URL("../src/resource-economics.ts",import.meta.url),"utf8");
const migration=await readFile(new URL("../../../packages/database/migrations/0035_resource_capacity_time_economics.sql",import.meta.url),"utf8");

test("resource and capacity routes are permission and entitlement gated",()=>{
  for(const permission of ["resources.view","resources.manage","capacity.view","capacity.manage","assignments.manage"])assert.ok(service.includes(`"${permission}"`),permission);
  for(const feature of ["practice.resources","practice.capacity"])assert.ok(service.includes(`"${feature}"`),feature);
  for(const route of ["/v1/practice/resources","/v1/practice/capacity","/v1/practice/work-allocations","/resource-assignment"])assert.ok(service.includes(route),route);
});

test("resource planning preserves history and blocks invalid resource assignments",()=>{
  assert.match(service,/insert into work_assignment_history/);
  assert.match(service,/RESOURCE_INACTIVE/);
  assert.match(service,/RESOURCE_OUTSIDE_TEAM/);
  assert.match(service,/WORK_REASSIGNED/);
  assert.match(service,/forecast_remaining_hours/);
});

test("time capture validates work context and snapshots effective cost",()=>{
  for(const value of ["INVALID_TIME_CONTEXT","cost_rate_snapshot","cost_amount_snapshot","TIME_ENTRY_CREATED","APPROVED_TIME_IMMUTABLE"])assert.ok(service.includes(value),value);
  for(const permission of ["time.view","time.enter","time.manage","time.approve"])assert.ok(service.includes(`"${permission}"`),permission);
  assert.match(service,/changes\.cost_amount_snapshot=calculateCostSnapshot/);
  assert.doesNotMatch(migration,/GRANT UPDATE\([^)]*cost_rate_snapshot/);
});

test("economics pre-aggregates each source and preserves unavailable values",()=>{
  for(const cte of ["work_stats as","time_stats as","commercial_stats as","recovery_stats as"])assert.ok(service.includes(cte),cte);
  assert.match(service,/cost_amount_snapshot is null/);
  assert.doesNotMatch(service,/coalesce\(sum\(te\.cost_amount_snapshot\),0\)/);
  assert.match(service,/commercial_value_state/);
  for(const route of ["/v1/practice/commercial-contexts","/v1/practice/recoveries","/v1/practice/cost-rates"])assert.ok(service.includes(route),route);
  assert.match(service,/PROPOSAL_PROVENANCE_REQUIRED/);
});

test("all sensitive routes enforce functional permission separately from entitlement",()=>{
  for(const pair of [["costrates.view","practice.economics"],["costrates.manage","practice.economics"],["economics.view","practice.economics"],["portfolio.view","practice.reporting"]]){
    assert.ok(service.includes(`"${pair[0]}"`));assert.ok(service.includes(`"${pair[1]}"`));
  }
});

test("database contract uses effective dating forced RLS and restricted grants",()=>{
  for(const table of ["resource_profile","resource_working_pattern","resource_availability_adjustment","work_assignment_history","resource_cost_rate","time_entry","work_commercial_context","billing_recovery"])assert.ok(migration.includes(`'${table}'`)||migration.includes(`CREATE TABLE ${table}(`),table);
  assert.match(migration,/FORCE ROW LEVEL SECURITY/);assert.match(migration,/costrates\.view/);assert.match(migration,/economics\.view/);assert.match(migration,/practice\.reporting/);
});
