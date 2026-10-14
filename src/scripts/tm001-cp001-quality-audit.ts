/** CP001 full-sample quality audit, same exposed historical window. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {aggregateCp001FiveMinute,detectCp001Flags} from "../research/cp001-flags.js";
import {detectCp001Shoulders} from "../research/cp001-shoulders.js";
import {auditCp001Quality} from "../research/cp001-quality.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const byFlag:Record<string,number>={};const byPattern:Record<string,number>={};const excluded:{date:string;reason:string}[]=[];
let eligible=0,total=0,flagged=0,unflagged=0,morning=0,afternoon=0;
console.log("=== TM001 CP001 PATTERN QUALITY DIAGNOSTIC ===");
console.log("READ_ONLY | CACHE_ONLY | ZERO_API | ZERO_ORDERS | FROZEN_DETECTORS | EXPOSED_HISTORY");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const bars=aggregateCp001FiveMinute(day),patterns=[...detectCp001Flags(bars),...detectCp001Shoulders(bars)].sort((a,b)=>a.breakoutIndex-b.breakoutIndex);
 for(const p of patterns){
  total++;byPattern[p.pattern]=(byPattern[p.pattern]??0)+1;
  if(p.breakoutIndex<39)morning++;else afternoon++;
  const q=auditCp001Quality(bars,p);
  if(q.flags.length)flagged++;else unflagged++;
  for(const f of q.flags)byFlag[f]=(byFlag[f]??0)+1;
  console.log("CP001_QUALITY_EVENT",JSON.stringify({date,pattern:p.pattern,confirmationEtMinutesFromOpen:(p.breakoutIndex+1)*5,flags:q.flags,metrics:q.metrics}));
 }
}
console.log("CP001_QUALITY_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,total,byPattern,flaggedForReview:flagged,noAutomatedWarning:unflagged,morningBefore1245Et:morning,afternoonFrom1245Et:afternoon,byFlag,excluded,originalDetectionsUnchanged:true,warningDoesNotProveFalsePositive:true,noWarningDoesNotProveValidity:true,visualHumanReviewRequired:true,allHistoryExposed:true,liveTradingApproved:false}));
