export type VolumeObservation = {
  date:string; septemberTicker:string; decemberTicker:string;
  septemberVolume:number; decemberVolume:number;
  septemberComplete:boolean; decemberComplete:boolean;
};
export type RolloverDecision = {
  tradeDate:string; status:"SELECTED"|"REVIEW_REQUIRED";
  selectedTicker?:string; evidenceDate?:string; reason:string;
};
/**
 * Research-only historical rollover selection. Only a fully observed prior
 * session may supply the evidence. No fallback to same-day volume.
 * Caller must supply strictly earlier chronological observations.
 */
export function decideRolloverForTradeDate(
  tradeDate:string, observations:readonly VolumeObservation[]
):RolloverDecision {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate) ||
    Number.isNaN(Date.parse(tradeDate+"T00:00:00Z")))
    throw new Error("Invalid trade date");
  let previous:string|undefined;
  for(const o of observations) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(o.date) ||
       o.date>=tradeDate || (previous!==undefined&&o.date<=previous))
      throw new Error("Observations must be strictly ordered and earlier than trade date");
    if(!Number.isSafeInteger(o.septemberVolume)||o.septemberVolume<0||
       !Number.isSafeInteger(o.decemberVolume)||o.decemberVolume<0)
      throw new Error("Invalid volume");
    if(!o.septemberTicker||!o.decemberTicker||o.septemberTicker===o.decemberTicker)
      throw new Error("Invalid contract tickers");
    previous=o.date;
  }
  const latest=observations.at(-1);
  if(!latest) return {tradeDate,status:"REVIEW_REQUIRED",reason:"NO_PRIOR_OBSERVATION"};
  if(!latest.septemberComplete||!latest.decemberComplete)
    return {tradeDate,status:"REVIEW_REQUIRED",evidenceDate:latest.date,reason:"INCOMPLETE_PRIOR_SESSION"};
  if(latest.septemberVolume===latest.decemberVolume)
    return {tradeDate,status:"REVIEW_REQUIRED",evidenceDate:latest.date,reason:"VOLUME_TIE"};
  return {tradeDate,status:"SELECTED",evidenceDate:latest.date,
    selectedTicker:latest.decemberVolume>latest.septemberVolume?
      latest.decemberTicker:latest.septemberTicker,
    reason:"PREVIOUS_OBSERVED_COMPLETE_RTH_VOLUME_LEADER"};
}
