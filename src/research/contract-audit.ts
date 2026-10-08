import type { FuturesContract } from "../market/types.js";

export interface ContractAuditRow {
  date: string;
  resolvedTicker: string;
  benchmarkTicker: string;
  matchesBenchmark: boolean;
  firstTradeDate?: string;
  lastTradeDate?: string;
  settlementDate?: string;
  tradeTickSize?: number;
}
export function auditContractDates(
  dates: readonly string[], resolved: readonly FuturesContract[], benchmarkTicker: string,
): { rows: ContractAuditRow[]; distinctTickers: string[]; benchmarkMismatchDates: string[]; status: "REVIEW_REQUIRED" } {
  if (dates.length !== resolved.length || !dates.length) throw new Error("Audit input length mismatch");
  const rows = dates.map((date,i) => {
    const contract = resolved[i]!;
    if (contract.productCode !== "NQ" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !contract.ticker)
      throw new Error("Invalid contract audit input");
    return {date,resolvedTicker:contract.ticker,benchmarkTicker,
      matchesBenchmark:contract.ticker === benchmarkTicker,
      ...(contract.firstTradeDate ? {firstTradeDate:contract.firstTradeDate}:{}),
      ...(contract.lastTradeDate ? {lastTradeDate:contract.lastTradeDate}:{}),
      ...(contract.settlementDate ? {settlementDate:contract.settlementDate}:{}),
      ...(contract.tradeTickSize != null ? {tradeTickSize:contract.tradeTickSize}:{})};
  });
  return {rows,distinctTickers:[...new Set(rows.map(r=>r.resolvedTicker))],
    benchmarkMismatchDates:rows.filter(r=>!r.matchesBenchmark).map(r=>r.date),
    status:"REVIEW_REQUIRED"};
}
