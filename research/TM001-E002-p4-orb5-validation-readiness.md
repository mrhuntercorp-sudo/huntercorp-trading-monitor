# TM001-E002 — Frozen-rule validation readiness (P4 and ORB5)

**Gate: NOT READY FOR PROSPECTIVE PERFORMANCE CLAIMS.**
This is a source-code contract review, not a new backtest. Original algorithms remain unchanged.

## Provenance inspected
- `src/research/p4-nq-signals.ts`
- `src/research/conservative-orb.ts`
- `src/scripts/tm001-ny-native-audit.ts`
- Prior E001 native audit output supplied by the operator: 28 eligible / 2 excluded; P4 19 trades +222 points; ORB 28 trades +144 points. These are **exposed in-sample results**, not independent validation.
- Historical P4 out-of-sample weakness remains unresolved. Do not relabel exposed days as fresh.

## P4: SESSION_TREND_PULLBACK_V1

- RTH minute bars checked for sequential timestamps, tick alignment, contract/calendar flags, and session boundary.
- Search starts after at least 20 RTH bars; signal candle time is 10:00–14:30 ET in the generator.
- Six-minute impulse measured from `bars[i-9].open` to `bars[i-4].close`; at least 30 points directional.
- Pullback uses `bars[i-1].close - bars[i-3].close`, at least 8 points counter-directional.
- Three prior candles must remain on correct side of the impulse anchor; signal candle closes beyond preceding candle high/low.
- Generator **returns only the first qualifying signal per day**.
- Assumed entry at next minute OPEN; 10-point stop; 40-point target; 30-minute deadline, with a hard cap derived from the session open.
- Native audit retains only entries before 11:00 ET; five later candidate entries were discarded in the latest reported audit.
- Native simulator charges 2 NQ points per trade, prioritizes stop if stop and target touch in one minute, and treats gap-through stops conservatively.
- **Audit needed:** exact causal timing of next-open fills, commission/slippage calibration, time-exit boundary, ambiguous bars, complete timestamped event ledger, historical P4 OOS provenance.

## ORB5: CONSERVATIVE_ORB5_NEXT_BAR_40_STOP_80_TARGET_SESSION_END

- Requires complete RTH 09:30–15:59 ET, one contract ticker, valid OHLC.
- First five 1-minute candles form opening range.
- **First close** outside the opening range triggers a direction; entry assumed at following minute OPEN.
- Stop 40 points, target 80 points, otherwise exit at session close.
- Stop wins when both stop and target touched in a minute. Gap-through stop fills at worse of stop/open; target fills at target.
- Native audit keeps entries before 11:00 ET; 2 NQ points base friction (40 USD per 1 NQ contract).
- **Audit needed:** actual exit timestamps (native audit currently sets null), gap-through counts, next-open fill realism, no-trade session reporting, drawdown and prior OOS provenance.

## Readiness checklist

| Check | P4 | ORB5 |
|---|---|---|
| Exact signal rules located | YES | YES |
| Existing historical test reproduced by operator | YES | YES |
| Risk and exit contract located | YES | YES |
| In-sample and OOS clearly separated | PARTIAL | PARTIAL |
| Timestamped event ledger verified | NOT YET | NOT YET |
| Assumed fill vs feasible execution independently verified | NOT YET | NOT YET |
| Fresh unseen sessions evaluated | NO | NO |
| Approved actionable alerts or orders | NO | NO |

## E002 next actions (no strategy changes)

1. Build a **read-only deterministic event ledger** from the existing cached historical data: one row per eligible day per strategy, including no-signal days, signal time, entry, stop, target, exit reason/time, base cost, exclusions, and simulation caveats.
2. Cross-check ledger aggregates against E001: P4 19 trades +222; ORB5 28 trades +144. **Stop on any mismatch.**
3. Reconstruct historical OOS evidence and commit/version provenance before locking a prospective validation start date.
4. Record forward paper results prospectively with the same frozen rules; no retroactive tuning.
5. Human approval is required before any actionable alert or live execution.

**Scope:** P4 and ORB5 only. Wick rejection is reserve. All other strategies paused. No paid data, network calls, new optimization, or orders.
