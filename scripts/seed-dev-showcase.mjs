import process from "node:process";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

export const MARKER = "[DEV-ENV-001]";
export const REQUIRED_FEATURES = [
  "practice users/roles", "clients/services", "CRM/opportunities/conversion",
  "recurring/work/workflow/review", "portal principal/request/document/message/confirmation",
  "resources/capacity/time/cost/WIP/economics", "Ledgerly linkage/demo accounting",
];

const ACTORS = {
  owner: "8f819a43-289a-4cd3-a399-b71512dc43ac",
  manager: "8be11ade-d563-4c5d-b76d-03526bfb4fd1",
  reviewer: "56ce384b-e155-46f8-8ac6-8c8017b155a4",
  member: "4856b8c2-4da9-4552-b302-6988b90c5f78",
  portal: "c0936b8c-c476-4b42-b8cb-fbf4a5de7bac",
};

export function configuration(env = process.env) {
  const required = ["PE_DEV_API_URL", "PE_DEV_AUTH_TOKEN", "PE_DEV_TENANT_ID", "PE_DEV_CONFIRM"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing required inputs: ${missing.join(", ")}`);
  if (env.PE_DEV_CONFIRM !== "practiceengine-dev") throw new Error("PE_DEV_CONFIRM must equal practiceengine-dev");
  const api = new URL(env.PE_DEV_API_URL);
  const visiblyDev = /(^|[.-])(dev|localhost|127\.0\.0\.1)([.-]|$)/i.test(api.hostname);
  if (!visiblyDev || /prod|production/i.test(api.hostname)) throw new Error(`Refusing non-DEV API host: ${api.hostname}`);
  if (!/^[0-9a-f-]{36}$/i.test(env.PE_DEV_TENANT_ID)) throw new Error("PE_DEV_TENANT_ID must be a UUID");
  return { api: api.toString().replace(/\/$/, ""), token: env.PE_DEV_AUTH_TOKEN, tenantId: env.PE_DEV_TENANT_ID,
    portalToken: env.PE_DEV_PORTAL_AUTH_TOKEN || null, ledgerlyEngagementId: env.PE_DEV_LEDGERLY_ENGAGEMENT_ID || null,
    quoteBenchEventFile: env.PE_DEV_QUOTEBENCH_EVENT_FILE || null };
}

export function dates(now = new Date()) {
  const iso = (d) => d.toISOString().slice(0, 10), add = (days) => { const d = new Date(now); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
  return { today: iso(now), past: add(-14), overdue: add(-3), soon: add(7), later: add(30), annual: add(365) };
}

function client(config, token = config.token) {
  async function request(method, path, body, extraHeaders = {}) {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const response = await fetch(`${config.api}${path}`, { method, headers: {
      authorization: `Bearer ${token}`, "x-tenant-id": config.tenantId, "x-correlation-id": crypto.randomUUID(),
      ...(body === undefined || body instanceof Uint8Array || isForm ? {} : { "content-type": "application/json" }), ...extraHeaders,
    }, body: body === undefined || body instanceof Uint8Array || isForm ? body : JSON.stringify(body) });
    const text = await response.text(); let value; try { value = text ? JSON.parse(text) : {}; } catch { value = { raw: text }; }
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${value.message || value.error || text}`);
    return value;
  }
  return { get: (p) => request("GET", p), post: (p,b,h) => request("POST",p,b,h), patch: (p,b) => request("PATCH",p,b), put: (p,b) => request("PUT",p,b) };
}

const one = (items, predicate) => items.find(predicate);
async function ensure(api, listPath, predicate, createPath, body) {
  const listed = await api.get(listPath), found = one(listed.items ?? [], predicate);
  return found ?? (await api.post(createPath, body)).item;
}

