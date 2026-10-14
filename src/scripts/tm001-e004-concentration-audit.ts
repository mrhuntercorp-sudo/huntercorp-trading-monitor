/** E004: read-only analysis of E003 reconciled event ledger. No strategy evaluation changes. */
import {e003Rows,e003Excluded} from "./tm001-e003-trade-ledger.js";
type Strategy="P4"|"ORB5";
type Trade=Extract<(typeof e003Rows)[number],{status:string}>;
const round=(n:number)=>Math.round(n*100)/100;
const trades=(strategy:Strategy)=>e003Rows.filter(r=>r.strategy===strategy&&r.status==="TRADE");
const mins=(s:string)=>{const d=new Date(s);return (d.getTime()/60000);};
const ranked=(strategy:Strategy)=>{
 const a=trades(strategy);
 const sorted=[...a].sort((x,y)=>(y.netPoints??0)-(x.netPoints??0));
 const net=round(a.reduce((s,x)=>s+(x.netPoints??0),0));
 const gains=a.filter(x=>(x.netPoints??0)>0).reduce((s,x)=>s+(x.netPoints??0),0);
 const losses=a.filter(x=>(x.netPoints??0)<0).reduce((s,x)=>s+(x.netPoints??0),0);
 const best=sorted[0],worst=sorted.at(-1);
 const byDate=new Map<string,number>();
 for(const x of a)byDate.set(x.date,(byDate.get(x.date)??0)+(x.netPoints??0));
 const days=[...byDate].sort((x,y)=>y[1]-x[1]);
 const top2=days.slice(0,2).reduce((s,x)=>s+x[1],0);
 const top3=days.slice(0,3).reduce((s,x)=>s+x[1],0);
 const durations=a.map(x=>({date:x.date,minutes:mins(x.exitTimeUtc!)-mins(x.entryTimeUtc!),reason:x.exitReason}));
 const maxMinutes=Math.max(...durations.map(x=>x.minutes));
 const firstBarExits=durations.filter(x=>x.minutes===0);
 const entries=a.map(x=>({date:x.date,entryTimeUtc:x.entryTimeUtc,exitTimeUtc:x.exitTimeUtc,netPoints:x.netPoints,exitReason:x.exitReason}));
 console.log("E004_STRATEGY",JSON.stringify({strategy,trades:a.length,netPoints:net,grossPositiveNetPoints:round(gains),grossNegativeNetPoints:round(losses),
  profitFactor:losses<0?round(gains/-losses):null,bestTrade:best?{date:best.date,netPoints:best.netPoints}:null,
  worstTrade:worst?{date:worst.date,netPoints:worst.netPoints}:null,
  withoutBestDay:round(net-(days[0]?.[1]??0)),withoutTopTwoDays:round(net-top2),withoutTopThreeDays:round(net-top3),
  topThreeDays:days.slice(0,3).map(([date,points])=>({date,points:round(points)})),
  maxObservedDurationMinutes:maxMinutes,firstBarExitCount:firstBarExits.length,
  firstBarExitDates:firstBarExits.map(x=>x.date),gapThroughStopCount:a.filter(x=>x.gapThroughStop===true).length,
  ambiguousBarCount:a.filter(x=>x.ambiguous===true).length,
  exitTimeIsMinuteBarStartNotFillTime:true,
  entryPriceAssumedNextMinuteOpen:true,frictionAssumedTwoNqPoints:true}));
 for(const x of sorted)console.log("E004_RANKED_TRADE",JSON.stringify({strategy,date:x.date,direction:x.direction,entryTimeUtc:x.entryTimeUtc,
  exitTimeUtc:x.exitTimeUtc,netPoints:x.netPoints,exitReason:x.exitReason,minutes:round(mins(x.exitTimeUtc!)-mins(x.entryTimeUtc!))}));
 return {days,entries};
};
const p4=ranked("P4"),orb=ranked("ORB5");
const p4Map=new Map(p4.entries.map(x=>[x.date,x]));
const orbMap=new Map(orb.entries.map(x=>[x.date,x]));
const overlapping=[...p4Map.keys()].filter(date=>orbMap.has(date)).sort();
const simultaneouslyOpen=overlapping.filter(date=>{
 const a=p4Map.get(date)!,b=orbMap.get(date)!;
 return mins(a.entryTimeUtc!)<=mins(b.exitTimeUtc!)&&mins(b.entryTimeUtc!)<=mins(a.exitTimeUtc!);
});
const opposing=overlapping.filter(date=>{
 const a=e003Rows.find(x=>x.date===date&&x.strategy==="P4"&&x.status==="TRADE")!;
 const b=e003Rows.find(x=>x.date===date&&x.strategy==="ORB5"&&x.status==="TRADE")!;
 return a.direction!==b.direction;
});
console.log("E004_OVERLAP",JSON.stringify({bothTradeDays:overlapping.length,dates:overlapping,
 simultaneouslyOpenDays:simultaneouslyOpen,opposingDirectionDays:opposing,
 note:"Same-day trades are correlated exposure; do not add independent strategy returns as if risk were independent"}));
console.log("E004_DATA_QUALITY",JSON.stringify({excluded:e003Excluded,eligibleDays:28,
 p4NoSignal:e003Rows.filter(x=>x.strategy==="P4"&&x.status==="NO_SIGNAL").length,
 p4OutsideWindow:e003Rows.filter(x=>x.strategy==="P4"&&x.status==="OUTSIDE_ENTRY_WINDOW").length,
 orbNoSignal:e003Rows.filter(x=>x.strategy==="ORB5"&&x.status==="NO_SIGNAL").length,
 limitations:["Exposed in-sample historical data","Minute OHLC cannot establish intrabar fill ordering","Assumed next-minute-open entry and friction","ORB exit timestamps reconstructed from minute bar, not actual fills","Prior P4 out-of-sample weakness unresolved"],
 noOptimization:true,noNetwork:true,noOrders:true,noStrategyApproved:true}));
if(trades("P4").length!==19||trades("ORB5").length!==28)throw Error("E004_E003_TRADE_COUNT_MISMATCH");
