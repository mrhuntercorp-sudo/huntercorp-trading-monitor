# TM001 P4e — Frozen candidate and independent-validation gate

Status: **RESEARCH CANDIDATE FROZEN; OOS NOT AUTHORIZED**
Frozen on: 2026-10-10
Candidate: `SESSION_TREND_PULLBACK_V1`
Source implementation: `src/research/p4-nq-signals.ts` (P4b source introduced in commit `a3739a399012ba2c38550684f079804f6f355831`)
Exploratory evaluator: `src/scripts/tm001-p4c-cached-eod-screen.ts` (through commit `247b648a1359b85b7dcc44f8e18fca3e45d3c878`)
Execution audit: `src/scripts/tm001-p4d-trade-execution-audit.ts` (commit `167c3dcd7013c7c175c17368e4ba85107629aecb`)
Contract: `docs/TM001-P4A-CANDIDATE-SPECIFICATIONS.md`

## Immutable research rules
- NQ one-minute RTH, New York timezone; complete, contiguous, verified contract/calendar session.
- Entry signal only on completed bar from 10:00–14:30 ET; first candidate per day only.
- Impulse: `close[i-4]-open[i-9] >= 30` points for long, <= -30 for short.
- Pullback: `close[i-1]-close[i-3] <= -8` points for long, >= +8 for short.
- Pullback closes must remain above impulse anchor for long, below for short.
- Confirmation close exceeds previous bar high (long), or breaks previous low (short).
- Entry at following one-minute bar open, stop 10 NQ points, target 40 points.
- Time exit at earlier of 30 minutes after entry or 15:55 ET; no overlapping trades.
- One executed trade maximum per strategy/session. No optimization or rule changes permitted under V1.

## Frozen evaluation conditions
- Sizes: 5 MNQ, 1 NQ, 2 NQ. EOD MLL: $2,000 and $3,000.
- Internal operating floor: 50% of MLL; daily loss floor: 15% of MLL. These are internal research assumptions, not official Topstep limits.
- Both `THRESHOLD_PROXY` and `WORST_BAR_STRESS` risk modes; price-path proxy uses NQ for MNQ.
- Baseline assumed round-trip costs: 5 MNQ $25; 1 NQ $35; 2 NQ $70. Unverified.
- Additional arithmetic stress: +$2.50, +$5, +$10, +$20/trade; +1/+2/+3 adverse ticks each side; one/two winners flipped to stops.
- Report net P&L, trade count, win/loss, entry-minute exits, maximum drawdown, worst-bar MLL cushion, operating/daily halts, collisions and uncertainty.

## Exploratory evidence (contaminated / in-sample only)
- 30 candidate dates; 28 eligible. Sep 11 incomplete RTH, Sep 14 provisional rollover unverified.
- 5 MNQ / $3,000 MLL: 24 executed; 9 targets, 15 stops; 6 entry-minute stops; net +$1,500 after $600 assumed baseline costs.
- Maximum closed drawdown $875; minimum modeled MLL cushion $2,012.50; no modeled operating or MLL breach in this configuration.
- Additional $20/trade -> +$1,020; +3 adverse ticks per side -> +$1,140; flip two winners -> +$500. These are arithmetic sensitivities, not rerun fills or risk.
- Results in other sizes/MLL combinations are **not** superseded by the favorable 5 MNQ/$3k case.
- Minute OHLC cannot certify fill order, latency, liquidity or stop execution. No OOS claim.

## Outstanding correctness gates — resolve before any OOS request
1. **Risk-trigger exit timestamp:** P4d audit uses the strategy exit timestamp even when a risk threshold exits earlier. Correct the ledger to record the actual risk-trigger bar timestamp; add regression for early risk exit and reconcile hold time, entry-minute status, and P&L.
2. **Time exit and terminal RTH bar:** test exact 30-minute deadline and 15:55 exit at bar open; ensure no post-exit extreme is counted in account-risk simulation.
3. **Source/provenance freeze:** record exact source file SHA-256 and final evaluator commit after correctness-only fixes; any semantic change requires a new version and invalidates this frozen baseline.
4. **Full matrix audit:** P4d currently logs only 5 MNQ/$3k. Verify P4c's 5 MNQ, 1 NQ, 2 NQ × $2k/$3k × both modes before nomination.
5. **Topstep rules and execution costs:** verify official account mechanics, commissions and fills separately; do not infer compliance from research proxies.

## Untouched data policy
- All cached Aug 21–Oct 2 2026 sessions previously inspected are **exploratory**, never OOS.
- No historical period may be called untouched if it was previously viewed, used to design a strategy, or screened.
- Before fetching any new period, record its date boundaries, contracts, data provenance, exclusion policy and intended sample size in a separately approved OOS manifest.
- No Massive API requests, additional purchases or external spending without explicit human approval.
- Do not fit thresholds to the held-out sample. One frozen pass; any changes after results are exploratory and require a new independent holdout.

## Predeclared OOS decision rules
- Automatic **REJECT FOR PROMOTION** for any lookahead, data provenance failure, severe worst-bar MLL touch, internal operating-stop breach, or materially negative post-cost expectancy.
- **REJECT FOR PROMOTION** if adding one adverse tick per side turns net expectancy negative, or if a single winner-to-stop flip erases the entire edge.
- Require both risk modes, all position/account configurations, all excluded dates, entry-minute exits and uncertainty flags to be reported. A single favorable configuration is not proof of generality.
- If fewer than 30 executed trades in a truly untouched sample, mark **INSUFFICIENT_EVIDENCE** regardless of net P&L. Thirty is a minimum reporting gate, not proof of statistical significance.
- Even passing these gates only permits further human-reviewed research. No live alerts, no orders, no automatic strategy promotion.

## Human approval gates
1. Correctness regressions and full-matrix audit: local, cache-only, no spend.
2. Frozen OOS manifest and any data costs: **Hunter approval required before retrieval**.
3. Any future alert-only pilot: separate approval after independent validation.
4. Automatic order execution: **not authorized** in TM001 V1.
