/** TM001 OOS1 locked-window fetch. Default DRY RUN; explicit --execute needed for network. */
import {readFileSync,existsSync,mkdirSync,writeFileSync,renameSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import type {MinuteBar} from "../market/types.js";

const root=process.cwd();
const manifest="docs/TM001-OOS1-LOCKED-RETRIEVAL-MANIFEST.md";
if(!existsSync(resolve(root,manifest)))throw Error("OOS_MANIFEST_MISSING");
const doc=readFileSync(resolve(root,manifest),"utf8");
if(!doc.includes("2026-10-05 through 2026-10-09")||!doc.includes("NQZ6"))throw Error("OOS_MANIFEST_CHANGED");
const execute=process.argv.includes("--execute");
if(process.argv.some(a=>a.startsWith("--")&&a!=="--execute"))throw Error("UNKNOWN_FLAG");
const dates=["2026-10-04","2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"];
const base=resolve(root,"data/cache/massive/NQ/NQZ6");
const missing=dates.filter(d=>!existsSync(join(base,d+".json")));
console.log("TM001 OOS1 FETCH PLAN",JSON.stringify({holdout:"2026-10-05..2026-10-09",contract:"NQZ6",utcCacheDates:dates,missing,execute,maxHttpRequests:missing.length,intervalMs:15000,automaticRetries:0,orders:0}));
if(!execute){console.log("DRY_RUN_ONLY ZERO_API ZERO_WRITES");process.exit(0);}
if(!process.env.MASSIVE_API_KEY?.trim())throw Error("MASSIVE_API_KEY_MISSING");
if(missing.length===0){console.log("ALL_REQUESTED_DATES_ALREADY_CACHED");process.exit(0);}
if(missing.length>6)throw Error("REQUEST_CAP_EXCEEDED");
const key=process.env.MASSIVE_API_KEY.trim();
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
let requests=0;
for(const date of missing){
 if(requests>0)await wait(15000);
 const end=new Date(Date.parse(date+"T00:00:00Z")+86400000).toISOString().slice(0,10);
 const url=new URL("/futures/v1/aggs/NQZ6","https://api.massive.com");
 url.searchParams.set("resolution","1min");
 url.searchParams.set("window_start.gte",date);
 url.searchParams.set("window_start.lt",end);
 url.searchParams.set("limit","50000");
 url.searchParams.set("sort","window_start.asc");
 url.searchParams.set("apiKey",key);
 requests++;
 const response=await fetch(url,{redirect:"error"});
 if(!response.ok)throw Error("HTTP_"+response.status+"_REQUEST_"+requests);
 const payload=await response.json() as {results?:Array<{ticker?:string;window_start?:number;session_end_date?:string;open?:number;high?:number;low?:number;close?:number;volume?:number}>;next_url?:string};
 if(payload.next_url)throw Error("PAGINATION_REQUIRED_STOP_NO_FOLLOWUP_"+date);
 const bars:MinuteBar[]=[];
 for(const row of payload.results??[]){
  if(row.window_start==null||row.open==null||row.high==null||row.low==null||row.close==null||row.volume==null||!row.session_end_date)throw Error("INCOMPLETE_VENDOR_ROW_"+date);
  bars.push({contractTicker:row.ticker??"NQZ6",productCode:"NQ",timestampMs:Math.floor(row.window_start/1_000_000),sessionEndDate:row.session_end_date,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume});
 }
 const start=Date.parse(date+"T00:00:00Z"),finish=start+86400000;
 let prev=-Infinity;
 for(const b of bars){
  if(b.contractTicker!=="NQZ6"||!Number.isSafeInteger(b.timestampMs)||b.timestampMs<start||b.timestampMs>=finish||b.timestampMs<=prev||b.timestampMs%60000!==0||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.volume<0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.low>b.high)throw Error("INVALID_BARS_"+date);
  prev=b.timestampMs;
 }
 if(!bars.length)throw Error("EMPTY_VENDOR_DATE_"+date);
 const sha256=createHash("sha256").update(JSON.stringify(bars)).digest("hex");
 const record={schema:1,provider:"massive",ticker:"NQZ6",productCode:"NQ",utcDate:date,sha256,bars};
 mkdirSync(base,{recursive:true});
 const dest=join(base,date+".json"),tmp=dest+"."+process.pid+".tmp";
 if(existsSync(dest))throw Error("CACHE_RACE_"+date);
 writeFileSync(tmp,JSON.stringify(record),{flag:"wx"});
 renameSync(tmp,dest);
 console.log("CACHED",date,"bars",bars.length,"sha256",sha256,"httpRequests",requests);
}
console.log("OOS1_FETCH_COMPLETE",JSON.stringify({requests,datesCached:missing.length,holdoutEvaluationPerformed:false}));
