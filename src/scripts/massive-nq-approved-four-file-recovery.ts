import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { executeBoundedBackfill } from "./massive-nq-backfill-safety.js";
import { pacedTransport } from "./massive-nq-paced-transport.js";

const targets = [
  {ticker:"NQU6",date:"2026-08-20"},
  {ticker:"NQU6",date:"2026-08-21"},
  {ticker:"NQU6",date:"2026-08-23"},
  {ticker:"NQU6",date:"2026-08-24"}
] as const;
const root="data/cache/massive/NQ";
const live=process.argv.includes("--execute");
console.log("=== TM001 APPROVED FOUR-REQUEST NQ RECOVERY ===");
console.log("MAX 4 REQUESTS | >=15s SPACING | NO RETRIES | NO PAGINATION | NO TRADES");
console.log("TARGETS "+JSON.stringify(targets));
if(!live){
  console.log("DRY_RUN: zero API calls and zero cache writes");
  process.exit(0);
}
const key=process.env.MASSIVE_API_KEY?.trim();
if(!key)throw Error("MASSIVE_API_KEY missing: zero requests made");
// All-or-nothing preflight prevents accidentally spending requests on existing files.
for(const target of targets){
  const path=join(root,target.ticker,target.date+".json");
  try{
    await readFile(path,"utf8");
    throw Error("CACHE_ALREADY_EXISTS: "+target.ticker+" "+target.date+"; stop before any request");
  }catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
  }
}
let attempts=0;
const transport=pacedTransport(async(target:{ticker:string;date:string})=>{
  attempts++;
  const url=new URL("https://api.massive.com/futures/v1/aggs/"+target.ticker);
  url.searchParams.set("resolution","1min");
  url.searchParams.set("window_start.gte",target.date);
  const end=new Date(Date.parse(target.date+"T00:00:00Z")+86400000).toISOString().slice(0,10);
  url.searchParams.set("window_start.lt",end);
  url.searchParams.set("limit","50000");
  url.searchParams.set("sort","window_start.asc");
  url.searchParams.set("apiKey",key);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(url,{signal:controller.signal,redirect:"error"});
    if(!response.ok)throw Error("MASSIVE_HTTP_"+response.status+" (request "+attempts+"); stopped");
    const payload=await response.json() as {
      status:string;
      results:Array<{ticker:string;window_start:number;session_end_date:string;open:number;high:number;low:number;close:number;volume:number}>;
      next_url?:string;
    };
    console.log("RESPONSE "+JSON.stringify({ticker:target.ticker,date:target.date,attempt:attempts,status:payload.status,bars:payload.results?.length??0,paginated:Boolean(payload.next_url)}));
    return payload;
  }finally{clearTimeout(timeout);}
},{intervalMs:15000,maxRequests:4});
try{
  const result=await executeBoundedBackfill({
    targets:[...targets],maxRequests:4,transport,persist:true,cacheRoot:root
  });
  console.log("RECOVERY_RESULT "+JSON.stringify({...result,attempts,targets,tradePlaced:false}));
  console.log("TM001 FOUR-FILE RECOVERY: GREEN (DATA NOT YET SESSION-VERIFIED)");
}catch(error){
  console.error("RECOVERY_STOPPED "+JSON.stringify({attempts,reason:(error as Error).message,remainingRequestsNotAuthorizedForRetry:true}));
  process.exitCode=1;
}
