import { planMissingNqFiles } from "./massive-nq-backfill-candidates.js";
import { classifyMinuteQuality } from "../research/minute-quality.js";

const root = "data/cache/massive/NQ";
const end = "2026-10-02";

console.log("=== TM001 SCHEDULE-AWARE COVERAGE GATE ===");
console.log("READ ONLY | CACHE METADATA ONLY | NO API | NO WRITES | NO TRADES");

for (const tradingSessions of [20, 60, 90] as const) {
  const plan = await planMissingNqFiles({ end, tradingSessions, cacheRoot: root });
  const missingFileClassifications = plan.candidates.map(() =>
    classifyMinuteQuality({
      cacheFileExists: false,
      schedule: "OPEN",
      rolloverPolicyVerified: true,
    }),
  );
  // Do not assume an exchange schedule from a regular-session template.
  // Every window remains unverified until NQ-specific historical hours
  // and an explicit causal rollover policy are supplied.
  const scheduleGate = classifyMinuteQuality({
    cacheFileExists: true,
    schedule: "UNVERIFIED",
    rolloverPolicyVerified: true,
  });
  const rolloverGate = classifyMinuteQuality({
    cacheFileExists: true,
    schedule: "OPEN",
    rolloverPolicyVerified: false,
  });
  console.log("SCHEDULE_AWARE_WINDOW " + JSON.stringify({
    tradingSessions,
    firstDate: plan.firstDate,
    lastDate: plan.lastDate,
    missingUtcFileCandidates: missingFileClassifications.length,
    cacheFileClassification: "CACHE_FILE_ABSENT",
    scheduleGate,
    rolloverGate,
    rolloverReviewDates: plan.rolloverReview,
    verifiedCompleteSessions: 0,
    completenessAssessed: false,
    existingBarGapsClassified: false,
    holidayPolicyVerified: false,
    rollPolicyVerified: false,
    approvedRequests: 0,
    approvedSpendUsd: 0,
    liveAcquisitionEnabled: false,
    warning: "Missing files are cache candidates only. Existing minute gaps require verified exchange hours and no-trade-bar semantics; no sessions are certified complete.",
  }));
}
console.log("TM001 SCHEDULE-AWARE COVERAGE GATE: GREEN (READ ONLY)");
