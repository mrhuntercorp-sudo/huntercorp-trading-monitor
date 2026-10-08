import { MassiveHistoricalProvider } from "../providers/massive.js";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { assessSparseMinutes } from "../research/sparse-minute-assessment.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract } from "../market/types.js";

const key=process.env.MASSIVE_API_KEY?.trim();
if(!key) throw new Error("MASSIVE_API_KEY missing");
const provider=new MassiveHistoricalProvider(key);
let last=0;
const cached=new CachedHistoricalDays({async getContractMinuteBars(c,from,to){
 const wait=Math.max(0,13000-(Date.now()-last));
 if(wait) await new Promise<void>(r=>setTimeout(r,wait));
 last=Date.now();
 return provider.getContractMinuteBars(c,from,to);
}});

const cycles=[
 {name:"2025-12 Z5->H6",old:"NQZ5",next:"NQH6",reference:"2025-12-15",
  dates:["2025-12-09","2025-12-10","2025-12-11","2025-12-12","2025-12-15","2025-12-16"]},
 {name:"2026-03 H6->M6",old:"NQH6",next:"NQM6",reference:"2026-03-16",
  dates:["2026-03-10","2026-03-11","2026-03-12","2026-03-13","2026-03-16","2026-03-17"]},
 {name:"2026-06 M6->U6",old:"NQM6",next:"NQU6",reference:"2026-06-15",
  dates:["2026-06-09","2026-06-10","2026-06-11","2026-06-12","2026-06-15","2026-06-16"]},
 {name:"2026-09 U6->Z6",old:"NQU6",next:"NQZ6",reference:"2026-09-14",
  dates:["2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-14","2026-09-15"]}
] as const;

function rth(bars:any[],date:string){
 return bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;
  return c.date===date&&m>=570&&m<960;});
}
console.log("=== TM001 MULTI-ROLLOVER HISTORICAL VALIDATION ===");
console.log("Research only; RTH observed volume; no imputation; no rollover approval.");

for(const cycle of cycles){
 let firstNewLeader:string|undefined;
 let usable=0,review=0,quarantine=0;
 console.log("\nCYCLE",cycle.name,"reference",cycle.reference);
 for(const date of cycle.dates){
  const rows:{ticker:string;volume:number;missing:number;missingTs:number[]}[]=[];
  for(const ticker of [cycle.old,cycle.next]){
   const c:FuturesContract={ticker,productCode:"NQ"};
   const bars=await cached.getDay(c,date);
   const session=rth(bars,date);
   const present=new Set(session.map(b=>b.timestampMs));
   const missingTs:number[]=[];
   // Build the expected RTH minute grid in New York time, including EST/EDT transitions.
   const utcMidnight=Date.parse(date+"T00:00:00Z");
   let expected=0;
   for(let t=utcMidnight;t<utcMidnight+24*60*60000;t+=60000){
    const clock=newYorkClock(t);
    const minute=clock.hour*60+clock.minute;
    if(clock.date!==date||minute<570||minute>=960) continue;
    expected++;
    if(!present.has(t)) missingTs.push(t);
   }
   if(expected!==390) throw new Error(`Unexpected RTH calendar coverage ${date}: ${expected}`);
   rows.push({ticker,volume:session.reduce((n,b)=>n+b.volume,0),missing:missingTs.length,missingTs});
  }
  const a=rows[0]!,b=rows[1]!;
  const classification=assessSparseMinutes(a.missingTs,b.missingTs);
  const canCompare=classification.status==="COMPLETE";
  if(canCompare) usable++; else review++;
  if(classification.status==="SHARED_GAP_QUARANTINE") quarantine++;
  const leader=canCompare?(b.volume>a.volume?b.ticker:a.volume>b.volume?a.ticker:"TIE"):"REVIEW";
  if(leader===cycle.next&&!firstNewLeader) firstNewLeader=date;
  console.log(JSON.stringify({cycle:cycle.name,date,oldTicker:a.ticker,oldVolume:a.volume,oldMissing:a.missing,
    newTicker:b.ticker,newVolume:b.volume,newMissing:b.missing,classification,usableComparison:canCompare,
    observedLeader:leader,newToOldRatio:a.volume?Number((b.volume/a.volume).toFixed(4)):null}));
 }
 console.log(JSON.stringify({cycle:cycle.name,referenceRollDate:cycle.reference,
   firstCompleteNewContractVolumeLeader:firstNewLeader??null,usableComparisonDays:usable,
   reviewDays:review,sharedGapQuarantineDays:quarantine}));
}
console.log("TM001 MULTI-ROLLOVER VALIDATION: GREEN (DESCRIPTIVE; POLICY NOT APPROVED)");
