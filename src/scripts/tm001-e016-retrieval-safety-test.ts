/** E016 regression checks: E015 must fail closed without authorization. Zero network/writes/orders. */
import {spawnSync} from "node:child_process";
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
const script=resolve("src/scripts/tm001-e015-orb5-prospective-retrieval.ts");
const auth=resolve("research/local-e015-retrieval-authorization.json");
if(existsSync(auth))throw Error("E016_REFUSE_EXISTING_AUTHORIZATION_FILE");
const locked=[
 ["research/TM001-E008-orb5-prospective-validation-lock.md","fb49edd8734e11ffc0ca5618c3a9e5d062af32c1ecf7c6f102224aa9de32254b"],
 ["src/research/conservative-orb.ts","40351d50e8c8757b9f0f57103fb73ca0568f4225a4c4ec688948768f67e787f6"]
] as const;
for(const [file,sha] of locked)
 if(createHash("sha256").update(readFileSync(file)).digest("hex")!==sha)throw Error("E016_FROZEN_HASH_MISMATCH "+file);
const env={...process.env,MASSIVE_API_KEY:"E016_DUMMY_NO_NETWORK"};
const run=(args:string[])=>spawnSync(process.execPath,["--import","tsx",script,...args],{encoding:"utf8",env,timeout:15000});
const dry=run([]);
if(dry.status!==0||!dry.stdout.includes("E015_DRY_RUN_ZERO_API_ZERO_WRITES")||
 !dry.stdout.includes('"ready":false'))throw Error("E016_DRY_RUN_REGRESSION "+dry.stderr);
console.log("E016_PASS",JSON.stringify({case:"DEFAULT_DRY_RUN",networkRequests:0,writes:0}));
const execute=run(["--execute"]);
if(execute.status===0||!execute.stderr.includes("E015_EXECUTION_BLOCKED_MISSING_VERIFIED_AUTHORIZATION"))
 throw Error("E016_EXECUTE_GATE_REGRESSION "+execute.stdout+" "+execute.stderr);
console.log("E016_PASS",JSON.stringify({case:"EXECUTE_REJECTED_WITHOUT_AUTHORIZATION",networkRequests:0,writes:0}));
const unknown=run(["--unsafe"]);
if(unknown.status===0||!unknown.stderr.includes("E015_UNKNOWN_ARGUMENT"))
 throw Error("E016_FLAG_REGRESSION");
console.log("E016_PASS",JSON.stringify({case:"UNKNOWN_FLAG_REJECTED",networkRequests:0,writes:0}));
console.log("E016_GATE",JSON.stringify({status:"GREEN_3_OF_3",collectorEnabled:false,liveTrading:false,prospectiveDataCollected:false}));
