# HunterCorp Trading Monitor — TM001

TM001 is an NQ-first trading intelligence monitor for HunterCorp.

## V1 mission

Continuously analyze E-mini Nasdaq-100 futures (NQ), summarize overnight/session structure, detect Hunter's defined setup as it develops, and send an alert for human review.

## Hard guardrails

- **Read / analyze / alert only.**
- **No automated order placement.**
- **No broker execution module in V1.**
- **No API keys, account IDs, tokens, or secrets committed to Git.**
- The detector must implement an explicit, testable setup contract; it must not invent generic AI buy/sell signals.
- Historical replay and live shadow-mode validation are required before an alert is considered trustworthy.
- NQ is the only V1 instrument. GC is deferred until NQ is proven.

## Data architecture

```text
Provider adapter
      |
Normalized NQ market events
      |
Session / structure engine
      |
Deterministic setup detector
      |
Context / explanation layer
      |
Alert
      |
Hunter decides whether to trade in TopstepX
```

The provider adapter prevents strategy logic from being coupled to a single market-data vendor.

## Planned providers

- Development/replay: Massive futures data (subject to final API verification during implementation)
- Production candidate: TopstepX / ProjectX market data
- Backup/research candidate: Databento

## Build status

- [x] TM001 objective locked
- [x] NQ-only V1 locked
- [x] No automated execution locked
- [x] Provider-independent data architecture locked
- [ ] Define Hunter's NQ setup contract
- [ ] Implement normalized market-data types
- [ ] Implement provider adapter
- [ ] Implement session engine (Asia / London / New York)
- [ ] Implement 09:20–09:25 ET briefing
- [ ] Implement setup detector
- [ ] Historical replay harness
- [ ] Validate detector against known sessions
- [ ] Live shadow mode
- [ ] Phone alert transport
- [ ] Add GC only after NQ is proven

## Current gate

**Do not implement the setup detector until Hunter's actual setup has been translated into measurable conditions.**
