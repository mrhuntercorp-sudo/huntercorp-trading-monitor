/** E014 prospective ORB5 collector. Dry run ONLY until separate authorization gate is implemented. */
import {existsSync,readdirSync,readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {join,resolve} from "node:path";

if(process.argv.length!==2)throw Error("E014_EXECUTION_DISABLED_ARGUMENTS_NOT_ALLOWED");
const locked=[
 ["research/TM001-E008-orb5-prospective-validation-lock.md","fb49edd8734e11ffc0ca5618c3a9e5d062af32c1ecf7c6f102224aa9de32254b"],
 ["src/research/conservative-orb.ts","40351d50e8c8757b9f0f57103fb73ca0568f4225a4c4ec688948768f67e787f6"]
] as const;
for(const [file,hash] of locked){
 if(createHash("sha256").update(readFileSync(resolve(file))).digest("hex")!==hash)throw Error("E014_FROZEN_SOURCE_MISMATCH "+file);
}
if(!existsSync("research/TM001-E013-cme-calendar-roll-source-review.md"))throw Error("E013_SOURCE_REVIEW_MISSING");
const start="2026-10-15";
const today=new Date().toISOString().slice(0,10);
const dir=resolve("data/cache/massive/NQ/NQZ6");
const cache=new Set(existsSync(dir)?readdirSync(dir).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).map(x=>x.slice(0,10)):[]);
const planned:{tradeDate:string;contract:string;utcDate:string;cached:boolean;reason:string}[]=[];
const maxDates=4;
let candidates=0;
for(let t=Date.parse(start+"T00:00:00Z");t<Date.parse(today+"T00:00:00Z")&&candidates<maxDates;t+=86400000){
 const date=new Date(t).toISOString().slice(0,10);
 const weekday=new Date(t).getUTCDay();
 if(weekday===0||weekday===6)continue;
 candidates++;
 const prior=new Date(t-86400000).toISOString().slice(0,10);
 for(const utcDate of [prior,date]){
  planned.push({tradeDate:date,contract:"NQZ6_PROVISIONAL",utcDate,cached:cache.has(utcDate),reason:"CALENDAR_AND_ROLL_REVIEW_REQUIRED"});
 }
}
const uniqueMissing=[...new Set(planned.filter(x=>!x.cached).map(x=>x.utcDate))];
console.log("E014_DRY_RUN",JSON.stringify({start,today,planned,missingUtcDates:uniqueMissing,proposedRequestCap:4,rateLimitPerMinute:5,spacingSeconds:15,automaticRetries:0,apiRequests:0,cacheWrites:0,orders:0,strategyEvaluated:false}));
console.log("E014_GATE",JSON.stringify({executionImplemented:false,executionEnabled:false,calendarVerified:false,rollVerified:false,incrementalCostVerified:false,userAuthorized:false,ready:false,reason:"NO_NETWORK_IMPLEMENTATION_UNTIL_SEPARATE_GATES_PASS"}));
