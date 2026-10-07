import assert from "node:assert/strict";
import test from "node:test";
import type { MinuteBar } from "../src/market/types.js";
import { newYorkClock } from "../src/market/time.js";
import { backtestNaiveOrb } from "../src/research/backtest.js";

function bar(iso:string,o:number,h:number,l:number,c:number):MinuteBar {
 return {contractTicker:"NQZ6",productCode:"NQ",timestampMs:Date.parse(iso),
 sessionEndDate:"2026-10-07",open:o,high:h,low:l,close:c,volume:100};
}

test("New York conversion is DST-safe",()=>{
 assert.deepEqual(newYorkClock(Date.parse("2026-07-01T13:30:00Z")).hour,9);
 assert.deepEqual(newYorkClock(Date.parse("2026-12-01T14:30:00Z")).hour,9);
});

test("5m ORB executes a complete long target trade",()=>{
 const bars=[
  bar("2026-07-01T13:30:00Z",100,101,99,100),
  bar("2026-07-01T13:31:00Z",100,102,100,101),
  bar("2026-07-01T13:32:00Z",101,102,100,101),
  bar("2026-07-01T13:33:00Z",101,102,100,101),
  bar("2026-07-01T13:34:00Z",101,102,100,101),
  bar("2026-07-01T13:35:00Z",102,103,101,102.5),
  bar("2026-07-01T13:36:00Z",102.5,104.5,102,104.5),
 ];
 const trades=backtestNaiveOrb(bars,{openingRangeMinutes:5,stopPoints:2,targetPoints:2,
 contracts:1,friction:{roundTripCommissionUsd:5,slippageTicksPerSide:1}});
 assert.equal(trades.length,1);
 assert.equal(trades[0]!.direction,"LONG");
 assert.equal(trades[0]!.exitReason,"TARGET");
 assert.equal(trades[0]!.grossPnlUsd,40);
 assert.equal(trades[0]!.netPnlUsd,25);
});

test("same-bar stop and target ambiguity resolves pessimistically",()=>{
 const bars=[
  bar("2026-07-01T13:30:00Z",100,101,99,100),
  bar("2026-07-01T13:31:00Z",100,102,100,101),
  bar("2026-07-01T13:32:00Z",101,102,100,101),
  bar("2026-07-01T13:33:00Z",101,102,100,101),
  bar("2026-07-01T13:34:00Z",101,102,100,101),
  bar("2026-07-01T13:35:00Z",102,103,101,102.5),
  bar("2026-07-01T13:36:00Z",102.5,105,99,102),
 ];
 const trades=backtestNaiveOrb(bars,{openingRangeMinutes:5,stopPoints:2,targetPoints:2,
 contracts:1,friction:{roundTripCommissionUsd:0,slippageTicksPerSide:0}});
 assert.equal(trades[0]!.exitReason,"STOP");
 assert.equal(trades[0]!.netPnlUsd,-40);
});
