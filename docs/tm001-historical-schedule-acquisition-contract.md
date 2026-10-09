# TM001 historical NQ schedule acquisition contract

Status: DOCUMENTED API SHAPE; ACTUAL 2026 NQ SESSION EVENTS NOT ACQUIRED OR VERIFIED.
Scope: read-only research. No authenticated requests, spend, cache mutation or trading.

## Source of truth and semantics

Massive documents `GET /futures/v1/schedules` with `product_code=NQ` and `session_end_date=YYYY-MM-DD`. Each response `results[]` record can include `event` (such as `pre_open`, `open`, `close`), `product_code`, `session_end_date`, `timestamp` (UTC ISO 8601), and `trading_venue`. `next_url` indicates pagination. Documentation states a two-year historical lookback. Actual session-event records have NOT been retrieved.

Sources:
- https://www.massive.com/docs/rest/futures/schedules
- https://massive.com/docs/rest/futures/overview
- https://www.cmegroup.com/trading-hours.html
- https://www.cmegroup.com/notices/electronic-trading/2026/05/20260511.html

## Critical trade-date caveat

CME announced a **June 19, 2026** change: futures and options trades executed on a Friday U.S. holiday reflect a Globex trade date aligned to the next valid clearing date. The existing TM001 regular 18:00 ET-to-next-day session template and weekday-only trade-date assumptions must not be treated as exchange-verified, particularly around June 19, July 3 and September 7. The July 3 and September 7 exclusions in the provisional policy are planning assumptions, not certified closures.

## Next offline implementation

1. Create a pure adapter that validates one already-provided schedules response: `status=OK`, array `results`, no `next_url`, exact NQ product/date/venue identity, recognized event types, UTC timestamp parsing, chronological order, and unambiguous open/close pairing.
2. Include synthetic fixtures for regular hours, early closes, missing events, wrong product/date, duplicate/out-of-order events, and pagination rejection. Never treat sample ERL product events as NQ facts.
3. Keep event-to-open-minute conversion and actual calendar coverage disabled until the adapter and real product-specific schedule evidence are validated.
4. Before any future authenticated schedule retrieval, establish a request cap, cost/plan entitlement, response storage policy, and explicit approval. Do not use credentials during this checkpoint.

No completeness certification is authorized by this document.
