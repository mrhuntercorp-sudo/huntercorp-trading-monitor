import type { MinuteBar } from "../market/types.js";

export type MinuteQualityClassification =
  | "CACHE_FILE_ABSENT"
  | "UNEXPLAINED_BAR_ABSENCE"
  | "SCHEDULED_CLOSURE"
  | "SCHEDULE_UNVERIFIED"
  | "ROLLOVER_POLICY_REVIEW"
  | "OBSERVED_BAR";

export interface MinuteQualityEvidence {
  cacheFileExists: boolean;
  schedule: "OPEN" | "CLOSED" | "UNVERIFIED";
  rolloverPolicyVerified: boolean;
  bar?: MinuteBar;
}

/**
 * Conservative evidence classification. Does not infer data corruption from a
 * no-trade minute or infer a verified complete session from a present bar.
 * Callers must supply independently verified exchange schedule evidence.
 */
export function classifyMinuteQuality(evidence: MinuteQualityEvidence): MinuteQualityClassification {
  if (!evidence.rolloverPolicyVerified) return "ROLLOVER_POLICY_REVIEW";
  if (evidence.schedule === "UNVERIFIED") return "SCHEDULE_UNVERIFIED";
  if (evidence.schedule === "CLOSED") return "SCHEDULED_CLOSURE";
  if (!evidence.cacheFileExists) return "CACHE_FILE_ABSENT";
  return evidence.bar ? "OBSERVED_BAR" : "UNEXPLAINED_BAR_ABSENCE";
}

export function canApproveSessionCompleteness(
  classifications: readonly MinuteQualityClassification[],
): boolean {
  // Presence of bars is not proof that no-trade intervals were handled.
  // The caller must provide every minute in an independently verified schedule.
  return classifications.length > 0 && classifications.every(
    classification => classification === "OBSERVED_BAR" || classification === "SCHEDULED_CLOSURE",
  );
}
