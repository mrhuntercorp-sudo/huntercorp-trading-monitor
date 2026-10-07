import { readFileSync } from "node:fs";
import { MassiveHistoricalProvider } from "../providers/massive.js";
function apiKey():string {
 const m=readFileSync(".env","utf8").match(/^MASSIVE_API_KEY=(.+)$/m);
 if(!m?.[1]?.trim()) throw new Error("MASSIVE_API_KEY missing from .env.");
 return m[1].trim();
}
const tradeDate=process.argv[2]??"2026-10-01";
const provider=new MassiveHistoricalProvider(apiKey());
console.log("=== TM001 MASSIVE NQ SMOKE TEST ===");
console.log(`Trade date: ${tradeDate}`);
const contract=await provider.resolveContract("NQ",tradeDate);
console.log(`Contract: ${contract.ticker}`);
console.log(`Tick size: ${contract.tradeTickSize??"unknown"}`);
const bars=await provider.getContractMinuteBars(contract,tradeDate,tradeDate);
console.log(`Minute bars returned: ${bars.length}`);
const sample=bars[0];
if(!sample) throw new Error("No valid minute bars returned.");
console.log("First normalized bar:",{ticker:sample.contractTicker,timestampUtc:new Date(sample.timestampMs).toISOString(),
 sessionEndDate:sample.sessionEndDate,open:sample.open,high:sample.high,low:sample.low,close:sample.close,volume:sample.volume});
console.log("TM001 MASSIVE NQ SMOKE: GREEN");
