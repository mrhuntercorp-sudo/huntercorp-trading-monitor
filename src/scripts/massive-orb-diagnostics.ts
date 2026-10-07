import { MassiveHistoricalProvider } from "../providers/massive.js";
import { backtestNaiveOrb } from "../research/backtest.js";
import { buildSessionFeatures } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import type { MinuteBar } from "../market/types.js";

const key = process.env.MASSIVE_API_KEY?.trim();
if (!key) throw new Error("MASSIVE_API_KEY missing.");
const tradeDates = ["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25",
  "2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02"];
const fetchDates = ["2026-09-20",...tradeDates.slice(0,5),"2026-09-27",...tradeDates.slice(5)];
const provider = new MassiveHistoricalProvider(key);
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const contract = await provider.resolveContract("NQ", tradeDates.at(-1)!);
console.log("=== TM001 ORB BREAKOUT DIAGNOSTICS ===");
console.log("Contract:", contract.ticker, "single contract; rollover not validated");
console.log("13-second request spacing; 12 historical date requests.");
const all: MinuteBar[] = [];
for (const date of fetchDates) {
  await wait(13000);
  const batch = await provider.getContractMinuteBars(contract,date,date);
  console.log(date, "UTC bars:",batch.length);
  all.push(...batch);
}
all.sort((a,b)=>a.timestampMs-b.timestampMs);
if (new Set(all.map(b=>b.timestampMs)).size !== all.length) throw new Error("Duplicate timestamps in historical data");
function etMinute(b: MinuteBar) {
  const c = newYorkClock(b.timestampMs);
  return {date:c.date,minute:c.hour*60+c.minute};
}
for (const date of tradeDates) {
  const rth = all.filter(b=>{const c=etMinute(b);return c.date===date&&c.minute>=570&&c.minute<960;});
  if(rth.length!==390||rth.slice(1).some((b,i)=>b.timestampMs-rth[i]!.timestampMs!==60000))
    throw new Error("Incomplete RTH session: "+date);
  const previous = tradeDates[tradeDates.indexOf(date)-1] ?? "2026-09-18";
  const f=buildSessionFeatures(all,date,previous);
  if(f.overnight?.bars!==930) throw new Error("Incomplete overnight session: "+date+" bars="+f.overnight?.bars);
}
for (const minutes of [5,15] as const) {
  const trades=backtestNaiveOrb(all,{openingRangeMinutes:minutes,stopPoints:40,targetPoints:80,
    contracts:1,friction:{roundTripCommissionUsd:6,slippageTicksPerSide:1}})
    .filter(t=>tradeDates.includes(t.date));
  console.log("\n=== "+minutes+"m ORB diagnostics ===");
  for(const trade of trades) {
    const date=trade.date;
    const day=all.filter(b=>etMinute(b).date===date&&etMinute(b).minute>=570&&etMinute(b).minute<960);
    const opening=day.slice(0,minutes);
    const high=Math.max(...opening.map(b=>b.high));
    const low=Math.min(...opening.map(b=>b.low));
    const trigger=day.slice(minutes).find(b=>b.close>high||b.close<low);
    if(!trigger||trigger.close!==trade.entry) throw new Error("Trigger mismatch: "+date);
    const later=day.filter(b=>b.timestampMs>trigger.timestampMs);
    let exitIndex=later.length-1;
    for(let i=0;i<later.length;i++){
      const b=later[i]!;
      const stop=trade.direction==="LONG"?trade.entry-40:trade.entry+40;
      const target=trade.direction==="LONG"?trade.entry+80:trade.entry-80;
      if(trade.direction==="LONG"?(b.low<=stop||b.high>=target):(b.high>=stop||b.low<=target)){exitIndex=i;break;}
    }
    const held=later.slice(0,exitIndex+1);
    const favorable=held.map(b=>trade.direction==="LONG"?b.high-trade.entry:trade.entry-b.low);
    const adverse=held.map(b=>trade.direction==="LONG"?trade.entry-b.low:b.high-trade.entry);
    const features=buildSessionFeatures(all,date,tradeDates[tradeDates.indexOf(date)-1]??"2026-09-18");
    const clock=newYorkClock(trigger.timestampMs);
    const postClose=later.at(-1)?.close??trigger.close;
    console.log(JSON.stringify({date,direction:trade.direction,entryEt:`${String(clock.hour).padStart(2,"0")}:${String(clock.minute).padStart(2,"0")}`,
      openingWidthPoints:high-low,overnightHigh:features.overnight?.high,
      overnightLow:features.overnight?.low,entry:trade.entry,
      entryAboveOvernightHigh:trade.entry>(features.overnight?.high??Infinity),
      entryBelowOvernightLow:trade.entry<(features.overnight?.low??-Infinity),
      maxFavorablePoints:held.length?Math.max(0,...favorable):0,
      maxAdversePoints:held.length?Math.max(0,...adverse):0,
      closeBeyondOppositeOpeningBoundary:trade.direction==="LONG"?postClose<low:postClose>high,
      exitReason:trade.exitReason,netPnlUsd:trade.netPnlUsd}));
  }
}
console.log("TM001 BREAKOUT DIAGNOSTICS: GREEN (DESCRIPTIVE; NOT STRATEGY APPROVAL)");
