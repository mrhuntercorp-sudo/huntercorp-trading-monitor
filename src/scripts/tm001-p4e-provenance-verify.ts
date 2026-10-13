/** Read-only SHA-256 verification of frozen P4e source and cache manifest. */
import {createHash} from "node:crypto";
import {readFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {provisionalClosedDates,provisionalNqContract} from "./massive-nq-calendar-policy.js";

const root=process.cwd();
const manifest=readFileSync(resolve(root,"docs/TM001-P4E-PROVENANCE-FREEZE.md"),"utf8");
const sourceBlock=manifest.match(/## Production source SHA-256[^]*?```text\n([^]*?)\n```/);
const dataBlock=manifest.match(/## Exact requested historical-cache dependencies[^]*?```text\n([^]*?)\n```/);
if(!sourceBlock||!dataBlock)throw Error("PROVENANCE_MANIFEST_FORMAT_INVALID");
const sourceRows=sourceBlock[1]!.trim().split(/\r?\n/);
const dataRows=dataBlock[1]!.trim().split(/\r?\n/);
const failures:string[]=[];
function verify(path:string,expected:string){
 const full=resolve(root,path);
 if(!existsSync(full)){failures.push("MISSING "+path);return;}
 const actual=createHash("sha256").update(readFileSync(full)).digest("hex").toUpperCase();
 if(actual!==expected)failures.push("HASH_MISMATCH "+path+" expected="+expected+" actual="+actual);
}
const sources=new Set<string>();
for(const row of sourceRows){
 const m=row.match(/^([0-9A-F]{64}) (src\/[^\s]+)$/);
 if(!m)throw Error("INVALID_SOURCE_ROW "+row);
 if(sources.has(m[2]!))throw Error("DUPLICATE_SOURCE "+m[2]);
 sources.add(m[2]!);verify(m[2]!,m[1]!);
}
const data=new Set<string>();
for(const row of dataRows){
 const m=row.match(/^(NQ[A-Z][0-9]) (\d{4}-\d{2}-\d{2}) ([0-9A-F]{64})$/);
 if(!m)throw Error("INVALID_DATA_ROW "+row);
 const key=m[1]+"/"+m[2]+".json";
 if(data.has(key))throw Error("DUPLICATE_DATA "+key);
 data.add(key);verify("data/cache/massive/NQ/"+key,m[3]!);
}
const ms=(s:string)=>Date.parse(s+"T00:00:00Z");
const iso=(n:number)=>new Date(n).toISOString().slice(0,10);
const dates:string[]=[];
for(let t=ms("2026-10-02");dates.length<30;t-=86400000){
 const date=iso(t),weekday=new Date(t).getUTCDay();
 if(weekday!==0&&weekday!==6&&!provisionalClosedDates.has(date))dates.push(date);
}
const expected=new Set<string>();
for(const date of dates){
 const ticker=provisionalNqContract(date);
 expected.add(ticker+"/"+date+".json");
 expected.add(ticker+"/"+iso(ms(date)-86400000)+".json");
}
for(const key of expected)if(!data.has(key))failures.push("UNRECORDED_DEPENDENCY "+key);
for(const key of data)if(!expected.has(key))failures.push("UNEXPECTED_DEPENDENCY "+key);
if(sources.size!==7)failures.push("SOURCE_COUNT "+sources.size+" expected=7");
if(data.size!==37)failures.push("DATA_COUNT "+data.size+" expected=37");
for(const failure of failures)console.error(failure);
console.log("TM001 P4e PROVENANCE "+JSON.stringify({sources:sources.size,cacheFiles:data.size,expectedCacheFiles:expected.size,candidateSessions:dates.length,failures:failures.length,readOnly:true}));
if(failures.length)process.exitCode=1;
else console.log("TM001 P4e PROVENANCE SHA256 GREEN "+(sources.size+data.size)+"/"+(sources.size+data.size));
