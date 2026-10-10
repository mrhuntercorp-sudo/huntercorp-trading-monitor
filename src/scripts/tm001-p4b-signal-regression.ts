import assert from "node:assert/strict";
import {generateP4Signals,type P4Strategy,type P4Session} from "../research/p4-nq-signals.js";
import type {P3Bar} from "../research/p3-nq-signals.js";
const start=Date.parse("2026-10-08T13:30:00Z"); // 09:30 ET (DST)
const mk=(i:number,o=100,h=o+1,l=o-1,c=o):P3Bar=>({timestampMs:start+i*60000,open:o,high:h,low:l,close:c});
const session=(bars:P3Bar[]):P4Session=>({bars,contractVerified:true,calendarVerified:true});
const ids:P4Strategy[]=["SESSION_TREND_PULLBACK_V1","VOLATILITY_COMPRESSION_EXPANSION_V1","OPENING_DRIVE_FAILURE_V1","LOW_TREND_MEAN_REVERSION_V1"];
let n=0;function test(name:string,f:()=>void){f();n++;console.log("PASS "+name);}
const flat=Array.from({length:320},(_,i)=>mk(i));
for(const id of ids){
 test(id+" FLAT_NO_TRADE",()=>assert.deepEqual(generateP4Signals(session(flat),id),[]));
 test(id+" MISSING_NEXT_BAR",()=>assert.deepEqual(generateP4Signals(session(flat.slice(0,1)),id),[]));
 test(id+" REJECT_UNVERIFIED_CONTRACT",()=>assert.throws(()=>generateP4Signals({...session(flat),contractVerified:false},id),/UNVERIFIED/));
 test(id+" REJECT_UNVERIFIED_CALENDAR",()=>assert.throws(()=>generateP4Signals({...session(flat),calendarVerified:false},id),/UNVERIFIED/));
 test(id+" REJECT_GAP",()=>{const b=flat.slice(0,40);b[30]={...b[30]!,timestampMs:b[30]!.timestampMs+60000};assert.throws(()=>generateP4Signals(session(b),id),/GAP/);});
 test(id+" REJECT_MISSING_OPEN",()=>assert.throws(()=>generateP4Signals(session(flat.slice(1,40)),id),/MISSING_RTH_OPEN/));
 test(id+" REJECT_BAD_TICK",()=>{const b=flat.slice(0,40);b[20]={...b[20]!,close:100.1};assert.throws(()=>generateP4Signals(session(b),id),/INVALID_BAR/);});
 test(id+" REJECT_BAD_OHLC",()=>{const b=flat.slice(0,40);b[20]={...b[20]!,high:99};assert.throws(()=>generateP4Signals(session(b),id),/INVALID_BAR/);});
 test(id+" REJECT_CROSS_SESSION",()=>assert.throws(()=>generateP4Signals(session(Array.from({length:391},(_,i)=>mk(i))),id),/GAP_OR_SESSION_BOUNDARY/));
}
test("OPENING_DRIVE_FAILURE_SHORT_NEXT_OPEN",()=>{
 const b=Array.from({length:30},(_,i)=>mk(i,100,101,99,100));
 for(let i=1;i<10;i++)b[i]=mk(i,100+4*i,101+4*i,99+4*i,100+4*i);
 b[0]=mk(0,100,101,99,100);
 b[10]=mk(10,136,137,133,134);
 b[11]=mk(11,134,135,110,112);
 b[12]=mk(12,112,114,111,113);
 const x=generateP4Signals(session(b),"OPENING_DRIVE_FAILURE_V1");
 assert.equal(x.length,1);assert.equal(x[0]!.direction,"SHORT");assert.equal(x[0]!.entryTime,b[12]!.timestampMs);assert.equal(x[0]!.entryPrice,112);
});
test("VOL_COMPRESSION_BREAKOUT_NEXT_OPEN",()=>{
 const b=Array.from({length:45},(_,i)=>mk(i,100,101,99,100));
 b[35]=mk(35,100,106,99,105);b[36]=mk(36,105,107,104,106);
 const x=generateP4Signals(session(b),"VOLATILITY_COMPRESSION_EXPANSION_V1");
 assert.equal(x.length,1);assert.equal(x[0]!.direction,"LONG");assert.equal(x[0]!.entryTime,b[36]!.timestampMs);
});
test("VOL_COMPRESSION_CHASE_REJECTED",()=>{
 const b=Array.from({length:45},(_,i)=>mk(i,100,101,99,100));
 b[35]=mk(35,100,106,99,105);b[36]=mk(36,112,113,111,112);
 assert.deepEqual(generateP4Signals(session(b.slice(0,37)),"VOLATILITY_COMPRESSION_EXPANSION_V1"),[]);
});
test("VOL_COMPRESSION_LATER_INDEPENDENT_SIGNAL",()=>{
 const b=Array.from({length:45},(_,i)=>mk(i,100,101,99,100));
 b[35]=mk(35,100,106,99,105);b[36]=mk(36,112,113,111,112);
 const x=generateP4Signals(session(b),"VOLATILITY_COMPRESSION_EXPANSION_V1");
 assert.equal(x.length,1);assert.equal(x[0]!.signalTime,b[36]!.timestampMs);assert.equal(x[0]!.entryTime,b[37]!.timestampMs);
});
test("TREND_PULLBACK_LONG_NEXT_OPEN",()=>{
 const b=Array.from({length:55},(_,i)=>mk(i,100,101,99,100));
 // impulse bars 21..26, pullback 27..29, confirmation 30
 b[21]=mk(21,100,102,99,101);b[22]=mk(22,101,108,100,107);
 b[23]=mk(23,107,116,106,115);b[24]=mk(24,115,124,114,123);
 b[25]=mk(25,123,132,122,131);b[26]=mk(26,131,137,130,136);
 b[27]=mk(27,136,137,130,132);b[28]=mk(28,132,133,125,127);
 b[29]=mk(29,127,128,120,122);b[30]=mk(30,122,132,121,131);
 b[31]=mk(31,131,133,130,132);
 const x=generateP4Signals(session(b),"SESSION_TREND_PULLBACK_V1");
 assert.equal(x.length,1);assert.equal(x[0]!.direction,"LONG");assert.equal(x[0]!.entryTime,b[31]!.timestampMs);
});
test("LOW_TREND_REVERSION_LONG_NEXT_OPEN",()=>{
 const b=Array.from({length:110},(_,i)=>mk(i,100,101,99,100));
 // At 11:00 (i=90), 30-bar alternating closes -> ER near zero, sigma > 2.
 for(let i=60;i<90;i++){const c=i%2?104:96;b[i]=mk(i,c,c+1,c-1,c);}
 b[90]=mk(90,90,91,89,91);b[91]=mk(91,91,92,90,92);
 const x=generateP4Signals(session(b),"LOW_TREND_MEAN_REVERSION_V1");
 assert.equal(x.length,1);assert.equal(x[0]!.direction,"LONG");assert.equal(x[0]!.entryTime,b[91]!.timestampMs);
});
test("SIGNAL_ONLY_COMPLETED_BAR",()=>{
 const b=Array.from({length:37},(_,i)=>mk(i,100,101,99,100));b[35]=mk(35,100,106,99,105);
 const a=generateP4Signals(session(b),"VOLATILITY_COMPRESSION_EXPANSION_V1");
 assert.equal(a[0]!.signalTime,b[35]!.timestampMs);assert.equal(a[0]!.entryTime,b[36]!.timestampMs);
});
console.log("TM001 P4b SYNTHETIC REGRESSION GREEN "+n+"/"+n);
console.log("SYNTHETIC ONLY | NO API | NO CACHE | NO TRADES | NOT FILL CERTIFIED");
