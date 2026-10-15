/** E026: causal, read-only 09:20 ET briefing and post-open sweep replay. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {newYorkClock} from "../market/time.js";
import {rthBars} from "../research/level-reclaim.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(s:string)=>Date.parse(s+"T00:00:00Z");
const date=process.argv[2]??"2026-10-02";
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(ms(date))||iso(ms(date))!==date)throw Error("INVALID_DATE");
const previous=(()=>{for(let t=ms(date)-86400000;t>=ms(date)-86400000*8;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))return d;}throw Error("NO_PREVIOUS_SESSION");})();
const ticker=provisionalNqContract(date);
if(isProvisionalRoll(date)||isProvisionalRoll(previous)||provisionalNqContract(previous)!==ticker)throw Error("PROVISIONAL_ROLL_OR_CONTRACT_CHANGE");
const dates=[...new Set([iso(ms(previous)-86400000),previous,iso(ms(date)-86400000),date])].sort();
const bars:MinuteBar[]=[];
for(const d of dates)bars.push(...await cache.getDay({ticker,productCode:"NQ"},d));
bars.sort((a,b)=>a.timestampMs-b.timestampMs);
if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length)throw Error("DUPLICATE_BARS");
const clock=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return {date:c.date,minute:c.hour*60+c.minute};};
const prior=rthBars(bars,previous),rth=rthBars(bars,date);
const priorCalendar=iso(ms(date)-86400000);
const asia=bars.filter(b=>{const c=clock(b);return(c.date===priorCalendar&&c.minute>=1080)||(c.date===date&&c.minute<120);});
const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.minute>=120&&c.minute<540;});
const preopen=bars.filter(b=>{const c=clock(b);return c.date===date&&c.minute>=540&&c.minute<560;});
const overnight=bars.filter(b=>{const c=clock(b);return(c.date===priorCalendar&&c.minute>=1080)||(c.date===date&&c.minute<560);});
const complete=(a:MinuteBar[],n:number)=>a.length===n&&a.every((b,i)=>i===0||b.timestampMs-a[i-1]!.timestampMs===60000);
if(!complete(prior,390)||!complete(asia,480)||!complete(london,420)||!complete(preopen,20)||!complete(overnight,920))throw Error("INCOMPLETE_BRIEFING_INPUT");
const bounds=(a:MinuteBar[])=>({high:Math.max(...a.map(b=>b.high)),low:Math.min(...a.map(b=>b.low)),bars:a.length});
const level={priorRth:bounds(prior),asia:bounds(asia),london:bounds(london),overnightThrough0919:bounds(overnight),preopen0900To0919:bounds(preopen)};
console.log("=== TM001 E026 NQ INTELLIGENCE REPLAY ===");
console.log("HISTORICAL_REPLAY | CACHE_ONLY | ZERO_API | ZERO_ORDERS | NO_LIVE_ALERTS");
console.log("BRIEFING_0920_ET",JSON.stringify({tradeDate:date,ticker,asOfEt:"09:20",previousTradeDate:previous,
 levels:level,lastKnownClose:preopen.at(-1)!.close,
 positionVsLondonHigh:preopen.at(-1)!.close>level.london.high?"ABOVE":"AT_OR_BELOW",
 definitionsProvisional:true,independentValidation:false}));
const londonHigh=level.london.high;
let firstSignal:{signalUtc:string;level:number;wickHigh:number;close:number;nextBarUtc:string;nextBarOpen:number}|null=null;
const timeline:{atUtc:string;state:string;level:number;wickHigh?:number;close?:number}[]=[];
for(let i=0;i<rth.length;i++){
 const bar=rth[i]!,c=clock(bar);
 if(c.minute>=660)break;
 // Only completed candles may create events. This is a replay, not an order signal.
 if(bar.high>londonHigh&&bar.close<londonHigh){
  const next=rth[i+1];
  if(!next||clock(next).minute>=660)break;
  firstSignal={signalUtc:new Date(bar.timestampMs).toISOString(),level:londonHigh,
   wickHigh:bar.high,close:bar.close,nextBarUtc:new Date(next.timestampMs).toISOString(),nextBarOpen:next.open};
  timeline.push({atUtc:new Date(bar.timestampMs+60000).toISOString(),state:"REJECTION_CONFIRMED_AFTER_BAR_CLOSE",level:londonHigh,wickHigh:bar.high,close:bar.close});
  break;
 }
}
if(!firstSignal)timeline.push({atUtc:date+" 11:00 ET",state:"NO_QUALIFYING_OPENING_REJECTION",level:londonHigh});
console.log("LONDON_HIGH_MONITOR",JSON.stringify({tradeDate:date,ticker,windowEt:"09:30-11:00",
 state:firstSignal?"HISTORICAL_REJECTION_OBSERVED":"NO_HISTORICAL_REJECTION",
 firstSignal,timeline,simulationExcluded:true,noTradeRecommendation:true}));
console.log("E026_COMPLETE",JSON.stringify({briefing:true,monitorReplay:true,noApi:true,noOrders:true,liveFeed:false}));
