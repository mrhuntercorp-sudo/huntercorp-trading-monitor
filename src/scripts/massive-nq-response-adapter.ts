// Provider response contract adapter; pure, offline, and strict about OHLCV and timestamps.
// Massive's one-request recovery accepts absent per-bar ticker, but requires session_end_date.
export type RawMassiveBar = {
  ticker?: string; window_start?: number; session_end_date?: string;
  open?: number; high?: number; low?: number; close?: number; volume?: number;
};
export type RawMassiveResponse = { status?: string; results?: RawMassiveBar[]; next_url?: string };
export type BackfillTarget = { ticker: string; date: string };
export function normalizeMassiveResponse(target: BackfillTarget, payload: RawMassiveResponse) {
  if (payload.status && payload.status !== "OK") throw Error("PROVIDER_STATUS_NOT_OK");
  if (payload.next_url) throw Error("PAGINATION_REQUIRED");
  if (!Array.isArray(payload.results) || payload.results.length === 0 || payload.results.length > 1440) throw Error("INVALID_RESULTS_COUNT");
  const start = Date.parse(target.date + "T00:00:00Z");
  if (!Number.isFinite(start)) throw Error("INVALID_TARGET_DATE");
  return {
    status: "OK",
    results: payload.results.map(bar => {
      if (bar.ticker && bar.ticker !== target.ticker) throw Error("TICKER_MISMATCH");
      if (typeof bar.session_end_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bar.session_end_date)) throw Error("INVALID_SESSION_END_DATE");
      if (typeof bar.window_start !== "number" || !Number.isSafeInteger(bar.window_start)) throw Error("INVALID_WINDOW_START");
      const timestampMs = Math.floor(bar.window_start / 1000000);
      if (!Number.isSafeInteger(timestampMs) || timestampMs < start || timestampMs >= start + 86400000 || timestampMs % 60000 !== 0) throw Error("INVALID_TIMESTAMP");
      const values = [bar.open, bar.high, bar.low, bar.close, bar.volume];
      if (!values.every(v => typeof v === "number" && Number.isFinite(v))) throw Error("INVALID_OHLCV");
      const { open, high, low, close, volume } = bar as Required<Pick<RawMassiveBar, "open" | "high" | "low" | "close" | "volume">>;
      if (volume < 0 || low > Math.min(open, close) || high < Math.max(open, close) || low > high) throw Error("INVALID_OHLCV");
      return { ticker: target.ticker, window_start: bar.window_start!, session_end_date: bar.session_end_date!, open, high, low, close, volume };
    })
  };
}
