import { MassiveHistoricalProvider } from "../providers/massive.js";
import { auditContractDates } from "../research/contract-audit.js";

const key=process.env.MASSIVE_API_KEY?.trim();
if(!key) throw new Error("MASSIVE_API_KEY missing.");
const provider=new MassiveHistoricalProvider(key);
const dates=["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25",
 "2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02"];
const resolved=[];
console.log("=== TM001 NQ CONTRACT SELECTION AUDIT ===");
console.log("Metadata-only provider calls; 13-second pacing; no bar downloads.");
for(const date of dates) {
  if(resolved.length) await new Promise<void>(r=>setTimeout(r,13000));
  const contract=await provider.resolveContract("NQ",date);
  resolved.push(contract);
  console.log(JSON.stringify({date,...contract}));
}
const audit=auditContractDates(dates,resolved,"NQZ6");
console.log(JSON.stringify(audit,null,2));
console.log("TM001 CONTRACT AUDIT: REVIEW REQUIRED — maturity selection is not a validated liquidity rollover policy.");
