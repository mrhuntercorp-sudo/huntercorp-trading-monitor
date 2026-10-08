import test from "node:test";
import assert from "node:assert/strict";
import {decideRolloverForTradeDate, type VolumeObservation} from "../src/research/rollover-decision.js";
const obs=(date:string,sep:number,dec:number,complete=true):VolumeObservation=>({
 date,septemberTicker:"NQU6",decemberTicker:"NQZ6",septemberVolume:sep,
 decemberVolume:dec,septemberComplete:complete,decemberComplete:complete
});
test("Sept 14 cannot use its own closing volume",()=>{
 const d=decideRolloverForTradeDate("2026-09-14",[obs("2026-09-11",299525,21197,false)]);
 assert.equal(d.status,"REVIEW_REQUIRED");
 assert.equal(d.reason,"INCOMPLETE_PRIOR_SESSION");
});
test("Sept 15 uses Sept 14 complete volume without lookahead",()=>{
 const d=decideRolloverForTradeDate("2026-09-15",[obs("2026-09-14",204504,249912)]);
 assert.equal(d.status,"SELECTED");assert.equal(d.selectedTicker,"NQZ6");
 assert.equal(d.evidenceDate,"2026-09-14");
});
test("Sept 10 uses Sept 9 only if both sessions complete",()=>{
 const d=decideRolloverForTradeDate("2026-09-10",[obs("2026-09-09",342259,3084,false)]);
 assert.equal(d.status,"REVIEW_REQUIRED");
});
test("rejects same-day or future evidence",()=>{
 assert.throws(()=>decideRolloverForTradeDate("2026-09-14",[obs("2026-09-14",1,2)]));
 assert.throws(()=>decideRolloverForTradeDate("2026-09-14",[obs("2026-09-15",1,2)]));
});
test("refuses volume ties and no evidence",()=>{
 assert.equal(decideRolloverForTradeDate("2026-09-15",[]).status,"REVIEW_REQUIRED");
 assert.equal(decideRolloverForTradeDate("2026-09-15",[obs("2026-09-14",1,1)]).status,"REVIEW_REQUIRED");
});
