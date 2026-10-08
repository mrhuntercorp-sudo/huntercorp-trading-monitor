import { CachedHistoricalDays } from "../research/historical-cache.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE_ONLY: network fetch prohibited");}});
const cycles=[
 {name:"2025-12",old:"NQZ5",next:"NQH6",before:"2025-12-12",roll:"2025-12-15"},
 {name:"2026-03",old:"NQH6",next:"NQM6",before:"2026-03-13",roll:"2026-03-16"},
 {name:"2026-06",old:"NQM6",next:"NQU6",before:"2026-06-12",roll:"2026-06-15"},
 {name:"2026-09",old:"NQU6",next:"NQZ6",before:"2026-09-11",roll:"2026-09-14"}
] as const;
function rth(bars:readonly MinuteBar[],date:string){
 return bars.filter(b=>{const c=newYorkClock(b.timestampMs);const m=c.hour*60+c.minute;
  return c.date===date&&m>=570&&m<960;});
}
function summarize(oldBars:readonly MinuteBar[],newBars:readonly MinuteBar[],date:string){
 const a=rth(oldBars,date),b=rth(newBars,date);
 const oldByTime=new Map(a.map(x=>[x.timestampMs,x]));
 const paired=b.flatMap(x=>{const y=oldByTime.get(x.timestampMs);return y?[{timestampMs:x.timestampMs,old:y,new:x}]:[];});
 const volume=(xs:readonly MinuteBar[])=>xs.reduce((sum,x)=>sum+x.volume,0);
 const first=paired[0],last=paired.at(-1);
 const oldVolume=volume(a),newVolume=volume(b);
 return {date,oldBars:a.length,newBars:b.length,pairedMinutes:paired.length,
  completeBoth:a.length===390&&b.length===390&&paired.length===390,
  oldVolume,newVolume,newToOldVolumeRatio:oldVolume?Number((newVolume/oldVolume).toFixed(4)):null,
  firstPairedUtc:first?new Date(first.timestampMs).toISOString():null,
  firstOpenSpreadPoints:first?Number((first.new.open-first.old.open).toFixed(2)):null,
  lastPairedUtc:last?new Date(last.timestampMs).toISOString():null,
  lastCloseSpreadPoints:last?Number((last.new.close-last.old.close).toFixed(2)):null,
  minimumCloseSpreadPoints:paired.length?Number(Math.min(...paired.map(x=>x.new.close-x.old.close)).toFixed(2)):null,
  maximumCloseSpreadPoints:paired.length?Number(Math.max(...paired.map(x=>x.new.close-x.old.close)).toFixed(2)):null};
}
console.log("=== TM001 ROLLOVER PRICE CONTINUITY / LIQUIDITY AUDIT ===");
console.log("CACHE ONLY | ZERO API CALLS | OBSERVATIONAL | NO PRICE ADJUSTMENT | NO POLICY APPROVAL");
for(const c of cycles){
 console.log("\nCYCLE",c.name,c.old,"->",c.next);
 const results=[];
 for(const date of [c.before,c.roll]){
  const contract=(ticker:string):FuturesContract=>({ticker,productCode:"NQ"});
  const [a,b]=await Promise.all([cache.getDay(contract(c.old),date),cache.getDay(contract(c.next),date)]);
  const result=summarize(a,b,date);
  results.push(result);
  console.log("SESSION "+JSON.stringify(result));
 }
 const before=results[0]!,after=results[1]!;
 console.log("TRANSITION "+JSON.stringify({cycle:c.name,oldTicker:c.old,newTicker:c.next,
  beforeDate:c.before,rollDate:c.roll,
  priorOldLastCloseToRollOldFirstOpenPoints:null,
  priorNewLastCloseToRollNewFirstOpenPoints:null,
  priorOldLastCloseToRollNewFirstOpenPoints:null,
  note:"No cross-date continuity calculation: UTC-day cache does not guarantee adjacent session boundary bars; inspect matched intraday spreads and session quality first",
  beforeComplete:before.completeBoth,rollComplete:after.completeBoth,
  disposition:before.completeBoth&&after.completeBoth?"RESEARCH_REVIEW":"QUARANTINE_OR_REVIEW"}));
}
console.log("TM001 ROLLOVER CONTINUITY AUDIT: GREEN (DESCRIPTIVE; NO STITCHING APPROVED)");
