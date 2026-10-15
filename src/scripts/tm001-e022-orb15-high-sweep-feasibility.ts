/** E022: post-hoc ORB15 high wick-sweep feasibility, not independent validation. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {rthBars,knownLevels} from "../research/level-reclaim.js";
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
type Trade={date:string;entryTime:string;net:number;reason:string;ambiguous:boolean;entry:number;exit:number;exitTime:string};
const trades:Trade[]=[],exclusions:{date:string;reason:string}[]=[];
let eligible=0,noSweep=0,late=0;
for(const date of dates){
 const ticker=provisionalNqContract(date);
 if(isProvisionalRoll(date)){exclusions.push({date,reason:"PROVISIONAL_ROLL"});continue;}
 try{
  const prior=iso(ms(date)-86400000);
  const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
  if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length)throw Error("DUPLICATE_BARS");
  const day=rthBars(bars,date),overnight=overnightBars(bars,date);
  if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||
    overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000))throw Error("INCOMPLETE_SESSION");
  eligible++;
  const level=knownLevels(day,overnight).find(x=>x.kind==="ORB_15_HIGH")!;
  const sweep=firstWickRejection(day,level);
  if(!sweep){noSweep++;continue;}
  const next=day[sweep.barIndex+1];
  if(!next){late++;continue;}
  const c=newYorkClock(next.timestampMs),minute=c.hour*60+c.minute;
  if(minute>=660){late++;continue;} // locked NY opening-window comparison, no late entries
  const sim=simulateFixedShort(day,sweep.barIndex);
  if(!sim){late++;continue;}
  trades.push({date,entryTime:new Date(next.timestampMs).toISOString(),net:sim.netPoints,
   reason:sim.reason,ambiguous:sim.ambiguousBar,entry:sim.entryPrice,exit:sim.exitPrice,
   exitTime:new Date(day[sim.exitIndex]!.timestampMs).toISOString()});
 }catch(e){const reason=e instanceof Error?e.message:String(e);exclusions.push({date,reason:reason.includes("ENOENT")?"MISSING_CACHE":reason});}
}
const round=(n:number)=>Math.round(n*100)/100;
const net=trades.reduce((s,t)=>s+t.net,0),wins=trades.filter(t=>t.net>0),losses=trades.filter(t=>t.net<0);
let equity=0,peak=0,drawdown=0;
for(const t of trades){equity+=t.net;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);}
const best=[...trades].sort((a,b)=>b.net-a.net);
console.log("=== TM001 E022 ORB15 HIGH SWEEP SHORT FEASIBILITY ===");
console.log("POST_HOC_SELECTED_FROM_E021 | IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_ORDERS | NO_OPTIMIZATION");
console.log("RULES",JSON.stringify({signal:"FIRST_ORB15_HIGH_WICK_BEYOND_CLOSE_BACK_INSIDE",entry:"NEXT_BAR_OPEN_BEFORE_11_ET",
 direction:"SHORT",...FIXED_SHORT_RULES,oneTradePerSession:true,stopFirstIfAmbiguous:true,
 gapsThroughStop:"WORSE_OPEN",timeExit:"CLOSE_OF_TENTH_ENTRY_ONWARD_BAR",
 note:"40/40/10 pre-existing wick feasibility rules, not optimized for this candidate"}));
console.log("COVERAGE",JSON.stringify({requested:dates.length,eligible,exclusions,noSweep,late}));
console.log("RESULT",JSON.stringify({trades:trades.length,wins:wins.length,losses:losses.length,netPoints:round(net),
 averageNetPoints:trades.length?round(net/trades.length):null,winRatePct:trades.length?round(wins.length/trades.length*100):null,
 stops:trades.filter(t=>t.reason==="STOP").length,targets:trades.filter(t=>t.reason==="TARGET").length,
 timeExits:trades.filter(t=>t.reason==="TIME").length,ambiguousBars:trades.filter(t=>t.ambiguous).length,
 maxClosedTradeDrawdownPoints:round(drawdown),netWithoutBestTradePoints:best.length?round(net-best[0]!.net):null,
 netWithoutBestTwoTradesPoints:best.length>1?round(net-best[0]!.net-best[1]!.net):null,
 costStressExtraPoints:[0,1,2,4].map(extra=>({extra,netPoints:round(net-extra*trades.length)})),
 historicalExploratoryOnly:true,notIndependent:true,noApprovedEdge:true}));
console.log("TRADES",JSON.stringify(trades));
console.log("E022_COMPLETE",JSON.stringify({noApi:true,noOrders:true,noStrategyPromotion:true}));
