// Provisional calendar policy for offline research planning only.
// These are review markers, NOT verified exchange hours or an approved causal roll.
export const provisionalClosedDates = new Set(["2026-07-03", "2026-09-07"]);
export const provisionalRollDates = ["2026-06-15", "2026-09-14"] as const;
export function provisionalNqContract(date: string): "NQM6" | "NQU6" | "NQZ6" {
  if (!/^2026-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) throw Error("INVALID_DATE");
  return date < "2026-06-15" ? "NQM6" : date < "2026-09-14" ? "NQU6" : "NQZ6";
}
export function isProvisionalRoll(date: string): boolean {
  return provisionalRollDates.some(d => d === date);
}
