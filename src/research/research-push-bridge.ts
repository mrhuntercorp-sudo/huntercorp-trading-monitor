/** E031 guarded event-to-phone bridge. No live feed and no order execution. */
import type {PipelineEvent} from "./intelligence-pipeline.js";
import {LocalNotificationOutbox} from "./local-notification-outbox.js";
import {deliverNtfy,type PushRequest} from "./ntfy-delivery.js";
export type BridgeDecision={status:"STALE"|"DUPLICATE"|"DRY_RUN"|"PUBLISHED";eventId:string};
export class ResearchPushBridge{
 private readonly handled=new Set<string>();
 constructor(private readonly outbox:LocalNotificationOutbox,private readonly topic:string){}
 async process(event:PipelineEvent,opts:{
  nowMs:number;mode?:"dry-run"|"live";approved?:boolean;maxAgeMs?:number;
  transport?:(req:PushRequest)=>Promise<{ok:boolean;status:number}>;
 }):Promise<BridgeDecision>{
  if(event.classification!=="RESEARCH_ONLY"||event.delivery!=="LOCAL_ONLY"||
     event.independentValidation!==false)throw Error("UNSUPPORTED_EVENT");
  if(!Number.isSafeInteger(opts.nowMs))throw Error("INVALID_CLOCK");
  const confirmed=Date.parse(event.confirmedAtUtc);
  if(!Number.isFinite(confirmed)||confirmed>opts.nowMs+5000)throw Error("FUTURE_EVENT");
  // A historical replay must never publish to a phone, even if live mode is requested.
  if(opts.nowMs-confirmed>(opts.maxAgeMs??120000))return {status:"STALE",eventId:event.id};
  if(this.handled.has(event.id))return {status:"DUPLICATE",eventId:event.id};
  const {inserted,notice}=await this.outbox.enqueue(event);
  if(!inserted)return {status:"DUPLICATE",eventId:event.id};
  // Dry-run records a local notice but never calls a network transport.
  if((opts.mode??"dry-run")==="dry-run"){
   this.handled.add(event.id);
   return {status:"DRY_RUN",eventId:event.id};
  }
  // Fail closed on explicit approval. The local outbox is not an exactly-once
  // delivery ledger: if publication fails, operator intervention is required.
  if(opts.mode!=="live"||opts.approved!==true)throw Error("LIVE_DELIVERY_REQUIRES_EXPLICIT_APPROVAL");
  const result=await deliverNtfy(notice,{topic:this.topic,mode:"live",approved:true,transport:opts.transport});
  this.handled.add(event.id);
  return {status:result.status,eventId:event.id};
 }
}
