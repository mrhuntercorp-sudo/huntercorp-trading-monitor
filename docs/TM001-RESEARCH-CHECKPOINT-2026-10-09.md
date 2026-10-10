# TM001 — Trading Research Checkpoint (2026-10-09)

## Status and objective
- Project: HunterCorp TM001 NQ/GC Trading Intelligence Monitor. Local repo: `C:\Users\hunte\huntercorp-trading-monitor`.
- Research and alerts only; **no automated/live orders**, no additional Massive API calls or spend without authorization.
- Primary instrument NQ (MNQ for sizing), secondary GC later. New York session is primary; eventually monitor all sessions and provide 9:20–9:25 ET premarket brief.
- Goal: discover and independently validate repeatable trading setups with positive net expectancy **and** survivability under the user's TopstepX EOD Trading Combine constraints. Do not promise profit.
- User reports the losing simulation resembles their actual experience; this is a motivation to investigate execution decisions, not evidence the heuristic models their trading.

## Account/risk assumptions (not certified Topstep rules)
- Two distinct Topstep EOD Combine accounts, MLL allowances **$2,000** and **$3,000**. User does **not** trade intraday-MLL account type.
- Provisional model: MLL floor trails highest end-of-day balance, capped at starting balance; unrealized intraday equity checked against floor.
- Starting balance $50,000 is an illustrative model input, **not confirmed account size**.
- Internal risk rules, **not Topstep policy**: daily stop 15% of MLL ($300/$450), operating drawdown 50% of MLL ($1,000/$1,500), currently modeled as trailing from highest EOD balance.
- Sizes tested: 5 MNQ, 1 NQ, 2 NQ. Friction estimates per round trip: $25, $35, $70 respectively (commission + 3 ticks slippage per side); not broker-verified.
- Confirm actual account sizes, fees, profit targets, consistency requirements, and relevant EOD rules before any certification.

## Completed evidence
- GitHub commit `58e3b0f`: isolated threshold regression, **TypeScript GREEN and 10/10 tests GREEN** on user PC.
- GitHub commit `0e50023`: integrated threshold-proxy vs worst-bar-stress survival simulation, **TypeScript GREEN**, regression 10/10, full script ran using cached data, zero API calls/trades.
- 30 candidate dates, 28 eligible RTH sessions (2026-08-21 through 2026-10-02 sample); excluded 2026-09-11 incomplete RTH and 2026-09-14 rollover unverified.
- 168 heuristic signals across 28 sessions, max 6/day, 87 sweep reversal and 81 breakout continuation; signal definitions: 10-minute extreme sweep/reclaim or breakout through prior 10-minute extreme aligned with opening range; next-bar open entry; fixed 10-point stop and 40-point target. **Not user-validated setups**.
- Both position modes failed internal operating risk for all six size/MLL combinations. Integrated results:
  
  | Size | MLL | Threshold proxy net | Worst-bar stress net |
  |---|---:|---:|---:|
  | 5 MNQ | $2,000 | -$1,000 | -$1,017.50 |
  | 5 MNQ | $3,000 | -$1,600 | -$1,502.50 |
  | 1 NQ | $2,000 | -$1,000 | -$1,510 |
  | 1 NQ | $3,000 | -$1,500 | -$1,510 |
  | 2 NQ | $2,000 | -$1,000 | -$2,440 |
  | 2 NQ | $3,000 | -$1,500 | -$2,440 |
  
- Worst-bar stress **2 NQ / $2k MLL** first simulated MLL touch 2026-08-24, minimum cushion -$440.
- Threshold-proxy **2 NQ / $2k MLL** shows minimum intraday cushion -$160 **despite** `firstMllTouch=null`; this is a **reporting/classification inconsistency to investigate**, not a certified survival.
- Several scenarios have 2–3 ambiguous risk bars; one-minute OHLC does not determine order of stop/target/risk crossings.
- Script still emits legacy `SCENARIO` and `SCREEN` blocks, with different/incorrect cost assumptions; **do not use those figures for decisions**. Use `INTEGRATED_SURVIVAL` only, with qualifications.

