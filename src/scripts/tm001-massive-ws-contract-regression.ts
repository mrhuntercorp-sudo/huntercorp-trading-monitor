/** Offline Massive futures AM adapter contract; no sockets, API calls or orders. */
type Agg={ev:string;sym:string;o:number;h:number;l:number;c:number;v:number;s:number;e:number};
const ticker="NQZ6";
function normalize(raw:Agg,observedAtMs:number){
 if(raw.ev!=="AM"||raw.sym!==ticker)throw Error("WRONG_CHANNEL_OR_TICKER");
 if(![raw.o,raw.h,raw.l,raw.c,raw.v,raw.s,raw.e].every(Number.isFinite)||
 raw.l>Math.min(raw.o,raw.c)||raw.h<Math.max(raw.o,raw.c)||raw.h<raw.l||
 raw.v<0||raw.s%60000!==0||raw.e-raw.s!==60000)throw Error("INVALID_AGGREGATE");
 // Do not treat a developing candle as closed. Provider finality/latency still needs live verification.
 if(observedAtMs<raw.e)return null;
 return {contractTicker:ticker,productCode:"NQ",timestampMs:raw.s,open:raw.o,high:raw.h,low:raw.l,close:raw.c,volume:raw.v};
}
const start=Date.parse("2026-09-28T13:32:00.000Z");
const sample:Agg={ev:"AM",sym:ticker,o:30748,h:30759.25,l:30735,c:30738.25,v:100,s:start,e:start+60000};
const developing=normalize(sample,start+30000);
const closed=normalize(sample,start+60000);
if(developing!==null||!closed||closed.timestampMs!==start||closed.close!==30738.25)throw Error("FINALITY_CONTRACT_FAILED");
let rejected=0;
for(const invalid of [{...sample,sym:"GCZ6"},{...sample,e:start+120000},{...sample,h:30730}]){
 try{normalize(invalid,start+120000);}catch{rejected++;}
}
if(rejected!==3)throw Error("INVALID_MESSAGE_ACCEPTED");
console.log("=== TM001 MASSIVE FUTURES WEBSOCKET CONTRACT ===");
console.log("FEED_CONTRACT",JSON.stringify({channel:"AM.NQZ6",event:"AM",transport:"WEBSOCKET",sampleOnly:true,developingBarIgnored:developing===null,closedBarNormalized:!!closed,invalidRejected:rejected,providerFinalityVerified:false,subscriptionEntitlementVerified:false,liveLatencyVerified:false,apiCalls:0,connections:0,orders:0,externalAlerts:0}));
