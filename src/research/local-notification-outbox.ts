/** E029 local durable notification outbox. No external transport or trading actions. */
import {mkdir,readFile,writeFile,rename} from "node:fs/promises";
import {dirname} from "node:path";
import type {PipelineEvent} from "./intelligence-pipeline.js";
export type Notice={id:string;eventId:string;createdAtUtc:string;title:string;body:string;delivery:"LOCAL_PENDING";classification:"RESEARCH_ONLY"};
type Ledger={schema:1;notices:Notice[]};
export function formatResearchNotice(event:PipelineEvent):Notice{
 if(event.classification!=="RESEARCH_ONLY"||event.delivery!=="LOCAL_ONLY"||event.type!=="LONDON_HIGH_REJECTION_OBSERVED")
  throw Error("UNSUPPORTED_EVENT");
 const et=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date(event.confirmedAtUtc));
 return {id:"NOTICE:"+event.id,eventId:event.id,createdAtUtc:event.confirmedAtUtc,
  title:event.product+" London high rejection observed",
  body:event.ticker+" | "+event.tradeDate+" | Confirmed "+et+" ET | London high "+event.level+
   " | Wick "+event.wickHigh+" | Close "+event.close+
   ". Research observation only; not a trade instruction. Verify current chart and market data.",
  delivery:"LOCAL_PENDING",classification:"RESEARCH_ONLY"};
}
export class LocalNotificationOutbox{
 constructor(readonly path:string){}
 async enqueue(event:PipelineEvent):Promise<{inserted:boolean;notice:Notice}>{
  const notice=formatResearchNotice(event);
  let ledger:Ledger={schema:1,notices:[]};
  try{
   const parsed:unknown=JSON.parse(await readFile(this.path,"utf8"));
   if(typeof parsed!=="object"||parsed===null||!("schema" in parsed)||parsed.schema!==1||
      !("notices" in parsed)||!Array.isArray(parsed.notices))throw Error("INVALID_OUTBOX");
   ledger=parsed as Ledger;
  }catch(e){
   if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;
  }
  const prior=ledger.notices.find(n=>n.id===notice.id);
  if(prior){
   if(JSON.stringify(prior)!==JSON.stringify(notice))throw Error("CONFLICTING_NOTICE");
   return {inserted:false,notice:prior};
  }
  ledger.notices.push(notice);
  await mkdir(dirname(this.path),{recursive:true});
  const temp=this.path+"."+process.pid+".tmp";
  try{
   await writeFile(temp,JSON.stringify(ledger,null,2),{flag:"wx"});
   await rename(temp,this.path);
  }finally{
   const {rm}=await import("node:fs/promises");
   await rm(temp,{force:true});
  }
  return {inserted:true,notice};
 }
}
