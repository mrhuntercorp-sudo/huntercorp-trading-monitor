/** Research-only account risk levels. Internal daily/operating budgets are NOT Topstep rules. */
import type {RiskLevel} from "./p4e-risk-crossing.js";
export function accountRiskFloors(x:{start:number;highEod:number;dayStart:number;mll:number}):RiskLevel[]{
 const {start,highEod,dayStart,mll}=x;
 if(![start,highEod,dayStart,mll].every(Number.isFinite)||mll<=0)throw Error("INVALID_ACCOUNT_INPUT");
 return [{name:"MLL",level:Math.min(start,highEod-mll)},{name:"OPERATING",level:highEod-mll*.5},{name:"DAILY",level:dayStart-mll*.15}];
}
export function nextEodHigh(previousHigh:number,closingBalance:number):number{
 if(!Number.isFinite(previousHigh)||!Number.isFinite(closingBalance))throw Error("INVALID_EOD_BALANCE");
 return Math.max(previousHigh,closingBalance);
}
