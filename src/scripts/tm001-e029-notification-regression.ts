/** E029 cache-only replay and restart-safe local outbox regression. */
import {strict as assert} from "node:assert";
import {mkdtemp,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {makeBriefing} from "../research/market-intelligence.js";
import {IntelligencePipeline} from "../research/intelligence-pipeline.js";
import {LocalNotificationOutbox} from "../research/local-notification-outbox.js";
import {rthBars} from "../research/level-reclaim.js";
import type {MinuteBar} from "../market/types.js";
const ticker="NQZ6",date="2026-10-02",previous="2026-10-01";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const bars:MinuteBar[]=[];
for(const d of ["2026-09-30","2026-10-01","2026-10-02"])bars.push(...await cache.getDay({ticker,productCode:"NQ"},d));
const briefing=makeBriefing(bars,date,previous,ticker);
const pipeline=new IntelligencePipeline(date,ticker,briefing.levels.london.high);
const events=rthBars(bars,date).map(b=>pipeline.consume(b).event).filter(e=>e!==null);
assert.equal(events.length,1);
const directory=await mkdtemp(join(tmpdir(),"tm001-e029-"));
try{
 const path=join(directory,"notices.json");
 const first=new LocalNotificationOutbox(path);
 const result=await first.enqueue(events[0]!);
 assert.equal(result.inserted,true);
 assert.equal(result.notice.delivery,"LOCAL_PENDING");
 assert.match(result.notice.body,/Research observation only/);
 const restarted=new LocalNotificationOutbox(path);
 const second=await restarted.enqueue(events[0]!);
 assert.equal(second.inserted,false);
 assert.deepEqual(second.notice,result.notice);
 const stored=JSON.parse(await readFile(path,"utf8")) as {schema:number;notices:unknown[]};
 assert.equal(stored.schema,1);
 assert.equal(stored.notices.length,1);
 assert.throws(()=>new LocalNotificationOutbox(path).enqueue({...events[0]!,classification:"LIVE" as "RESEARCH_ONLY"}),/UNSUPPORTED_EVENT/);
 console.log("=== TM001 E029 LOCAL NOTIFICATION REGRESSION ===");
 console.log("NOTICE",JSON.stringify(result.notice));
 console.log("E029_COMPLETE",JSON.stringify({localPersistence:true,restartSafeDeduplication:true,
 oneNoticePerEvent:true,researchOnly:true,noApi:true,noOrders:true,phoneDelivery:false}));
}finally{await rm(directory,{recursive:true,force:true});}
