import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root=resolve(fileURLToPath(new URL("..",import.meta.url))),tier=process.argv[2];
const npmCli=process.env.npm_execpath;
if(!npmCli){console.error("Run verification through npm so npm_execpath is available.");process.exit(2);}
const n=(label,args)=>[label,process.execPath,[npmCli,...args]];
const commands={
  fast:[
    n("Diff whitespace",["run","verify:diff"]),
    n("Architecture boundaries",["run","verify:architecture"]),
    n("Release lockstep",["run","verify:lockstep"]),
    n("Release guards",["run","test:release-guard"]),
    n("Domain tests",["run","test:core"]),
    n("API tests",["test","--workspace","apps/api"]),
    ["API typecheck",process.execPath,[resolve(root,"node_modules/typescript/bin/tsc"),"-p","apps/api/tsconfig.json","--noEmit"]],
    n("Web typecheck",["run","typecheck","--workspace","apps/web"]),
    n("Web unit tests",["test","--workspace","apps/web"]),
  ],
  integration:[
    n("Fast development gate",["run","verify:fast"]),
    n("Worker build and Wrangler dry run",["run","check","--workspace","apps/api"]),
    n("Web UI and header guards",["run","test:ui-quality","--workspace","apps/web"]),
    n("Web header tests",["run","test:headers","--workspace","apps/web"]),
    n("Production-shaped web build",["run","build","--workspace","apps/web"]),
    n("Practice browser smoke",["run","test:e2e:pm","--workspace","apps/web"]),
  ],
};
if(!Object.hasOwn(commands,tier)){console.error("Usage: node scripts/verify-tier.mjs fast|integration");process.exit(2);}
const started=Date.now(),timings=[];
for(const [label,command,args] of commands[tier]){
  const suiteStarted=Date.now();console.log(`\n=== ${label} ===`);
  const result=spawnSync(command,args,{cwd:root,stdio:"inherit",shell:false,env:{...process.env,WRANGLER_SEND_METRICS:"false"}});
  const seconds=Number(((Date.now()-suiteStarted)/1000).toFixed(1));timings.push({label,seconds,status:result.status??1});
  console.log(`--- ${label}: ${seconds.toFixed(1)}s ---`);
  if(result.error){console.error(result.error.message);process.exit(1);}if(result.status!==0){print();process.exit(result.status??1);}
}
print();
function print(){const seconds=Number(((Date.now()-started)/1000).toFixed(1));console.log(`\nVerification timing (${tier}): ${seconds.toFixed(1)}s total`);for(const item of [...timings].sort((a,b)=>b.seconds-a.seconds))console.log(`${item.seconds.toFixed(1)}s  ${item.label}`);console.log(`VERIFY_TIMING_JSON=${JSON.stringify({tier,seconds,suites:timings,playwrightWorkers:Number(process.env.PLAYWRIGHT_WORKERS||4)})}`);}
