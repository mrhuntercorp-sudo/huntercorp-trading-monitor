/** Oct 15 London-high rejection check, using verified cached minutes only.
 * Zero API calls. Never interprets missing data as no signal.
 */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {rthBars} from "../research/level-reclaim.js";
import {newYorkClock} from "../market/time.js";
import {LondonHighRejectionDetector} from "../research/market-intelligence.js";
import {simulateFixedShort} from "../research/fixed-short-feasibility.js";
import type {MinuteBar} from "../market/types.js";
const date="2026-10-15",ticker="NQZ6";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
let day=await cache.getDay({ticker,productCode:"NQ"},date);
try {
 const file="data/cache/massive/NQ/"+ticker+"/"+date+".research.json";
 const snapshot=JSON.parse(await readFile(file,"utf8")) as {
  schema:number;provider:string;ticker:string;productCode:string;utcDate:string;
  sha256:string;bars:MinuteBar[];
 };
 const checksum=createHash("sha256").update(JSON.stringify(snapshot.bars)).digest("hex");
 if(snapshot.schema!==1||snapshot.provider!=="massive"||snapshot.ticker!==ticker||
    snapshot.productCode!=="NQ"||snapshot.utcDate!==date||snapshot.sha256!==checksum||
    !Array.isArray(snapshot.bars)) throw Error("INVALID_RESEARCH_SNAPSHOT");
 if(snapshot.bars.length>day.length){
  day=snapshot.bars;
  console.log("RESEARCH_SNAPSHOT_USED",day.length);
 }
} catch(error) {
 if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error;
}
const all=day;
const minute=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return {date:c.date,m:c.hour*60+c.minute};};
const london=all.filter(b=>{const c=minute(b);return c.date===date&&c.m>=120&&c.m<540;});
const londonTimes=new Set(london.map(b=>minute(b).m));
const opening=rthBars(all,date).filter(b=>{const m=minute(b).m;return m>=570&&m<660;});
const openingTimes=new Set(opening.map(b=>minute(b).m));
const missingLondon=Array.from({length:420},(_,i)=>120+i).filter(m=>!londonTimes.has(m));
const missingOpening=Array.from({length:90},(_,i)=>570+i).filter(m=>!openingTimes.has(m));
console.log("=== TM001 OCT 15 LONDON REJECTION CHECK ===");
console.log("OCT15_LONDON_COVERAGE",JSON.stringify({londonBars:londonTimes.size,requiredLondon:420,
 openingBars:openingTimes.size,requiredOpening:90,missingLondon:missingLondon.length,
 missingOpening:missingOpening.length,requests:0,orders:0}));
if(missingLondon.length){
 console.log("OCT15_LONDON_RESULT",JSON.stringify({status:"INCOMPLETE_LONDON_CONTEXT_NO_SCORING"}));
 process.exit(0);
}
const londonHigh=Math.max(...london.map(b=>b.high));
const detector=new LondonHighRejectionDetector(date,ticker,londonHigh);
const observed=opening.map(b=>detector.consumeCompletedBar(b)).filter(x=>x!==null);
if(missingOpening.length){
 console.log("OCT15_LONDON_RESULT",JSON.stringify({status:"PARTIAL_OPENING_WINDOW",
 londonHigh,observedRejections:observed,missingOpeningMinutes:missingOpening.length,
 noSignalConclusionAllowed:false,tradeOutcomes:"NOT_SCORED"}));process.exit(0);
}
// Diagnostic only: describe price action without changing the frozen entry rule.
const swept=opening.filter(b=>b.high>londonHigh);
const touched=opening.filter(b=>b.high===londonHigh);
const closesBelowAfterSweep=swept.filter(b=>b.close<londonHigh);
const firstSweep=swept[0]??null;
const format=(b:MinuteBar|null)=>b?{
 et:newYorkClock(b.timestampMs).date+" "+String(newYorkClock(b.timestampMs).hour).padStart(2,"0")+":"+String(newYorkClock(b.timestampMs).minute).padStart(2,"0"),
 open:b.open,high:b.high,low:b.low,close:b.close}:null;
const windowHigh=Math.max(...opening.map(b=>b.high));
const windowLow=Math.min(...opening.map(b=>b.low));
console.log("OCT15_LONDON_PRICE_ACTION",JSON.stringify({
 londonHigh,openingHigh:windowHigh,openingLow:windowLow,
 highestAboveLondon:Math.max(0,windowHigh-londonHigh),
 candlesAboveLevel:swept.length,candlesTouchingLevel:touched.length,
 firstSweep:format(firstSweep),
 sweptAndClosedBelowCount:closesBelowAfterSweep.length,
 classification:swept.length===0?"NO_SWEEP":closesBelowAfterSweep.length===0?"SWEPT_NO_SAME_CANDLE_REJECTION":"REJECTION_PATTERN_PRESENT",
 detectorObservations:observed.length,diagnosticOnly:true,requests:0,orders:0
}));
// Post-11 observation: classify acceptance versus failure of the London-high break.
// Descriptive only. No new entries, optimization, or retrospective trade scoring.
const after= rthBars(all,date).filter(b=>{const m=minute(b).m;return m>=660&&m<690;});
const available=after.length;
const above=after.filter(b=>b.close>londonHigh);
const below=after.filter(b=>b.close<londonHigh);
const retest=after.filter(b=>b.low<=londonHigh&&b.high>=londonHigh);
const firstBelow=below[0]??null;
const last=after.at(-1)??null;
console.log("OCT15_POST11_CONTINUATION",JSON.stringify({
 window:"11:00-11:29_ET",availableMinutes:available,requiredMinutes:30,
 londonHigh,firstSweepEt:format(firstSweep)?.et??null,
 closesAbove:above.length,closesBelow:below.length,
 firstCloseBelow:format(firstBelow),retestCandles:retest.length,
 post11High:available?Math.max(...after.map(b=>b.high)):null,
 post11Low:available?Math.min(...after.map(b=>b.low)):null,
 lastCandle:format(last),
 classification:available<30?"INCOMPLETE_OBSERVATION":
  below.length>0?"BREAK_FAILED_AT_LEAST_ONCE":
  above.length===30?"HELD_ABOVE_ALL_30_CLOSES":"MIXED_OR_AT_LEVEL",
 researchOnly:true,noTradeScoring:true,requests:0,orders:0
}));
if(!observed.length){
 console.log("OCT15_LONDON_RESULT",JSON.stringify({status:"NO_LONDON_HIGH_REJECTION_BEFORE_11",londonHigh,observations:0}));
 process.exit(0);
}
const signal=observed[0]!;
const rth=rthBars(all,date);
const i=rth.findIndex(b=>b.timestampMs===Date.parse(signal.signalUtc));
const sim=simulateFixedShort(rth,i);
console.log("OCT15_LONDON_RESULT",JSON.stringify({status:sim?"SIMULATED_EXIT":"REJECTION_CONFIRMED_EXIT_DATA_PENDING",
 londonHigh,signal,entry:sim?{utc:new Date(rth[sim.entryIndex]!.timestampMs).toISOString(),
 price:sim.entryPrice,exitPrice:sim.exitPrice,reason:sim.reason,netPoints:sim.netPoints,
 ambiguousBar:sim.ambiguousBar}:null,simulationRules:"40_STOP_40_TARGET_10_BARS_2_POINTS_COST",
 researchOnly:true,independentValidation:false,noOrders:true}));
