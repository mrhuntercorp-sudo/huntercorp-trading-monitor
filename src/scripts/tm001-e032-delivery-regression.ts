/** E032 offline persistence, failure, restart and stale regression. */
import {strict as assert} from "node:assert";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DurableResearchDelivery} from "../research/durable-research-delivery.js";
import type {PipelineEvent} from "../research/intelligence-pipeline.js";
const event:PipelineEvent={
 id:"TM001:LONDON_HIGH_REJECTION:NQZ6:2026-10-02:2026-10-02T13:43:00.000Z",
 type:"LONDON_HIGH_REJECTION_OBSERVED",product:"NQ",ticker:"NQZ6",tradeDate:"2026-10-02",
 observedAtUtc:"2026-10-02T13:43:00.000Z",confirmedAtUtc:"2026-10-02T13:44:00.000Z",
 level:31179,wickHigh:31181.75,close:31163,
 classification:"RESEARCH_ONLY",delivery:"LOCAL_ONLY",independentValidation:false};
const topic="huntercorp_tm001_test_0123456789abcdef0123456789";
const now=Date.parse(event.confirmedAtUtc)+1000;
const dir=await mkdtemp(join(tmpdir(),"tm001-e032-"));
let calls=0;
const ok=async()=>{calls++;return {ok:true,status:200};};
try{
 const dryPath=join(dir,"dry.json");
 const dry=new DurableResearchDelivery(dryPath,topic);
 assert.equal((await dry.process(event,{nowMs:now})).status,"DRY_RUN");
 assert.equal(await dry.inspect("NOTICE:"+event.id),"PENDING");
 assert.equal((await new DurableResearchDelivery(dryPath,topic).process(event,{nowMs:now,mode:"live",approved:true,transport:ok})).status,"ALREADY_HANDLED");
 assert.equal(calls,0);
 const livePath=join(dir,"live.json");
 const live=new DurableResearchDelivery(livePath,topic);
 assert.equal((await live.process(event,{nowMs:Date.now(),mode:"live",approved:true,transport:ok})).status,"STALE");
 await assert.rejects(()=>live.process(event,{nowMs:now,mode:"live",transport:ok}),/LIVE_REQUIRES/);
 assert.equal(await live.inspect("NOTICE:"+event.id),null);
 const parallel=await Promise.all([
  live.process(event,{nowMs:now,mode:"live",approved:true,transport:ok}),
  live.process(event,{nowMs:now,mode:"live",approved:true,transport:ok})]);
 assert.deepEqual(parallel.map(r=>r.status),["PUBLISHED","ALREADY_HANDLED"]);
 assert.equal(calls,1);
 assert.equal(await new DurableResearchDelivery(livePath,topic).inspect("NOTICE:"+event.id),"PUBLISHED");
 const failure=new DurableResearchDelivery(join(dir,"failure.json"),topic);
 assert.equal((await failure.process(event,{nowMs:now,mode:"live",approved:true,transport:async()=>{calls++;return {ok:false,status:429};}})).status,"FAILED");
 assert.equal(await failure.inspect("NOTICE:"+event.id),"FAILED");
 assert.equal((await new DurableResearchDelivery(failure.path,topic).process(event,{nowMs:now,mode:"live",approved:true,transport:ok})).status,"ALREADY_HANDLED");
 const unknown=new DurableResearchDelivery(join(dir,"unknown.json"),topic);
 assert.equal((await unknown.process(event,{nowMs:now,mode:"live",approved:true,transport:async()=>{calls++;throw Error("TIMEOUT");}})).status,"UNCERTAIN");
 assert.equal(await unknown.inspect("NOTICE:"+event.id),"UNCERTAIN");
 assert.equal((await new DurableResearchDelivery(unknown.path,topic).process(event,{nowMs:now,mode:"live",approved:true,transport:ok})).status,"ALREADY_HANDLED");
 console.log("=== TM001 E032 DURABLE DELIVERY REGRESSION ===");
 console.log("E032_COMPLETE",JSON.stringify({dryRun:true,persistentStates:true,restartDedup:true,
  staleBlocked:true,approvalGate:true,parallelInstanceSerialization:true,
  httpFailureRecorded:true,unknownOutcomeQuarantined:true,noAutomaticRetry:true,
  mockedTransportCalls:calls,realNetworkCalls:0,noOrders:true}));
}finally{await rm(dir,{recursive:true,force:true});}
