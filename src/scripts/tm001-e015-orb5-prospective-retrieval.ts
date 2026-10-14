/**
 * TM001 E015 — prospective NQ daily-bar retrieval.
 * Default dry-run. --execute requires a separate, explicit, verified authorization file.
 * No strategy evaluation, orders, retries, pagination, or date substitution.
 */
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import type {MinuteBar} from "../market/types.js";

const args=process.argv.slice(2);
if(args.some(a=>a!=="--execute")||args.length>1)throw Error("E015_UNKNOWN_ARGUMENT");
const execute=args.includes("--execute");
const root=process.cwd();
const authPath=resolve(root,"research/local-e015-retrieval-authorization.json");
const locked=[
 ["research/TM001-E008-orb5-prospective-validation-lock.md","fb49edd8734e11ffc0ca5618c3a9e5d062af32c1ecf7c6f102224aa9de32254b"],
 ["src/research/conservative-orb.ts","40351d50e8c8757b9f0f57103fb73ca0568f4225a4c4ec688948768f67e787f6"]
] as const;
for(const [file,expected] of locked)
 if(createHash("sha256").update(readFileSync(resolve(root,file))).digest("hex")!==expected)
  throw Error("E015_FROZEN_SOURCE_MISMATCH "+file);

type Authorization={schema:1;tradeDate:string;contract:"NQZ6"|"NQH7";utcDates:string[];
 verifiedCmeRegularSession:boolean;verifiedPriorSessionContractSelection:boolean;
 verifiedMassiveIncrementalCost:boolean;explicitUserApproval:boolean;
 maxRequests:4;expiresUtcDate:string};
const dateValid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const today=new Date().toISOString().slice(0,10);
const exists=existsSync(authPath);
let auth:Authorization|undefined;
if(exists){
 auth=JSON.parse(readFileSync(authPath,"utf8")) as Authorization;
 if(auth.schema!==1||!dateValid(auth.tradeDate)||!dateValid(auth.expiresUtcDate)||
    auth.tradeDate<"2026-10-15"||auth.tradeDate>=today||
    auth.expiresUtcDate<today||
    !["NQZ6","NQH7"].includes(auth.contract)||
    !Array.isArray(auth.utcDates)||auth.utcDates.length<1||auth.utcDates.length>4||
    auth.utcDates.some(d=>!dateValid(d)||d>auth.tradeDate)||
    new Set(auth.utcDates).size!==auth.utcDates.length||auth.maxRequests!==4)
    throw Error("E015_INVALID_AUTHORIZATION");
}
const eligible=Boolean(auth?.verifiedCmeRegularSession&&auth?.verifiedPriorSessionContractSelection&&
 auth?.verifiedMassiveIncrementalCost&&auth?.explicitUserApproval);
const base=auth?resolve(root,"data/cache/massive/NQ",auth.contract):"";
const missing=auth?auth.utcDates.filter(d=>!existsSync(join(base,d+".json"))):[];
const ready=eligible&&missing.length<=4;
console.log("E015_PLAN",JSON.stringify({today,execute,authorizationFilePresent:exists,tradeDate:auth?.tradeDate??null,
 contract:auth?.contract??null,utcDates:auth?.utcDates??[],missing,maximumRequests:4,
 minimumIntervalMs:15000,automaticRetries:0,rateLimitPerMinute:5,
 verifiedCalendar:auth?.verifiedCmeRegularSession??false,verifiedRoll:auth?.verifiedPriorSessionContractSelection??false,
 verifiedCost:auth?.verifiedMassiveIncrementalCost??false,userApproval:auth?.explicitUserApproval??false,
 ready,orders:0,strategyEvaluation:false}));
if(!execute){console.log("E015_DRY_RUN_ZERO_API_ZERO_WRITES");process.exit(0);}
if(!ready)throw Error("E015_EXECUTION_BLOCKED_MISSING_VERIFIED_AUTHORIZATION");
if(!process.env.MASSIVE_API_KEY?.trim())throw Error("E015_MASSIVE_API_KEY_MISSING");
if(!auth)throw Error("E015_AUTH_MISSING");
if(missing.length===0){console.log("E015_ALL_DATES_CACHED_ZERO_API");process.exit(0);}
const key=process.env.MASSIVE_API_KEY.trim();
const wait=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
let requests=0;
for(const date of missing){
 if(requests>0)await wait(15000);
 const next=new Date(Date.parse(date+"T00:00:00Z")+86400000).toISOString().slice(0,10);
 const url=new URL("/futures/v1/aggs/"+auth.contract,"https://api.massive.com");
 for(const [k,v] of Object.entries({"resolution":"1min","window_start.gte":date,
  "window_start.lt":next,"limit":"50000","sort":"window_start.asc","apiKey":key}))url.searchParams.set(k,v);
 requests++;
 const response=await fetch(url,{redirect:"error"});
 if(!response.ok)throw Error("E015_HTTP_"+response.status+"_REQUEST_"+requests);
 const payload=await response.json() as {results?:Array<{ticker?:string;window_start?:number;session_end_date?:string;
  open?:number;high?:number;low?:number;close?:number;volume?:number}>;next_url?:string};
 if(payload.next_url)throw Error("E015_PAGINATION_STOP_"+date);
 const bars:MinuteBar[]=[];
 for(const row of payload.results??[]){
  if(row.window_start==null||row.open==null||row.high==null||row.low==null||
     row.close==null||row.volume==null||!row.session_end_date)throw Error("E015_INCOMPLETE_ROW_"+date);
  bars.push({contractTicker:row.ticker??auth.contract,productCode:"NQ",
   timestampMs:Math.floor(row.window_start/1000000),sessionEndDate:row.session_end_date,
   open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume});
 }
 const start=Date.parse(date+"T00:00:00Z");
 let prior=-Infinity;
 for(const b of bars){
  if(b.contractTicker!==auth.contract||!Number.isSafeInteger(b.timestampMs)||
   b.timestampMs<start||b.timestampMs>=start+86400000||b.timestampMs<=prior||
   b.timestampMs%60000!==0||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||
   b.volume<0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||
   b.low>b.high)throw Error("E015_INVALID_BARS_"+date);
  prior=b.timestampMs;
 }
 if(!bars.length)throw Error("E015_EMPTY_RESPONSE_"+date);
 const record={schema:1,provider:"massive",ticker:auth.contract,productCode:"NQ",
  utcDate:date,sha256:createHash("sha256").update(JSON.stringify(bars)).digest("hex"),bars};
 mkdirSync(base,{recursive:true});
 const dest=join(base,date+".json"),tmp=dest+"."+process.pid+".tmp";
 if(existsSync(dest))throw Error("E015_CACHE_ALREADY_EXISTS_"+date);
 try{writeFileSync(tmp,JSON.stringify(record),{flag:"wx"});renameSync(tmp,dest);}
 catch(e){throw e;}
 console.log("E015_CACHED",JSON.stringify({date,contract:auth.contract,bars:bars.length,sha256:record.sha256,requests}));
}
console.log("E015_COMPLETE",JSON.stringify({requests,cacheFilesWritten:missing.length,orders:0,strategyEvaluation:false}));
