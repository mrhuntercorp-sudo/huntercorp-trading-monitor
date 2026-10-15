/** TM001 E027 reusable, deterministic, read-only market intelligence. */
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
export type Range={high:number;low:number;bars:number};
export type Briefing={tradeDate:string;previousTradeDate:string;ticker:string;asOfEt:"09:20";levels:{priorRth:Range;asia:Range;london:Range;overnightThrough0919:Range;preopen0900To0919:Range};lastKnownClose:number;positionVsLondonHigh:"ABOVE"|"AT_OR_BELOW";definitionsProvisional:true;independentValidation:false};
export type Observation={signalUtc:string;confirmedUtc:string;level:number;wickHigh:number;close:number};
const clock=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return {date:c.date,minute:c.hour*60+c.minute};};
const range=(a:readonly MinuteBar[]):Range=>({high:Math.max(...a.map(b=>b.high)),low:Math.min(...a.map(b=>b.low)),bars:a.length});
const complete=(a:readonly MinuteBar[],n:number)=>a.length===n&&a.every((b,i)=>i===0||b.timestampMs-a[i-1]!.timestampMs===60000);
export function makeBriefing(bars:readonly MinuteBar[],date:string,previous:string,ticker:string):Briefing{
 const sorted=[...bars].sort((a,b)=>a.timestampMs-b.timestampMs);
 if(new Set(sorted.map(b=>b.timestampMs)).size!==sorted.length)throw Error("DUPLICATE_BARS");
 if(sorted.some(b=>b.contractTicker!==ticker||b.productCode!=="NQ"))throw Error("WRONG_CONTRACT");
 const prevCalendar=new Date(Date.parse(date+"T00:00:00Z")-86400000).toISOString().slice(0,10);
 const prior=sorted.filter(b=>{const c=clock(b);return c.date===previous&&c.minute>=570&&c.minute<960;});
 const asia=sorted.filter(b=>{const c=clock(b);return(c.date===prevCalendar&&c.minute>=1080)||(c.date===date&&c.minute<120);});
 const london=sorted.filter(b=>{const c=clock(b);return c.date===date&&c.minute>=120&&c.minute<540;});
 const preopen=sorted.filter(b=>{const c=clock(b);return c.date===date&&c.minute>=540&&c.minute<560;});
 const overnight=sorted.filter(b=>{const c=clock(b);return(c.date===prevCalendar&&c.minute>=1080)||(c.date===date&&c.minute<560);});
 if(!complete(prior,390)||!complete(asia,480)||!complete(london,420)||!complete(preopen,20)||!complete(overnight,920))throw Error("INCOMPLETE_BRIEFING_INPUT");
 const levels={priorRth:range(prior),asia:range(asia),london:range(london),overnightThrough0919:range(overnight),preopen0900To0919:range(preopen)};
 const lastKnownClose=preopen.at(-1)!.close;
 return {tradeDate:date,previousTradeDate:previous,ticker,asOfEt:"09:20",levels,lastKnownClose,
 positionVsLondonHigh:lastKnownClose>levels.london.high?"ABOVE":"AT_OR_BELOW",
 definitionsProvisional:true,independentValidation:false};
}
/** Accept only *completed* 1m bars in chronological order. Emit at most one historical observation. */
export class LondonHighRejectionDetector{
 private lastTimestamp=-Infinity;
 private seen=false;
 constructor(readonly tradeDate:string,readonly ticker:string,readonly londonHigh:number){
  if(!Number.isFinite(londonHigh))throw Error("INVALID_LEVEL");
 }
 consumeCompletedBar(bar:MinuteBar):Observation|null{
  if(bar.contractTicker!==this.ticker||bar.productCode!=="NQ")throw Error("WRONG_CONTRACT");
  if(bar.timestampMs<=this.lastTimestamp||bar.timestampMs%60000!==0)throw Error("OUT_OF_ORDER_BAR");
  if(bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close))throw Error("INVALID_OHLC");
  this.lastTimestamp=bar.timestampMs;
  const c=clock(bar);
  if(c.date!==this.tradeDate||c.minute<570||c.minute>=660||this.seen)return null;
  if(bar.high<=this.londonHigh||bar.close>=this.londonHigh)return null;
  this.seen=true;
  return {signalUtc:new Date(bar.timestampMs).toISOString(),confirmedUtc:new Date(bar.timestampMs+60000).toISOString(),
   level:this.londonHigh,wickHigh:bar.high,close:bar.close};
 }
}
