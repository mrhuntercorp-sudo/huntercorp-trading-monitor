import { MassiveHistoricalProvider } from "../providers/massive.js";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const key=process.env.MASSIVE_API_KEY?.trim();
if(!key) throw new Error("MASSIVE_API_KEY missing");
const provider=new MassiveHistoricalProvider(key);
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
let lastRequestAt=0;
const cached=new CachedHistoricalDays({async getContractMinuteBars(contract,from,to) {
 const remaining=13000-(Date.now()-lastRequestAt);
 if(remaining>0) await wait(remaining);
 lastRequestAt=Date.now();
 return provider.getContractMinuteBars(contract,from,to);
}});
const dates=["2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-14","2026-09-15"];
const contracts: FuturesContract[]=[{ticker:"NQU6",productCode:"NQ"},{ticker:"NQZ6",productCode:"NQ"}];
function rth(bars:MinuteBar[],date:string):MinuteBar[] {
 return bars.filter(b=>{
  const c=newYorkClock(b.timestampMs);
  const m=c.hour*60+c.minute;
  return c.date===date&&m>=570&&m<960;
 });
}
console.log("=== TM001 SEPTEMBER 2026 ROLLOVER VOLUME INVESTIGATION ===");
console.log("Research only; 2 contracts x 6 dates; RTH volume only; UTC daily cache.");
console.log("No liquidity rule is approved by this diagnostic.");
const results=[];
for(const date of dates) {
 const row:Record<string,string|number>={date};
 for(const contract of contracts) {
  // UTC date includes the entire New York RTH session during September (EDT).
  const bars=await cached.getDay(contract,date);
  const session=rth(bars,date);
  const contiguous=session.length===390&&session.every((b,i)=>i===0||b.timestampMs-session[i-1]!.timestampMs===60000);
  if(!contiguous) throw new Error("INCOMPLETE RTH DATA "+date+" "+contract.ticker+" bars="+session.length);
  const volume=session.reduce((sum,b)=>sum+b.volume,0);
  if(!Number.isSafeInteger(volume)||volume<=0) throw new Error("INVALID VOLUME "+date+" "+contract.ticker);
  row[contract.ticker]=volume;
 }
 const oldVolume=row["NQU6"] as number;
 const newVolume=row["NQZ6"] as number;
 row["higherRthVolume"]=newVolume>oldVolume?"NQZ6":oldVolume>newVolume?"NQU6":"TIE";
 row["decemberToSeptemberRatio"]=Number((newVolume/oldVolume).toFixed(4));
 results.push(row);
 console.log(JSON.stringify(row));
}
console.log("TM001 ROLLOVER VOLUME AUDIT: DATA VALIDATED; POLICY REVIEW REQUIRED");
console.log("Scope: sampled RTH only, not full Globex daily volume or open interest.");
