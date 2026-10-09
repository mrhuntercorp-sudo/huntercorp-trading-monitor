// TM001 offline-only request pacing. No network transport or API keys in this module.
export type Clock = { now(): number; wait(ms: number): Promise<void> };
export const realClock: Clock = {
  now: () => Date.now(),
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};
export function pacedTransport<T, R>(transport: (target: T) => Promise<R>, options: {
  intervalMs: number;
  clock?: Clock;
  maxRequests: number;
}): (target: T) => Promise<R> {
  const { intervalMs, maxRequests, clock = realClock } = options;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 15000) throw Error("PACING_BELOW_SAFETY_MINIMUM");
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 0 || maxRequests > 90) throw Error("INVALID_REQUEST_BUDGET");
  let calls = 0;
  let lastStart: number | undefined;
  let stopped = false;
  return async target => {
    if (stopped) throw Error("TRANSPORT_STOPPED");
    if (calls >= maxRequests) throw Error("TRANSPORT_BUDGET_EXHAUSTED");
    if (lastStart !== undefined) {
      const elapsed = clock.now() - lastStart;
      if (!Number.isFinite(elapsed)) throw Error("INVALID_CLOCK");
      if (elapsed < intervalMs) await clock.wait(intervalMs - elapsed);
    }
    const started = clock.now();
    if (!Number.isFinite(started) || (lastStart !== undefined && started - lastStart < intervalMs)) throw Error("PACING_CLOCK_DID_NOT_ADVANCE");
    lastStart = started;
    calls++;
    try { return await transport(target); }
    catch (error) { stopped = true; throw error; }
  };
}
