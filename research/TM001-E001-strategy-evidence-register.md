# TM001 — Strategy Evidence Register (E001)

Status: **RESEARCH ONLY — NO STRATEGY APPROVED**

This document is a reproducible evidence inventory, not a ranking. The original detectors and backtests are unchanged. No API requests, parameter search, orders, or alerts are authorized by this document.

## Evidence categories

- **EXPERIMENTAL**: implemented or historically evaluated, but not supported by sufficiently independent evidence.
- **UNDER_VALIDATION**: rules frozen before fresh observations; data quality and execution assumptions audited; forward observations being collected.
- **EVIDENCE_BACKED**: requires independently evaluated forward results, execution-cost robustness, and explicit human approval. **None currently qualifies.**

## Existing strategy families and evidence

| Family | Primary code/evidence | What we can conclude | Critical gaps | Status |
|---|---|---|---|---|
| Opening-range breakout (ORB) | `src/research/conservative-orb.ts`; `src/scripts/tm001-ny-native-audit.ts` | Reproducible native-rule backtest exists; earlier forward evaluations were weak | Compare identical sample dates, costs, risk, and exits; fresh OOS evidence | EXPERIMENTAL |
| Session trend pullback (P4) | `src/research/p4-nq-signals.ts`; `src/scripts/tm001-ny-native-audit.ts` | Initial historical promise, previously observed OOS weakness; a native 10-stop/40-target audit exists | Robustness, concentration of wins, independent forward validation | EXPERIMENTAL |
| Wick rejection / liquidity levels | `src/research/wick-rejection.ts`; `src/research/fixed-short-feasibility.ts`; `src/scripts/tm001-ny-native-audit.ts` | Reproducible fixed-short audit variants exist | Selection effects, overlap, risk comparability, OOS validation | EXPERIMENTAL |
| ICT / sweep → MSS → FVG | Prior IS001 research (verify exact script before inclusion in automated audit) | Earlier 21 filled midpoint-limit cases had strongly negative aggregate results | Exact code provenance and comparability; no evidence to promote | EXPERIMENTAL |
| Bull/bear flags | `src/research/cp001-flags.ts`; `src/scripts/tm001-cp001-q2-audit.ts` | 22 detections in exposed sample; directional 30-minute close movement negative in both classified flag groups | Not trade P&L; no realistic entries/stops/costs; no fresh sample | EXPERIMENTAL |
| Head and shoulders / inverse | `src/research/cp001-shoulders.ts`; `src/scripts/tm001-cp001-q2-audit.ts` | Six detections; neckline timing concerns; four complete forward windows | Extremely small sample; no validated execution or fresh sample | EXPERIMENTAL |

## Comparison contract (locked before further testing)

1. Preserve original rule versions and record exact commit hashes.
2. Record **sample dates, eligible sessions, exclusions, trade counts, and missing data** for each strategy.
3. Separate **in-sample, exposed history, truly unseen out-of-sample, and forward paper observations**.
4. Report gross and net results, realistic commissions/slippage, stop/target ambiguity, max drawdown, worst session, and results without the best session when trade P&L exists.
5. Do not rank unequal stop/target and exposure models by raw net points. Risk-normalized comparison requires consistent definitions and explicit caveats.
6. Keep descriptive pattern excursions separate from executable strategy returns.
7. Do not optimize parameters against the already exposed 33-session CP001 sample.
8. No automatic promotion. Human approval is mandatory.

## Reproduce existing evidence locally

Run in `C:\Users\hunte\huntercorp-trading-monitor` after `git pull --ff-only` and `npm run typecheck`:

```powershell
node --import tsx src/scripts/tm001-ny-native-audit.ts |
  Tee-Object -FilePath tm001-native-evidence.txt |
  Select-String 'NATIVE_RULES|NATIVE_STRATEGY_RESULT|NATIVE_AUDIT_COMPLETE'

node --import tsx src/scripts/tm001-cp001-q2-audit.ts |
  Tee-Object -FilePath tm001-pattern-evidence.txt |
  Select-String 'CP001_Q2_SUMMARY'
```

**Important:** The native audit loads overnight plus RTH cached data and can fail if a required day is unavailable. A failed run is missing evidence, not a zero-trade result. No network fallback is permitted.

## Decision gate

Do **not** choose a winner until the native strategy results and their caveats have been inspected together. If no candidate meets the evidence standard, outcome is **NO APPROVED STRATEGY**. The next stage would be frozen-rule, prospective paper observation rather than a live trading alert system.
