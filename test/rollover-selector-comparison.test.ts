import assert from "node:assert/strict";
import test from "node:test";
import {compareRolloverSelectors} from "../src/research/rollover-selector-comparison.js";
const day={date:"2026-06-12",oldVolume:295041,newVolume:67585,complete:true};
test("roll date calendar switches while prior session still leads old",()=>{
 const r=compareRolloverSelectors("2026-06-15","2026-06-15","2026-06-12",[day]);
 assert.equal(r.calendar.ticker,"NEW");assert.equal(r.volume.ticker,"OLD");assert.equal(r.agreement,false);
});
test("following day prior complete leader agrees with calendar",()=>{
 const r=compareRolloverSelectors("2026-06-16","2026-06-15","2026-06-15",[{date:"2026-06-15",oldVolume:98749,newVolume:245513,complete:true}]);
 assert.equal(r.volume.ticker,"NEW");assert.equal(r.agreement,true);
});
test("stale prior evidence fails closed",()=>{
 const r=compareRolloverSelectors("2026-06-16","2026-06-15","2026-06-15",[day]);
 assert.equal(r.volume.status,"REVIEW_REQUIRED");
 assert.equal(r.volume.reason,"MISSING_IMMEDIATE_PRIOR_SESSION");
});
test("incomplete prior evidence fails closed",()=>{
 const r=compareRolloverSelectors("2026-06-16","2026-06-15","2026-06-15",[{...day,date:"2026-06-15",complete:false}]);
 assert.equal(r.volume.status,"REVIEW_REQUIRED");
});
test("rejects same-day and future evidence",()=>{
 assert.throws(()=>compareRolloverSelectors("2026-06-15","2026-06-15","2026-06-12",[{...day,date:"2026-06-15"}]));
});
test("ties require review",()=>{
 const r=compareRolloverSelectors("2026-06-15","2026-06-15","2026-06-12",[{...day,newVolume:day.oldVolume}]);
 assert.equal(r.volume.reason,"VOLUME_TIE");
});
