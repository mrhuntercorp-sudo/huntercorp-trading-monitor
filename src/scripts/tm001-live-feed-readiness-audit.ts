/** TM001 live-feed readiness audit. Read-only; no credentials printed, no network requests. */
import {readFile} from "node:fs/promises";
import {join} from "node:path";
const root=process.cwd();
const checks=[
 ["historical REST recovery","src/scripts/tm001-oct16-one-request-recovery.ts"],
 ["incremental closed-candle engine","src/scripts/tm001-london-incremental-replay.ts"],
 ["disk checkpoint regression","src/scripts/tm001-london-durable-state-regression.ts"],
 ["two-stage alert regression","src/scripts/tm001-london-two-stage-alert-regression.ts"]
] as const;
const files=await Promise.all(checks.map(async ([label,path])=>{
 try{const content=await readFile(join(root,path),"utf8");return {label,path,present:true,bytes:Buffer.byteLength(content)};}
 catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return {label,path,present:false,bytes:0};throw e;}
}));
const recovery=await readFile(join(root,checks[0][1]),"utf8");
const facts={
 endpoint:"/futures/v1/aggs/NQZ6",
 transport:"REST historical minute aggregates",
 bearerAuth:recovery.includes('Authorization:"Bearer "+key'),
 oneRequestGuard:recovery.includes("TM001_APPROVE_OCT16_ONE_REQUEST"),
 retriesConfigured:false,
 streamingImplemented:false,
 continuousPollingImplemented:false,
 liveCandleFinalityVerified:false,
 providerEntitlementVerified:false,
 liveLatencyMeasured:false,
 durableProductionOutboxImplemented:false,
 externalNotificationDeliveryVerified:false,
 automatedOrders:false
};
console.log("=== TM001 LIVE DATA READINESS AUDIT ===");
console.log("SOURCE_FILES",JSON.stringify(files));
console.log("PROVIDER_FACTS",JSON.stringify(facts));
console.log("GATES",JSON.stringify({
 offlineReplay:files.every(f=>f.present)?"READY":"BLOCKED",
 realTimeData:"BLOCKED_PENDING_PROVIDER_STREAM_OR_APPROVED_POLLING_AND_LATENCY_TEST",
 notification:"BLOCKED_PENDING_DURABLE_OUTBOX_AND_DELIVERY_TEST",
 execution:"DISABLED_BY_DESIGN"
}));
console.log("AUDIT_END",JSON.stringify({apiCalls:0,orders:0,externalAlerts:0,readOnly:true,secretValuesPrinted:false}));
