# TM001 P4 — Independent NQ strategy discovery contract
Status: FROZEN RESEARCH PROCESS / CANDIDATES NOT YET APPROVED
Date: 2026-10-10
Parent: docs/TM001-P2-STRATEGY-COMPARISON-CONTRACT.md

## Decision carried forward
- P3a–P3e: completed and locally verified. ORB_RETEST_V1 at 5 MNQ/$3k MLL produced 27 in-sample trades, seven targets, twenty stops, gross +$800, assumed costs $675, net +$125. Fifteen trades exited during their entry minute. An extra adverse tick per side ($5/trade) reduced net to -$10. One winner becoming a loser reduced net to -$375.
- ORB_RETEST_V1 is **REJECTED FOR TRADING**, not proven intrinsically unprofitable. Do not relabel it, tweak its stops/filters, or use it as a fresh independent candidate on the same dates.
- ON_SWEEP_RECLAIM_V1 remains NOT APPROVED. Its $3k/5 MNQ exploratory case did not hit the internal operating stop but had negative P&L. No live alert or order authorization.
- All Aug–Oct cached sessions examined in P3 are contaminated for out-of-sample claims. All further work on them is exploratory only.

## Job
Discover *genuinely different* NQ price-behavior hypotheses, compare their falsifiable predictions, and reject weak ideas before requesting new data. NQ primary, GC later under a separate contract. Research only: no order execution, no trading advice presented as validated, no API calls/spend without Hunter approval.

## Discovery intake — mandatory fields
Each proposal must have:
1. Immutable candidate ID and version; hypothesis owner, creation time, exact code commit and parameter hash.
2. Mechanism and causal market story: who may be forced to transact, at what session event, and why an exploitable response might exist.
3. Counter-hypothesis: a specific observation that would invalidate the story.
4. Information boundary: required completed bars, time zone, session boundaries, rollover policy, data-quality requirements, and whether bid/ask or tick data is essential.
5. Deterministic trigger, entry on next bar or later, no-trade state, stop, target, time exit, max one-position exposure, cooldown, maximum signals per day.
6. Predeclared eligible regime and regime detector based solely on information available at signal time. Avoid retroactive trend-day labels.
7. Costs, risk sizes, and account-risk gates inherited *unchanged* from P2. Mark price-path proxy when using NQ prices for MNQ.
8. Expected failure modes, slippage/latency sensitivity, ambiguous-entry handling, and minimum evidence required to continue.
9. Explicit data partitions: exploratory dates versus truly untouched future/OOS dates, locked **before** data retrieval.
10. Decision log with reject/research-more/OOS-eligible and human approval; no autonomous promotion.

## Candidate families to investigate — research queue, NOT approved setups
- **SESSION_TREND_PULLBACK_V1**: continuation after an independently defined, completed-bar directional expansion; require pullback and continuation confirmation. Falsifier: reversal/whipsaw frequency overwhelms post-cost expectancy.
- **VOLATILITY_COMPRESSION_EXPANSION_V1**: compression defined by trailing realized range known at signal time, followed by expansion and acceptance. Falsifier: breakout slippage or failed acceptance removes net edge.
- **OPENING_DRIVE_FAILURE_V1**: early-session directional drive that fails to hold an objectively defined level, then confirms reversal. Falsifier: strong-trend days repeatedly punish reversals.
- **LOW_TREND_MEAN_REVERSION_V1**: reversion only in a *preidentified* low-trend regime using completed data. Falsifier: regime classification lags and produces outsized trend-day losses.
These are distinct hypotheses, not four fitted variants of ORB_RETEST_V1. If data cannot distinguish a hypothesis, mark INSUFFICIENT_DATA rather than invent a signal.

## Research order and separation
**P4a — Paper discovery.** For each family, document mechanism, deterministic rule sketch, required data, falsifier, and how it differs from rejected ORB. No market-data calls and no parameter sweep.

**P4b — Contract and synthetic invariants.** Implement a common candidate interface and synthetic tests for no lookahead, next-bar entry, incomplete sessions, session boundaries, no-trade paths, gaps, overlapping signals, and conflicting stop/target touches. Keep production alerts off.

**P4c — Exploratory screen.** Apply one predeclared first-pass parameterization per family to the same eligible cached sessions. Report every candidate, including no-signal candidates and exclusions. Use P2 scorecard and EOD risk simulator; no cherry-picking winners. This is NOT OOS.

**P4d — Robustness/falsification.** Examine trade ledger, entry-minute exits, win/loss concentration, increased friction (+1/+2/+3 adverse ticks per side), one-winner flip, both MLL scenarios, 5 MNQ/1 NQ/2 NQ stress, both fill modes, and independent time/regime splits. No fitting parameters to rescue failures.

**P4e — Freeze and seek permission.** Only a reproducible candidate with nonfragile exploratory results may be nominated for untouched OOS. Freeze commit, rules, costs, partitions, rejection thresholds and metrics *before* requesting any fresh data. Hunter must approve any API/spend separately. OOS eligibility does not authorize alerts or trades.

## Stop conditions
Reject trading promotion if any severe worst-bar MLL touch, internal operating stop, unbounded risk, lookahead, material data-quality failure, or clearly negative post-cost expectancy. A small positive sample that flips negative under one extra tick per side is fragile and not promotion-worthy. Do not treat lack of observed collisions as fill certification.

## Evaluation contract
Reuse P2 sizes (5 MNQ, 1 NQ, 2 NQ), $2k/$3k EOD MLL, 50% MLL internal operating budget, 15% MLL daily budget, threshold-proxy and worst-bar-stress. Report signal counts, executed/skipped, all costs, net expectancy/trade, drawdown, cushion, halts, collisions, gap risk, entry-minute exits, subgroups, and in-sample/OOS designation. Commission/slippage and Topstep mechanics are provisional and must be verified before any operational deployment.

## Authority and checkpoints
Hunter approves data spend, frozen OOS study, and any eventual alert-only deployment separately. No autonomous order execution in TM001 V1. No permanent agent team or dashboard expansion is justified by this contract.

- [x] P3a–P3e audited; ORB_RETEST_V1 rejected for trading
- [x] P4 strategy discovery contract written
- [ ] P4a four candidate paper specifications reviewed
- [ ] P4b synthetic invariants green
- [ ] P4c cache-only exploratory screen
- [ ] P4d falsification/sensitivity
- [ ] P4e freeze/OOS request (approval required)
