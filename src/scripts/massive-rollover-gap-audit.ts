import { readFile } from "node:fs/promises";
import { newYorkClock } from "../market/time.js";
import type { MinuteBar } from "../market/types.js";

const date="2026-09-11";
const expectedStart=Date.parse(date+"T13:30:00Z"); // September EDT, 09:30 New York
const expected=Array.from({length:390},(_,i)=>expectedStart+i*60000);
console.log("=== TM001 SEPT 11 RTH COVERAGE FORENSICS ===");
console.log("Read-only local cache; no APIs; no imputation.");
for(const ticker of ["NQU6","NQZ6"]) {
 const path="data/cache/massive/NQ/"+ticker+"/"+date+".json";
 const record=JSON.parse(await readFile(path,"utf8")) as {bars:MinuteBar[],ticker:string,utcDate:string};
 if(record.ticker!==ticker||record.utcDate!==date||!Array.isArray(record.bars)) throw new Error("Cache identity mismatch "+ticker);
 const actual=new Set(record.bars.map(b=>b.timestampMs));
 const missing=expected.filter(t=>!actual.has(t));
 const rth=record.bars.filter(b=>{
  const c=newYorkClock(b.timestampMs);const m=c.hour*60+c.minute;
  return c.date===date&&m>=570&&m<960;
 });
 const ranges:{from:string,to:string,count:number}[]=[];
 for(const t of missing) {
  const last=ranges.at(-1);
  if(last&&Date.parse(last.to) + 60000===t) {last.to=new Date(t).toISOString();last.count++;}
  else ranges.push({from:new Date(t).toISOString(),to:new Date(t).toISOString(),count:1});
 }
 const first=rth[0],last=rth.at(-1);
 console.log(JSON.stringify({ticker,utcDayBars:record.bars.length,rthBars:rth.length,
  firstRthBarUtc:first?new Date(first.timestampMs).toISOString():null,
  lastRthBarUtc:last?new Date(last.timestampMs).toISOString():null,
  missingMinutes:missing.length,missingRanges:ranges,
  sampleAroundGap:record.bars.filter(b=>b.timestampMs>=Date.parse(date+"T17:00:00Z")&&b.timestampMs<Date.parse(date+"T20:00:00Z"))
   .filter((_,i)=>i%15===0).map(b=>({utc:new Date(b.timestampMs).toISOString(),volume:b.volume,sessionEndDate:b.sessionEndDate}))
 },null,2));
}
console.log("TM001 GAP FORENSICS: COMPLETE (DESCRIPTIVE; NO ROLLOVER APPROVAL)");
