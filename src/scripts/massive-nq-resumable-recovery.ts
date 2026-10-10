import { planMissingNqFiles } from "./massive-nq-backfill-candidates.js";
import { executeBoundedBackfill } from "./massive-nq-backfill-safety.js";
import { pacedTransport } from "./massive-nq-paced-transport.js";

const root="data/cache/massive/NQ";
const live=process.argv.includes("--execute");
const maxRequests=4;
console.log("=== TM001 RESUMABLE 30-SESSION HISTORICAL RECOVERY ===");
console.log("MAX 4 REQUESTS | 15s MINIMUM SPACING | NO RETRIES | NO OVERWRITES | NO TRADES");
const plan=await planMissingNqFiles({end:"2026-10-02",tradingSessions:30,cacheRoot:root});
const targets=plan.candidates.slice(0,maxRequests);
console.log("BATCH_PLAN "+JSON.stringify({
  firstDate:plan.firstDate,lastDate:plan.lastDate,missingUtcFiles:plan.candidates.length,
  targets,remainingAfterSuccessfulBatch:plan.candidates.length-targets.length,
  rolloverReview:plan.rolloverReview,holidayPolicyVerified:false,rollPolicyVerified:false,
  liveRequested:live
}));
if(!live){
  console.log("DRY_RUN: zero requests, zero writes; use --execute for a single bounded batch");
  process.exit(0);
}
if(!targets.length){console.log("NO_MISSING_FILES: zero requests");process.exit(0);}
const key=process.env.MASSIVE_API_KEY?.trim();
if(!key)throw Error("MASSIVE_API_KEY missing: zero requests");
let attempts=0;
const transport=pacedTransport(async(target:{ticker:string;date:string})=>{
  attempts++;
  const url=new URL("https://api.massive.com/futures/v1/aggs/"+target.ticker);
  url.searchParams.set("resolution","1min");
  url.searchParams.set("window_start.gte",target.date);
  url.searchParams.set("window_start.lt",new Date(Date.parse(target.date+"T00:00:00Z")+86400000).toISOString().slice(0,10));
  url.searchParams.set("limit","50000");
  url.searchParams.set("sort","window_start.asc");
  url.searchParams.set("apiKey",key);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(url,{signal:controller.signal,redirect:"error"});
    if(!response.ok)throw Error("MASSIVE_HTTP_"+response.status+"; stopped");
    const payload=await response.json() as {
      status:string;results:Array<{
        ticker:string;window_start:number;session_end_date:string;
        open:number;high:number;low:number;close:number;volume:number
      }>;next_url?:string
    };
    console.log("RESPONSE "+JSON.stringify({
      ticker:target.ticker,date:target.date,attempt:attempts,
      status:payload.status,bars:payload.results?.length??0,paginated:Boolean(payload.next_url)
    }));
    return payload;
  }finally{clearTimeout(timeout);}
},{intervalMs:15000,maxRequests});
try{
  const result=await executeBoundedBackfill({
    targets,maxRequests,transport,persist:true,cacheRoot:root
  });
  console.log("RECOVERY_RESULT "+JSON.stringify({...result,attempts,targets,tradePlaced:false}));
  console.log("TM001 RESUMABLE BATCH: GREEN (SESSION SCHEDULE UNVERIFIED)");
}catch(error){
  console.error("RECOVERY_STOPPED "+JSON.stringify({
    attempts,reason:(error as Error).message,
    action:"Stop; inspect cache and rerun dry-run before any additional live execution"
  }));
  process.exitCode=1;
}
