/** E033 deterministic end-to-end cache replay. Zero API calls and zero phone publishes. */
import {strict as assert} from "node:assert";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runCachedNqResearch} from "../research/cached-nq-monitor-runner.js";
import {DurableResearchDelivery} from "../research/durable-research-delivery.js";
const dir=await mkdtemp(join(tmpdir(),"tm001-e033-"));
const input={tradeDate:"2026-10-02",previousTradeDate:"2026-10-01",ticker:"NQZ6",
 cacheDates:["2026-09-30","2026-10-01","2026-10-02"],ledgerPath:join(dir,"delivery.json"),
 topic:"huntercorp_tm001_test_0123456789abcdef0123456789"};
try{
 const first=await runCachedNqResearch(input);
 assert.equal(first.mode,"CACHE_ONLY_DRY_RUN");
 assert.equal(first.observations,1);
 assert.equal(first.deliveryDecisions.DRY_RUN,1);
 assert.equal(first.gapQuarantined,false);
 assert.equal(first.networkCalls,0);
 assert.equal(first.orders,0);
 const second=await runCachedNqResearch(input);
 assert.equal(second.observations,1);
 assert.equal(second.deliveryDecisions.ALREADY_HANDLED,1);
 const state=new DurableResearchDelivery(input.ledgerPath,input.topic);
 // Replay did not publish; the durable ledger holds a PENDING local observation.
 const {readFile}=await import("node:fs/promises");
 const raw=JSON.parse(await readFile(input.ledgerPath,"utf8")) as {records:Array<{id:string;state:string}>};
 assert.equal(raw.records.length,1);
 assert.equal(raw.records[0]?.state,"PENDING");
 assert.equal(await state.inspect(raw.records[0]!.id),"PENDING");
 console.log("=== TM001 E033 CACHE-ONLY MONITOR RUNNER ===");
 console.log("E033_COMPLETE",JSON.stringify({first,second,ledgerRecords:raw.records.length,
  persistentDryRun:true,restartDedup:true,realNetworkCalls:0,phonePublishes:0,orders:0}));
}finally{await rm(dir,{recursive:true,force:true});}
