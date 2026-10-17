/** TM001 durable notification outbox: local, zero-network regression.
 * A unique event is staged on disk before it can be delivered.
 * At-least-once external delivery needs provider-side idempotency; not asserted here.
 */
import {mkdtemp,readFile,rename,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";

type Kind="SETUP_ALERT"|"ENTRY_UPDATE";
type Entry={id:string;kind:Kind;date:string;signalUtc:string;payload:Record<string,unknown>;status:"PENDING"|"DELIVERED";createdAt:string};
type Outbox={schema:1;entries:Entry[]};
const folder=await mkdtemp(join(tmpdir(),"tm001-outbox-regression-"));
const path=join(folder,"outbox.json");
const empty=():Outbox=>({schema:1,entries:[]});
const save=async(data:Outbox)=>{
 const temp=path+".tmp";
 await writeFile(temp,JSON.stringify(data),{flag:"wx"});
 try{await rename(temp,path);}catch(e){await rm(temp,{force:true});throw e;}
};
const load=async():Promise<Outbox>=>{
 const data=JSON.parse(await readFile(path,"utf8")) as Outbox;
 if(data.schema!==1||!Array.isArray(data.entries))throw Error("INVALID_OUTBOX");
 const ids=new Set<string>();
 for(const e of data.entries){
  if(!e.id||ids.has(e.id)||!["SETUP_ALERT","ENTRY_UPDATE"].includes(e.kind)||
   !["PENDING","DELIVERED"].includes(e.status)||!e.date||!e.signalUtc)throw Error("INVALID_OUTBOX_ENTRY");
  ids.add(e.id);
 }
 return data;
};
const stage=async(data:Outbox,kind:Kind,date:string,signalUtc:string,payload:Record<string,unknown>)=>{
 const id=createHash("sha256").update(["TM001","NQZ6",date,signalUtc,kind].join("|")).digest("hex");
 const existing=data.entries.find(e=>e.id===id);
 if(existing){
  if(JSON.stringify(existing.payload)!==JSON.stringify(payload))throw Error("IDEMPOTENCY_PAYLOAD_CONFLICT");
  return {id,created:false};
 }
 data.entries.push({id,kind,date,signalUtc,payload,status:"PENDING",createdAt:"REPLAY"});
 await save(data);
 return {id,created:true};
};
try{
 await save(empty());
 let data=await load();
 const date="2026-09-28",signalUtc="2026-09-28T13:32:00.000Z";
 const setup={side:"SHORT",londonHigh:30753,initialStop:30759.5,entryPrice:"PENDING_NEXT_CANDLE",execution:"NONE"};
 const entry={side:"SHORT",modeledEntry:30737.5,initialStop:30759.5,instrument:"MNQ",qty:5,initialModeledLoss:250,execution:"NONE"};
 const a=await stage(data,"SETUP_ALERT",date,signalUtc,setup);
 data=await load(); // process restart
 const duplicate=await stage(data,"SETUP_ALERT",date,signalUtc,setup);
 const b=await stage(data,"ENTRY_UPDATE",date,signalUtc,entry);
 data=await load(); // second process restart
 const duplicateEntry=await stage(data,"ENTRY_UPDATE",date,signalUtc,entry);
 const pending=data.entries.filter(e=>e.status==="PENDING");
 if(!a.created||!b.created||duplicate.created||duplicateEntry.created||data.entries.length!==2||pending.length!==2)throw Error("OUTBOX_REGRESSION_FAILED");
 let conflictRejected=false;
 try{await stage(data,"SETUP_ALERT",date,signalUtc,{...setup,initialStop:0});}
 catch(e){if(String(e).includes("IDEMPOTENCY_PAYLOAD_CONFLICT"))conflictRejected=true;else throw e;}
 if(!conflictRejected)throw Error("CONFLICT_NOT_REJECTED");
 console.log("=== TM001 DURABLE OUTBOX REGRESSION ===");
 console.log("OUTBOX_EVENTS",JSON.stringify(data.entries.map(e=>({id:e.id.slice(0,12),kind:e.kind,status:e.status,signalUtc:e.signalUtc}))));
 console.log("OUTBOX_RESULT",JSON.stringify({events:2,pending:2,duplicateRecords:0,restarts:2,conflictRejected,
  persisted:true,externalDelivery:"DISABLED",exactlyOnceExternalDelivery:false,apiCalls:0,orders:0,externalAlerts:0}));
}finally{await rm(folder,{recursive:true,force:true});}
