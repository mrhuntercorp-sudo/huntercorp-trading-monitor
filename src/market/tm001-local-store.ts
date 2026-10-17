/** Local TM001 state store. Single-writer only; no network or notification delivery.
 * Checkpoint and pending alerts share one atomic snapshot to avoid split writes.
 */
import {createHash,randomUUID} from "node:crypto";
import {mkdir,open,readFile,rename,rm,writeFile} from "node:fs/promises";
import {dirname,join} from "node:path";
export type AlertKind="SETUP_ALERT"|"ENTRY_UPDATE";
export type AlertRecord={id:string;kind:AlertKind;signalUtc:string;payload:Record<string,unknown>;status:"PENDING"};
export type Snapshot={schema:1;date:string;ticker:string;lastTs:number;checkpoint:unknown;outbox:AlertRecord[]};
export const alertId=(ticker:string,date:string,kind:AlertKind,signalUtc:string)=>
 createHash("sha256").update(["TM001",ticker,date,signalUtc,kind].join("|")).digest("hex");
export class Tm001LocalStore{
 private constructor(private readonly path:string,private readonly lockPath:string,private readonly lock:Awaited<ReturnType<typeof open>>){}
 static async acquire(root:string,date:string,ticker:string){
  if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/^NQ[A-Z0-9]+$/.test(ticker))throw Error("INVALID_STORE_ID");
  await mkdir(root,{recursive:true});
  const path=join(root,ticker+"-"+date+".json"),lockPath=path+".lock";
  // Exclusive lock. A stale lock requires manual investigation, never automatic stealing.
  const lock=await open(lockPath,"wx");
  return new Tm001LocalStore(path,lockPath,lock);
 }
 async read(date:string,ticker:string):Promise<Snapshot|null>{
  let value:string;
  try{value=await readFile(this.path,"utf8");}
  catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return null;throw e;}
  const s=JSON.parse(value) as Snapshot;
  if(s.schema!==1||s.date!==date||s.ticker!==ticker||!Number.isSafeInteger(s.lastTs)||!Array.isArray(s.outbox))throw Error("INVALID_SNAPSHOT");
  const ids=new Set<string>();
  for(const e of s.outbox){
   if(!["SETUP_ALERT","ENTRY_UPDATE"].includes(e.kind)||typeof e.signalUtc!=="string"||
     e.id!==alertId(ticker,date,e.kind,e.signalUtc)||ids.has(e.id)||e.status!=="PENDING"||
     !e.payload||typeof e.payload!=="object")throw Error("INVALID_ALERT");
   ids.add(e.id);
  }
  return s;
 }
 async commit(s:Snapshot){
  if(s.schema!==1)throw Error("INVALID_SCHEMA");
  const prior=await this.read(s.date,s.ticker);
  if(prior&&s.lastTs<prior.lastTs)throw Error("CHECKPOINT_ROLLBACK");
  if(prior){
   for(const old of prior.outbox){
    const next=s.outbox.find(x=>x.id===old.id);
    if(!next||JSON.stringify(next)!==JSON.stringify(old))throw Error("PENDING_ALERT_MUTATION");
   }
  }
  const ids=new Set<string>();
  for(const e of s.outbox){
   if(ids.has(e.id)||e.id!==alertId(s.ticker,s.date,e.kind,e.signalUtc)||e.status!=="PENDING")throw Error("INVALID_NEW_ALERT");
   ids.add(e.id);
  }
  const temp=this.path+"."+randomUUID()+".tmp";
  try{
   const fh=await open(temp,"wx");
   try{await fh.writeFile(JSON.stringify(s));await fh.sync();}finally{await fh.close();}
   await rename(temp,this.path);
  }finally{await rm(temp,{force:true});}
 }
 async release(){await this.lock.close();await rm(this.lockPath);}
}
export function stageAlert(s:Snapshot,kind:AlertKind,signalUtc:string,payload:Record<string,unknown>){
 const id=alertId(s.ticker,s.date,kind,signalUtc);
 const prior=s.outbox.find(e=>e.id===id);
 if(prior){
  if(JSON.stringify(prior.payload)!==JSON.stringify(payload))throw Error("ALERT_PAYLOAD_CONFLICT");
  return false;
 }
 s.outbox.push({id,kind,signalUtc,payload,status:"PENDING"});
 return true;
}
