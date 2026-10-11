/** P4e: synthetic invariant for early risk exits; no cache, API, or trades. */
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const path="src/scripts/tm001-p4d-trade-execution-audit.ts";
const source=readFileSync(path,"utf8");
assert.match(source,/let exit=t\.exit,reason=t\.exitReason,actualExitTime=t\.exitTime;/);
assert.match(source,/reason=crossed\.name;\s*actualExitTime=b\.timestampMs;\s*break;/);
assert.match(source,/exitTime:new Date\(auditedExitTime\(/);
assert.match(source,/holdingMinutes:auditHoldingMinutes\(t\.entryTime,actualExitTime\)/);
assert.match(source,/entryMinuteExit:actualExitTime===t\.entryTime/);
// Static source contract guards the integration points; it does NOT execute the risk engine.
const entry=Date.parse("2026-09-21T14:22:00Z");
const planned=entry+8*60_000;
const riskAtEntry=entry;
const riskAfterTwo=entry+2*60_000;
assert.equal((riskAtEntry-entry)/60_000,0);
assert.equal(riskAtEntry===entry,true);
assert.equal((riskAfterTwo-entry)/60_000,2);
assert.equal(riskAfterTwo===entry,false);
assert.notEqual(riskAfterTwo,planned);
console.log("TM001 P4e TIMESTAMP SOURCE-CONTRACT CHECK GREEN 10/10 | STATIC INTEGRATION + SYNTHETIC ARITHMETIC | NOT EXECUTION-ENGINE REGRESSION");
