/** E032 durable single-process notification delivery ledger.
 * Live sends reserve an UNCERTAIN state BEFORE network I/O; never auto-retry.
 * Use one writer per ledger path. Atomic rename is not multi-process locking.
 */
import {mkdir,readFile,rename,rm,writeFile} from "node:fs/promises";
import {dirname} from "node:path";
import type {PipelineEvent} from "./intelligence-pipeline.js";
import {formatResearchNotice} from "./local-notification-outbox.js";
import {deliverNtfy,type PushRequest} from "./ntfy-delivery.js";
export type DeliveryState="PENDING"|"PUBLISHED"|"FAILED"|"UNCERTAIN";
type RecordEntry={id:string;state:DeliveryState;updatedAtUtc:string;httpStatus?:number;error?:string};
type Ledger={schema:1;records:RecordEntry[]};
export type DeliveryDecision={status:"STALE"|"DRY_RUN"|"PUBLISHED"|"FAILED"|"UNCERTAIN"|"ALREADY_HANDLED";eventId:string};
export class DurableResearchDelivery{
 private queue:Promise<unknown>=Promise.resolve();
 constructor(readonly path:string,readonly topic:string){}
 private async load():Promise<Ledger>{
  try{
   const value:unknown=JSON.parse(await readFile(this.path,"utf8"));
   if(typeof value!=="object"||value===null||!("schema" in value)||value.schema!==1||
      !("records" in value)||!Array.isArray(value.records))throw Error("INVALID_DELIVERY_LEDGER");
   return value as Ledger;
  }catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return {schema:1,records:[]};throw e;}
 }
 private async save(ledger:Ledger):Promise<void>{
  await mkdir(dirname(this.path),{recursive:true});
  const temp=this.path+"."+process.pid+"."+Math.random().toString(36).slice(2)+".tmp";
  try{await writeFile(temp,JSON.stringify(ledger,null,2),{flag:"wx",mode:0o600});await rename(temp,this.path);}
  finally{await rm(temp,{force:true});}
 }
 async inspect(id:string):Promise<DeliveryState|null>{
  return (await this.load()).records.find(r=>r.id===id)?.state??null;
 }
 async process(event:PipelineEvent,opts:{
  nowMs:number;mode?:"dry-run"|"live";approved?:boolean;maxAgeMs?:number;
  transport?:(req:PushRequest)=>Promise<{ok:boolean;status:number}>;
 }):Promise<DeliveryDecision>{
  // Serialize all calls on this instance, including network wait.
  const run=this.queue.then(()=>this.execute(event,opts));
  this.queue=run.then(()=>undefined,()=>undefined);
  return run;
 }
 private async execute(event:PipelineEvent,opts:{
  nowMs:number;mode?:"dry-run"|"live";approved?:boolean;maxAgeMs?:number;
  transport?:(req:PushRequest)=>Promise<{ok:boolean;status:number}>;
 }):Promise<DeliveryDecision>{
  const notice=formatResearchNotice(event);
  if(event.independentValidation!==false)throw Error("UNSUPPORTED_EVENT");
  if(!Number.isSafeInteger(opts.nowMs))throw Error("INVALID_CLOCK");
  const confirmed=Date.parse(event.confirmedAtUtc);
  if(!Number.isFinite(confirmed)||confirmed>opts.nowMs+5000)throw Error("FUTURE_EVENT");
  const maxAge=opts.maxAgeMs??120000;
  if(!Number.isSafeInteger(maxAge)||maxAge<0||maxAge>120000)throw Error("INVALID_MAX_AGE");
  if(opts.nowMs-confirmed>maxAge)return {status:"STALE",eventId:event.id};
  const ledger=await this.load();
  if(ledger.records.some(r=>r.id===notice.id))return {status:"ALREADY_HANDLED",eventId:event.id};
  const mode=opts.mode??"dry-run";
  if(mode!=="dry-run"&&mode!=="live")throw Error("INVALID_MODE");
  if(mode==="live"&&(opts.approved!==true||!opts.transport))throw Error("LIVE_REQUIRES_APPROVAL_AND_TRANSPORT");
  const record:RecordEntry={id:notice.id,state:mode==="live"?"UNCERTAIN":"PENDING",updatedAtUtc:new Date(opts.nowMs).toISOString()};
  ledger.records.push(record);
  await this.save(ledger);
  if(mode==="dry-run")return {status:"DRY_RUN",eventId:event.id};
  // Persisted UNCERTAIN before publishing: crashes/timeouts never trigger automatic retry.
  try{
   const response=await deliverNtfy(notice,{topic:this.topic,mode:"live",approved:true,transport:opts.transport!});
   record.state="PUBLISHED";
   if(response.httpStatus!==undefined)record.httpStatus=response.httpStatus;
   record.updatedAtUtc=new Date().toISOString();
   await this.save(ledger);
   return {status:"PUBLISHED",eventId:event.id};
  }catch(e){
   // Even a definite HTTP rejection is recorded as FAILED; still no automatic retry.
   const match=/^NTFY_HTTP_(\d+)$/.exec((e as Error).message);
   record.state=match?"FAILED":"UNCERTAIN";
   if(match)record.httpStatus=Number(match[1]);
   record.error=match?"HTTP_REJECTED":"DELIVERY_OUTCOME_UNKNOWN";
   record.updatedAtUtc=new Date().toISOString();
   await this.save(ledger);
   return {status:record.state,eventId:event.id};
  }
 }
}
