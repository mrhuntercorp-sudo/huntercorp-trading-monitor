# HunterCorp Trading Monitor — TM001

TM001 is an NQ-first trading intelligence monitor for HunterCorp.

## V1 mission

Continuously analyze E-mini Nasdaq-100 futures (NQ), summarize overnight/session structure, **discover and validate a robust intraday setup from historical evidence**, then detect that approved setup as it develops and send an alert for human review.

## Hard guardrails

- **Read / analyze / alert only.**
- **No automated order placement.**
- **No broker execution module in V1.**
- **No API keys, account IDs, tokens, or secrets committed to Git.**
- No strategy is accepted because it is popular or because one backtest looks good.
- Historical replay, out-of-sample testing, robustness checks, and live shadow-mode validation are required before an alert is considered trustworthy.
- NQ is the only V1 instrument. GC is deferred until NQ is proven.

## Research architecture

```text
Historical NQ data
      |
Normalized market-data adapter
      |
Session / feature engine
      |
Candidate strategy families
      |
Backtest + friction + OOS + robustness
      |
Approved deterministic setup
      |
Live market adapter
      |
Setup detector + context
      |
Phone alert
      |
Hunter decides whether to trade in TopstepX
```

## Candidate strategy families

1. Filtered 5m / 15m Opening Range Breakout
2. Opening-drive breakout + pullback/retest
3. Overnight high/low breakout or rejection
4. VWAP trend/pullback
5. Opening-range mean reversion as a counter-hypothesis

See `docs/STRATEGY_DISCOVERY_CONTRACT.md` for the validation contract.

## Planned providers

- Development/replay: Massive futures data (subject to final API verification during implementation)
- Production candidate: TopstepX / ProjectX market data
- Backup/research candidate: Databento

## Build status

- [x] TM001 objective locked
- [x] NQ-only V1 locked
- [x] No automated execution locked
- [x] Provider-independent data architecture locked
- [x] Strategy-discovery direction locked
- [x] Candidate strategy families defined
- [x] Anti-overfitting / promotion gates defined
- [ ] Implement normalized market-data types
- [ ] Verify and implement development data provider
- [ ] Implement session / feature engine
- [ ] Implement backtest harness
- [ ] Run naive ORB control
- [ ] Run candidate-family tests
- [ ] Out-of-sample / sensitivity / regime tests
- [ ] Select setup only if evidence passes
- [ ] Implement 09:20–09:25 ET briefing
- [ ] Live shadow mode
- [ ] Phone alert transport
- [ ] Add GC only after NQ is proven

## Current gate

**Build the research/data harness. Do not promote a trading setup until it passes the Strategy Discovery Contract.**
