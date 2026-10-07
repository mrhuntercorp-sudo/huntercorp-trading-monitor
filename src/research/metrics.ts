export interface TradeResult {
  pnlUsd: number;
}

export interface PerformanceSummary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnlUsd: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  profitFactor: number | null;
  maxDrawdownUsd: number;
}

export function summarizePerformance(
  trades: readonly TradeResult[],
): PerformanceSummary {
  let equity = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;
  let grossProfitUsd = 0;
  let grossLossUsd = 0;
  let wins = 0;
  let losses = 0;

  for (const trade of trades) {
    equity += trade.pnlUsd;
    peak = Math.max(peak, equity);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equity);

    if (trade.pnlUsd > 0) {
      wins += 1;
      grossProfitUsd += trade.pnlUsd;
    } else if (trade.pnlUsd < 0) {
      losses += 1;
      grossLossUsd += -trade.pnlUsd;
    }
  }

  return {
    trades: trades.length,
    wins,
    losses,
    winRate: trades.length ? wins / trades.length : null,
    netPnlUsd: equity,
    grossProfitUsd,
    grossLossUsd,
    profitFactor: grossLossUsd > 0 ? grossProfitUsd / grossLossUsd : null,
    maxDrawdownUsd,
  };
}
