# TM001 E008 — ORB5 prospective validation lock
Locked: 2026-10-14. Status: PREDECLARED / NOT EXECUTED / RESEARCH ONLY.

## Decision and provenance
ORB5_NATIVE_40_80 remains experimental and **not approved**. Its historical 28-trade exposed sample produced +144 NQ points assuming 2 NQ points total round-trip friction; removing the two best trades leaves -12 points. These observations are hypothesis-generating, not independent evidence. October 5–9 and any other previously inspected dates must not be relabeled fresh OOS.

## Frozen candidate
- Existing source of truth: `src/research/conservative-orb.ts`, invoked by `src/scripts/tm001-ny-native-audit.ts` and reconciled in `src/scripts/tm001-e003-trade-ledger.ts`.
- NQ futures, 1-minute OHLCV, New York RTH; first 5 minutes opening range; **original conservative ORB5 implementation unchanged**.
- 40 NQ-point stop, 80 NQ-point target, next-bar execution as implemented, exit no later than session end as implemented; opening-window entry before 11:00 ET; 1 contract research proxy; frozen 2-point total friction (simulator commission USD40 at USD20/point; zero additional slippage ticks).
- Preserve original simulator's exact trigger, handling of gaps, simultaneous touches, exits and session constraints. This manifest is **not** authorization to reinterpret or change them.
- No filters, stop variants, target changes, date substitution, hindsight exclusions, or parameter optimization.

## Prospective collection and evidence gate
- Start **2026-10-15**, after this lock. Evaluate consecutive eligible trading sessions in chronological order. Do not inspect candidate-period outcomes before verifying this manifest was committed.
- Collect until at least **30 independent ORB5 trades** across distinct eligible sessions, with no outcome-based early stopping. Report all elapsed candidate dates, no-signal days and exclusions. A 30-trade count is a minimum evidence gate, **not** proof of profitability or an automatic promotion threshold.
- Fix contract calendar/roll, market holidays, RTH and overnight coverage rules and timestamp semantics before retrieving data. Exclude missing/duplicate/invalid bars and unresolved roll/calendar days; report exclusions without replacement chosen by outcome.
- If data has already been viewed or strategy altered after this lock, classify that period as exposed, not untouched OOS. Re-lock a later prospective start before continuing.
- Preserve daily trade ledger: session date, contract, range high/low, direction, signal/entry/exit timestamps and prices, stop/target, exit reason, net points, gap/collision flags, completeness and exclusion reason.
- Report wins/losses, expectancy after frozen costs, profit factor, closed-trade drawdown, maximum adverse excursion, concentration (remove best 1 and 2), gap and intrabar ambiguity, and friction stress of +1/+2/+4 NQ points per trade. Disclose model limitations and avoid equating OHLC simulations with fills.
- Compare to the exposed baseline only after prospective evaluation. Predeclare risk/Topstep account-specific feasibility and independently replay account constraints before any potential promotion. Never combine ORB5 and P4 P&L as independent given overlap.

## Gates and restrictions
1. Verify repository commit, evaluator source hash and exact rules before the first new retrieval.
2. Verify provider entitlement, incremental cost and API limits; **STOP** if unknown. A separate capped request plan and explicit user approval are required before any paid or uncertain-cost retrieval.
3. Do not initiate retrieval, background monitoring, or order execution from this document.
4. After at least 30 untouched trades, perform independent reconciliation and execution/risk audits. Any material negative expectancy, invalid provenance, or execution ambiguity prevents promotion pending resolution.
5. Human approval remains mandatory. No actionable alerts or live trading until independently validated.

E008 deliverable: frozen research contract only. NO API | NO SPEND | NO ORDERS | NO OPTIMIZATION | NO LIVE APPROVAL.
