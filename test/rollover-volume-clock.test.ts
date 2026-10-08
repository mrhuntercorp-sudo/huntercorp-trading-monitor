import assert from "node:assert/strict";
import test from "node:test";
import { newYorkClock } from "../src/market/time.js";
test("September New York 09:30 corresponds to 13:30 UTC",()=>{
 const clock=newYorkClock(Date.parse("2026-09-10T13:30:00Z"));
 assert.equal(clock.date,"2026-09-10");
 assert.equal(clock.hour,9);
 assert.equal(clock.minute,30);
});
