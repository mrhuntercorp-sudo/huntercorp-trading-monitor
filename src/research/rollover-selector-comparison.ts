export type ContractVolumeDay={date:string;oldVolume:number;newVolume:number;complete:boolean};
export type Selection={status:"SELECTED"|"REVIEW_REQUIRED";ticker?:"OLD"|"NEW";reason:string;evidenceDate?:string};
export function compareRolloverSelectors(tradeDate:string,rollDate:string,priorSessionDate:string,days:readonly ContractVolumeDay[]){
 const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T00:00:00Z"));
 if(![tradeDate,rollDate,priorSessionDate].every(valid)||priorSessionDate>=tradeDate) throw Error("Invalid date ordering");
 const calendar:Selection={status:"SELECTED",ticker:tradeDate>=rollDate?"NEW":"OLD",reason:"REFERENCE_ROLL_CALENDAR"};
 const earlier=days.filter(d=>d.date<tradeDate);
 if(earlier.some((d,i)=>!valid(d.date)||(i>0&&earlier[i-1]!.date>=d.date)||
  !Number.isSafeInteger(d.oldVolume)||d.oldVolume<0||!Number.isSafeInteger(d.newVolume)||d.newVolume<0))
  throw Error("Invalid observations");
 if(days.some(d=>d.date>=tradeDate)) throw Error("Same-day or future volume forbidden");
 const last=earlier.at(-1);
 let volume:Selection;
 if(!last||last.date!==priorSessionDate) volume={status:"REVIEW_REQUIRED",reason:"MISSING_IMMEDIATE_PRIOR_SESSION"};
 else if(!last.complete) volume={status:"REVIEW_REQUIRED",evidenceDate:last.date,reason:"INCOMPLETE_PRIOR_SESSION"};
 else if(last.oldVolume===last.newVolume) volume={status:"REVIEW_REQUIRED",evidenceDate:last.date,reason:"VOLUME_TIE"};
 else volume={status:"SELECTED",ticker:last.newVolume>last.oldVolume?"NEW":"OLD",evidenceDate:last.date,reason:"IMMEDIATE_PRIOR_COMPLETE_RTH_VOLUME"};
 return {tradeDate,calendar,volume,agreement:volume.status==="SELECTED"?calendar.ticker===volume.ticker:null};
}
