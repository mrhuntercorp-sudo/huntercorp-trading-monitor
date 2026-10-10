import assert from "node:assert/strict";

/**
 * Deterministic OHLC event-ambiguity audit. RESEARCH ONLY.
 * This is deliberately NOT a fill simulator and does not infer an intrabar path.
 */
type Side="LONG"|"SHORT";
type Bar={open:number;high:number;low:number;close:number};
type Event="STOP"|"TARGET"|"RISK";
type Result={touches:Event[];classification:"NONE"|"SINGLE_TOUCH"|"UNRESOLVED_ORDER"|"OPEN_GAP_THROUGH_STOP"|"OPEN_GAP_THROUGH_RISK";certifiedFill:false};
function audit(side:Side,bar:Bar,stop:number,target:number,riskPrice:number):Result{
 if(!(bar.low<=bar.open&&bar.open<=bar.high&&bar.low<=bar.close&&bar.close<=bar.high))throw Error("INVALID_OHLC");
 const long=side==="LONG";
 const stopHit=long?bar.low<=stop:bar.high>=stop;
 const targetHit=long?bar.high>=target:bar.low<=target;
 const riskHit=long?bar.low<=riskPrice:bar.high>=riskPrice;
 const touches:Event[]=[];
 if(stopHit)touches.push("STOP");
 if(targetHit)touches.push("TARGET");
 if(riskHit)touches.push("RISK");
 const gapRisk=long?bar.open<=riskPrice:bar.open>=riskPrice;
 const gapStop=long?bar.open<=stop:bar.open>=stop;
 const classification=gapRisk?"OPEN_GAP_THROUGH_RISK":gapStop?"OPEN_GAP_THROUGH_STOP":touches.length>1?"UNRESOLVED_ORDER":touches.length?"SINGLE_TOUCH":"NONE";
 return {touches,classification,certifiedFill:false};
}
let passed=0;
function check(name:string,fn:()=>void){fn();passed++;console.log("PASS "+name);}
check("NO_TOUCH",()=>assert.deepEqual(audit("LONG",{open:100,high:102,low:99,close:101},95,110,90).touches,[]));
check("SINGLE_STOP",()=>assert.equal(audit("LONG",{open:100,high:103,low:94,close:98},95,110,90).classification,"SINGLE_TOUCH"));
check("SINGLE_TARGET",()=>assert.deepEqual(audit("LONG",{open:100,high:111,low:98,close:105},95,110,90).touches,["TARGET"]));
check("STOP_TARGET_SAME_BAR_UNRESOLVED",()=>assert.equal(audit("LONG",{open:100,high:112,low:94,close:101},95,110,90).classification,"UNRESOLVED_ORDER"));
check("STOP_RISK_SAME_BAR_UNRESOLVED",()=>assert.equal(audit("LONG",{open:100,high:101,low:89,close:94},95,110,90).classification,"UNRESOLVED_ORDER"));
check("STOP_TARGET_RISK_SAME_BAR_UNRESOLVED",()=>assert.deepEqual(audit("LONG",{open:100,high:112,low:89,close:101},95,110,90).touches,["STOP","TARGET","RISK"]));
check("SHORT_STOP_TARGET_SAME_BAR_UNRESOLVED",()=>assert.equal(audit("SHORT",{open:100,high:106,low:89,close:99},105,90,110).classification,"UNRESOLVED_ORDER"));
check("SHORT_STOP_RISK_SAME_BAR_UNRESOLVED",()=>assert.equal(audit("SHORT",{open:100,high:111,low:97,close:108},105,90,110).classification,"UNRESOLVED_ORDER"));
check("LONG_GAP_THROUGH_STOP",()=>assert.equal(audit("LONG",{open:93,high:98,low:92,close:96},95,110,90).classification,"OPEN_GAP_THROUGH_STOP"));
check("LONG_GAP_THROUGH_RISK",()=>assert.equal(audit("LONG",{open:88,high:95,low:86,close:92},95,110,90).classification,"OPEN_GAP_THROUGH_RISK"));
check("SHORT_GAP_THROUGH_STOP",()=>assert.equal(audit("SHORT",{open:107,high:109,low:101,close:104},105,90,110).classification,"OPEN_GAP_THROUGH_STOP"));
check("SHORT_GAP_THROUGH_RISK",()=>assert.equal(audit("SHORT",{open:112,high:114,low:106,close:108},105,90,110).classification,"OPEN_GAP_THROUGH_RISK"));
check("INVALID_BAR_REJECTED",()=>assert.throws(()=>audit("LONG",{open:100,high:99,low:98,close:100},95,110,90),/INVALID_OHLC/));
check("NEVER_CERTIFIES_FILL",()=>assert.equal(audit("LONG",{open:100,high:112,low:89,close:101},95,110,90).certifiedFill,false));
console.log("TM001 INTRABAR UNCERTAINTY REGRESSION GREEN "+passed+"/"+passed);
console.log("RESEARCH ONLY | NO API | NO CACHE | NO WRITES | NO TRADES");
console.log("OHLC TOUCHES DO NOT ESTABLISH EVENT ORDER OR ACHIEVABLE FILL. Gap cases require separate fill modeling.");
