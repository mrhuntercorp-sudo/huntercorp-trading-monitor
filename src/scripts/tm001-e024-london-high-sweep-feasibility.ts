/** E024: post-hoc London high wick sweep short feasibility; cache only. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {rthBars} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {simulateFixedShort,FIXED_SHORT_RULES} from "../research/fixed-short-feasibility.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const end=process.argv[2]??"2026-10-02";
if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(ms(end))||iso(ms(end))!==end)throw Error("INVALID_END_DATE");
const dates:string[]=[];
for(let t=ms(end);dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}
dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const clock=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return {date:c.date,minute:c.hour*60+c.minute};};
type Trade={date:string;entryTime:string;entry:number;exit:number;exitTime:string;net:number;reason:string;ambiguous:boolean};
const trades:Trade[]=[],excluded:{date:string;reason:string}[]=[];
let eligible=0,noSweep=0,late=0;
for(const date of dates){
 const ticker=provisionalNqContract(date);
 if(isProvisionalRoll(date)){excluded.push({date,reason:"PROVISIONAL_ROLL"});continue;}
 try{
  const prior=iso(ms(date)-86400000);
  const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
  if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length)throw Error("DUPLICATE_BARS");
  const day=rthBars(bars,date);
  if(auditRthCoverage(day,date,ticker).status!=="COMPLETE")throw Error("INCOMPLETE_RTH");
  const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.minute>=120&&c.minute<540;});
  if(london.length!==420||london.some((b,i)=>i>0&&b.timestampMs-london[i-1]!.timestampMs!==60000))throw Error("INCOMPLETE_LONDON");
  eligible++;
  const high=Math.max(...london.map(b=>b.high));
  const sweep=firstWickRejection(day,{kind:"OVERNIGHT_HIGH",price:high,side:"HIGH",knownAtIndex:0});
  if(!sweep){noSweep++;continue;}
  const next=day[sweep.barIndex+1];
  if(!next||clock(next).minute>=660){late++;continue;}
  const sim=simulateFixedShort(day,sweep.barIndex);
  if(!sim){late++;continue;}
  trades.push({date,entryTime:new Date(next.timestampMs).toISOString(),entry:sim.entryPrice,exit:sim.exitPrice,
   exitTime:new Date(day[sim.exitIndex]!.timestampMs).toISOString(),net:sim.netPoints,reason:sim.reason,ambiguous:sim.ambiguousBar});
 }catch(e){const reason=e instanceof Error?e.message:String(e);excluded.push({date,reason:reason.includes("NETWORK_DISABLED")?"MISSING_CACHE":reason});}
}
const round=(n:number)=>Math.round(n*100)/100;
const net=trades.reduce((s,t)=>s+t.net,0),wins=trades.filter(t=>t.net>0),losses=trades.filter(t=>t.net<0);
let equity=0,peak=0,dd=0;
for(const t of trades){equity+=t.net;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);}
const best=[...trades].sort((a,b)=>b.net-a.net);
console.log("=== TM001 E024 LONDON HIGH SWEEP SHORT FEASIBILITY ===");
console.log("POST_HOC_SELECTED_FROM_E023 | IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_ORDERS | NO_OPTIMIZATION");
console.log("RULES",JSON.stringify({londonEt:"02:00-08:59",signal:"FIRST_RTH_CANDLE_WICKS_ABOVE_LONDON_HIGH_AND_CLOSES_BELOW",
 entry:"NEXT_BAR_OPEN_BEFORE_11_ET",direction:"SHORT",...FIXED_SHORT_RULES,
 oneTradePerSession:true,stopFirstIfAmbiguous:true,gapThroughStop:"WORSE_OPEN",
 warning:"Provisional London window; OHLC cannot establish intrabar order or actual liquidity"}));
console.log("COVERAGE",JSON.stringify({requested:dates.length,eligible,excluded,noSweep,late}));
console.log("RESULT",JSON.stringify({trades:trades.length,wins:wins.length,losses:losses.length,
 netPoints:round(net),averageNetPoints:trades.length?round(net/trades.length):null,
 winRatePct:trades.length?round(wins.length/trades.length*100):null,
 stops:trades.filter(t=>t.reason==="STOP").length,targets:trades.filter(t=>t.reason==="TARGET").length,
 timeExits:trades.filter(t=>t.reason==="TIME").length,ambiguousBars:trades.filter(t=>t.ambiguous).length,
 maxClosedTradeDrawdownPoints:round(dd),
 netWithoutBestTradePoints:best.length?round(net-best[0]!.net):null,
 netWithoutBestTwoTradesPoints:best.length>1?round(net-best[0]!.net-best[1]!.net):null,
 costStressExtraPoints:[0,1,2,4].map(extra=>({extra,netPoints:round(net-extra*trades.length)})),
 historicalExploratoryOnly:true,notIndependent:true,noApprovedEdge:true}));
console.log("TRADES",JSON.stringify(trades));
console.log("E024_COMPLETE",JSON.stringify({noApi:true,noOrders:true,noStrategyPromotion:true}));
