/** E031 cache-only integration; no real ntfy publish. */
import {strict as assert} from "node:assert";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {makeBriefing} from "../research/market-intelligence.js";
import {IntelligencePipeline} from "../research/intelligence-pipeline.js";
import {LocalNotificationOutbox} from "../research/local-notification-outbox.js";
import {ResearchPushBridge} from "../research/research-push-bridge.js";
import {rthBars} from "../research/level-reclaim.js";
import type {MinuteBar} from "../market/types.js";
const date="2026-10-02",ticker="NQZ6";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const bars:MinuteBar[]=[];
for(const d of ["2026-09-30","2026-10-01","2026-10-02"])bars.push(...await cache.getDay({ticker,productCode:"NQ"},d));
const briefing=makeBriefing(bars,date,"2026-10-01",ticker);
const pipeline=new IntelligencePipeline(date,ticker,briefing.levels.london.high);
const events=rthBars(bars,date).map(b=>pipeline.consume(b).event).filter(e=>e!==null);
assert.equal(events.length,1);
const event=events[0]!;
const topic="huntercorp_tm001_test_0123456789abcdef0123456789";
const dir=await mkdtemp(join(tmpdir(),"tm001-e031-"));
let sends=0;
const transport=async()=>{sends++;return {ok:true,status:200};};
try{
 const path=join(dir,"outbox.json");
 const bridge=new ResearchPushBridge(new LocalNotificationOutbox(path),topic);
 const now=Date.parse(event.confirmedAtUtc)+1000;
 assert.equal((await bridge.process(event,{nowMs:Date.now(),mode:"live",approved:true,transport})).status,"STALE");
 assert.equal(sends,0);
 await assert.rejects(()=>bridge.process(event,{nowMs:now,mode:"live",transport}),/EXPLICIT_APPROVAL/);
 assert.equal((await bridge.process(event,{nowMs:now,transport})).status,"DRY_RUN");
 assert.equal((await bridge.process(event,{nowMs:now,mode:"live",approved:true,transport})).status,"DUPLICATE");
 assert.equal(sends,0);
 const second=new ResearchPushBridge(new LocalNotificationOutbox(path),topic);
 assert.equal((await second.process(event,{nowMs:now,mode:"live",approved:true,transport})).status,"DUPLICATE");
 assert.equal(sends,0);
 const live=new ResearchPushBridge(new LocalNotificationOutbox(join(dir,"live.json")),topic);
 assert.equal((await live.process(event,{nowMs:now,mode:"live",approved:true,transport})).status,"PUBLISHED");
 assert.equal(sends,1);
 assert.equal((await live.process(event,{nowMs:now,mode:"live",approved:true,transport})).status,"DUPLICATE");
 assert.equal(sends,1);
 console.log("=== TM001 E031 GUARDED PUSH BRIDGE REGRESSION ===");
 console.log("E031_COMPLETE",JSON.stringify({cachedReplay:true,staleSuppression:true,
  approvalGate:true,defaultDryRun:true,restartDedup:true,mockedLivePublish:true,
  realNetworkCalls:0,liveMarketFeed:false,orders:false}));
}finally{await rm(dir,{recursive:true,force:true});}
