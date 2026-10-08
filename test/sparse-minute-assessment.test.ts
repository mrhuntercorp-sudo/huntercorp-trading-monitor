import test from "node:test";
import assert from "node:assert/strict";
import {assessSparseMinutes} from "../src/research/sparse-minute-assessment.js";
test("complete contracts report complete",()=>{
 assert.equal(assessSparseMinutes([],[]).status,"COMPLETE");
});
test("isolated thin-contract gaps are review, not invented zero-volume bars",()=>{
 const a=assessSparseMinutes([],[1,3,5]);
 assert.equal(a.status,"ISOLATED_SPARSE_REVIEW");
 assert.equal(a.sharedMissingMinutes,0);
});
test("shared missing timestamps remain quarantined",()=>{
 const a=assessSparseMinutes([1,2,3],[2,3,4]);
 assert.equal(a.status,"SHARED_GAP_QUARANTINE");
 assert.equal(a.sharedMissingMinutes,2);
});
test("invalid duplicate timestamps fail closed",()=>{
 assert.throws(()=>assessSparseMinutes([1,1],[]));
 assert.throws(()=>assessSparseMinutes([],[-1]));
});
