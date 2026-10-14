/** CP001 offline visual audit. All detections, no cherry-picking, no API/orders.
 * Writes an HTML report with SVG candlesticks and frozen detector annotations.
 */
import {writeFileSync} from "node:fs";
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {aggregateCp001FiveMinute,detectCp001Flags,type Cp001Bar,type Cp001Flag} from "../research/cp001-flags.js";
import {detectCp001Shoulders,type Cp001Shoulder} from "../research/cp001-shoulders.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";

type Pattern=Cp001Flag|Cp001Shoulder;
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];
for(let t=ms("2026-10-09");dates.length<35;t-=86400000){
 const d=iso(t),w=new Date(t).getUTCDay();
 if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);
}
dates.reverse();
const escape=(v:unknown)=>String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const round=(n:number)=>Number(n.toFixed(2));
const et=(ms:number)=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(ms));
function chart(day:readonly Cp001Bar[],p:Pattern):string{
 const start=Math.max(0,("poleStartIndex" in p?p.poleStartIndex:p.leftIndex)-5);
 const end=Math.min(day.length-1,p.breakoutIndex+8);
 const visible=day.slice(start,end+1);
 const low=Math.min(...visible.map(b=>b.low)),high=Math.max(...visible.map(b=>b.high));
 const pad=Math.max(5,(high-low)*.12),min=low-pad,max=high+pad;
 const W=980,H=350,left=58,right=15,top=20,bottom=38;
 const cw=(W-left-right)/visible.length;
 const x=(i:number)=>left+(i-start+.5)*cw;
 const y=(v:number)=>top+(max-v)/(max-min)*(H-top-bottom);
 const marks:string[]=[];
 for(let j=0;j<=4;j++){
  const value=min+(max-min)*j/4;
  marks.push('<line x1="'+left+'" y1="'+y(value)+'" x2="'+(W-right)+'" y2="'+y(value)+'" stroke="#293548" stroke-dasharray="3 5"/>');
  marks.push('<text x="4" y="'+(y(value)+4)+'" fill="#94a3b8" font-size="12">'+round(value)+'</text>');
 }
 for(let i=start;i<=end;i++){
  const b=day[i]!,cx=x(i),up=b.close>=b.open,color=up?"#3acaa1":"#fb7185";
  marks.push('<line x1="'+cx+'" y1="'+y(b.high)+'" x2="'+cx+'" y2="'+y(b.low)+'" stroke="'+color+'" stroke-width="1.5"/>');
  const rectY=y(Math.max(b.open,b.close)),height=Math.max(1.2,Math.abs(y(b.open)-y(b.close)));
  marks.push('<rect x="'+(cx-Math.min(5,cw*.33))+'" y="'+rectY+'" width="'+Math.min(10,cw*.66)+'" height="'+height+'" fill="'+color+'"/>');
  if(i%3===0||i===p.breakoutIndex)marks.push('<text x="'+cx+'" y="'+(H-11)+'" fill="#94a3b8" font-size="10" text-anchor="middle">'+escape(et(b.timestampMs))+'</text>');
 }
 const labels:(readonly [number,number,string,string])[]=[];
 if("poleStartIndex" in p){
  labels.push([p.poleStartIndex,day[p.poleStartIndex]!.open,"Pole start","#fbbf24"],[p.poleEndIndex,day[p.poleEndIndex]!.close,"Pole end","#fbbf24"],[p.flagStartIndex,day[p.flagStartIndex]!.close,"Flag","#a78bfa"]);
  const from=p.flagStartIndex,to=p.breakoutIndex;
  marks.push('<line x1="'+x(from)+'" y1="'+y(p.breakoutLevel)+'" x2="'+x(to)+'" y2="'+y(p.breakoutLevel)+'" stroke="#a78bfa" stroke-width="2" stroke-dasharray="6 4"/>');
 }else{
  const n1=p.necklineAnchorIndices[0],n2=p.necklineAnchorIndices[1];
  const leftPrice=p.pattern==="HEAD_AND_SHOULDERS"?day[p.leftIndex]!.high:day[p.leftIndex]!.low;
  const headPrice=p.pattern==="HEAD_AND_SHOULDERS"?day[p.headIndex]!.high:day[p.headIndex]!.low;
  const rightPrice=p.pattern==="HEAD_AND_SHOULDERS"?day[p.rightIndex]!.high:day[p.rightIndex]!.low;
  labels.push([p.leftIndex,leftPrice,"L","#fbbf24"],[p.headIndex,headPrice,"H","#fbbf24"],[p.rightIndex,rightPrice,"R","#fbbf24"],[n1,p.pattern==="HEAD_AND_SHOULDERS"?day[n1]!.low:day[n1]!.high,"N1","#a78bfa"],[n2,p.pattern==="HEAD_AND_SHOULDERS"?day[n2]!.low:day[n2]!.high,"N2","#a78bfa"]);
  const firstPrice=p.necklineAtBreak+(n1-p.breakoutIndex)*(p.necklineAtBreak-(p.pattern==="HEAD_AND_SHOULDERS"?day[n1]!.low:day[n1]!.high))/(p.breakoutIndex-n1);
  marks.push('<line x1="'+x(n1)+'" y1="'+y(firstPrice)+'" x2="'+x(p.breakoutIndex)+'" y2="'+y(p.necklineAtBreak)+'" stroke="#a78bfa" stroke-width="2" stroke-dasharray="6 4"/>');
 }
 for(const [i,price,label,color] of labels){
  if(i<start||i>end)continue;
  marks.push('<circle cx="'+x(i)+'" cy="'+y(price)+'" r="4" fill="'+color+'"/>');
  marks.push('<text x="'+x(i)+'" y="'+Math.max(12,y(price)-9)+'" text-anchor="middle" font-size="12" font-weight="bold" fill="'+color+'">'+escape(label)+'</text>');
 }
 marks.push('<line x1="'+x(p.breakoutIndex)+'" y1="'+top+'" x2="'+x(p.breakoutIndex)+'" y2="'+(H-bottom)+'" stroke="#60a5fa" stroke-dasharray="5 5"/>');
 marks.push('<text x="'+x(p.breakoutIndex)+'" y="'+(top+12)+'" fill="#60a5fa" font-size="12" text-anchor="middle">CONFIRMED</text>');
 return '<svg role="img" aria-label="Annotated '+escape(p.pattern)+' candlestick chart" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">'+marks.join("")+'</svg>';
}
const sections:string[]=[];const counts:Record<string,number>={BULL_FLAG:0,BEAR_FLAG:0,HEAD_AND_SHOULDERS:0,INVERSE_HEAD_AND_SHOULDERS:0};
const excluded:{date:string;reason:string}[]=[];let eligible=0;
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const bars=aggregateCp001FiveMinute(day);
 const patterns:Pattern[]=[...detectCp001Flags(bars),...detectCp001Shoulders(bars)].sort((a,b)=>a.breakoutIndex-b.breakoutIndex);
 for(const p of patterns){
  counts[p.pattern]++;
  const metadata="poleStartIndex" in p?
   "Pole "+round(p.polePoints)+" pts | Retracement "+round(p.retracementRatio*100)+"% | Flag "+p.consolidationBars+" bars":
   "Head excess "+round(p.headExcessPoints)+" pts | Shoulder difference "+round(p.shoulderDifferencePoints)+" pts";
  sections.push('<article><h2>'+escape(date)+' · '+escape(p.pattern.replaceAll("_"," "))+' · '+escape(et(p.breakoutTimeMs))+' ET</h2><p>'+escape(metadata)+' · Breakout index '+p.breakoutIndex+'</p>'+chart(bars,p)+'<p class="review">Visual review: <label><input type="checkbox"/> Valid pattern</label> <label><input type="checkbox"/> False positive</label> <label><input type="checkbox"/> Unclear</label> <span>(checkboxes are not saved)</span></p></article>');
 }
}
const total=Object.values(counts).reduce((a,b)=>a+b,0);
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>TM001 CP001 Visual Audit</title><style>body{background:#0b1220;color:#e2e8f0;font:15px system-ui,sans-serif;margin:0 auto;max-width:1080px;padding:24px}h1{font-size:27px}h2{font-size:18px;margin:0}p{color:#aebbd0}article{background:#121e30;border:1px solid #344256;border-radius:12px;padding:18px;margin:22px 0}svg{display:block;width:100%;background:#0a1524;border-radius:8px}.review{display:flex;flex-wrap:wrap;gap:15px}label{color:#e2e8f0}input{accent-color:#60a5fa}summary{cursor:pointer}code{color:#9bd9ff}</style></head><body><h1>TM001 · CP001 Four-Pattern Visual Audit</h1><p>Historical NQ, 5-minute RTH · Cache only · No orders · All detections included · NOT trading validation</p><p><strong>'+total+' detections</strong> across '+eligible+' eligible days. '+escape(JSON.stringify(counts))+'</p><p>Annotations are generated from frozen detection outputs. L/H/R mark shoulders/head; N1/N2 neckline anchors. Blue line marks confirmed breakout. Candles after confirmation are displayed for context only, never for detection.</p><details><summary>Excluded dates</summary><pre>'+escape(JSON.stringify(excluded,null,2))+'</pre></details>'+sections.join("")+'<p>END OF AUDIT · Historical sample exposed. Human review required; no performance claims.</p></body></html>';
const output="cp001-visual-audit.html";writeFileSync(output,html,"utf8");
console.log("CP001_VISUAL_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,counts,total,charts:sections.length,excluded,output,allDetectionsIncluded:true,usesFutureBarsForDetection:false,visualReviewRequired:true,noApi:true,noOrders:true}));
