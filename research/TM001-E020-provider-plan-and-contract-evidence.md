# TM001 E020 — provider entitlement and contract evidence (2026-10-14)

## Published Massive Futures Basic terms
Source: https://massive.com/pricing?product=futures
- Published price: USD $0/month.
- 5 API requests/minute.
- 2 years historical data, CME coverage, minute aggregates.
- This establishes **published product terms**, not the user's specific API-key plan, account billing settings, or whether any commercial/business use restrictions apply.
- Existing verified local history: Massive NQZ6 minute aggregates fetched successfully in prior TM001 smoke tests. This is not evidence of the account's present billing classification.

## October NQ contract selection
- NQZ6 (December 2026) is the established nearby quarterly NQ contract for October 2026; see CME contract reference and published exchange roll conventions.
- The original E008 policy states prior-complete-session volume evidence is required for roll decisions. **Do not silently replace that frozen policy with calendar convention.**
- E019 requires both contracts' complete RTH bars and found missing cache for 2026-10-13 and 2026-10-14. That is a missing-evidence result, not a bad-data result.
- For Oct 15, prior session is Oct 14. UTC cache retrieval would typically need Oct 13/14 UTC for complete Oct 14 ET RTH. Two contracts x two UTC dates = **up to four requests** if uncached.
- A second, separately approved retrieval may be required for the prospective Oct 15 trade session; it must never be evaluated before completion.
- The collector E015 remains hard-blocked (`independentEvidenceVerified=false`) until an auditable independent verification gate is implemented.

## Concrete next action
1. Confirm user API-key entitlement/terms (Basic $0 individual use vs another plan); no key disclosure.
2. Confirm exchange session calendar for the exact date.
3. Define an evidence artifact produced by code from SHA-verified cached bars for prior-session volume and an independently reviewed CME-hours source, rather than user-supplied true/false flags.
4. Separately obtain user approval for an explicitly enumerated max-four-request batch; only then enable an auditable capped retrieval path.
5. Do not alter frozen ORB5 or turn on live trading.
