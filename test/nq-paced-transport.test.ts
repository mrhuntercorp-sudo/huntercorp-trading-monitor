import assert from "node:assert/strict";
import { test } from "node:test";
import { pacedTransport, type Clock } from "../src/scripts/massive-nq-paced-transport.js";

test("enforces 15 second separation using simulated clock", async () => {
  let now = 0;
  const waits: number[] = [], starts: number[] = [];
  const clock: Clock = { now: () => now, wait: async ms => { waits.push(ms); now += ms; } };
  const transport = pacedTransport(async (value: number) => { starts.push(now); return value; }, { intervalMs: 15000, maxRequests: 3, clock });
  assert.equal(await transport(1), 1);
  assert.equal(await transport(2), 2);
  assert.equal(await transport(3), 3);
  assert.deepEqual(starts, [0, 15000, 30000]);
  assert.deepEqual(waits, [15000, 15000]);
  await assert.rejects(transport(4), /TRANSPORT_BUDGET_EXHAUSTED/);
});

test("rejects pacing below minimum", () => {
  assert.throws(() => pacedTransport(async () => 1, { intervalMs: 14999, maxRequests: 1 }), /PACING_BELOW_SAFETY_MINIMUM/);
});

test("stops permanently after provider failure, without retry", async () => {
  let calls = 0;
  const transport = pacedTransport(async () => { calls++; throw Error("HTTP_429"); }, { intervalMs: 15000, maxRequests: 3 });
  await assert.rejects(transport("first"), /HTTP_429/);
  await assert.rejects(transport("second"), /TRANSPORT_STOPPED/);
  assert.equal(calls, 1);
});

test("rejects fake clock that fails to advance", async () => {
  const clock: Clock = { now: () => 0, wait: async () => {} };
  const transport = pacedTransport(async () => 1, { intervalMs: 15000, maxRequests: 2, clock });
  assert.equal(await transport("first"), 1);
  await assert.rejects(transport("second"), /PACING_CLOCK_DID_NOT_ADVANCE/);
});
