# TM001 — NQ Setup Contract

Status: **NOT YET DEFINED**

This document is the approval gate for the setup detector.

TM001 must recognize **Hunter's setup**, not generate generic AI trading signals.

## Questions the contract must answer

### 1. Trading window
When is the setup valid? Define session(s), preferred New York window, and any no-trade periods.

### 2. Higher-timeframe context
Which timeframes and structures establish directional context?

### 3. Important levels
Define the levels that matter (for example overnight high/low, prior-day levels, session highs/lows, VWAP or other explicitly approved references).

### 4. Momentum / displacement
Define what Hunter means by momentum entering the market using observable conditions.

### 5. Setup sequence
Write the event sequence that must occur before TM001 may classify a setup as FORMING.

### 6. Confirmation
Define what upgrades FORMING to READY / CONFIRMED, if that state is desired.

### 7. Invalidation
Define conditions that immediately cancel the setup.

### 8. Alert timing
Define when Hunter wants the first alert and whether follow-up state-change alerts are useful.

### 9. Context filters
Define news, session, volatility, liquidity, or other filters that should suppress or downgrade an alert.

### 10. Evidence
Provide several historical examples of valid setups and non-setups so the detector can be replay-tested.

## State machine (provisional)

```text
IDLE -> WATCHING -> FORMING -> CONFIRMED
          |           |           |
          +-------- INVALID <------+
```

The states are provisional until Hunter approves the setup contract.

## Governance

No detector implementation is considered valid until this contract is explicit enough that two independent implementations should classify the same historical market sequence the same way.
