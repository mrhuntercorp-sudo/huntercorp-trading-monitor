/** E030 no-network regression: verify approval gate and push payload. */
import {strict as assert} from "node:assert";
import {deliverNtfy,prepareNtfy} from "../research/ntfy-delivery.js";
import type {Notice} from "../research/local-notification-outbox.js";
const topic="huntercorp_tm001_random_topic_0123456789abcdef";
const notice:Notice={id:"NOTICE:TM001:TEST",eventId:"TM001:TEST",
 createdAtUtc:"2026-10-02T13:44:00.000Z",title:"NQ London high rejection observed",
 body:"NQZ6 | Historical replay | Research observation only; not a trade instruction.",
 delivery:"LOCAL_PENDING",classification:"RESEARCH_ONLY"};
let calls=0;
const transport=async(req:ReturnType<typeof prepareNtfy>)=>{
 calls++;assert.equal(req.method,"POST");assert.equal(req.url,"https://ntfy.sh/"+topic);
 assert.equal(req.headers.Title,notice.title);assert.equal(req.body,notice.body);
 return {ok:true,status:200};
};
assert.equal((await deliverNtfy(notice,{topic,transport})).status,"DRY_RUN");
assert.equal(calls,0);
await assert.rejects(()=>deliverNtfy(notice,{topic,mode:"live",transport}),/EXPLICIT_APPROVAL/);
assert.equal(calls,0);
assert.throws(()=>prepareNtfy(notice,"short"),/TOPIC_MUST_BE_RANDOM/);
assert.throws(()=>prepareNtfy({...notice,classification:"LIVE" as "RESEARCH_ONLY"},topic),/UNSUPPORTED_NOTICE/);
const published=await deliverNtfy(notice,{topic,mode:"live",approved:true,transport});
assert.equal(published.status,"PUBLISHED");assert.equal(calls,1);
await assert.rejects(()=>deliverNtfy(notice,{topic,mode:"live",approved:true,
 transport:async()=>({ok:false,status:429})}),/NTFY_HTTP_429/);
console.log("=== TM001 E030 NTFY DRY-RUN REGRESSION ===");
console.log("PREVIEW",JSON.stringify({title:notice.title,body:notice.body,topicConfigured:true}));
console.log("E030_COMPLETE",JSON.stringify({defaultDryRun:true,approvalGate:true,topicGuard:true,
 researchOnly:true,payloadVerified:true,failedPublishDetected:true,
 mockedPublish:true,realNetworkCalls:0,realPhoneDelivery:false}));
