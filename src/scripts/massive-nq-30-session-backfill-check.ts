import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planMissingNqFiles } from "./massive-nq-backfill-candidates.js";
import { executeBoundedBackfill } from "./massive-nq-backfill-safety.js";
import { pacedTransport, type Clock } from "./massive-nq-paced-transport.js";

if (process.argv.includes("--execute")) throw Error("LIVE_ACQUISITION_DISABLED");
console.log("=== TM001 30-SESSION BACKFILL OFFLINE SAFETY CHECK ===");
console.log("ZERO API | NO ENV | NO PRODUCTION CACHE WRITES | NO TRADES");
const plan = await planMissingNqFiles({
  end: "2026-10-02", tradingSessions: 30, cacheRoot: "data/cache/massive/NQ"
});
console.log("REAL_CACHE_PLAN " + JSON.stringify({
  firstDate:plan.firstDate,lastDate:plan.lastDate,
  missingUtcFiles:plan.candidates.length,targets:plan.candidates,
  rolloverReview:plan.rolloverReview,
  holidayPolicyVerified:plan.holidayPolicyVerified,
  rollPolicyVerified:plan.rollPolicyVerified,
  approvedLiveRequests:0
}));
assert.ok(plan.candidates.length > 0, "No missing files to exercise");
const root = await mkdtemp(join(tmpdir(),"tm001-backfill-30-"));
try {
  const targets = plan.candidates.slice(0,4);
  let time = 0;
  const starts:number[]=[];
  const clock:Clock={now:()=>time,wait:async ms=>{time+=ms;}};
  const fixture = pacedTransport(async (target:{ticker:string;date:string})=>{
    starts.push(time);
    return {status:"OK",results:[{
      ticker:target.ticker,
      window_start:Date.parse(target.date+"T14:30:00Z")*1_000_000,
      session_end_date:target.date,
      open:100,high:101,low:99,close:100.5,volume:10
    }]};
  },{intervalMs:15000,maxRequests:4,clock});
  const result=await executeBoundedBackfill({
    targets,maxRequests:4,transport:fixture,persist:true,cacheRoot:root
  });
  assert.deepEqual(result,{requests:4,validated:4,written:4});
  assert.deepEqual(starts,[0,15000,30000,45000]);
  for(const target of targets){
    const payload=JSON.parse(await readFile(join(root,target.ticker,target.date+".json"),"utf8"));
    assert.equal(payload.schema,1);
    assert.equal(payload.bars.length,1);
    assert.match(payload.sha256,/^[a-f0-9]{64}$/);
  }
  let blocked=false;
  try {
    await executeBoundedBackfill({targets:[targets[0]!],maxRequests:1,
      transport:async()=>{throw Error("SHOULD_NOT_CALL_NETWORK");},
      persist:true,cacheRoot:root});
  }catch(e){blocked=String(e).includes("CACHE_ALREADY_EXISTS");}
  assert.equal(blocked,true,"Existing cache must block transport");
  let budgetBlocked=false;
  try {
    await executeBoundedBackfill({targets,maxRequests:3,
      transport:async()=>{throw Error("SHOULD_NOT_CALL_NETWORK");},
      persist:false,cacheRoot:root});
  }catch(e){budgetBlocked=String(e).includes("BUDGET_EXCEEDED_BEFORE_START");}
  assert.equal(budgetBlocked,true,"Budget must block before transport");
  console.log("OFFLINE_RESULT "+JSON.stringify({
    ...result,simulatedStartsMs:starts,temporaryCacheOnly:true,
    existingFileOverwriteBlocked:blocked,overBudgetBlocked:budgetBlocked,
    liveRequests:0,liveAcquisitionEnabled:false
  }));
  console.log("TM001 30-SESSION BACKFILL SAFETY: GREEN (OFFLINE)");
}finally{
  await rm(root,{recursive:true,force:true});
}
