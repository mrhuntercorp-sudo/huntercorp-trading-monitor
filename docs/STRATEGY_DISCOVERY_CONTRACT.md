# TM001 — Strategy Discovery Contract

Status: **ACTIVE RESEARCH GATE**

TM001 will not assume Hunter's prior discretionary setup is the production strategy. The system must discover and validate a robust NQ intraday setup from historical evidence before live alerts are enabled.

## Candidate families — V1

1. 5-minute / 15-minute filtered Opening Range Breakout (ORB)
2. Opening-drive breakout followed by pullback/retest
3. Overnight high/low breakout or rejection
4. VWAP trend/pullback
5. Opening-range mean reversion (counter-hypothesis)

These are hypotheses, not approved trading strategies.

## Research rules

- NQ only during V1 research.
- Use chronological train / validation / out-of-sample splits; never randomize time-series observations.
- Include commissions and explicit slippage assumptions.
- Report long and short performance separately.
- Measure performance by year and regime, not only aggregate P&L.
- Track trade count, expectancy in R, profit factor, win rate, max drawdown, Sharpe (where appropriate), MFE and MAE.
- Test sensitivity around parameters; reject strategies that depend on one narrow optimum.
- Prefer fewer economically defensible parameters over large grid searches.
- Maintain an untouched final holdout period.
- No live-money validation. After historical validation, use live shadow mode.
- No strategy is promoted because of a single backtest, high win rate, or high total P&L.

## Context features to test

Only use information available before the decision point:

- Previous-day range / volatility regime
- Previous-day high and low
- Overnight high and low
- Overnight range
- Gap from prior close
- Opening-range width
- Opening direction / displacement
- Volume relative to comparable time-of-day history
- VWAP relationship
- Time of day
- Scheduled high-impact macro-event flag, if a reliable calendar source is available

## Anti-overfitting gates

A candidate fails if its apparent edge:

- disappears after reasonable costs/slippage,
- exists mainly in one year or a tiny number of outlier trades,
- collapses out-of-sample,
- requires hindsight-only features,
- is highly sensitive to tiny parameter changes,
- or cannot be expressed as deterministic rules.

## Promotion path

```text
HYPOTHESIS
   -> BASELINE BACKTEST
   -> FRICTION TEST
   -> OUT-OF-SAMPLE
   -> PARAMETER SENSITIVITY
   -> REGIME ANALYSIS
   -> FINAL HOLDOUT
   -> LIVE SHADOW
   -> HUNTER APPROVAL
   -> ALERT-ONLY PRODUCTION
```

## First benchmark

The first benchmark is the **naive ORB**. It is intentionally simple and is not expected to be the winner. It gives us a control against which filtered ORB, retest, overnight-level, VWAP, and mean-reversion variants can be measured.

No candidate becomes the TM001 setup until the evidence package passes the gates above.
