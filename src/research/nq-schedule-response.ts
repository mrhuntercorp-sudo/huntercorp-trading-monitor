export type ScheduleEvent = {
  event: "open" | "close";
  productCode: "NQ";
  sessionEndDate: string;
  timestamp: string;
  tradingVenue: string;
};
export type ScheduleInterval = { openUtc: string; closeUtc: string };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("INVALID_SCHEDULE_OBJECT");
  return value as Record<string, unknown>;
}
function utcTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw Error("INVALID_UTC_TIMESTAMP");
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) throw Error("INVALID_UTC_TIMESTAMP");
  return new Date(ms).toISOString();
}
/** Pure validation only. Does not fetch schedules or certify market coverage. */
export function validateNqScheduleResponse(
  payload: unknown,
  expected: { sessionEndDate: string; tradingVenue: string },
): { events: ScheduleEvent[]; intervals: ScheduleInterval[] } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expected.sessionEndDate) ||
      !Number.isFinite(Date.parse(expected.sessionEndDate + "T00:00:00Z")) ||
      new Date(Date.parse(expected.sessionEndDate + "T00:00:00Z")).toISOString().slice(0, 10) !== expected.sessionEndDate ||
      !expected.tradingVenue) throw Error("INVALID_EXPECTED_IDENTITY");
  const obj = record(payload);
  if (obj.status !== "OK") throw Error("SCHEDULE_STATUS_NOT_OK");
  if (obj.next_url !== undefined && obj.next_url !== null && obj.next_url !== "") throw Error("SCHEDULE_PAGINATION_UNHANDLED");
  if (!Array.isArray(obj.results) || obj.results.length === 0) throw Error("SCHEDULE_RESULTS_MISSING");
  const events: ScheduleEvent[] = [];
  const intervals: ScheduleInterval[] = [];
  let open: string | null = null;
  let last = -Infinity;
  for (const item of obj.results) {
    const row = record(item);
    if (row.product_code !== "NQ" || row.session_end_date !== expected.sessionEndDate ||
        row.trading_venue !== expected.tradingVenue) throw Error("SCHEDULE_IDENTITY_MISMATCH");
    if (row.event !== "open" && row.event !== "close") throw Error("SCHEDULE_UNSUPPORTED_EVENT");
    const timestamp = utcTimestamp(row.timestamp);
    const current = Date.parse(timestamp);
    if (current <= last) throw Error("SCHEDULE_EVENT_ORDER_INVALID");
    last = current;
    if (row.event === "open") {
      if (open !== null) throw Error("SCHEDULE_UNPAIRED_OPEN");
      open = timestamp;
    } else {
      if (open === null) throw Error("SCHEDULE_UNPAIRED_CLOSE");
      intervals.push({ openUtc: open, closeUtc: timestamp });
      open = null;
    }
    events.push({
      event: row.event, productCode: "NQ",
      sessionEndDate: expected.sessionEndDate,
      timestamp, tradingVenue: expected.tradingVenue,
    });
  }
  if (open !== null || intervals.length === 0) throw Error("SCHEDULE_UNPAIRED_OPEN");
  return { events, intervals };
}
