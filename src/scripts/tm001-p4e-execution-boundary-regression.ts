/** Executable synthetic tests for the SAME boundary helpers imported by P4d.
 * Not a complete intrabar fill/risk engine replay.
 */
import {strict as assert} from "node:assert";
import {riskBarEligible,auditedExitTime,auditHoldingMinutes,exitAtDeadline} from "../research/p4e-execution-boundaries.js";
const m=60_000,entry=Date.parse("2026-09-21T14:30:00Z"),deadline=entry+30*m;
let tests=0;function check(condition:boolean,label:string){assert.ok(condition,label);tests++;}
check(exitAtDeadline(deadline,deadline),"30-minute exact boundary");
check(!exitAtDeadline(deadline-m,deadline),"minute before 30-minute boundary");
check(exitAtDeadline(deadline+m,deadline),"minute after deadline");
check(riskBarEligible(deadline-m,deadline,"TIME_EXIT"),"pre-exit risk bar included");
check(!riskBarEligible(deadline,deadline,"TIME_EXIT"),"time-exit bar high/low excluded");
check(!riskBarEligible(deadline+m,deadline,"TIME_EXIT"),"post-exit high/low excluded");
check(riskBarEligible(entry,entry,"STOP"),"entry-minute stop risk bar included");
check(riskBarEligible(entry,entry,"TARGET"),"entry-minute target risk bar included");
const early=entry+2*m;
check(auditedExitTime(deadline,early)===early,"early risk exit timestamp");
check(auditHoldingMinutes(entry,early)===2,"early risk holding duration");
check(auditedExitTime(deadline,null)===deadline,"no risk exit preserves planned exit");
check(auditHoldingMinutes(entry,entry)===0,"entry-minute exit duration");
check(auditedExitTime(deadline,entry)===entry,"entry-minute risk trigger");
check(auditHoldingMinutes(entry,deadline)===30,"time exit duration");
const sessionEnd=Date.parse("2026-09-21T19:55:00Z");
check(exitAtDeadline(sessionEnd,sessionEnd),"15:55 ET boundary (EDT date)");
check(!riskBarEligible(sessionEnd,sessionEnd,"TIME_EXIT"),"15:55 open excludes subsequent extreme");
check(riskBarEligible(sessionEnd-m,sessionEnd,"TIME_EXIT"),"15:54 bar included");
check(!riskBarEligible(sessionEnd+m,sessionEnd,"STOP"),"post-stop bar excluded");
assert.throws(()=>auditHoldingMinutes(entry,entry-m),/EXIT_BEFORE_ENTRY/);tests++;
console.log("TM001 P4e EXECUTION BOUNDARY REGRESSION GREEN "+tests+"/"+tests+" | SHARED PRODUCTION HELPERS | SYNTHETIC ONLY");
