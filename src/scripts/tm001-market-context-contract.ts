import {strict as assert} from "node:assert";
import type {MinuteBar} from "../market/types.js";
import type {KnownLevel} from "../research/level-reclaim.js";
import {marketContextAt} from "../research/market-context.js";
const base=Date.parse("2026-10-05T13:30:00Z");
const bar=(i:number,o:number,h:number,l:number,c:number,v=100):MinuteBar=>({contractTicker:"NQZ6",productCode:"NQ",timestampMs:base+i*60000,sessionEndDate:"2026-10-05",open:o,high:h,low:l,close:c,volume:v});
const day=[bar(0,100,102,98,101),bar(1,101,104,100,103),bar(2,103,105,101,104),bar(3,104,106,102,105),bar(4,105,108,104,107),bar(5,107,110,106,109)];
const levels:KnownLevel[]=[
 {kind:"OVERNIGHT_HIGH",price:120,knownAtIndex:0,side:"HIGH"},
 {kind:"OVERNIGHT_LOW",price:90,knownAtIndex:0,side:"LOW"},
 {kind:"ORB_5_HIGH",price:108,knownAtIndex:5,side:"HIGH"},
 {kind:"ORB_5_LOW",price:98,knownAtIndex:5,side:"LOW"},
 {kind:"ORB_15_HIGH",price:130,knownAtIndex:15,side:"HIGH"}];
let checks=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
const early=marketContextAt(day,levels,4);
eq(early.openingFiveWidthPoints,null);
eq(early.nearestAboveKind,"OVERNIGHT_HIGH");
eq(early.nearestBelowKind,"OVERNIGHT_LOW");
eq(early.trailingFiveRangePoints,10);
eq(early.trailingFiveNetPoints,7);
eq(early.observedBars,5);
const later=marketContextAt(day,levels,5);
eq(later.openingFiveWidthPoints,10);
eq(later.nearestBelowKind,"ORB_5_HIGH");
eq(later.nearestBelowPoints,1);
eq(later.nearestAboveKind,"OVERNIGHT_HIGH");
eq(later.nearestAbovePoints,11);
eq(later.observedBars,6);
eq(marketContextAt(day.slice(0,5),levels,4).vwap,early.vwap);
eq(marketContextAt([bar(0,100,102,98,101,0)],levels,0).vwap,null);
eq(marketContextAt([bar(0,100,102,98,101,0)],levels,0).distanceFromVwapPoints,null);
assert.throws(()=>marketContextAt(day,levels,6),/INVALID_CONTEXT_INDEX/);checks++;
assert.throws(()=>marketContextAt([bar(0,100,99,98,101)],levels,0),/INVALID_CONTEXT_BARS/);checks++;
console.log("TM001 MARKET CONTEXT CONTRACT GREEN "+checks+"/"+checks+" | ZERO_API | ZERO_TRADES");
