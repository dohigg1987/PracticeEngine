import assert from "node:assert/strict";
import test from "node:test";
import { calculateCostSnapshot, calculateDailyCapacity, calculateEconomicPosition, rollupCapacity, selectWorkEstimate } from "../src/resource-economics-core.ts";

const partTime = [{ effectiveFrom: "2027-01-01", mondayMinutes: 360, tuesdayMinutes: 360, wednesdayMinutes: 360, thursdayMinutes: 0, fridayMinutes: 0, saturdayMinutes: 0, sundayMinutes: 0 }];

test("capacity applies part-time patterns and unavailability deterministically", () => {
  const days = calculateDailyCapacity("2027-01-04", "2027-01-06", partTime, [{ startsOn: "2027-01-05", endsOn: "2027-01-05", capacityDeltaMinutes: -120 }], [{ id: "w1", startsOn: "2027-01-04", endsOn: "2027-01-06", minutes: 600, source: "generated" }]);
  assert.deepEqual(days.map(day => [day.availableMinutes, day.committedMinutes, day.remainingMinutes]), [[360,200,160],[240,200,40],[360,200,160]]);
  assert.equal(rollupCapacity(days,"week")[0]!.availableMinutes,960);
});
test("recurring forecast is visible without reducing committed remaining capacity", () => {
  const [day] = calculateDailyCapacity("2027-01-04","2027-01-04",partTime,[],[
    { id:"generated",startsOn:"2027-01-04",endsOn:"2027-01-04",minutes:300,source:"generated" },
    { id:"future",startsOn:"2027-01-04",endsOn:"2027-01-04",minutes:120,source:"forecast" },
  ]);
  assert.equal(day!.remainingMinutes,60);
  assert.equal(day!.forecastRemainingMinutes,-60);
  assert.equal(day!.overallocated,false);
  assert.equal(day!.forecastOverallocated,true);
});

test("work estimate ownership prevents task and work double counting",()=>{
  assert.deepEqual(selectWorkEstimate(600,[120,180]),{minutes:600,provenance:"work"});
  assert.deepEqual(selectWorkEstimate(null,[120,180]),{minutes:300,provenance:"task_rollup"});
  assert.deepEqual(selectWorkEstimate(undefined,[]),{minutes:0,provenance:"unavailable"});
});

test("effective cost snapshot supports hourly and daily rates",()=>{
  assert.deepEqual(calculateCostSnapshot(90,40,"hourly","GBP"),{durationMinutes:90,rate:40,basis:"hourly",dailyMinutes:450,amount:60,currency:"GBP"});
  assert.equal(calculateCostSnapshot(225,300,"daily","GBP").amount,150);
});

test("economics does not turn unknown commercial or cost values into zero",()=>{
  const unknown=calculateEconomicPosition({actualMinutes:120,internalCost:null});
  assert.equal(unknown.internalCost,null);assert.equal(unknown.acceptedRevenue,null);assert.equal(unknown.wipBalance,null);assert.equal(unknown.contribution,null);
  assert.deepEqual(unknown.status,{cost:"unavailable",revenue:"unavailable",billing:"unavailable",wip:"unavailable"});
  const known=calculateEconomicPosition({actualMinutes:120,internalCost:100,billableValue:250,acceptedRevenue:300,billedAmount:150,recoveredAmount:100});
  assert.equal(known.wipBalance,100);assert.equal(known.contribution,200);assert.equal(known.marginPercent,66.67);
});