export async function seed(config, { now = new Date(), log = console.log } = {}) {
  const api = client(config), d = dates(now), summary = { createdOrFound: {}, warnings: [] };
  const context = await api.get("/v1/platform/context");
  if (String(context.item?.tenantId) !== config.tenantId) throw new Error("Authenticated API context does not match PE_DEV_TENANT_ID");

  const resourceData = await api.get("/v1/practice/resources"), resources = resourceData.items ?? [];
  const expectedNames={owner:"Development Owner",manager:"Development Manager",reviewer:"Development Reviewer",member:"Development Team"};
  const memberByActor = Object.fromEntries(Object.entries(expectedNames).map(([key, name]) => [key, one(resources, (m) => m.display_name === name)]));
  if (!memberByActor.owner || !memberByActor.manager || !memberByActor.reviewer || !memberByActor.member)
    throw new Error("Run scripts/seed-dev-members.sql first; all four DEV practice identities must be active");
  const mid = Object.fromEntries(Object.entries(memberByActor).map(([k,v]) => [k, String(v.id)]));

  const delivery = await ensure(api,"/v1/platform/teams",(x)=>x.name===`${MARKER} Client Delivery`,"/v1/platform/teams",{name:`${MARKER} Client Delivery`});
  for (const id of [mid.manager,mid.reviewer,mid.member]) await api.post(`/v1/platform/teams/${delivery.id}/members`,{tenantMemberId:id});

  const serviceDefs = [
    ["Annual accounts","Accounts production","annual","ledgerly","ledgerly.accounts"],
    ["Bookkeeping","Finance operations","monthly",null,null], ["VAT returns","Tax compliance","quarterly",null,null],
    ["Payroll","Payroll","monthly",null,null], ["Advisory","Advisory","monthly",null,null],
  ];
  const services = {};
  for (const [name,category,frequency,moduleKey,featureKey] of serviceDefs) services[name] = await ensure(api,"/v1/practice/services",(x)=>x.name===`${MARKER} ${name}`,"/v1/practice/services",{name:`${MARKER} ${name}`,category,defaultFrequency:frequency,specialistModuleKey:moduleKey,requiredEntitlementFeatureKey:featureKey});

  const clients = {};
  for (const [code,name,type] of [["DEV-ACME","Acme Engineering Ltd","COMPANY"],["DEV-RIVER","River & Reed LLP","PARTNERSHIP"],["DEV-MAYA","Maya Patel Consulting","SOLE_TRADER"],["DEV-ORBIT","Orbit Payroll Services Ltd","COMPANY"],["DEV-NORTH","Northstar Advisory Ltd","COMPANY"]])
    clients[code] = await ensure(api,"/v1/clients",(x)=>x.client_code===code,"/v1/clients",{displayName:`${MARKER} ${name}`,legalName:name,entityType:type,clientCode:code,jurisdiction:"UK"});

  async function clientService(clientKey, serviceName) {
    const c=clients[clientKey], s=services[serviceName], path=`/v1/practice/clients/${c.id}/services`;
    return ensure(api,path,(x)=>String(x.service_id)===String(s.id)&&x.status==="active",path,{serviceId:s.id,startDate:d.past,frequency:s.default_frequency,responsibleMemberId:mid.manager,responsibleTeamId:delivery.id,specialistModuleKey:s.specialist_module_key});
  }
  const acmeAccounts=await clientService("DEV-ACME","Annual accounts"), acmeBook=await clientService("DEV-ACME","Bookkeeping"), riverVat=await clientService("DEV-RIVER","VAT returns"), orbitPayroll=await clientService("DEV-ORBIT","Payroll"), northAdvisory=await clientService("DEV-NORTH","Advisory");
  const engagement=await ensure(api,"/v1/practice/engagements",(x)=>x.reference==="DEV-ACME-2026","/v1/practice/engagements",{clientId:clients["DEV-ACME"].id,reference:"DEV-ACME-2026",name:`${MARKER} Acme 2026 accounts`,status:"active",startDate:d.past,acceptanceState:"accepted",responsibleOwnerId:mid.manager,clientServiceIds:[acmeAccounts.id,acmeBook.id]});

  const workSpecs=[
    ["Upcoming annual accounts",acmeAccounts,clients["DEV-ACME"],"not_started",d.later,mid.member],
    ["Overdue bookkeeping close",acmeBook,clients["DEV-ACME"],"in_progress",d.overdue,mid.member],
    ["Waiting on VAT records",riverVat,clients["DEV-RIVER"],"waiting_on_client",d.soon,mid.member],
    ["Payroll review",orbitPayroll,clients["DEV-ORBIT"],"review",d.soon,mid.reviewer],
    ["Advisory workshop complete",northAdvisory,clients["DEV-NORTH"],"in_progress",d.past,mid.manager],
  ], work={};
  for(const [title,cs,c,status,due,assignee] of workSpecs) work[title]=await ensure(api,"/v1/practice/work",(x)=>x.title===`${MARKER} ${title}`,"/v1/practice/work",{clientId:c.id,clientServiceId:cs.id,engagementId:c.id===clients["DEV-ACME"].id?engagement.id:undefined,title:`${MARKER} ${title}`,status,priority:due===d.overdue?"high":"normal",assignedMemberId:assignee,plannedStartDate:d.past,plannedEndDate:due,dueDate:due,estimatedEffortMinutes:480,remainingEffortMinutes:status==="in_progress"?240:480});
  const completed=work["Advisory workshop complete"];
  await api.post(`/v1/practice/work/${completed.id}/complete`,{}).catch((e)=>{ if(!/already completed/.test(e.message)) throw e; });

  const taskPath=`/v1/practice/work/${work["Overdue bookkeeping close"].id}/tasks`;
  const prepare=await ensure(api,taskPath,(x)=>x.title===`${MARKER} Prepare month-end`,taskPath,{title:`${MARKER} Prepare month-end`,sequence:1,assigneeMemberId:mid.member,reviewerMemberId:mid.reviewer,dueDate:d.overdue,estimatedEffortMinutes:180});
  const review=await ensure(api,taskPath,(x)=>x.title===`${MARKER} Manager review`,taskPath,{title:`${MARKER} Manager review`,sequence:2,assigneeMemberId:mid.reviewer,dueDate:d.soon,estimatedEffortMinutes:60});
  const depPath=`/v1/practice/tasks/${review.id}/dependencies`;
  await ensure(api,depPath,(x)=>String(x.predecessor_task_id)===String(prepare.id),depPath,{predecessorTaskId:prepare.id,dependencyType:"finish_to_start",blockingReason:"Preparation must finish before review"});

  const templateName=`${MARKER} Monthly bookkeeping workflow`;
  let template=one((await api.get("/v1/practice/work-templates")).items??[],x=>x.name===templateName);
  if(!template){ template=(await api.post("/v1/practice/work-templates",{name:templateName,serviceId:services.Bookkeeping.id,status:"draft",estimatedEffortMinutes:360,stages:[{name:"Prepare",stageType:"preparation",sequence:1},{name:"Review",stageType:"internal_review",sequence:2}],tasks:[{title:"Reconcile bank",sequence:1,stageSequence:1,estimatedEffortMinutes:240},{title:"Review exceptions",sequence:2,stageSequence:2,reviewRequired:true,estimatedEffortMinutes:120}]})).item; }
  if(template.status==="draft") template=(await api.post(`/v1/practice/work-templates/${template.id}/publish`,{})).item;
  const schedules=await api.get("/v1/practice/recurring-schedules");
  if(!one(schedules.items??[],x=>String(x.client_service_id)===String(acmeBook.id)&&String(x.work_template_id)===String(template.id))) await api.post("/v1/practice/recurring-schedules",{clientServiceId:acmeBook.id,engagementId:engagement.id,workTemplateId:template.id,recurrenceRule:{frequency:"monthly",interval:1},effectiveFrom:d.today,generationHorizonType:"periods",generationHorizonValue:6,defaultAssigneeMemberId:mid.member,defaultTeamId:delivery.id});
  const reviews=await api.get("/v1/practice/reviews");
  const practiceReview=one(reviews.items??[],x=>String(x.practice_task_id)===String(review.id)) ?? (await api.post("/v1/practice/reviews",{workItemId:work["Overdue bookkeeping close"].id,taskId:review.id,preparerMemberId:mid.member,reviewerMemberId:mid.reviewer,approverMemberId:mid.manager,segregationRequired:true})).item;
  const reviewPoints=await api.get(`/v1/practice/reviews/${practiceReview.id}/points`);
  if(!one(reviewPoints.items??[],x=>x.description===`${MARKER} Confirm unusual reconciling item`)) await api.post(`/v1/practice/reviews/${practiceReview.id}/points`,{description:`${MARKER} Confirm unusual reconciling item`,assignedMemberId:mid.member});
  const automations=await api.get("/v1/practice/automation-rules");
  if(!one(automations.items??[],x=>x.name===`${MARKER} Overdue work alert example`)) await api.post("/v1/practice/automation-rules",{name:`${MARKER} Overdue work alert example`,enabled:false,triggerType:"deadline.overdue",conditions:[],actions:[{type:"emit_notification_request",message:"Synthetic overdue-work alert"}],priority:100});

  const prospects={};
  for(const [name,source] of [["Greenfield Robotics Ltd","Website"],["Harbour Dental Group","Referral"]]) prospects[name]=await ensure(api,"/v1/crm/prospects",(x)=>x.display_name===`${MARKER} ${name}`,"/v1/crm/prospects",{displayName:`${MARKER} ${name}`,legalName:name,entityType:"COMPANY",source,responsibleMemberId:mid.manager});
  const greenfield=await ensure(api,"/v1/crm/opportunities",(x)=>x.name===`${MARKER} Greenfield finance function`,"/v1/crm/opportunities",{prospectId:prospects["Greenfield Robotics Ltd"].id,name:`${MARKER} Greenfield finance function`,stageKey:"proposal",serviceIds:[services.Bookkeeping.id,services.Advisory.id],estimatedValue:18000,currency:"GBP",expectedCloseDate:d.later,responsibleMemberId:mid.manager});
  await ensure(api,"/v1/crm/opportunities",(x)=>x.name===`${MARKER} Harbour payroll`,"/v1/crm/opportunities",{prospectId:prospects["Harbour Dental Group"].id,name:`${MARKER} Harbour payroll`,stageKey:"discovery",serviceIds:[services.Payroll.id],estimatedValue:7200,currency:"GBP",expectedCloseDate:d.annual,responsibleMemberId:mid.manager});

  const contacts=await api.get("/v1/contacts");
  const contact=one(contacts.items??[],(x)=>x.email_normalized==="portal.dev@practiceengine.invalid") ?? (await api.post("/v1/contacts",{displayName:`${MARKER} Alex Client`,contactKind:"PERSON",givenName:"Alex",familyName:"Client",email:"portal.dev@practiceengine.invalid"})).item;
  const accessPath=`/v1/clients/${clients["DEV-ACME"].id}/portal-access`;
  const access=await ensure(api,accessPath,(x)=>String(x.contact_id)===String(contact.id),accessPath,{contactId:contact.id,engagementId:engagement.id,clientServiceId:acmeAccounts.id,accessRole:"approver"});
  const request=await ensure(api,"/v1/client-requests",(x)=>x.title===`${MARKER} Upload bank statements`,"/v1/client-requests",{clientId:clients["DEV-ACME"].id,engagementId:engagement.id,workItemId:work["Upcoming annual accounts"].id,requestType:"document",title:`${MARKER} Upload bank statements`,description:"Synthetic request for the DEV acceptance journey.",recipientAccessIds:[access.id],dueAt:`${d.soon}T12:00:00Z`,priority:"high",send:true,waitingOnClient:true,responseRequirements:{formats:["application/pdf"]}});

  if(config.portalToken){
    const portalApi=client(config,config.portalToken);
    if(access.status!=="active"){const invitation=await api.post(`/v1/portal-access/${access.id}/invitations`,{expiresInHours:72});await portalApi.post("/v1/portal/invitations/accept",{token:invitation.token});}
    const subject=`${MARKER} Accounts information`; let thread=one((await api.get("/v1/portal-threads")).items??[],x=>x.subject===subject);
    if(!thread) thread=(await api.post("/v1/portal-threads",{clientId:clients["DEV-ACME"].id,engagementId:engagement.id,workItemId:work["Upcoming annual accounts"].id,clientRequestId:request.id,subject,portalPrincipalIds:[access.portal_principal_id]})).item;
    await api.post(`/v1/portal-threads/${thread.id}/messages`,{body:`${MARKER} Please upload the synthetic statement pack.`,idempotencyKey:"DEV-ENV-001-staff-message-1"});
    await portalApi.post(`/v1/portal/messages/${thread.id}`,{body:`${MARKER} Synthetic documents will follow.`,idempotencyKey:"DEV-ENV-001-portal-message-1"});
    const portalDocuments=await portalApi.get("/v1/portal/documents");
    if(!one(portalDocuments.items??[],x=>x.display_filename==="dev-bank-statement.txt")){const form=new FormData();form.set("file",new Blob(["Synthetic PracticeEngine DEV statement. No real client data.\n"],{type:"text/plain"}),"dev-bank-statement.txt");form.set("idempotencyKey","DEV-ENV-001-document-1");await portalApi.post(`/v1/portal/requests/${request.id}/documents`,form);}
    const confirmations=await api.get("/v1/client-confirmations");
    if(!one(confirmations.items??[],x=>x.resource_id===String(work["Upcoming annual accounts"].id))) await api.post("/v1/client-confirmations",{clientId:clients["DEV-ACME"].id,portalClientAccessId:access.id,clientRequestId:request.id,resourceType:"WORK_ITEM",resourceId:String(work["Upcoming annual accounts"].id),confirmationText:"I confirm the synthetic DEV information is complete for demonstration purposes.",confirmationVersion:1,expiresAt:`${d.later}T17:00:00Z`});
  }

  for(const [key,m] of Object.entries(memberByActor)) await api.patch(`/v1/practice/resources/${m.id}`,{jobTitle:key==="owner"?"Partner":key==="manager"?"Manager":key==="reviewer"?"Reviewer":"Associate",standardCapacityMinutesWeek:key==="owner"?1500:2250,utilisationTarget:key==="owner"?45:75,chargeabilityTarget:key==="owner"?35:65,skills:["DEV showcase",key]});
  for(const [key,m] of Object.entries(memberByActor)){
    const markerPath=`/v1/platform/settings/devseed/pattern_${key}_v1`; let done=false;
    try{done=(await api.get(markerPath)).item?.setting_value===true;}catch(error){if(!/-> 404:/.test(String(error)))throw error;}
    if(!done){await api.post(`/v1/practice/resources/${m.id}/working-patterns`,{name:`${MARKER} Standard week`,effectiveFrom:d.past,mondayMinutes:450,tuesdayMinutes:450,wednesdayMinutes:450,thursdayMinutes:450,fridayMinutes:key==="owner"?300:450,saturdayMinutes:0,sundayMinutes:0});await api.put(markerPath,{value:true});}
  }
  const rates=await api.get("/v1/practice/cost-rates");
  for(const [key,rate] of [["manager",55],["reviewer",42],["member",28]]) if(!one(rates.items??[],x=>String(x.tenant_member_id)===mid[key]&&String(x.effective_from).slice(0,10)===d.past)) await api.post("/v1/practice/cost-rates",{tenantMemberId:mid[key],effectiveFrom:d.past,internalCostRate:rate,currency:"GBP",rateBasis:"hourly",provenance:"Synthetic DEV showcase rate"});
  const entries=await api.get(`/v1/practice/time-entries?from=${d.past}&to=${d.today}`);
  if(!one(entries.items??[],x=>x.description===`${MARKER} Month-end bookkeeping`)) await api.post("/v1/practice/time-entries",{tenantMemberId:mid.member,entryDate:d.today,workItemId:work["Overdue bookkeeping close"].id,durationMinutes:240,narrative:`${MARKER} Month-end bookkeeping`,classification:"billable",status:"submitted",billableValue:480,valueProvenance:"Synthetic DEV showcase"});
  const contexts=await api.get("/v1/practice/commercial-contexts");
  if(!one(contexts.items??[],x=>x.source_version==="DEV-ENV-001-v1")) await api.post("/v1/practice/commercial-contexts",{clientId:clients["DEV-ACME"].id,clientServiceId:acmeBook.id,workItemId:work["Overdue bookkeeping close"].id,engagementId:engagement.id,agreedValue:12000,currency:"GBP",billingModel:"subscription",billingFrequency:"monthly",sourceType:"manual_authorised",sourceVersion:"DEV-ENV-001-v1",effectiveFrom:d.past});
  const recovery=await api.get("/v1/practice/recoveries");
  if(!one(recovery.items??[],x=>x.source_reference==="DEV-ENV-001-INVOICE-001")) await api.post("/v1/practice/recoveries",{clientId:clients["DEV-ACME"].id,clientServiceId:acmeBook.id,workItemId:work["Overdue bookkeeping close"].id,engagementId:engagement.id,recoveryDate:d.today,amount:1000,currency:"GBP",recoveryType:"billed",sourceReference:"DEV-ENV-001-INVOICE-001",provenance:"Synthetic DEV showcase"});

  const opportunityDetail=await api.get(`/v1/crm/opportunities/${greenfield.id}`);
  if(!(opportunityDetail.item.proposals??[]).length) await api.post(`/v1/crm/opportunities/${greenfield.id}/proposals`,{proposalId:"DEV-QB-001",proposalVersion:"1"});
  if(config.quoteBenchEventFile && opportunityDetail.item.status!=="won") { const bundle=JSON.parse(await readFile(config.quoteBenchEventFile,"utf8")); if(bundle.body?.proposalId!=="DEV-QB-001") throw new Error("QuoteBench event bundle proposalId must be DEV-QB-001"); await api.post("/v1/integrations/quotebench/events",bundle.body,bundle.headers??{}); }
  else if(opportunityDetail.item.status!=="won") summary.warnings.push("PE_DEV_QUOTEBENCH_EVENT_FILE not set; accepted proposal conversion was not performed.");
  if(config.ledgerlyEngagementId) await api.put(`/v1/practice/work/${work["Upcoming annual accounts"].id}/ledgerly-link`,{ledgerlyEngagementId:config.ledgerlyEngagementId,requiredFeatureKey:"ledgerly.accounts"});
  else summary.warnings.push("PE_DEV_LEDGERLY_ENGAGEMENT_ID not set; Ledgerly linkage was not created.");
  if(!config.portalToken) summary.warnings.push("PE_DEV_PORTAL_AUTH_TOKEN not set; invitation acceptance, portal response/document upload and confirmation response were not performed.");
  summary.createdOrFound={team:1,services:Object.keys(services).length,clients:Object.keys(clients).length,work:Object.keys(work).length,prospects:Object.keys(prospects).length,portalRequests:1,resources:Object.keys(memberByActor).length};
  log(JSON.stringify(summary,null,2)); return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) seed(configuration()).catch((error)=>{ console.error(error instanceof Error ? error.message : error); process.exitCode=1; });
