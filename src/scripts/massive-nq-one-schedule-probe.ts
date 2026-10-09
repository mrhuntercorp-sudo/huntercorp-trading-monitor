import { validateNqScheduleResponse } from "../research/nq-schedule-response.js";

const DATE = "2026-09-11";
const URL = "https://api.massive.com/futures/v1/schedules";
const key = process.env.MASSIVE_API_KEY?.trim();
if (!key) throw Error("MASSIVE_API_KEY_MISSING: set it locally in .env");
if (process.argv.length !== 3 || process.argv[2] !== "--execute-one-approved-request") {
  throw Error("EXPLICIT_EXECUTION_FLAG_REQUIRED: --execute-one-approved-request");
}

const url = new URL(URL);
url.searchParams.set("product_code", "NQ");
url.searchParams.set("session_end_date", DATE);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 12000);
console.log("TM001 SCHEDULE PROBE | ONE REQUEST | NO RETRIES | NO PAGINATION | NO CACHE WRITES");
console.log("PRODUCT NQ | SESSION_END_DATE " + DATE);
try {
  // Single call, including failures. Do not print key, URL with credentials, or raw response.
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: "Bearer " + key, Accept: "application/json" },
    signal: controller.signal,
    redirect: "error",
  });
  console.log("HTTP_STATUS " + response.status);
  if (!response.ok) {
    console.log("SCHEDULE_PROBE_STOPPED " + JSON.stringify({
      status: response.status,
      reason: response.status === 401 || response.status === 403 ? "ENTITLEMENT_OR_AUTH_REVIEW" :
        response.status === 429 ? "RATE_LIMIT_REVIEW" : "PROVIDER_RESPONSE_REVIEW",
      retry: false, additionalRequests: 0,
    }));
    process.exitCode = 1;
  } else {
    const raw = await response.text();
    if (raw.length > 1_000_000) throw Error("SCHEDULE_RESPONSE_TOO_LARGE");
    const payload = JSON.parse(raw) as unknown;
    const result = validateNqScheduleResponse(payload, {
      sessionEndDate: DATE, tradingVenue: "XCME",
    });
    console.log("SCHEDULE_PROBE_RESULT " + JSON.stringify({
      status: "VALIDATED_RESPONSE_FORMAT", productCode: "NQ", sessionEndDate: DATE,
      venue: "XCME", events: result.events.length, intervals: result.intervals,
      independentlyExchangeVerified: false, completenessCertified: false,
      requestsMade: 1, cacheWrites: 0, retries: 0,
      warning: "Provider schedule format validated; exchange accuracy and trade-date mapping remain unverified.",
    }));
  }
} finally {
  clearTimeout(timeout);
}
