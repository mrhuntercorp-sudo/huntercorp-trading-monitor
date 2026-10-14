/** CP001-Q2 classification only. Frozen original detections remain unchanged.
 * Classification labels are research hypotheses, NOT validated pattern truth.
 */
import type {Cp001Bar,Cp001Flag} from "./cp001-flags.js";
import type {Cp001Shoulder} from "./cp001-shoulders.js";
import {auditCp001Quality} from "./cp001-quality.js";
export type Cp001Class="FLAG_COUNTERTREND_OR_FLAT"|"FLAG_SAME_DIRECTION_CHANNEL_CANDIDATE"|"SHOULDERS_FIRST_BREAK_CANDIDATE"|"SHOULDERS_REPEATED_BREAK"|"SHOULDERS_PRECONFIRMATION_BREAK";
export type Cp001Classification={classification:Cp001Class;flags:string[];confirmationIntegrity:"FIRST_BREAK_CANDIDATE"|"REPEATED_BREAK"|"PRECONFIRMATION_BREAK"|"NOT_APPLICABLE";humanReviewRequired:true};
export function classifyCp001(bars:readonly Cp001Bar[],p:Cp001Flag|Cp001Shoulder):Cp001Classification{
 const quality=auditCp001Quality(bars,p);
 if("poleStartIndex" in p){
  const sameDirection=quality.flags.includes("CONSOLIDATION_DRIFTS_WITH_POLE");
  return {classification:sameDirection?"FLAG_SAME_DIRECTION_CHANNEL_CANDIDATE":"FLAG_COUNTERTREND_OR_FLAT",flags:quality.flags,confirmationIntegrity:"NOT_APPLICABLE",humanReviewRequired:true};
 }
 const repeated=quality.flags.includes("EARLIER_BREAK_AFTER_CONFIRMED_RIGHT_PIVOT");
 const preconfirmed=quality.flags.includes("EARLIER_BREAK_AFTER_RIGHT_PIVOT")&&!repeated;
 return {classification:repeated?"SHOULDERS_REPEATED_BREAK":preconfirmed?"SHOULDERS_PRECONFIRMATION_BREAK":"SHOULDERS_FIRST_BREAK_CANDIDATE",flags:quality.flags,confirmationIntegrity:repeated?"REPEATED_BREAK":preconfirmed?"PRECONFIRMATION_BREAK":"FIRST_BREAK_CANDIDATE",humanReviewRequired:true};
}
