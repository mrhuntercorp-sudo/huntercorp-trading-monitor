/** P4e correctness-only helpers shared by the audit and synthetic boundary regression. */
export function riskBarEligible(barTime:number,exitTime:number,exitReason:string):boolean{
 // A TIME_EXIT is filled at its bar open; that bar's high/low occurs after exit.
 return barTime<exitTime||(barTime===exitTime&&exitReason!=="TIME_EXIT");
}
export function auditedExitTime(plannedExitTime:number,riskTriggerBarTime:number|null):number{
 return riskTriggerBarTime??plannedExitTime;
}
export function auditHoldingMinutes(entryTime:number,exitTime:number):number{
 if(exitTime<entryTime)throw Error("EXIT_BEFORE_ENTRY");
 return (exitTime-entryTime)/60000;
}
export function exitAtDeadline(barTime:number,deadline:number):boolean{
 return barTime>=deadline;
}
