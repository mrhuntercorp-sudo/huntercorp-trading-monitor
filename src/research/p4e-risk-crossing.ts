/** Pure production risk-threshold selector used by P4c. No market data or order execution. */
export type RiskTrigger="MLL"|"OPERATING"|"DAILY";
export type RiskLevel={name:RiskTrigger;level:number};
/** First threshold reached on a monotonically adverse equity path; equal equity does not trigger from below. */
export function firstRiskCrossing(entryEquity:number,adverseEquity:number,levels:readonly RiskLevel[]):RiskLevel|null{
 if(!Number.isFinite(entryEquity)||!Number.isFinite(adverseEquity))throw Error("NONFINITE_EQUITY");
 // A bar extreme can still be favorable relative to entry after friction; no threshold is crossed.
 for(const x of levels)if(!Number.isFinite(x.level))throw Error("NONFINITE_RISK_LEVEL");
 return levels.filter(x=>entryEquity>x.level&&adverseEquity<=x.level).sort((a,b)=>b.level-a.level)[0]??null;
}
