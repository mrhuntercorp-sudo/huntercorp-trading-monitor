# TM001 OOS1 — Pre-retrieval lock (2026-10-12)

Status: **PLANNED / NO DATA FETCHED / NO OOS EXECUTED**. User authorized using the existing Massive connection provided there is **no additional purchase or subscription charge**. API entitlement, request limits, and potential usage charges must be confirmed before retrieval; authorization does not waive that condition.

## Untouched holdout
- Initial fixed window: **2026-10-05 through 2026-10-09**, five weekdays; no post-hoc date replacement based on P&L.
- Instrument: NQ December 2026 contract **NQZ6**, subject to independent contract/calendar verification; MNQ execution economics use NQ price path as a proxy.
- Bar type: vendor historical **1-minute OHLCV**, timestamps interpreted as minute starts in America/New_York; RTH 09:30–16:00 ET, prior-session overnight context required.
- For each date, retrieve its selected-contract date and preceding calendar date (deduplicate repeated requests). Request only the locked window and necessary preceding context; no automatic expansion.
- Exclude and disclose sessions with missing RTH bars, incomplete overnight context, duplicate/invalid OHLCV, calendar/rollover uncertainty; do not replace excluded dates to improve outcome.
- Verify Massive entitlement/usage billing **before** first request. Stop if charges or permissions are uncertain. Do not expose API credentials in logs.

## Frozen strategy and research risk
- **SESSION_TREND_PULLBACK_V1** unchanged, default 10 NQ-point stop / 40-point target, next-minute-open entry, 30-minute/15:55 ET time exits, max one trade per day, signal hours 10:00–14:30 ET; no optimization or new thresholds.
- Primary research configuration **5 MNQ / $3,000 EOD trailing MLL**; report both proxy and conservative worst-bar risk modes. Include 5 MNQ, 1 NQ, 2 NQ × $2k/$3k MLL matrix for context, not cherry-picked promotion.
- Research-only operating stop 50% of MLL and daily stop 15% of MLL, not official Topstep rules. Apply frozen friction and execution assumptions; do not claim fill certification.
- Compare performance, trades, win/loss distribution, post-cost expectancy, closed drawdown, worst-bar cushion, ambiguity/collision/gap flags, risk-limit breaches, sensitivity to one adverse tick per side and one winner-to-stop flip.
- **Insufficient evidence** if <30 OOS trades. Reject promotion on lookahead, provenance failure, severe worst-bar MLL or operating stop breach, materially negative post-cost expectancy, one adverse tick per side flips expectancy negative, or one winner flip erases edge.
- Never tune after looking at holdout results. Any subsequent holdout requires a new predeclared manifest and approval.

## Required preflight before retrieval
1. Confirm vendor plan permits historical futures data on requested dates without incremental cost; if unknown, stop and ask user.
2. Verify source/provider method, per-request bounds and local cache behavior; establish explicit API request cap and safe logging.
3. Freeze evaluator commit and provenance for new input files; **do not alter the P4e frozen research baseline**.
4. Obtain final user confirmation of concrete capped request plan after cost verification.

No live orders, no auto-trading, no external spending, no strategy modification, and no API requests are authorized by this document itself.
