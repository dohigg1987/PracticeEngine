import postgres from 'postgres';

interface Env { HYPERDRIVE:{connectionString:string}; ARTEFACTS:R2Bucket; }
interface RequestContext { tenantId:string; actorId:string; correlationId:string; }

function json(data:unknown,status=200):Response{return Response.json(data,{status,headers:{'cache-control':'no-store'}});}
function context(request:Request):RequestContext{
  const tenantId=request.headers.get('x-tenant-id');
  const actorId=request.headers.get('x-actor-id');
  if(!tenantId||!actorId)throw new Error('AUTH_CONTEXT_REQUIRED');
  return{tenantId,actorId,correlationId:request.headers.get('x-correlation-id')??crypto.randomUUID()};
}
function db(env:Env){return postgres(env.HYPERDRIVE.connectionString,{prepare:false,max:5});}

async function listEngagements(request:Request,env:Env){
  const ctx=context(request);const sql=db(env);
  try{return json({items:await sql`select e.id,e.period_start,e.period_end,e.framework,e.sector_profile,e.status,e.version,o.legal_name from engagement e join organisation o on o.id=e.organisation_id and o.tenant_id=e.tenant_id where e.tenant_id=${ctx.tenantId} order by e.period_end desc`});}
  finally{await sql.end();}
}

async function engagementTrialBalance(request:Request,env:Env,engagementId:string){
  const ctx=context(request);const sql=db(env);
  try{
    const engagements=await sql`select id from engagement where id=${engagementId} and tenant_id=${ctx.tenantId}`;
    if(!engagements.length)return json({error:{code:'NOT_FOUND',message:'Engagement not found'}},404);
    const lines=await sql`select sa.account_code,sa.account_name,tbl.debit,tbl.credit,ca.canonical_code,ca.name as canonical_name,ca.report_line from trial_balance tb join trial_balance_line tbl on tbl.trial_balance_id=tb.id and tbl.tenant_id=tb.tenant_id join source_account sa on sa.id=tbl.source_account_id and sa.tenant_id=tb.tenant_id left join canonical_account ca on ca.id=tbl.canonical_account_id where tb.engagement_id=${engagementId} and tb.tenant_id=${ctx.tenantId} and tb.state='IMPORTED' order by tb.version_no desc,sa.account_code`;
    return json({items:lines});
  }finally{await sql.end();}
}

async function auditHistory(request:Request,env:Env,engagementId:string){
  const ctx=context(request);const sql=db(env);
  try{return json({items:await sql`select event_id,occurred_at_utc,actor_id,event_type,object_type,object_id,reason,correlation_id,metadata,event_hash from audit_event where tenant_id=${ctx.tenantId} and engagement_id=${engagementId} order by occurred_at_utc desc,event_id desc limit 250`});}
  finally{await sql.end();}
}

export default {async fetch(request:Request,env:Env):Promise<Response>{
  try{
    const url=new URL(request.url);
    if(url.pathname==='/health')return json({status:'ok',service:'uk-accounts-api'});
    if(url.pathname==='/v1/capabilities')return json({accountingCore:'vertical-slice-2',database:'neon-postgres-via-hyperdrive',artefacts:'r2',modules:['tenancy','engagements','csv-import','trial-balance','canonical-mapping','audit-ledger','rules','report-provenance']});
    if(request.method==='GET'&&url.pathname==='/v1/engagements')return listEngagements(request,env);
    const tb=url.pathname.match(/^\/v1\/engagements\/([^/]+)\/trial-balance$/);if(request.method==='GET'&&tb)return engagementTrialBalance(request,env,tb[1]!);
    const history=url.pathname.match(/^\/v1\/engagements\/([^/]+)\/history$/);if(request.method==='GET'&&history)return auditHistory(request,env,history[1]!);
    return json({error:{code:'NOT_FOUND',message:'Route not found'}},404);
  }catch(error){const message=error instanceof Error?error.message:'Unexpected error';const status=message==='AUTH_CONTEXT_REQUIRED'?401:500;return json({error:{code:message,message:message==='AUTH_CONTEXT_REQUIRED'?'Tenant and actor context are required':'Request failed'}},status);}
}};
