import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FuturesContract, MinuteBar } from "../market/types.js";

export interface HistoricalDailySource {
  getContractMinuteBars(contract: FuturesContract, fromDate: string, toDate: string): Promise<MinuteBar[]>;
}
interface CacheRecord {
  schema: 1;
  provider: string;
  ticker: string;
  productCode: string;
  utcDate: string;
  sha256: string;
  bars: MinuteBar[];
}
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const digest = (bars: MinuteBar[]) => createHash("sha256").update(JSON.stringify(bars)).digest("hex");
function check(bars: MinuteBar[], contract: FuturesContract, date: string): void {
  const start = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== date)
    throw new Error("Invalid UTC date: " + date);
  let previous = -Infinity;
  for (const b of bars) {
    if (b.contractTicker !== contract.ticker || b.productCode !== contract.productCode ||
        !Number.isSafeInteger(b.timestampMs) || b.timestampMs < start || b.timestampMs >= start + 86400000 ||
        b.timestampMs <= previous || b.timestampMs % 60000 !== 0 ||
        ![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite) ||
        b.volume < 0 || b.low > Math.min(b.open,b.close) ||
        b.high < Math.max(b.open,b.close) || b.low > b.high)
      throw new Error("Invalid or unordered historical bar for " + date);
    previous = b.timestampMs;
  }
}
export class CachedHistoricalDays {
  constructor(private readonly source: HistoricalDailySource,
    private readonly root = "data/cache/massive", private readonly provider = "massive") {}
  async getDay(contract: FuturesContract, date: string): Promise<MinuteBar[]> {
    if (!dayPattern.test(date) || !/^[A-Z0-9]+$/.test(contract.ticker) ||
        !/^[A-Z0-9]+$/.test(contract.productCode)) throw new Error("Invalid cache identity");
    const directory = join(this.root, contract.productCode, contract.ticker);
    const path = join(directory, date + ".json");
    let record: CacheRecord | undefined;
    try {
      record = JSON.parse(await readFile(path, "utf8")) as CacheRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (record) {
      if (record.schema !== 1 || record.provider !== this.provider ||
          record.ticker !== contract.ticker || record.productCode !== contract.productCode ||
          record.utcDate !== date || !Array.isArray(record.bars)) throw new Error("Cache metadata mismatch: " + path);
      check(record.bars, contract, date);
      if (digest(record.bars) !== record.sha256) throw new Error("Cache checksum mismatch: " + path);
      console.log("CACHE HIT", contract.ticker, date, record.bars.length);
      return record.bars;
    }
    const bars = await this.source.getContractMinuteBars(contract, date, date);
    check(bars, contract, date);
    if (!bars.length) throw new Error("Refusing to cache empty day: " + date);
    const payload: CacheRecord = {schema:1,provider:this.provider,ticker:contract.ticker,
      productCode:contract.productCode,utcDate:date,sha256:digest(bars),bars};
    await mkdir(directory, {recursive:true});
    const temporary = path + "." + process.pid + ".tmp";
    try {
      await writeFile(temporary, JSON.stringify(payload), {flag:"wx"});
      await rename(temporary,path);
    } finally { await rm(temporary,{force:true}); }
    console.log("CACHE MISS/FETCH",contract.ticker,date,bars.length);
    return bars;
  }
}
