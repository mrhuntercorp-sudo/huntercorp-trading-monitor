/** TM001 E012: calendar/roll policy audit; no network, files written, or trades. */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {decideRolloverForTradeDate} from "../research/rollover-decision.js";
import {provisionalClosedDates,provisionalRollDates} from "./massive-nq-calendar-policy.js";

if(process.argv.length!==2)throw Error("E012_NO_ARGUMENTS");
const locked=[
 ["research/TM001-E008-orb5-prospective-validation-lock.md","fb49edd8734e11ffc0ca5618c3a9e5d062af32c1ecf7c6f102224aa9de32254b"],
 ["src/research/conservative-orb.ts","40351d50e8c8757b9f0f57103fb73ca0568f4225a4c4ec688948768f67e787f6"]
] as const;
for(const [path,expected] of locked){
 const actual=createHash("sha256").update(readFileSync(path)).digest("hex");
 if(actual!==expected)throw Error("E012_FROZEN_SOURCE_CHANGED "+path);
}
const start="2026-10-15";
const dates=["2026-10-15","2026-11-26","2026-11-27","2026-12-10","2026-12-14","2026-12-25","2027-01-01"];
const review=dates.map(date=>{
 const weekend=[0,6].includes(new Date(date+"T00:00:00Z").getUTCDay());
 const selected=decideRolloverForTradeDate(date,[]);
 return {date,weekend,calendar:"UNVERIFIED",regular390MinuteSession:"UNVERIFIED",contract:date<"2026-12-01"?"NQZ6_PROVISIONAL":"NQZ6_OR_NQH7_REVIEW_REQUIRED",rollStatus:selected.status,rollReason:selected.reason,eligible:false};
});
console.log("E012_POLICY",JSON.stringify({start,sessionTimezone:"America/New_York",regularRthEt:"09:30-16:00",requiredRegularMinutes:390,holidaySource:"NOT_VERIFIED",earlyCloseSource:"NOT_VERIFIED",previousCompleteSessionVolumeRequired:true,sameDayVolumeForbidden:true,calendarAndRollNotInferredFromCache:true,existingProvisionalClosedDates:[...provisionalClosedDates],existingProvisionalRollDates:[...provisionalRollDates],futureContractTransition:"NQZ6_TO_NQH7_REQUIRES_VERIFIED_PRIOR_SESSION_EVIDENCE"}));
console.log("E012_REVIEW",JSON.stringify({dates:review,illustrativeReviewDatesNotCompleteExchangeCalendar:true}));
console.log("E012_GATE",JSON.stringify({frozenHashesVerified:true,calendarVerified:false,rollVerified:false,providerCostVerified:false,retrievalApproved:false,collectorEnabled:false,apiRequests:0,writes:0,orders:0,status:"REVIEW_REQUIRED_NO_RETRIEVAL"}));
