import assert from "node:assert/strict";
import test from "node:test";
import { measureOrbPath } from "../src/research/orb-diagnostics.js";
import type { MinuteBar } from "../src/market/types.js";
const bar = (minute:number,high:number,low:number):MinuteBar=>({
 contractTicker:"NQZ6",productCode:"NQ",timestampMs:Date.parse("2026-10-01T14:00:00Z")+minute*60000,
 sessionEndDate:"2026-10-01",open:100,high,low,close:100,volume:1
});
test("excludes stop bar extremes from pre-exit excursion",()=>{
 const result=measureOrbPath([bar(0,130,95),bar(1,160,50)],100,"LONG",110,80,40,80);
 assert.equal(result.maxFavorableBeforeExitBarPoints,30);
 assert.equal(result.maxFavorableThroughExitBarPoints,60);
 assert.equal(result.maxAdverseBeforeExitBarPoints,5);
 assert.equal(result.maxAdverseThroughExitBarPoints,50);
 assert.equal(result.crossedOppositeOpeningBoundaryBeforeExit,false);
 assert.equal(result.crossedOppositeOpeningBoundaryThroughExit,true);
});
test("flags intraday opposite boundary crossing even if close recovers",()=>{
 const result=measureOrbPath([bar(0,120,70),bar(1,181,100)],100,"LONG",110,80,40,80);
 assert.equal(result.crossedOppositeOpeningBoundaryAfterEntry,true);
 assert.equal(result.crossedOppositeOpeningBoundaryBeforeExit,true);
});
test("same-bar stop and target is flagged as ambiguous",()=>{
 const result=measureOrbPath([bar(0,185,55)],100,"LONG",110,80,40,80);
 assert.equal(result.stopAndTargetSameBar,true);
 assert.equal(result.maxFavorableBeforeExitBarPoints,0);
});