## Critical unfinished work, in order
1. **Risk-engine correctness:** reconcile negative intraday MLL cushion vs no MLL touch; distinguish hypothetical worst-bar excursions from realized threshold-proxy fills; ensure entry fee, risk threshold, stop/target priority and EOD ratchet are consistent. Add focused synthetic regressions for simultaneous target/stop/risk touch, gaps, and halts. Avoid claiming precise fills from minute bars.
2. **Reporting hygiene:** remove or clearly label legacy ORB `SCENARIO` and stale-friction `SCREEN` outputs; keep a single authoritative assumptions/results report.
3. **Independent strategy discovery (user correction, 2026-10-09):** the user's previous NQ trading method is not working and is NOT a required input, baseline, or strategy to optimize. Do not ask the user to document their old entries. Research candidate NQ strategies independently, using falsifiable hypotheses and objective criteria.
4. **Research design:** systematically compare opening-range approaches, overnight high/low sweeps, London/Asia context, breakout-and-retest, trend continuation/pullbacks, reversals, trend/range regimes, and news/calendar filters. Predefine tests and baselines; avoid parameter fishing or declaring a winner based only on in-sample results.
5. **Measure actual edge:** expectancy after realistic fees/slippage, win rate, payoff ratio, MAE/MFE, drawdown, losing streaks, intraday MLL exposure, and Combine survival. Test both account sizes separately; evaluate 5 MNQ, 1 NQ, 2 NQ only where risk supports them.
6. **Validation:** train/discovery vs untouched out-of-sample periods, walk-forward checks, stress costs, realistic bar ordering uncertainty; more history may require explicit data authorization.
7. **Only after research proof:** design monitor alerts and pre-NY briefing; user approval before any expanded spend. No autonomous trading.

## Resume instruction
On return: read this checkpoint, check git state, **start with item 1 risk-engine classification fix**, then proceed with independent strategy research and comparative tests. Do not require or request a description of the user's old NQ method. Keep changes small, tested, and reproducible. Provide a single PowerShell block for local verification. Do not conflate passing software tests with a profitable trading strategy.

## Operating principle
We are testing to find out what works, including the possibility that no tested setup has an edge. Never increase risk to force returns or imply profits are guaranteed.

## User clarification — strategy discovery mandate
The user explicitly rejected the previous instruction to document their own entry process: their old trading method no longer works. TM001 must search for and validate better approaches independently, with risk-adjusted net expectancy, robustness, out-of-sample evidence and Combine survivability. Do not present any approach as guaranteed profitable.

## Session plan — 2026-10-10 (updated live checklist)
Objective: make the risk simulation internally consistent, remove misleading reporting, and establish a fair independent strategy-discovery protocol. Do not claim profitable edge without out-of-sample proof.

- [x] Historical cache / session eligibility pipeline working (28 eligible sessions; provisional rollover/calendar)
- [x] Isolated risk threshold regression: 10/10 GREEN, TypeScript GREEN (user verified)
- [x] Integrated risk simulation runs in both threshold-proxy and worst-bar-stress modes (user verified)
- [x] Research mandate corrected: **do not request or optimize user's former NQ trading method**
- [ ] **NOW / P0:** reconcile threshold-proxy 2 NQ / $2k minimum cushion -$160 with no MLL event; distinguish observed worst intrabar excursion from modeled threshold execution and stop/target ordering. Add synthetic regression cases.
- [ ] **P1:** retire or explicitly mark stale ORB SCENARIO and SCREEN output (older incorrect friction) so authoritative results are unambiguous.
- [ ] **P2:** design common strategy comparison contract: signal definition, data window, execution assumptions, costs, MAE/MFE, expectancy, drawdown, Combine survival, regime breakdown.
- [ ] **P3:** implement first independently motivated candidate strategies and run fair side-by-side in-sample comparisons; no parameter fishing.
- [ ] **P4:** freeze rules and evaluate on untouched out-of-sample data, with slippage sensitivity and Combine survivability.
- [ ] **LATER:** pre-NY 9:20–9:25 briefing, all-session alerts, GC expansion. No live order execution.

Finish line tonight: P0 + P1 verified, P2 specified, P3 only if time/data supports it. Any item only becomes [x] after evidence from local test output.
