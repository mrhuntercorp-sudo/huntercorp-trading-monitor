# TM001 P2 — Independent NQ strategy comparison contract (V1)
Status: PROPOSED / RESEARCH ONLY / NOT CERTIFIED
Date: 2026-10-10

## Mandate
Discover and compare NQ strategy hypotheses independently. Do not reconstruct the user's old method or claim a profitable edge without independent validation. Read/analyze/alert only; **never place orders**.

## Data and evaluation isolation
- Universe: NQ minute OHLC, New York time, contract-aware. MNQ uses NQ as a *price-path proxy*, explicitly labeled.
- Current cache: 30 candidate sessions, 28 eligible, Aug–Oct 2026. Too short for robust performance claims. Record exact dates, exclusions, roll/calendar status, source and cache fingerprints in every report.
- All currently inspected sessions are **exploratory/in-sample**. Do not relabel previously viewed dates as untouched out-of-sample.
- Before any fresh data is inspected, freeze hypothesis, parameters, costs, risk controls, metrics, and evaluation period. Truly unseen data must be collected/evaluated later with explicit user approval for any API/spend.
- No lookahead: compute signals only from completed bars, enter no earlier than next bar's open. Do not select the best variant on the evaluation set.

## Candidate interface (common to all strategies)
Each strategy must declare: stable ID/version, rationale, eligible session/time, long/short conditions, lookback, entry timing, stop/target/time exit, cooldown, maximum concurrent positions, maximum daily signals, required indicators, regime tags, parameter set and parameter-freeze timestamp. Include a no-trade option.
Each signal/trade must record: session date, contract, strategy ID, direction, signal timestamp, entry timestamp/price assumption, stop, target, planned exit, observed exit, exit reason, MAE/MFE when calculable, costs, and data-quality flags. Distinguish *signal opportunities* from *executed trades* after account-risk halts.

## Shared execution assumptions
- Common comparison sizes: 5 MNQ ($10/point), 1 NQ ($20/point), 2 NQ ($40/point). **2 NQ is a stress comparison, not an endorsed size.**
- Per round-trip assumed friction: 5 MNQ $25 ($10 commission + $15 slippage); 1 NQ $35 ($5 + $30); 2 NQ $70 ($10 + $60). These are provisional and require brokerage confirmation.
- Every strategy runs under identical threshold-proxy and worst-bar-stress models. Neither is a verified fill model.
- Minute-bar stop/target/risk collisions are explicitly unresolved; preserve counts, sample trade IDs, and stress envelope. Gaps through risk/stop cannot be assigned ideal threshold fills as proven executable prices.
- Any unresolved ordering, unavailable tick data, missing bars, or questionable rollover lowers evidence quality; never hide it behind a single net P&L.

## Account-risk rules (internal research safeguards, NOT Topstep requirements)
- Evaluate both $2,000 and $3,000 EOD trailing MLL scenarios, separately.
- Illustrative $50,000 starting balance; do not imply actual account balance.
- EOD MLL floor: min(starting balance, highest completed EOD balance minus MLL). It **does not** ratchet on intraday equity peaks, but the current floor may still be touched by unrealized P&L.
- Internal operating floor: highest completed EOD balance minus 50% of MLL ($1,000/$1,500 initial budgets).
- Internal daily floor: day-start balance minus 15% of MLL ($300/$450).
- No new trades after internal halt. Track attempted/blocked signals, realized P&L, worst-bar stress cushion, and MLL touch. Account profit target, consistency and broker-specific mechanics are not certified.

## Standard scorecard — report separately for each strategy × size × MLL × fill mode
1. Coverage: candidate days, eligible days, excluded dates/reasons, signals, executed, skipped, pretrade rejects.
2. Performance: gross/net P&L, total friction, win rate, mean win/loss, net expectancy **per executed trade**, profit factor (undefined when no losses), max closed-equity drawdown, maximum consecutive losses, average holding time, sample size.
3. Risk: daily/operating halt counts and dates, first MLL touch, minimum modeled EOD-floor cushion, minimum observed worst-bar cushion, budget utilization, status.
4. Uncertainty: stop-target collision bars, stop-risk collision bars, gap-through-stop/risk bars, unresolved ordering, percentage of trades affected. State **NOT FILL CERTIFIED**.
5. Robustness: by session (open/midday/late), long vs short, strategy subtype, volatility regime, and time segment; report empty/undersized groups as insufficient evidence.
6. Sensitivity: base friction and higher-friction stress; conservative order ambiguity; parameter stability without optimizing on held-out data.
7. Generalization: in-sample vs truly untouched forward/OOS; no OOS claim until available.

## Promotion gate
- REJECT: internal operating halt, MLL stress touch, or clearly negative expectancy.
- RESEARCH_MORE: potentially promising exploratory results but small sample, uncertainty, regime concentration, or no untouched evaluation.
- OOS_ELIGIBLE: frozen, reproducible candidate with adequate exploratory evidence and risk tolerance; **not** approval to trade.
- ALERT_ONLY_ELIGIBLE: only after OOS, costs, uncertainty, account risk and operational checks pass, with explicit human approval. No autonomous execution.
- Any severe stress-model MLL touch blocks promotion irrespective of threshold-proxy profit.
- Do not rank candidates solely by total net P&L. Prefer uncertainty-adjusted evidence, downside control, robustness and repeatability.

## Initial comparison families (hypotheses, not recommendations)
A. Opening-range breakout with fixed entry confirmation and time exit.
B. Overnight high/low sweep and reclaim/rejection.
C. Trend continuation / pullback using prior completed-bar trend criteria.
D. Breakout retest with explicit no-chase rule.
E. Mean reversion in a predeclared low-trend regime.
Each candidate gets a fixed first-pass parameter set and a written counter-hypothesis; no parameter fishing.

## Immediate implementation sequence
1. Define a machine-readable scorecard schema and validator with deterministic synthetic tests, **no API or cache reads**.
2. Adapt the existing integrated simulator to emit the schema while retaining legacy evidence for comparison; do not change risk behavior silently.
3. Implement two *distinct* candidate families and evaluate on identical eligible cached sessions with identical costs and account limits.
4. Freeze selected rules before gathering truly new data; seek approval before any paid data.
5. Keep reporting NOT CERTIFIED until event ordering/fill fidelity and independent validation support stronger claims.
