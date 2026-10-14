/** TM001 ORB002 research-only signal detector. No API calls, fills, optimization or orders.
 * Input must include the complete overnight minute series and RTH minute bars.
 * ET windows are fixed research conventions, not claims about local exchange opening hours.
 */
import type {MinuteBar} from "../market/types.js";
export type OvernightVariant="ORB002_LONDON"|"ORB002_FULL_OVERNIGHT";
export type OvernightBreakout={variant:OvernightVariant;direction:"LONG"|"SHORT";overnightHigh:number;overnightLow:number;signalBarStartMs:number;signalCloseMs:number;earliestEntryMs:number};
const fmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function et(ms:number){const p=Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};}
const MIN=60_000;
export function detectOvernightBreakout(bars:readonly MinuteBar[],tradeDate:string,variant:OvernightVariant):OvernightBreakout|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate))throw Error("INVALID_TRADE_DATE");
 const previous=new Date(Date.parse(tradeDate+"T12:00:00Z")-86400000).toISOString().slice(0,10);
 const ordered=[...bars].sort((a,b)=>a.timestampMs-b.timestampMs);
 for(let i=0;i<ordered.length;i++){
  const b=ordered[i]!;
  if(!Number.isSafeInteger(b.timestampMs)||![b.open,b.high,b.low,b.close].every(Number.isFinite)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("INVALID_BAR");
  if(i&&b.timestampMs===ordered[i-1]!.timestampMs)throw Error("DUPLICATE_BAR");
 }
 const london=variant==="ORB002_LONDON";
 if(!london&&variant!=="ORB002_FULL_OVERNIGHT")throw Error("UNKNOWN_VARIANT");
 const overnight=ordered.filter(b=>{const t=et(b.timestampMs);return london?t.date===tradeDate&&t.minute>=180&&t.minute<570:(t.date===previous&&t.minute>=1080)||(t.date===tradeDate&&t.minute<570);});
 const expected=london?390:930;
 if(overnight.length!==expected||overnight.some((b,i)=>i&&b.timestampMs-overnight[i-1]!.timestampMs!==MIN))throw Error("INCOMPLETE_OVERNIGHT_"+variant);
 const high=Math.max(...overnight.map(b=>b.high)),low=Math.min(...overnight.map(b=>b.low));
 // The NY 15-minute candle begins at 09:30, 09:45, ... . All 15 constituent
 // one-minute bars must exist. A signal is known only at candle close.
 const rth=ordered.filter(b=>{const t=et(b.timestampMs);return t.date===tradeDate&&t.minute>=570&&t.minute<960;});
 for(let i=0;i+15<=rth.length;i+=15){
  const chunk=rth.slice(i,i+15),first=et(chunk[0]!.timestampMs);
  if(first.minute!==570+i||chunk.some((b,j)=>et(b.timestampMs).minute!==570+i+j||j>0&&b.timestampMs-chunk[j-1]!.timestampMs!==MIN))throw Error("INCOMPLETE_RTH_15M");
  const close=chunk[14]!.close,dir=close>high?"LONG":close<low?"SHORT":null;
  if(dir)return {variant,direction:dir,overnightHigh:high,overnightLow:low,signalBarStartMs:chunk[0]!.timestampMs,signalCloseMs:chunk[14]!.timestampMs+MIN,earliestEntryMs:chunk[14]!.timestampMs+MIN};
 }
 return null;
}
