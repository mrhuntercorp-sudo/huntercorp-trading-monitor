import assert from "node:assert/strict";
import { test } from "node:test";
import type { MinuteBar } from "../src/market/types.js";
import { backtestConservativeOrb } from "../src/research/conservative-orb.js";

function session(): MinuteBar[] {
  return Array.from({length:390},(_,i)=>({
    contractTicker:"NQZ6",productCode:"NQ" as const,sessionEndDate:"2026-10-01",
    timestampMs:Date.parse("2026-10-01T13:30:00Z")+i*60000,
    open:100,high:105,low:95,close:100,volume:10,
  }));
}
function set(bars:MinuteBar[],i:number,o:number,h:number,l:number,c:number) {
  bars[i]={...bars[i]!,open:o,high:h,low:l,close:c};
}
const config={openingRangeMinutes:5 as const,stopPoints:10,targetPoints:10,
  contracts:1,friction:{roundTripCommissionUsd:6,slippageTicksPerSide:1}};
test("full RTH is required; missing minute is quarantined",()=>{
  const bars=session();bars.splice(30,1);
  const r=backtestConservativeOrb(bars,config);
  assert.equal(r.trades.length,0);
  assert.equal(r.excluded[0]?.reason,"INCOMPLETE_RTH");
});
test("next bar open is entry, not breakout close",()=>{
  const bars=session();set(bars,5,100,112,99,110);set(bars,6,115,127,114,120);
  const r=backtestConservativeOrb(bars,config);
  assert.equal(r.trades.length,1);
  assert.equal(r.trades[0]?.entry,115);
  assert.equal(r.trades[0]?.exit,125);
  assert.equal(r.trades[0]?.netPnlUsd,184);
});
test("entry bar can hit stop and target; stop wins and ambiguity is recorded",()=>{
  const bars=session();set(bars,5,100,112,99,110);set(bars,6,110,125,95,110);
  const t=backtestConservativeOrb(bars,config).trades[0]!;
  assert.equal(t.exitReason,"STOP");assert.equal(t.exit,100);
  assert.equal(t.ambiguousExit,true);
});
test("gap below long stop uses adverse opening price",()=>{
  const bars=session();set(bars,5,100,112,99,110);
  set(bars,6,110,112,105,110);set(bars,7,90,95,85,90);
  const t=backtestConservativeOrb(bars,config).trades[0]!;
  assert.equal(t.exitReason,"STOP");assert.equal(t.exit,90);
  assert.equal(t.gapThroughStop,true);
});
test("gap above long target is not rewarded beyond target",()=>{
  const bars=session();set(bars,5,100,112,99,110);
  set(bars,6,110,112,105,110);set(bars,7,130,135,125,130);
  const t=backtestConservativeOrb(bars,config).trades[0]!;
  assert.equal(t.exitReason,"TARGET");assert.equal(t.exit,120);
});
test("short gap above stop uses adverse open",()=>{
  const bars=session();set(bars,5,100,101,88,90);
  set(bars,6,90,95,88,90);set(bars,7,115,120,110,115);
  const t=backtestConservativeOrb(bars,config).trades[0]!;
  assert.equal(t.direction,"SHORT");assert.equal(t.exit,115);
  assert.equal(t.gapThroughStop,true);
});
test("no next bar after 15:59 breakout means no trade",()=>{
  const bars=session();set(bars,389,100,112,99,110);
  const r=backtestConservativeOrb(bars,config);
  assert.equal(r.trades.length,0);
  assert.equal(r.excluded[0]?.reason,"NO_NEXT_BAR_FOR_ENTRY");
});
test("complete RTH with no breakout produces no trade and no exclusions",()=>{
  const r=backtestConservativeOrb(session(),config);
  assert.deepEqual(r,{trades:[],excluded:[]});
});
