# TM001 E013 — CME calendar and NQ contract roll source review
Research date: 2026-10-14. Status: SOURCE REVIEW COMPLETE; PER-SESSION ELIGIBILITY NOT CERTIFIED. NO API / NO ORDERS / NO STRATEGY CHANGES.

## Official sources
1. CME Equity Index Roll Dates: https://www.cmegroup.com/trading/equity-index/rolldates.html
   - Customary U.S. equity-index roll is the Monday before the third Friday of expiry month.
   - December 2026 customary roll: 2026-12-14; expiration: 2026-12-18. March 2027 roll: 2027-03-15; expiration: 2027-03-19.
   - Customary roll date is not observed NQZ6/NQH7 volume leadership.
2. CME Holiday and Trading Hours: https://www.cmegroup.com/trading-hours.html
   - Thanksgiving 2026-11-26 through 2026-11-28; Christmas 2026-12-24 through 2026-12-26; New Year 2026-12-31 through 2027-01-01.
   - CME notes holiday hours can change and are generally finalized about two weeks ahead.
   - Verify NQ-specific session hours before accepting or rejecting affected dates.
3. Nasdaq cash-equity calendar: https://nasdaqtrader.com/Trader.aspx?id=Calendar
   - Cash equity early closes 2026-11-27 and 2026-12-24 are caution flags, NOT NQ futures session-hours evidence.

## Frozen E008 implications
- ORB5_NATIVE_40_80 unchanged; prospective start 2026-10-15; no hindsight exclusions.
- Normal 09:30–15:59 ET sessions require 390 unique valid minute bars. Quarantine gaps, duplicates, and unknown shortened sessions.
- Review holiday windows for NQ-specific schedule before eligibility decisions.
- 2026-12-14 is a documented customary roll marker, not an automatic signal to switch contracts. Require predeclared contract policy and prior complete-session volume evidence where applicable. Never use same-day outcome or volume to choose a contract retroactively.
- Existing provisional calendar and rollover scripts remain provisional; do not silently treat them as certified.
- Massive known limit 5 calls/minute; proposed 15-second spacing, max 4 requests/run, no retries. Incremental cost still unverified.
- No API calls, no collector activation, no orders, no strategy promotion without separate approval.

## Decision
E013 official-source review complete. Per-session NQ trading hours, contract-roll selection and retrieval authorization remain gated.