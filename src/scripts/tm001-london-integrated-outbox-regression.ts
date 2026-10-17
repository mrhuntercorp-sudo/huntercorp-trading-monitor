/** TM001 incremental closed-candle London sweep replay. Zero APIs/orders/notifications.
 * Simulated restart preserves state and alert ids; production persistence is NOT implemented.
 */
import {createHash} from "node:crypto";
import {readdir,readFile,mkdir,rename,writeFile,rm,mkdtemp} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
const date=process.argv.find(x=>/^2026-\d\d-\d\d$/.test(x))??"2026-09-28";
const ticker="NQZ6",dir=join("data/cache/massive/NQ",ticker);
const stateDir=await mkdtemp(join(tmpdir(),"tm001-integrated-outbox-"));
const statePath=join(stateDir,date+".json");
const outboxPath=join(stateDir,date+".outbox.json");
type Cache={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
const all=new Map<number,MinuteBar>();
for(const file of (await readdir(dir)).filter(f=>/^\d{4}-\d\d-\d\d(\.research)?\.json$/.test(f))){
 const r=JSON.parse(await readFile(join(dir,file),"utf8")) as Cache;
 if(!Array.isArray(r.bars)||r.schema!==1||r.provider!=="massive"||r.ticker!==ticker||r.productCode!=="NQ"||
 !file.startsWith(r.utcDate+".")||createHash("sha256").update(JSON.stringify(r.bars)).digest("hex")!==r.sha256)throw Error("INVALID_CACHE "+file);
 for(const b of r.bars){
  if(b.contractTicker!==ticker||b.productCode!=="NQ"||!Number.isSafeInteger(b.timestampMs)||b.timestampMs%60000!==0||
   ![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low>b.high||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error("INVALID_BAR "+file);
  if(newYorkClock(b.timestampMs).date!==date)continue;
  const old=all.get(b.timestampMs);
  if(old&&JSON.stringify(old)!==JSON.stringify(b))throw Error("CONFLICTING_BAR");
  all.set(b.timestampMs,b);
 }
}
const bars=[...all.values()].sort((a,b)=>a.timestampMs-b.timestampMs);
const minute=(ms:number)=>{const c=newYorkClock(ms);return c.hour*60+c.minute;};
type State={lastTs:number;london:Record<number,number>;londonHigh:number|null;signalTs:number|null;stop:number|null;sentIds:string[];events:Array<{kind:string;payload:Record<string,unknown>}>};
const blank=():State=>({lastTs:-1,london:{},londonHigh:null,signalTs:null,stop:null,sentIds:[],events:[]});
const emit=(s:State,kind:string,payload:Record<string,unknown>)=>{const id=kind+":"+date+":"+String(payload.signalUtc??"");if(s.sentIds.includes(id))return;s.sentIds.push(id);s.events.push({kind,payload});};
function ingest(s:State,b:MinuteBar){
 if(b.timestampMs<=s.lastTs) return; // duplicated/replayed candle after reconnect
 if(s.lastTs>=0&&b.timestampMs-s.lastTs>60000){
  // London coverage is explicitly verified before locking. A gap in opening
  // cannot fabricate an earlier rejection; next-bar entry requires adjacency.
 }
 s.lastTs=b.timestampMs;
 const m=minute(b.timestampMs);
 if(m>=120&&m<540)s.london[m]=b.high;
 if(m>=540&&s.londonHigh===null){
  if(Array.from({length:420},(_,i)=>120+i).every(x=>s.london[x]!==undefined)){
   s.londonHigh=Math.max(...Object.values(s.london));
   emit(s,"LONDON_LEVEL_LOCKED",{date,londonHigh:s.londonHigh,asOfEt:"09:00"});
  }else emit(s,"MONITOR_BLOCKED",{date,reason:"INCOMPLETE_LONDON"});
 }
 if(s.signalTs!==null&&b.timestampMs===s.signalTs+60000&&s.stop!==null){
  const risk=s.stop-b.open;
  const nq=risk>0&&(risk+1)*20+40<=250;
  const qty=risk<=0?0:nq?1:Math.floor(250/((risk+1)*2+4));
  if(qty>0){
   const signalUtc=new Date(s.signalTs).toISOString();
   emit(s,"ENTRY_UPDATE",{date,signalUtc,nextBarUtc:new Date(b.timestampMs).toISOString(),side:"SHORT",ticker,
    modeledEntry:b.open,initialStop:s.stop,structuralRiskPoints:risk,instrument:nq?"NQ":"MNQ",qty,
    initialModeledLoss:Number((((risk+1)*(nq?20:2)+(nq?40:4))*qty).toFixed(2)),
    target3R:b.open-3*risk,trailing:"BE30_TRAIL20",execution:"NONE",
    timing:"NEXT_CANDLE_OPEN_OBSERVED_ONLY_WHEN_NEXT_CLOSED_CANDLE_IS_INGESTED; NOT_LIVE_EXECUTABLE"});
  }else emit(s,"PAPER_ALERT_BLOCKED",{date,signalUtc:new Date(s.signalTs).toISOString(),reason:risk<=0?"INVALID_RISK":"BUDGET"});
 }
 if(s.londonHigh!==null&&s.signalTs===null&&m>=570&&m<660&&b.high>s.londonHigh&&b.close<s.londonHigh){
  s.signalTs=b.timestampMs;s.stop=Math.max(s.londonHigh,b.high)+0.25;
  emit(s,"SETUP_ALERT",{date,side:"SHORT",ticker,execution:"NONE",entryPrice:"PENDING_NEXT_CANDLE",signalUtc:new Date(b.timestampMs).toISOString(),londonHigh:s.londonHigh,
   rejectionHigh:b.high,rejectionClose:b.close,initialStop:s.stop,signalAvailableAfterUtc:new Date(b.timestampMs+60000).toISOString(),timing:"EMITTED_ON_REJECTION_CANDLE_INGESTION"});
 }
}
console.log("=== TM001 TWO STAGE ALERT TIMING REGRESSION ===");
console.log("REPLAY_RULES",JSON.stringify({date,ticker,apiCalls:0,orders:0,externalAlerts:0,cacheOnly:true,closedCandlesOnly:true,
 restart:"FILE_CHECKPOINT_EVERY_BAR",warning:"Next-bar open is only known after next candle arrives; not a live executable entry"}));
// Persist the entire checkpoint atomically after every processed candle.
// Replay runner uses an isolated temporary directory; live production integration is separate.
await mkdir(stateDir,{recursive:true});
const persist=async(s:State)=>{
 const tmp=statePath+"."+process.pid+".tmp";
 await writeFile(tmp,JSON.stringify({schema:1,date,ticker,state:s}));
 await rename(tmp,statePath);
};
const load=async():Promise<State>=>{
 const r=JSON.parse(await readFile(statePath,"utf8")) as {schema:number;date:string;ticker:string;state:State};
 if(r.schema!==1||r.date!==date||r.ticker!==ticker||!r.state||!Array.isArray(r.state.sentIds)||
 !Array.isArray(r.state.events)||!Number.isSafeInteger(r.state.lastTs))throw Error("INVALID_CHECKPOINT");
 return r.state;
};
type OutboxEntry={id:string;kind:"SETUP_ALERT"|"ENTRY_UPDATE";payload:Record<string,unknown>;status:"PENDING"};
type Outbox={schema:1;date:string;entries:OutboxEntry[]};
const eventId=(e:{kind:string;payload:Record<string,unknown>})=>createHash("sha256").update(["TM001",ticker,date,String(e.payload.signalUtc),e.kind].join("|")).digest("hex");
const writeOutbox=async(o:Outbox)=>{
 const tmp=outboxPath+".tmp";
 await writeFile(tmp,JSON.stringify(o),{flag:"wx"});
 try{await rename(tmp,outboxPath);}catch(error){await rm(tmp,{force:true});throw error;}
};
const readOutbox=async():Promise<Outbox>=>{
 const o=JSON.parse(await readFile(outboxPath,"utf8")) as Outbox;
 if(o.schema!==1||o.date!==date||!Array.isArray(o.entries))throw Error("INVALID_OUTBOX");
 const ids=new Set<string>();
 for(const e of o.entries){
  if(ids.has(e.id)||e.id!==eventId(e)||!["SETUP_ALERT","ENTRY_UPDATE"].includes(e.kind)||e.status!=="PENDING")throw Error("INVALID_OUTBOX_ENTRY");
  ids.add(e.id);
 }
 return o;
};
// Checkpoint is saved before outbox. If the process crashes between the two
// writes, reconciliation on restart restores missing pending events.
const reconcile=async(s:State)=>{
 const o=await readOutbox();
 let added=0;
 for(const e of s.events.filter(e=>e.kind==="SETUP_ALERT"||e.kind==="ENTRY_UPDATE")){
  const id=eventId(e);
  const prior=o.entries.find(x=>x.id===id);
  if(prior){
   if(JSON.stringify(prior.payload)!==JSON.stringify(e.payload))throw Error("OUTBOX_CONFLICT");
  }else{o.entries.push({id,kind:e.kind as OutboxEntry["kind"],payload:e.payload,status:"PENDING"});added++;}
 }
 if(added)await writeOutbox(o);
 return added;
};
await writeOutbox({schema:1,date,entries:[]});
let state=blank();let restarts=0;
for(let i=0;i<bars.length;i++){
 ingest(state,bars[i]!);
 await persist(state);
 await reconcile(state);
 if(i===Math.floor(bars.length/2)){
  state=await load();restarts++;
  ingest(state,bars[i]!); // replay last candle after a real disk reload
  await persist(state);
  await reconcile(state);
 }
}
const restored=await load();
if(JSON.stringify(restored)!==JSON.stringify(state))throw Error("CHECKPOINT_MISMATCH");
state=restored;
const before=await readOutbox();
const expected=state.events.filter(e=>e.kind==="SETUP_ALERT"||e.kind==="ENTRY_UPDATE");
if(before.entries.length!==expected.length)throw Error("OUTBOX_COUNT_MISMATCH");
// Simulate a crash after checkpoint save but before the last outbox append.
// Reconciliation must recover the pending event without duplicate IDs.
let recovered=0;
if(before.entries.length){
 const last=before.entries.pop()!;
 await writeOutbox(before);
 recovered=await reconcile(await load());
 const repaired=await readOutbox();
 if(recovered!==1||repaired.entries.filter(e=>e.id===last.id).length!==1)throw Error("RECOVERY_FAILED");
}
const outbox=await readOutbox();
if(outbox.entries.length!==expected.length||new Set(outbox.entries.map(e=>e.id)).size!==expected.length)throw Error("OUTBOX_DUPLICATE");
if(await reconcile(state)!==0)throw Error("OUTBOX_NOT_IDEMPOTENT");
for(const e of state.events)console.log(e.kind,JSON.stringify(e.payload));
const signals=state.events.filter(e=>e.kind==="SETUP_ALERT");
const alerts=state.events.filter(e=>e.kind==="ENTRY_UPDATE");
if(signals.length>1||alerts.length>1)throw Error("DUPLICATE_SIGNAL_OR_ALERT");
if(alerts.length>0&&signals.length===0)throw Error("ENTRY_WITHOUT_SETUP");
if(signals.length===1&&alerts.length===1){
 const setup=signals[0]!,entry=alerts[0]!;
 if(setup.payload.signalUtc!==entry.payload.signalUtc)throw Error("MISMATCHED_SIGNAL");
 if(Date.parse(String(entry.payload.nextBarUtc))-Date.parse(String(setup.payload.signalUtc))!==60000)throw Error("ENTRY_NOT_NEXT_CANDLE");
}
if(date==="2026-09-28"&&(signals.length!==1||alerts.length!==1))throw Error("POSITIVE_REGRESSION_FAILED");
if((date==="2026-10-15"||date==="2026-10-16")&&(signals.length!==0||alerts.length!==0))throw Error("NEGATIVE_REGRESSION_FAILED");
console.log("INTEGRATED_OUTBOX",JSON.stringify({date,records:outbox.entries.length,pending:outbox.entries.length,recoveredAfterCrash:recovered,duplicates:0,delivery:"DISABLED"}));
console.log("TWO_STAGE_REPLAY_END",JSON.stringify({date,bars:bars.length,signals:signals.length,alerts:alerts.length,restarts,
 londonLocked:state.londonHigh!==null,apiCalls:0,orders:0,externalAlerts:0,
 checkpointVerified:true,outboxIntegrated:true,productionRestartPersistence:false,externalDeliveryExactlyOnce:false,liveEntryTimingVerified:false}));
await rm(stateDir,{recursive:true,force:true});
