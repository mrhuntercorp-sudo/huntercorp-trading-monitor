/** P4c research account state transitions; internal operating budgets are not Topstep rules. */
import {accountRiskFloors,nextEodHigh} from "./p4e-account-floors.js";
import type {RiskTrigger} from "./p4e-risk-crossing.js";
export type AccountState={start:number;mll:number;balance:number;highEod:number;dayStart:number;currentDate:string;haltToday:boolean;firstMllTouch:string|null;firstOperatingStop:string|null};
export function beginAccountDate(s:AccountState,date:string):AccountState{
 if(date===s.currentDate)return s;
 return {...s,highEod:s.currentDate?nextEodHigh(s.highEod,s.balance):s.highEod,currentDate:date,dayStart:s.balance,haltToday:false};
}
export function pretradeAccountDecision(s:AccountState){
 const levels=accountRiskFloors(s);
 const mllFloor=levels[0]!.level,operatingFloor=levels[1]!.level,dailyFloor=levels[2]!.level;
 if(s.firstMllTouch||s.firstOperatingStop||s.haltToday)return {allowed:false,pretradeReject:false,levels,mllFloor,operatingFloor,dailyFloor};
 return {allowed:s.balance>mllFloor&&s.balance>operatingFloor&&s.balance>dailyFloor,pretradeReject:s.balance<=mllFloor||s.balance<=operatingFloor||s.balance<=dailyFloor,levels,mllFloor,operatingFloor,dailyFloor};
}
export function rejectPretrade(s:AccountState):AccountState{
 const d=pretradeAccountDecision(s);
 return {...s,haltToday:true,firstMllTouch:s.balance<=d.mllFloor?s.currentDate:s.firstMllTouch,firstOperatingStop:s.balance>d.mllFloor&&s.balance<=d.operatingFloor?s.currentDate:s.firstOperatingStop};
}
export function settleAccountTrade(s:AccountState,pnl:number,reason:string):AccountState{
 const d=pretradeAccountDecision(s);
 const balance=s.balance+pnl;
 return {...s,balance,haltToday:s.haltToday||reason==="MLL"||reason==="OPERATING"||reason==="DAILY"||balance<=d.mllFloor||balance<=d.operatingFloor,
 firstMllTouch:s.firstMllTouch??(reason==="MLL"||balance<=d.mllFloor?s.currentDate:null),
 firstOperatingStop:s.firstOperatingStop??(reason==="OPERATING"||balance<=d.operatingFloor?s.currentDate:null)};
}
export function closeAccountSample(s:AccountState):AccountState{
 return {...s,highEod:s.currentDate?nextEodHigh(s.highEod,s.balance):s.highEod};
}
