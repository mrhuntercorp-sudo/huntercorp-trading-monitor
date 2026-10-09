export type ScheduleEvent = {
  event: "pre_open" | "open" | "close";
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
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/.test(value)) throw Error("INVALID_UTC_TIMESTAMP");
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
  let pendingPreOpen = false;
  const parsed: Array<{ row: Record<string, unknown>; timestamp: string }> = [];
  for (const item of obj.results) {
    const row = record(item);
    if (row.product_code !== "NQ" || row.session_end_date !== expected.sessionEndDate ||
        row.trading_venue !== expected.tradingVenue) throw Error("SCHEDULE_IDENTITY_MISMATCH");
    if (row.event !== "pre_open" && row.event !== "open" && row.event !== "close") throw Error("SCHEDULE_UNSUPPORTED_EVENT");
    const timestamp = utcTimestamp(row.timestamp);
    parsed.push({ row, timestamp });
  }
  // Provider response array order is not assumed to be chronological. Validate identity and timestamps first,
  // then sort a private normalized copy; equal timestamps remain invalid because ordering is ambiguous.
  parsed.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i]!.timestamp === parsed[i - 1]!.timestamp) {
      const timestamp = parsed[i]!.timestamp;
      const collidingEvents = parsed.filter(item => item.timestamp === timestamp)
        .map(item => item.row.event as ScheduleEvent["event"]).sort();
      // Validated event names and normalized UTC time only; no raw response or credentials.
      const classification = collidingEvents.every(event => event === "pre_open")
        ? "DUPLICATE_PRE_OPEN_TIMESTAMP_REVIEW"
        : "MIXED_OR_OTHER_TIMESTAMP_COLLISION_REVIEW";
      throw Error("SCHEDULE_EVENT_TIMESTAMP_COLLISION " + JSON.stringify({ timestamp, events: collidingEvents, classification }));
    }
  }
  for (const { row, timestamp } of parsed) {
    if (row.event === "pre_open") {
      if (open !== null || pendingPreOpen) throw Error("SCHEDULE_INVALID_PRE_OPEN");
      pendingPreOpen = true;
    } else if (row.event === "open") {
      pendingPreOpen = false;
      if (open !== null) throw Error("SCHEDULE_UNPAIRED_OPEN");
      open = timestamp;
    } else {
      if (open === null) throw Error("SCHEDULE_UNPAIRED_CLOSE");
      intervals.push({ openUtc: open, closeUtc: timestamp });
      open = null;
    }
    events.push({
      event: row.event as ScheduleEvent["event"], productCode: "NQ",
      sessionEndDate: expected.sessionEndDate,
      timestamp, tradingVenue: expected.tradingVenue,
    });
  }
  if (pendingPreOpen) throw Error("SCHEDULE_UNPAIRED_PRE_OPEN");
  if (open !== null || intervals.length === 0) throw Error("SCHEDULE_UNPAIRED_OPEN");
  return { events, intervals };
}
