# TM001 — CME calendar evidence gate (2026)

Research-only checkpoint. No data acquisition, cache mutation, execution, or strategy approval.

## Verified from CME published roll-date table

CME equity-index customary lead-month roll dates for 2026:
- June 15, 2026: June (NQM6) to September (NQU6).
- September 14, 2026: September (NQU6) to December (NQZ6).

Source: https://www.cmegroup.com/trading/equity-index/rolldates.html

These are CME **customary** roll dates, not proof that a volume-based crossover occurred on those dates. A causal historical backtest may adopt a fixed published-calendar roll policy; a volume-based roll requires independent as-of data and an explicit rule. Do not retroactively choose a date based on later observations.

## Holidays — unresolved product-level session exceptions

CME's 2026 Globex holiday schedule explicitly covers:
- Juneteenth: June 18–19, 2026
- Independence Day: July 3–5, 2026
- Labor Day: September 6–8, 2026

Source: https://www.cmegroup.com/trading-hours.html

CME holiday notes say September 6 pre-open orders carry Tuesday September 8 trade date. This does **not** establish the exact NQ matching-minute schedule. Likewise, the Nasdaq cash-equity calendar is not an NQ futures trading-hours calendar. Do not classify July 3 or September 7 as regular full sessions, nor assume zero futures trading, until the product-specific CME Globex schedule is recorded.

## Required before historical recovery

1. Capture product-specific CME Globex NQ schedule for June 19, July 3, September 7, and adjoining evening sessions, including timezone and early-close/reopen times.
2. Reconcile regular 930-minute overnight and 390-minute RTH templates with product-specific exceptions. The labels 'missing' and 'incomplete' are provisional near these dates.
3. Decide fixed CME customary lead-month roll vs as-of volume-based roll. Record chosen policy and source; retain both contracts on boundary dates when validating.
4. Review provider Massive minute-bar timestamp and no-trade-minute semantics. Absence of a bar is not necessarily a data outage.
5. Only after checks, create a separate request/spend proposal; no automatic execution.

Status: CME customary roll-date evidence verified; product-specific holiday hours and provider bar semantics NOT verified. Acquisition gate CLOSED.
