/** Synthetic multi-day account transitions. No API, orders, or fill certification. */
import {strict as assert} from "node:assert";
import {beginAccountDate,pretradeAccountDecision,rejectPretrade,settleAccountTrade,closeAccountSample,type AccountState} from "../research/p4e-account-state.js";
const base:AccountState={start:50000,mll:3000,balance:50000,highEod:50000,dayStart:50000,currentDate:"",haltToday:false,firstMllTouch:null,firstOperatingStop:null};
let n=0;function eq(a:unknown,b:unknown,label:string){assert.deepEqual(a,b,label);n++;}
let s=beginAccountDate(base,"2026-09-21");
eq(s.dayStart,50000,"initial day start");eq(pretradeAccountDecision(s).allowed,true,"initial trading allowed");
s=settleAccountTrade(s,375,"TARGET");eq(s.balance,50375,"winning trade settlement");
s=beginAccountDate(s,"2026-09-22");eq(s.highEod,50375,"EOD high ratchets on new day");eq(s.dayStart,50375,"daily budget resets");
eq(pretradeAccountDecision(s).dailyFloor,49925,"daily floor recalculated");
s=settleAccountTrade(s,-450,"DAILY");eq(s.haltToday,true,"daily stop halts current day");eq(pretradeAccountDecision(s).allowed,false,"daily halt prevents new trade");
s=beginAccountDate(s,"2026-09-23");eq(s.haltToday,false,"daily halt resets next day");eq(s.highEod,50375,"EOD high never ratchets downward");
eq(s.dayStart,49925,"new day starts at closed balance");eq(pretradeAccountDecision(s).allowed,true,"new day permitted if floors clear");
let operating=beginAccountDate({...base,balance:50000,highEod:51000},"2026-09-21");
eq(pretradeAccountDecision(operating).allowed,false,"pretrade operating breach denied");
operating=rejectPretrade(operating);eq(operating.firstOperatingStop,"2026-09-21","operating breach recorded");
operating=beginAccountDate(operating,"2026-09-22");eq(pretradeAccountDecision(operating).allowed,false,"operating stop persists across days");
let mll=beginAccountDate({...base,balance:46900},"2026-09-21");mll=rejectPretrade(mll);
eq(mll.firstMllTouch,"2026-09-21","MLL breach recorded");eq(pretradeAccountDecision(beginAccountDate(mll,"2026-09-22")).allowed,false,"MLL breach permanent");
const same=beginAccountDate(s,"2026-09-23");eq(same,s,"same day transition idempotent");
eq(closeAccountSample({...s,balance:51000}).highEod,51000,"last sample EOD finalized");
console.log("TM001 P4e MULTIDAY ACCOUNT STATE GREEN "+n+"/"+n+" | SYNTHETIC TRANSITIONS");
console.log("LIMITATION: Production P4c integration and full multi-day historical replay not yet verified.");
