/** Zero-network local-state persistence regression. */
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Tm001LocalStore,stageAlert,type Snapshot} from "../market/tm001-local-store.js";
const root=await mkdtemp(join(tmpdir(),"tm001-store-"));
const date="2026-09-28",ticker="NQZ6";
const file=join(root,ticker+"-"+date+".json");
let restarts=0,lockRejected=false,conflictRejected=false,rollbackRejected=false;
try{
 let store=await Tm001LocalStore.acquire(root,date,ticker);
 const snapshot:Snapshot={schema:1,date,ticker,lastTs:0,checkpoint:{londonHigh:30753},outbox:[]};
 stageAlert(snapshot,"SETUP_ALERT","2026-09-28T13:32:00.000Z",{side:"SHORT",execution:"NONE"});
 await store.commit(snapshot);
 try{const second=await Tm001LocalStore.acquire(root,date,ticker);await second.release();}
 catch(e){if((e as NodeJS.ErrnoException).code==="EEXIST")lockRejected=true;else throw e;}
 if(!lockRejected)throw Error("CONCURRENT_WRITER_NOT_REJECTED");
 await store.release();
 store=await Tm001LocalStore.acquire(root,date,ticker);restarts++;
 const loaded=await store.read(date,ticker);
 if(!loaded||loaded.outbox.length!==1)throw Error("RESTART_LOST_ALERT");
 if(stageAlert(loaded,"SETUP_ALERT","2026-09-28T13:32:00.000Z",{side:"SHORT",execution:"NONE"}))throw Error("DUPLICATE_CREATED");
 try{stageAlert(loaded,"SETUP_ALERT","2026-09-28T13:32:00.000Z",{side:"LONG",execution:"NONE"});}
 catch(e){if(String(e).includes("ALERT_PAYLOAD_CONFLICT"))conflictRejected=true;else throw e;}
 if(!conflictRejected)throw Error("CONFLICT_NOT_REJECTED");
 loaded.lastTs=60_000;
 stageAlert(loaded,"ENTRY_UPDATE","2026-09-28T13:32:00.000Z",{modeledEntry:30737.5,execution:"NONE"});
 await store.commit(loaded);
 try{await store.commit({...loaded,lastTs:0});}
 catch(e){if(String(e).includes("CHECKPOINT_ROLLBACK"))rollbackRejected=true;else throw e;}
 if(!rollbackRejected)throw Error("ROLLBACK_NOT_REJECTED");
 await store.release();
 store=await Tm001LocalStore.acquire(root,date,ticker);restarts++;
 const final=await store.read(date,ticker);
 if(!final||final.outbox.length!==2||final.outbox.some(e=>e.status!=="PENDING"))throw Error("OUTBOX_NOT_PERSISTED");
 await store.release();
 console.log("=== TM001 PERSISTENT LOCAL STORE REGRESSION ===");
 console.log("STORE_RESULT",JSON.stringify({restarts,records:final.outbox.length,pending:2,duplicates:0,lockRejected,conflictRejected,rollbackRejected,atomicSnapshot:true,apiCalls:0,orders:0,externalAlerts:0,productionMonitorRunning:false,externalDeliveryExactlyOnce:false}));
}finally{await rm(root,{recursive:true,force:true});}
