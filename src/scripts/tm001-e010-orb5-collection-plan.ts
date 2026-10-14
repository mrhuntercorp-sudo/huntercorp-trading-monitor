/** E010 prospective ORB5 collection plan: OFFLINE ONLY, no HTTP, no writes, no trading. */
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";

if(process.argv.length>2)throw Error("E010_NO_FLAGS_SUPPORTED_NO_RETRIEVAL");
const root=process.cwd();
const files=[
 "research/TM001-E008-orb5-prospective-validation-lock.md",
 "src/research/conservative-orb.ts",
 "src/scripts/tm001-ny-native-audit.ts",
 "src/scripts/tm001-e003-trade-ledger.ts",
 "src/scripts/tm001-oos1-capped-retrieval.ts"
];
const hashes=files.map(path=>{
 const absolute=resolve(root,path);
 if(!existsSync(absolute))throw Error("E010_REQUIRED_FILE_MISSING: "+path);
 return {path,sha256:createHash("sha256").update(readFileSync(absolute)).digest("hex")};
});
const manifest=readFileSync(resolve(root,files[0]!),"utf8");
for(const clause of ["2026-10-15","40 NQ-point stop","80 NQ-point target","30 independent ORB5 trades"])
 if(!manifest.includes(clause))throw Error("E010_FROZEN_CONTRACT_MISMATCH: "+clause);
const previous=readFileSync(resolve(root,files[4]!),"utf8");
if(!previous.includes('const dates=["2026-10-04"'))throw Error("E010_LEGACY_RETRIEVAL_CHANGED_REVIEW_REQUIRED");
console.log("E010_SOURCE_LOCK",JSON.stringify({hashes,prospectiveStart:"2026-10-15",candidate:"ORB5_NATIVE_40_80",frozen:true}));
console.log("E010_COLLECTION_PLAN",JSON.stringify({dataProvider:"Massive",rateLimitKnownRequestsPerMinute:5,plannedIntervalSeconds:15,plannedMaximumRequestsPerRun:4,automaticRetries:0,networkRequests:0,writes:0,orders:0,collectionMode:"OFFLINE_PLAN_ONLY",contract:"NQZ6",utcDailyCache:true,consecutiveSessions:true,tradeGate:30,rollPolicyVerified:false,calendarVerified:false,providerIncrementalCostVerified:false,requestAuthorization:false}));
console.log("E010_GATE",JSON.stringify({status:"BLOCKED_PENDING_ROLL_CALENDAR_COST_AND_EXPLICIT_RETRIEVAL_APPROVAL",executeEnabled:false,noStrategyApproved:true}));
