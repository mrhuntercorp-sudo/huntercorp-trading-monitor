/** Independent synthetic account-risk scenario checks.
 * Does not import P4c/P4d or claim market-fill certification.
 */
import {strict as assert} from "node:assert";
type Mode="THRESHOLD_PROXY"|"WORST_BAR_STRESS";
type Bar={time:number;open:number;high:number;low:number};
type Input={direction:"LONG"|"SHORT";entry:number;entryTime:number;plannedExitTime:number;plannedExitReason:string;plannedExitPrice:number;bars:Bar[];balance:number;dayStart:number;highEod:number;start:number;mll:number;usdPerPoint:number;friction:number;mode:Mode};
function independentReplay(x:Input){
 const sign=x.direction==="LONG"?1:-1;
 const floors=[{name:"MLL",value:Math.min(x.start,x.highEod-x.mll)},{name:"OPERATING",value:x.highEod-x.mll*.5},{name:"DAILY",value:x.dayStart-x.mll*.15}];
 let exit=x.plannedExitPrice,reason=x.plannedExitReason,time=x.plannedExitTime;
 for(const b of x.bars){
  if(b.time>x.plannedExitTime||(b.time===x.plannedExitTime&&x.plannedExitReason==="TIME_EXIT"))break;
  const worst=x.direction==="LONG"?b.low:b.high;
  const equity=x.balance+(worst-x.entry)*sign*x.usdPerPoint-x.friction;
  const entryEquity=x.balance-x.friction;
  const crossed=floors.filter(f=>entryEquity>f.value&&equity<=f.value).sort((a,b)=>b.value-a.value)[0];
  if(!crossed)continue;
  exit=x.mode==="WORST_BAR_STRESS"?worst:x.entry+(crossed.value-x.balance+x.friction)/(sign*x.usdPerPoint);
  reason=crossed.name;time=b.time;break;
 }
 const net=(exit-x.entry)*sign*x.usdPerPoint-x.friction;
 return {exit,reason,time,holdingMinutes:(time-x.entryTime)/60000,entryMinuteExit:time===x.entryTime,net,balance:x.balance+net,halt:reason==="MLL"||reason==="OPERATING"||reason==="DAILY"};
}
const t=Date.parse("2026-09-21T14:30:00Z"),minute=60000;
const base:Input={direction:"LONG",entry:100,entryTime:t,plannedExitTime:t+30*minute,plannedExitReason:"TIME_EXIT",plannedExitPrice:105,bars:[{time:t,open:100,high:101,low:99},{time:t+2*minute,open:99,high:100,low:50}],balance:50000,dayStart:50000,highEod:50000,start:50000,mll:3000,usdPerPoint:10,friction:25,mode:"THRESHOLD_PROXY"};
let count=0;const test=(ok:boolean,name:string)=>{assert.ok(ok,name);count++};
for(const mode of ["THRESHOLD_PROXY","WORST_BAR_STRESS"] as const){
 const r=independentReplay({...base,mode});
 test(r.reason==="DAILY","daily threshold first "+mode);
 test(r.time===t+2*minute,"early exit timestamp "+mode);
 test(r.holdingMinutes===2&&!r.entryMinuteExit,"early holding "+mode);
 test(r.halt,"daily halt "+mode);
 test(mode==="THRESHOLD_PROXY"?r.net===-450:r.net===-525,"fill mode P&L "+mode);
}
const immediate=independentReplay({...base,bars:[{time:t,open:100,high:101,low:50}],mode:"THRESHOLD_PROXY"});
test(immediate.entryMinuteExit&&immediate.holdingMinutes===0,"entry-minute risk exit");
const noPost=independentReplay({...base,bars:[{time:t,open:100,high:101,low:99},{time:t+30*minute,open:105,high:105,low:1}],plannedExitPrice:105});
test(noPost.reason==="TIME_EXIT"&&noPost.net===25,"time-exit open excludes later extreme");
const operating=independentReplay({...base,mll:2000,dayStart:50500,balance:50500,highEod:50500});
test(operating.reason==="DAILY","daily floor priority with $2k MLL");
const mll=independentReplay({...base,mll:3000,balance:49900,dayStart:53000,highEod:53000});
test(mll.reason==="DAILY","highest encountered equity threshold wins");
const short=independentReplay({...base,direction:"SHORT",bars:[{time:t,open:100,high:150,low:99}]});
test(short.reason==="DAILY"&&short.exit>100,"short adverse move");
console.log("TM001 P4e INDEPENDENT SYNTHETIC RISK SCENARIOS GREEN "+count+"/"+count);
console.log("LIMITATION: Standalone oracle scenarios; does not invoke production engine, validate intrabar ordering, or certify fills.");
