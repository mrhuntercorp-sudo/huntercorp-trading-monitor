/** E033 cache-only NQ research monitor runner. No network and no order interface. */
import {CachedHistoricalDays} from "./historical-cache.js";
import {makeBriefing} from "./market-intelligence.js";
import {IntelligencePipeline} from "./intelligence-pipeline.js";
import {DurableResearchDelivery} from "./durable-research-delivery.js";
import {rthBars} from "./level-reclaim.js";
import type {MinuteBar} from "../market/types.js";
export type ReplayReport={
 mode:"CACHE_ONLY_DRY_RUN";tradeDate:string;ticker:string;bars:number;observations:number;
 deliveryDecisions:Record<string,number>;londonHigh:number;gapQuarantined:boolean;
 networkCalls:0;orders:0;
};
export async function runCachedNqResearch(input:{
 tradeDate:string;previousTradeDate:string;ticker:string;cacheDates:readonly string[];
 ledgerPath:string;topic:string;
}):Promise<ReplayReport>{
 if(!/^NQ[A-Z][0-9]$/.test(input.ticker))throw Error("INVALID_NQ_CONTRACT");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.tradeDate)||!/^\d{4}-\d{2}-\d{2}$/.test(input.previousTradeDate))
  throw Error("INVALID_TRADE_DATE");
 if(input.cacheDates.length<2||!input.cacheDates.includes(input.tradeDate)||
    !input.cacheDates.includes(input.previousTradeDate))throw Error("INVALID_CACHE_DATES");
 const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_MISS");}});
 const bars:MinuteBar[]=[];
 for(const day of input.cacheDates)bars.push(...await cache.getDay({ticker:input.ticker,productCode:"NQ"},day));
 const briefing=makeBriefing(bars,input.tradeDate,input.previousTradeDate,input.ticker);
 const pipeline=new IntelligencePipeline(input.tradeDate,input.ticker,briefing.levels.london.high);
 const delivery=new DurableResearchDelivery(input.ledgerPath,input.topic);
 const decisions:Record<string,number>={};
 let observations=0,gapQuarantined=false;
 // Replay uses a synthetic clock only for local dry-run accounting. No network transport is available.
 for(const bar of rthBars(bars,input.tradeDate)){
  const result=pipeline.consume(bar);
  if(result.status==="GAP_QUARANTINED"){gapQuarantined=true;break;}
  if(result.event){
   observations++;
   const outcome=await delivery.process(result.event,{nowMs:Date.parse(result.event.confirmedAtUtc)+1000});
   decisions[outcome.status]=(decisions[outcome.status]??0)+1;
  }
 }
 return {mode:"CACHE_ONLY_DRY_RUN",tradeDate:input.tradeDate,ticker:input.ticker,
  bars:rthBars(bars,input.tradeDate).length,observations,deliveryDecisions:decisions,
  londonHigh:briefing.levels.london.high,gapQuarantined,networkCalls:0,orders:0};
}
