/** E034 one-request Massive Basic recency probe. No orders, ntfy, or continuous polling.
 * Requires explicit TM001_APPROVE_ONE_MASSIVE_PROBE=YES and MASSIVE_API_KEY.
 */
import {newYorkClock} from "../market/time.js";
if(process.env.TM001_APPROVE_ONE_MASSIVE_PROBE!=="YES")throw Error("ONE_PROBE_REQUIRES_EXPLICIT_APPROVAL");
const key=process.env.MASSIVE_API_KEY?.trim();
if(!key)throw Error("MASSIVE_API_KEY_MISSING");
const ticker=process.argv[2]??"NQZ6";
if(!/^NQ[A-Z][0-9]$/.test(ticker))throw Error("INVALID_NQ_TICKER");
const now=Date.now(),today=newYorkClock(now).date;
const url=new URL("https://api.massive.com/futures/v1/aggs/"+ticker);
url.searchParams.set("resolution","1min");
url.searchParams.set("window_start.gte",today);
url.searchParams.set("window_start.lte",new Date(now).toISOString());
url.searchParams.set("sort","window_start.desc");
url.searchParams.set("limit","10");
const response=await fetch(url,{headers:{"Authorization":"Bearer "+key},signal:AbortSignal.timeout(12000)});
const raw=await response.text();
if(!response.ok){
 console.log("E034_PROBE",JSON.stringify({httpStatus:response.status,ticker,requestedEtDate:today,
  access:"NOT_CONFIRMED",errorCode:response.status===403?"FORBIDDEN":response.status===429?"RATE_LIMITED":"HTTP_ERROR",requests:1}));
 process.exitCode=1;
}else{
 const payload=JSON.parse(raw) as {results?:Array<{window_start?:number;open?:number;high?:number;low?:number;close?:number;volume?:number}>;next_url?:string};
 const bars=payload.results??[];
 const times=bars.map(b=>b.window_start).filter((x):x is number=>typeof x==="number"&&Number.isFinite(x))
  .map(ns=>Math.floor(ns/1_000_000)).sort((a,b)=>b-a);
 const latest=times[0];
 const ageMinutes=latest===undefined?null:Math.round((now-(latest+60000))/60000*10)/10;
 console.log("=== TM001 E034 MASSIVE RECENCY PROBE ===");
 console.log("E034_PROBE",JSON.stringify({httpStatus:response.status,ticker,requestedEtDate:today,
  responseBars:bars.length,latestBarStartUtc:latest===undefined?null:new Date(latest).toISOString(),
  latestBarAgeAfterCloseMinutes:ageMinutes,
  currentMinuteAvailable:ageMinutes!==null&&ageMinutes<3,
  sourcePlanRecency:"UNVERIFIED_BY_PROBE",requests:1,morePages:Boolean(payload.next_url),
  realNetworkCalls:1,phonePublishes:0,orders:0}));
}
