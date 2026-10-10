import assert from "node:assert/strict";

/** Research-only threshold accounting. Not a Topstep execution or fill simulator. */
type RiskState={balance:number;highEod:number;dayStart:number;dayRealized:number;start:number;mll:number;dailyFraction:number;operatingFraction:number};
type Limits={mllFloor:number;operatingFloor:number;dailyFloor:number};
type Trigger="MLL"|"OPERATING"|"DAILY";
const limits=(s:RiskState):Limits=>({
 mllFloor:Math.min(s.start,s.highEod-s.mll),
 // Internal operating limit trails the EOD high-water mark, unlike the old absolute start-only check.
 operatingFloor:s.highEod-s.mll*s.operatingFraction,
 dailyFloor:s.dayStart-s.mll*s.dailyFraction,
});
function firstThreshold(s:RiskState,entryEquity:number,adverseEquity:number){
 const l=limits(s);
 if(adverseEquity>entryEquity)throw Error("ADVERSE_EQUITY_INVALID");
 const candidates: {name:Trigger;level:number}[]=[
  {name:"MLL",level:l.mllFloor},{name:"OPERATING",level:l.operatingFloor},{name:"DAILY",level:l.dailyFloor}
 ].filter(x=>entryEquity>x.level&&adverseEquity<=x.level);
 candidates.sort((a,b)=>b.level-a.level);
 return {first:candidates[0]??null,all:candidates,limits:l};
}
function endDay(s:RiskState,closingBalance:number):RiskState{
 return {...s,balance:closingBalance,highEod:Math.max(s.highEod,closingBalance),dayStart:closingBalance,dayRealized:0};
}
const base:RiskState={start:50000,balance:50000,highEod:50000,dayStart:50000,dayRealized:0,mll:2000,dailyFraction:.15,operatingFraction:.5};
let count=0;
function check(name:string,fn:()=>void){fn();count++;console.log("PASS "+name);}
check("FIRST_CROSSING_DAILY_BEFORE_OPERATING_AND_MLL",()=>{
 const r=firstThreshold(base,50000,47700);
 assert.equal(r.first?.name,"DAILY");assert.deepEqual(r.all.map(x=>x.name),["DAILY","OPERATING","MLL"]);
});
check("NO_CROSSING_ABOVE_ALL_LIMITS",()=>assert.equal(firstThreshold(base,50000,49750).first,null));
check("EXACT_DAILY_THRESHOLD",()=>assert.equal(firstThreshold(base,50000,49700).first?.name,"DAILY"));
check("TRAILING_EOD_FLOOR_RATCHETS",()=>{
 const next=endDay(base,51000);
 assert.equal(limits(next).mllFloor,49000);
 assert.equal(limits(next).operatingFloor,50000);
 assert.equal(limits(next).dailyFloor,50700);
 assert.equal(firstThreshold(next,51000,50650).first?.name,"DAILY");
});
check("MLL_FLOOR_CAPS_AT_START",()=>{
 const next=endDay(base,54000);assert.equal(limits(next).mllFloor,50000);
});
check("DAILY_BUDGET_RESETS_EACH_DAY",()=>{
 const next=endDay({...base,dayRealized:-250},49750);
 assert.equal(limits(next).dailyFloor,49450);
 assert.equal(firstThreshold(next,49750,49440).first?.name,"DAILY");
});
check("DAILY_LIMIT_USES_DAY_START_NOT_LAST_TRADE",()=>{
 const s={...base,balance:49800,dayRealized:-200};
 assert.equal(limits(s).dailyFloor,49700);
 assert.equal(firstThreshold(s,49800,49690).first?.name,"DAILY");
});
check("ALREADY_BELOW_THRESHOLD_IS_NOT_NEW_CROSSING",()=>{
 const s={...base,balance:49600};
 assert.equal(firstThreshold(s,49600,49500).all.some(x=>x.name==="DAILY"),false);
});
check("ENTRY_EQUITY_ALREADY_BELOW_LIMIT_REQUIRES_PRETRADE_REJECTION",()=>{
 const s={...base,balance:49500};
 assert.ok(s.balance<=limits(s).dailyFloor);
});
check("OPERATING_LIMIT_IS_INTERNAL_NOT_TOPSTEP_RULE",()=>{
 const l=limits(base);assert.equal(l.operatingFloor,49000);assert.equal(l.mllFloor,48000);
});
console.log("TM001 RISK THRESHOLD REGRESSION GREEN "+count+"/"+count);
console.log("RESEARCH ONLY | NO API | NO CACHE | NO WRITES | NO TRADES");
console.log("NOT A FILL SIMULATOR: threshold crossings do not establish achievable liquidation prices; bar high/low cannot resolve event order versus stop/target; use tick-level data for higher fidelity.");
