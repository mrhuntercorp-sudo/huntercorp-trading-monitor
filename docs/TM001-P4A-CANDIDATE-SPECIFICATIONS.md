# TM001 P4a — Four independent NQ candidate specifications (paper only)
Status: DRAFT FOR HUNTER REVIEW / NOT BACKTESTED / NOT APPROVED
Date: 2026-10-10
Parent: docs/TM001-P4-STRATEGY-DISCOVERY-CONTRACT.md

## Common conventions — first-pass research parameters, NOT optimized
All clocks America/New_York, with exchange calendar and DST handled explicitly; RTH 09:30–16:00 ET. One-minute bars represent the interval starting at timestamp; decisions only after a bar completes, with earliest hypothetical entry at the next minute's open. If the next bar, needed history, calendar, rollover, or data integrity is missing, emit NO_TRADE. No entry in last 15 RTH minutes. At most one new position and one executed trade per strategy per day; never overlap positions. Reject conflicting long/short triggers rather than choosing retrospectively. Indicators use only completed bars and never use future session high/low or ex-post regime labels. Require contiguous 1-minute bars and a verified contract; no assumed gap fills.

First-pass illustrative exits for all candidates: stop 10 NQ points, target 40 NQ points, flatten at 15:55 ET or after 30 completed minutes, whichever comes first; stop/target ordering within a minute is UNKNOWN and must be evaluated in both P2 fill models. These exits are held common initially for controlled comparison, not justified as optimal or safe. Do not let a $10-point stop bypass daily/operating/MLL risk gates; risk engine has final veto. No overnight positions. All price levels must respect 0.25-point NQ tick grid. One-bar indicators are measured in NQ index points.

Common comparison: 5 MNQ/1 NQ/2 NQ; $2k and $3k EOD MLL; threshold-proxy and worst-bar-stress; provisional round-trip friction $25/$35/$70 respectively. An NQ path for MNQ is a proxy. Zero new API calls, no trading, no alerts.

## 1. SESSION_TREND_PULLBACK_V1
**Mechanism:** directional institutional participation may continue after a temporary counter-move; this is not an opening-range retest. **Counter-hypothesis:** initial impulse is exhaustion and pullbacks reverse or chop.
**Eligible window:** 10:00–14:30 ET. Use the prior 20 *completed* one-minute bars to determine direction. At signal bar i, require: (a) over bars i-9 through i-4 inclusive, close displacement from first open to last close >= +30 points for long (<= -30 for short); (b) bars i-3 through i-1 are a countertrend pullback, with net close change <= -8 for long (>= +8 for short), and no pullback close beyond the impulse's first open; (c) bar i closes above bar i-1 high for long (below bar i-1 low for short). Do not use the 09:30 opening-range boundary or overnight levels.
**Signal/entry:** confirmation at close of bar i, hypothetical entry next bar open. **No trade:** opposite signals, noncontiguous history, inadequate impulse, failed pullback or outside window. **Falsifier:** net after costs <=0, concentrated winners, or stress-model risk breach; in particular repeated impulse exhaustion.
**Data:** completed RTH minute OHLC, contract/calendar, no tick requirement to *screen* signals; tick/order book needed for execution claims.

## 2. VOLATILITY_COMPRESSION_EXPANSION_V1
**Mechanism:** a low-range period can precede directional price discovery as resting liquidity is consumed. **Counter-hypothesis:** compressions often resolve into false breaks or adverse gap/slippage.
**Eligible window:** 10:00–14:30 ET. At completed bar i-1, calculate high-low of bars i-12..i-1 (12 contiguous minutes); require range <= 20 points and each of those bars' high-low <= 8 points. At completed bar i, require close > prior 12-bar high + 2 points (long) or close < prior 12-bar low - 2 points (short), and bar i true range <= 20 points to exclude oversized expansion entries. No retest of a five-minute opening range.
**Signal/entry:** breakout confirmation at close i; enter next open, no chase if next open is > 5 points beyond signal close in trade direction (no-trade). **No trade:** unverified history, oversize breakout, gap/chase, conflicting trigger. **Falsifier:** post-cost breakout follow-through fails, especially after 1 tick/side adverse execution stress.
**Data:** completed RTH minute OHLC; tick data required for actual stop/target sequencing.

## 3. OPENING_DRIVE_FAILURE_V1
**Mechanism:** early directional inventory may be trapped when a sustained opening drive reverses; differs from the rejected ORB retest because it trades failed *drive acceptance*, not breakout-retest continuation.
**Eligible window:** 09:40–10:30 ET. Define initial drive using first 10 completed RTH bars (09:30–09:39). If 09:39 close minus 09:30 open >= +30 points, define UP drive and anchor at 09:30 open; if <= -30, DOWN drive. No drive otherwise. For UP drive, require a subsequent completed bar i closing below the midpoint of the 09:30 open and 09:39 close and below the preceding bar low; then signal SHORT. For DOWN drive require close above that midpoint and above preceding bar high; signal LONG. Only the first qualifying failure counts.
**Signal/entry:** next bar open after failure confirmation. **No trade:** no strong opening drive, no confirmed failure, missing opening bars, opposite/ambiguous condition, outside window. **Falsifier:** trend-day continuation creates repeated stop-outs, or performance depends on a few extreme reversal days.
**Data:** complete first ten RTH minute bars plus subsequent contiguous bars; no future opening-session outcome used.

## 4. LOW_TREND_MEAN_REVERSION_V1
**Mechanism:** when directional persistence is weak, temporary excursions away from a trailing price center may revert. **Counter-hypothesis:** regime detector lags and sells emerging trends.
**Eligible window:** 11:00–14:30 ET. For signal bar i, compute 30-bar SMA of closes and efficiency ratio ER=abs(close[i-1]-close[i-30]) / sum(abs(close[k]-close[k-1])) for k=i-29..i-1; zero denominator => NO_TRADE. Regime is eligible only if ER<=0.25 based exclusively on completed bars through i-1. Define center as 30-bar SMA through i-1, and sample standard deviation of those 30 closes; require sigma>=2 points. At bar i, require close <= center-2*sigma and close > open for LONG, or close >= center+2*sigma and close < open for SHORT. This is a countertrend excursion/rejection, not an ORB level.
**Signal/entry:** close i confirmation, next bar open; no-trade if regime invalid, dispersion too small, or no rejection. **Falsifier:** persistent trends overwhelm stops or execution friction eliminates mean-reversion expectancy.
**Data:** contiguous completed RTH bars, contract/calendar; tick data needed for fill certification.

## Falsification and integrity checklist
- [ ] Hunter reviews whether each mechanism is sufficiently independent from ORB_RETEST_V1
- [ ] P4b implements exact bar indexing, time-zone handling, gap rejection, tick rounding and synthetic cases before any cache run
- [ ] P4b tests no-lookahead, next-open, missing history, contradictory signals, no-trade, and no future-based regime labels
- [ ] P4c applies exactly these first-pass thresholds across every eligible cached session and reports ALL four candidates, including zero signals; no parameter search
- [ ] P4d audits entry-minute exits, trade ledger, cost/tick sensitivity, worst-bar MLL, risk halts and outcome concentration
- [ ] Any future OOS requires separately frozen parameters and untouched dates plus Hunter approval for fresh data

## Known research limitations
These numerical thresholds are hypotheses chosen before screening, not evidence of edge; common 10/40 exits may not fit each mechanism and must not be optimized on P3 cache. Minute OHLC cannot certify order of intrabar touches or slippage. Prior P3 cache is exploratory/in-sample. This document creates no executable strategy, test result, trading permission or OOS evidence.
