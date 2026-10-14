import test from "node:test";
import assert from "node:assert/strict";
import {detectOvernightBreakout} from "../src/research/overnight-breakout-signals.js";
import type {MinuteBar} from "../src/market/types.js";
const MIN=60_000;
const bar=(timestampMs:number,close:number):MinuteBar=>({timestampMs,open:close,high:close+0.25,low:close-0.25,close,volume:1});
function sample(){
 // Monday 2026-10-12, Sunday evening and Monday London in America/New_York (EDT).
 const start=Date.parse("2026-10-11T22:00:00Z");
 const xs:MinuteBar[]=[];
 for(let i=0;i<930;i++){const price=i<540?100:105;xs.push(bar(start+i*MIN,price));}
 const open=Date.parse("2026-10-12T13:30:00Z");
 for(let i=0;i<30;i++)xs.push(bar(open+i*MIN,i<15?105:110));
 return xs;
}
test("London and full overnight use distinct levels and completed 15m closes",()=>{
 const xs=sample();
 const l=detectOvernightBreakout(xs,"2026-10-12","ORB002_LONDON");
 const o=detectOvernightBreakout(xs,"2026-10-12","ORB002_FULL_OVERNIGHT");
 assert.equal(l?.direction,"LONG");assert.equal(o?.direction,"LONG");
 assert.equal(l?.overnightLow,104.75);assert.equal(o?.overnightLow,99.75);
 assert.equal(l?.signalCloseMs,Date.parse("2026-10-12T14:00:00Z"));
 assert.equal(o?.signalCloseMs,Date.parse("2026-10-12T14:00:00Z"));
});
test("no signal from a wick without a close",()=>{
 const xs=sample();for(const b of xs.slice(930)){b.close=104;b.open=104;b.high=120;b.low=103;}
 assert.equal(detectOvernightBreakout(xs,"2026-10-12","ORB002_LONDON"),null);
});
test("missing overnight minute fails closed",()=>{
 const xs=sample();xs.splice(20,1);
 assert.throws(()=>detectOvernightBreakout(xs,"2026-10-12","ORB002_FULL_OVERNIGHT"),/INCOMPLETE_OVERNIGHT/);
});
