import assert from "node:assert/strict";
import test from "node:test";
import { auditContractDates } from "../src/research/contract-audit.js";
test("detects historical ticker mismatch and does not approve rollover",()=>{
 const audit=auditContractDates(["2026-09-18","2026-09-21"],
 [{ticker:"NQU6",productCode:"NQ"},{ticker:"NQZ6",productCode:"NQ"}],"NQZ6");
 assert.deepEqual(audit.distinctTickers,["NQU6","NQZ6"]);
 assert.deepEqual(audit.benchmarkMismatchDates,["2026-09-18"]);
 assert.equal(audit.status,"REVIEW_REQUIRED");
});
test("even matching tickers cannot prove liquidity-based rollover",()=>{
 const audit=auditContractDates(["2026-09-21"],[{ticker:"NQZ6",productCode:"NQ"}],"NQZ6");
 assert.deepEqual(audit.benchmarkMismatchDates,[]);
 assert.equal(audit.status,"REVIEW_REQUIRED");
});
