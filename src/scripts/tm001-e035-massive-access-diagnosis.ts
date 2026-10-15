/** E035 Massive futures access diagnosis: exactly two read-only API requests.
 * Requires explicit TM001_APPROVE_TWO_MASSIVE_DIAGNOSTICS=YES.
 * Never logs credentials, raw response bodies or full request URLs.
 */
import {newYorkClock} from "../market/time.js";
if(process.env.TM001_APPROVE_TWO_MASSIVE_DIAGNOSTICS!=="YES")
 throw Error("TWO_REQUEST_DIAGNOSIS_REQUIRES_EXPLICIT_APPROVAL");
const key=process.env.MASSIVE_API_KEY?.trim();
if(!key)throw Error("MASSIVE_API_KEY_MISSING");
const ticker=process.argv[2]??"NQZ6";
if(!/^NQ[A-Z][0-9]$/.test(ticker))throw Error("INVALID_NQ_TICKER");
const now=Date.now();
const et=newYorkClock(now);
const etToday=et.date;
// The CME Globex session begins 18:00 ET on the previous calendar day.
// A 24h UTC lookback deliberately covers that boundary without relying on
// API interpretation of an ET date string.
const windows=[
 {name:"KNOWN_HISTORICAL",from:"2026-10-01T00:00:00.000Z",to:"2026-10-02T00:00:00.000Z"},
 {name:"CURRENT_UTC_LOOKBACK",from:new Date(now-24*60*60*1000).toISOString(),to:new Date(now).toISOString()}
] as const;
type Row={window_start?:number;open?:number;high?:number;low?:number;close?:number;volume?:number};
type ResponseBody={results?:Row[];next_url?:string;status?:string;request_id?:string;count?:number};
const results=[];
for(const window of windows){
 const url=new URL("https://api.massive.com/futures/v1/aggs/"+ticker);
 url.searchParams.set("resolution","1min");
 url.searchParams.set("window_start.gte",window.from);
 url.searchParams.set("window_start.lt",window.to);
 url.searchParams.set("sort","window_start.desc");
 url.searchParams.set("limit","10");
 let httpStatus:number|null=null,rows:Row[]=[],pagination=false,providerStatus:string|null=null;
 let errorType:string|null=null;
 try{
  const response=await fetch(url,{headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(15000)});
  httpStatus=response.status;
  if(response.ok){
   const body=await response.json() as ResponseBody;
   rows=Array.isArray(body.results)?body.results:[];
   pagination=Boolean(body.next_url);
   providerStatus=typeof body.status==="string"?body.status:null;
  }else{
   errorType=response.status===401?"UNAUTHORIZED":response.status===403?"FORBIDDEN":
    response.status===429?"RATE_LIMITED":"HTTP_ERROR";
   // Do not print raw response body (could contain sensitive metadata).
   await response.body?.cancel();
  }
 }catch(e){errorType=(e as Error).name==="TimeoutError"?"TIMEOUT":"NETWORK_ERROR";}
 const timestamps=rows.map(b=>b.window_start).filter((n):n is number=>typeof n==="number"&&Number.isFinite(n))
  .map(n=>Math.floor(n/1_000_000)).sort((a,b)=>b-a);
 const latest=timestamps[0];
 results.push({window:window.name,fromUtc:window.from,toUtc:window.to,
  httpStatus,providerStatus,errorType,returnedBars:rows.length,morePages:pagination,
  latestBarStartUtc:latest===undefined?null:new Date(latest).toISOString(),
  latestBarEndAgeMinutes:latest===undefined?null:Math.round((now-latest-60000)/6000)/10});
 if(httpStatus===429)break; // Stop rather than hammer a rate-limited account.
}
console.log("=== TM001 E035 MASSIVE ACCESS DIAGNOSIS ===");
console.log("E035_DIAGNOSIS",JSON.stringify({ticker,etToday,utcNow:new Date(now).toISOString(),
 results,requestsMade:results.length,phonePublishes:0,orders:0,
 conclusion:"OBSERVATIONAL_ONLY_NO_PLAN_ENTITLEMENT_INFERENCE"}));
