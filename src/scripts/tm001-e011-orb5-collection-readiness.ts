/** TM001 E011: prospective ORB5 readiness inventory. Offline and read-only. */
import {existsSync,readdirSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";

if(process.argv.length!==2)throw Error("E011_FLAGS_NOT_ALLOWED");
const start="2026-10-15";
const manifest="research/TM001-E008-orb5-prospective-validation-lock.md";
const source="src/research/conservative-orb.ts";
const hashes=[
 {path:manifest,sha256:"fb49edd8734e11ffc0ca5618c3a9e5d062af32c1ecf7c6f102224aa9de32254b"},
 {path:source,sha256:"40351d50e8c8757b9f0f57103fb73ca0568f4225a4c4ec688948768f67e787f6"}
];
for(const item of hashes){
 const data=readFileSync(resolve(item.path));
 const hash=createHash("sha256").update(data).digest("hex");
 if(hash!==item.sha256)throw Error("E011_SOURCE_LOCK_MISMATCH "+item.path);
}
const end=new Date().toISOString().slice(0,10);
const dir=resolve("data/cache/massive/NQ/NQZ6");
const cached=new Set(existsSync(dir)?readdirSync(dir).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n=>n.slice(0,10)):[]);
const dates:{date:string;weekday:string;contract:string;utcFilesPresent:string[];utcFilesMissing:string[];status:string}[]=[];
for(let t=Date.parse(start+"T00:00:00Z");t<=Date.parse(end+"T00:00:00Z");t+=86400000){
 const d=new Date(t),weekday=d.toLocaleDateString("en-US",{weekday:"short",timeZone:"UTC"});
 if(weekday==="Sat"||weekday==="Sun")continue;
 const date=d.toISOString().slice(0,10);
 // This is an inventory, NOT a calendar or rollover certification.
 const previous=new Date(t-86400000).toISOString().slice(0,10);
 const required=[previous,date];
 const utcFilesPresent=required.filter(x=>cached.has(x));
 const utcFilesMissing=required.filter(x=>!cached.has(x));
 dates.push({date,weekday,contract:"NQZ6_PROVISIONAL",utcFilesPresent,utcFilesMissing,status:"CALENDAR_AND_ROLL_UNVERIFIED"});
}
console.log("E011_SOURCE_LOCK",JSON.stringify({hashesVerified:hashes,sourceUnmodified:true}));
console.log("E011_INVENTORY",JSON.stringify({start,end,dates,cacheOnly:true,apiRequests:0,writes:0,orders:0,resultsNotEvaluated:true}));
console.log("E011_GATE",JSON.stringify({status:"NOT_READY_FOR_RETRIEVAL",knownRateLimitPerMinute:5,proposedPaceSeconds:15,maxRequestsPerRun:4,automaticRetries:0,calendarVerified:false,rollPolicyVerified:false,incrementalCostVerified:false,explicitRetrievalApproval:false,collectorImplemented:false,liveApproval:false}));
