import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { configuration, dates, MARKER, REQUIRED_FEATURES } from "./seed-dev-showcase.mjs";

const valid={PE_DEV_API_URL:"https://api.dev.practiceengine.example",PE_DEV_AUTH_TOKEN:"secret",PE_DEV_TENANT_ID:"11111111-1111-4111-8111-111111111111",PE_DEV_CONFIRM:"practiceengine-dev"};
test("DEV seed requires explicit confirmation and a visibly non-production host",()=>{
  assert.equal(configuration(valid).tenantId,valid.PE_DEV_TENANT_ID);
  assert.throws(()=>configuration({...valid,PE_DEV_CONFIRM:"yes"}),/must equal/);
  assert.throws(()=>configuration({...valid,PE_DEV_API_URL:"https://api.practiceengine.example"}),/Refusing non-DEV/);
  assert.throws(()=>configuration({...valid,PE_DEV_API_URL:"https://api.production.dev.example"}),/Refusing non-DEV/);
});
test("relative showcase dates remain deterministic",()=>assert.deepEqual(dates(new Date("2026-08-26T12:00:00Z")),{today:"2026-08-26",past:"2026-08-12",overdue:"2026-08-23",soon:"2026-09-02",later:"2026-09-25",annual:"2027-08-26"}));
test("seed marker and declared coverage remain explicit",()=>{
  assert.equal(MARKER,"[DEV-ENV-001]");
  for(const area of ["clients/services","CRM/opportunities/conversion","portal principal/request/document/message/confirmation","Ledgerly linkage/demo accounting"]) assert.ok(REQUIRED_FEATURES.includes(area));
});
test("seed routes and key payload fields remain backed by API handlers",async()=>{
  const [practice,crm,portal,economics]=await Promise.all([
    readFile(new URL("../apps/api/src/practice-management.ts",import.meta.url),"utf8"),
    readFile(new URL("../apps/api/src/crm-onboarding.ts",import.meta.url),"utf8"),
    readFile(new URL("../apps/api/src/client-collaboration.ts",import.meta.url),"utf8"),
    readFile(new URL("../apps/api/src/resource-economics.ts",import.meta.url),"utf8"),
  ]);
  for(const fragment of ["/v1/practice/work-templates","/proposals$","/v1/portal-threads","/v1/client-confirmations","/v1/practice/time-entries","narrative"]) assert.ok(`${practice}${crm}${portal}${economics}`.includes(fragment),fragment);
});
