export const NQ_SPEC = {
  productCode: "NQ",
  pointValueUsd: 20,
  tickSizePoints: 0.25,
  tickValueUsd: 5,
  regularOpenEt: "09:30",
  globexOpenEt: "18:00",
  globexCloseEt: "17:00",
} as const;

export function pointsToUsd(points: number, contracts = 1): number {
  if (!Number.isFinite(points) || !Number.isInteger(contracts) || contracts <= 0) {
    throw new Error("Invalid NQ P&L input.");
  }
  return points * NQ_SPEC.pointValueUsd * contracts;
}
