import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { convertAcceptedProposal } from "../src/crm-onboarding.ts";

const databaseUrl = process.env.PM006_CONVERSION_DATABASE_URL ?? "";

test("database-backed QuoteBench acceptance creates the canonical conversion graph atomically", { skip: !databaseUrl }, async () => {
  const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });
  const tenantId="81000000-0000-0000-0000-000000000001",memberId="81000000-0000-0000-0000-000000000002",contactId="81000000-0000-0000-0000-000000000003";
  const prospectId="81000000-0000-0000-0000-000000000004",serviceId="81000000-0000-0000-0000-000000000005",templateId="81000000-0000-0000-0000-000000000006";
  const existingServiceId="81000000-0000-0000-0000-000000000018",existingTemplateId="81000000-0000-0000-0000-000000000019";
  const opportunityId="81000000-0000-0000-0000-000000000007",opportunityServiceId="81000000-0000-0000-0000-000000000008",proposalId="81000000-0000-0000-0000-000000000009";
  const eventId="81000000-0000-0000-0000-000000000010",actorId="pm006-conversion-owner";
  const rollback=Symbol("rollback");
  try {
    await assert.rejects(sql.begin(async tx=>{
      await tx`insert into tenant(id,name,legal_name) values(${tenantId},'PM006 conversion tenant','PM006 conversion tenant')`;
      await tx`insert into tenant_member(id,tenant_id,actor_id,role_code) values(${memberId},${tenantId},${actorId},'OWNER')`;
      await tx`insert into contact(id,tenant_id,display_name,email_normalized,status,created_by,updated_by) values(${contactId},${tenantId},'Conversion contact','conversion@example.test','ACTIVE',${actorId},${actorId})`;
      await tx`insert into prospect(id,tenant_id,display_name,legal_name,entity_type,primary_contact_id,status,created_by,updated_by) values(${prospectId},${tenantId},'Conversion prospect','Conversion prospect Ltd','COMPANY',${contactId},'qualified',${actorId},${actorId})`;
      await tx`insert into prospect_contact_relationship(tenant_id,prospect_id,contact_id,relationship_type,is_primary,created_by) values(${tenantId},${prospectId},${contactId},'PRIMARY_CONTACT',true,${actorId})`;
      await tx`insert into practice_service(id,tenant_id,name,category,default_frequency,created_by,updated_by) values(${serviceId},${tenantId},'Monthly advisory','advisory','monthly',${actorId},${actorId})`;
      await tx`insert into practice_service(id,tenant_id,name,category,default_frequency,created_by,updated_by) values(${existingServiceId},${tenantId},'Quarterly advisory','advisory','quarterly',${actorId},${actorId})`;
      await tx`insert into work_template(id,tenant_id,name,service_id,status,version,template_family_id,published_at,created_by,updated_by) values(${templateId},${tenantId},'Monthly advisory delivery',${serviceId},'published',1,${templateId},now(),${actorId},${actorId})`;
      await tx`insert into work_template(id,tenant_id,name,service_id,status,version,template_family_id,published_at,created_by,updated_by) values(${existingTemplateId},${tenantId},'Quarterly advisory delivery',${existingServiceId},'published',1,${existingTemplateId},now(),${actorId},${actorId})`;
      await tx`update practice_service set default_work_template_id=${templateId} where tenant_id=${tenantId} and id=${serviceId}`;
      await tx`update practice_service set default_work_template_id=${existingTemplateId} where tenant_id=${tenantId} and id=${existingServiceId}`;
      await tx`insert into opportunity(id,tenant_id,prospect_id,name,stage_key,currency,status,responsible_member_id,created_by,updated_by) values(${opportunityId},${tenantId},${prospectId},'Accepted advisory','proposal','GBP','open',${memberId},${actorId},${actorId})`;
      await tx`insert into opportunity_service(id,tenant_id,opportunity_id,service_id,created_by) values(${opportunityServiceId},${tenantId},${opportunityId},${serviceId},${actorId})`;
      await tx`insert into quotebench_proposal_reference(id,tenant_id,opportunity_id,proposal_id,proposal_version,status,accepted_event_id,accepted_at,created_by,updated_by) values(${proposalId},${tenantId},${opportunityId},'QB-PM006','1','accepted',${eventId},now(),${actorId},${actorId})`;
      await tx`select set_config('app.tenant_id',${tenantId},true),set_config('app.actor_id',${actorId},true)`;
      const proposal=(await tx`select * from quotebench_proposal_reference where tenant_id=${tenantId} and id=${proposalId}`)[0]!;
      const ctx={tenantId,actorId,correlationId:"pm006-conversion-database"};
      const first=await convertAcceptedProposal(tx,ctx,{},proposal,eventId),replay=await convertAcceptedProposal(tx,ctx,{},proposal,eventId);
      assert.equal(String(first.id),String(replay.id));
      const graph=await tx`select
        (select count(*)::int from organisation where tenant_id=${tenantId} and originating_opportunity_id=${opportunityId}) clients,
        (select count(*)::int from client_contact_relationship where tenant_id=${tenantId} and contact_id=${contactId}) contacts,
        (select count(*)::int from client_service where tenant_id=${tenantId} and originating_opportunity_service_id=${opportunityServiceId}) services,
        (select count(*)::int from practice_engagement where tenant_id=${tenantId}) engagements,
        (select count(*)::int from recurring_work_schedule where tenant_id=${tenantId}) schedules,
        (select count(*)::int from onboarding_case where tenant_id=${tenantId}) onboarding,
        (select count(*)::int from crm_conversion where tenant_id=${tenantId} and acceptance_event_id=${eventId}) conversions,
        (select count(*)::int from audit_event where tenant_id=${tenantId}) audit_events,
        (select count(*)::int from outbox_event where tenant_id=${tenantId}) outbox_events`;
      assert.deepEqual({...graph[0]}, {clients:1,contacts:1,services:1,engagements:1,schedules:1,onboarding:1,conversions:1,audit_events:Number(graph[0]!.audit_events),outbox_events:Number(graph[0]!.outbox_events)});
      assert.ok(Number(graph[0]!.audit_events)>=6); assert.ok(Number(graph[0]!.outbox_events)>=6);
      const existingOpportunity="82000000-0000-0000-0000-000000000014",existingOpportunityService="81000000-0000-0000-0000-000000000015",existingProposal="81000000-0000-0000-0000-000000000016",existingEvent="81000000-0000-0000-0000-000000000017";
      await tx`insert into opportunity(id,tenant_id,existing_client_id,name,stage_key,currency,status,responsible_member_id,created_by,updated_by) values(${existingOpportunity},${tenantId},${first.client_id},'Existing client advisory','proposal','GBP','open',${memberId},${actorId},${actorId})`;
      await tx`insert into opportunity_service(id,tenant_id,opportunity_id,service_id,created_by) values(${existingOpportunityService},${tenantId},${existingOpportunity},${existingServiceId},${actorId})`;
      await tx`insert into quotebench_proposal_reference(id,tenant_id,opportunity_id,proposal_id,proposal_version,status,accepted_event_id,accepted_at,created_by,updated_by) values(${existingProposal},${tenantId},${existingOpportunity},'QB-EXISTING','1','accepted',${existingEvent},now(),${actorId},${actorId})`;
      const existingProposalRow=(await tx`select * from quotebench_proposal_reference where tenant_id=${tenantId} and id=${existingProposal}`)[0]!;
      const existingConversion=await convertAcceptedProposal(tx,ctx,{},existingProposalRow,existingEvent);
      assert.equal(String(existingConversion.client_id),String(first.client_id));
      const existingGraph=(await tx`select
        (select count(*)::int from organisation where tenant_id=${tenantId}) clients,
        (select count(*)::int from client_service where tenant_id=${tenantId}) services,
        (select count(*)::int from practice_engagement where tenant_id=${tenantId}) engagements,
        (select count(*)::int from recurring_work_schedule where tenant_id=${tenantId}) schedules,
        (select count(*)::int from onboarding_case where tenant_id=${tenantId}) onboarding,
        (select count(*)::int from crm_conversion where tenant_id=${tenantId}) conversions,
        (select status from opportunity where tenant_id=${tenantId} and id=${existingOpportunity}) opportunity_status`)[0]!;
      assert.deepEqual({...existingGraph}, {clients:1,services:2,engagements:2,schedules:2,onboarding:2,conversions:2,opportunity_status:"won"});
      const failingOpportunity="81000000-0000-0000-0000-000000000011",failingProposal="81000000-0000-0000-0000-000000000012",failingEvent="81000000-0000-0000-0000-000000000013";
      await tx`insert into opportunity(id,tenant_id,prospect_id,name,stage_key,currency,status,created_by,updated_by) values(${failingOpportunity},${tenantId},${prospectId},'Controlled failure','proposal','GBP','open',${actorId},${actorId})`;
      await tx`insert into quotebench_proposal_reference(id,tenant_id,opportunity_id,proposal_id,proposal_version,status,accepted_event_id,accepted_at,created_by,updated_by) values(${failingProposal},${tenantId},${failingOpportunity},'QB-FAIL','1','accepted',${failingEvent},now(),${actorId},${actorId})`;
      const failing=(await tx`select * from quotebench_proposal_reference where id=${failingProposal}`)[0]!;
      await assert.rejects(tx.savepoint(nested=>convertAcceptedProposal(nested,ctx,{},failing,failingEvent)),/SERVICES_REQUIRED|no proposed services/i);
      assert.equal(Number((await tx`select count(*)::int count from organisation where tenant_id=${tenantId} and originating_opportunity_id=${failingOpportunity}`)[0]!.count),0);
      throw rollback;
    }),error=>error===rollback);
  } finally { await sql.end(); }
});
