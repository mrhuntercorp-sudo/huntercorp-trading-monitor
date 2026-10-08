import assert from "node:assert/strict";
import test from "node:test";
import { assessForwardRolloverAdjustment } from "../src/research/rollover-adjustment-study.js";
import type { MinuteBar } from "../src/market/types.js";
const day=(ticker:string,start:number,close:number,open=close):MinuteBar[]=>Array.from({length:390},(_,i)=>({
 contractTicker:ticker,productCode:"NQ",timestampMs:start+i*60000,sessionEndDate:"2026-06-12",
 open,high:Math.max(open,close),low:Math.min(open,close),close,volume:1
}));
test("forward offset removes prior spread without changing underlying overnight move",()=>{
 const pOld=day("NQM6",0,20000),pNew=day("NQU6",0,20300);
 const rOld=day("NQM6",3*86400000,20050,20050),rNew=day("NQU6",3*86400000,20355,20355);
 const result=assessForwardRolloverAdjustment(pOld,pNew,rOld,rNew);
 assert.equal(result.status,"EVALUATED");
 assert.equal(result.priorSpreadPoints,300);
 assert.equal(result.rawCrossContractGapPoints,355);
 assert.equal(result.adjustedCrossContractGapPoints,55);
 assert.equal(result.sameContractOvernightGapPoints,50);
 assert.equal(result.adjustedVsSameContractResidualPoints,5);
});
test("missing prior RTH minute rejects adjustment",()=>{
 const pOld=day("NQM6",0,20000),pNew=day("NQU6",0,20300);
 const rOld=day("NQM6",3*86400000,20050),rNew=day("NQU6",3*86400000,20355);
 assert.equal(assessForwardRolloverAdjustment(pOld.slice(1),pNew,rOld,rNew).status,"REVIEW_REQUIRED");
});
test("misaligned RTH timestamps reject adjustment",()=>{
 const pOld=day("NQM6",0,20000),pNew=day("NQU6",0,20300);
 pNew[10]={...pNew[10]!,timestampMs:pNew[10]!.timestampMs+30000};
 const rOld=day("NQM6",3*86400000,20050),rNew=day("NQU6",3*86400000,20355);
 assert.equal(assessForwardRolloverAdjustment(pOld,pNew,rOld,rNew).reason,"UNALIGNED_RTH_MINUTES");
});
test("contract identity mismatch rejects adjustment",()=>{
 const pOld=day("NQM6",0,20000),pNew=day("NQU6",0,20300);
 const rOld=day("NQM6",3*86400000,20050),rNew=day("NQZ6",3*86400000,20355);
 assert.equal(assessForwardRolloverAdjustment(pOld,pNew,rOld,rNew).reason,"CONTRACT_IDENTITY_MISMATCH");
});
