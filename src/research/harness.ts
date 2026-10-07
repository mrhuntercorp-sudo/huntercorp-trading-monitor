import type { MarketDataProvider } from "../market/types.js";

export interface ResearchWindow {
  fromMs: number;
  toMs: number;
}

export interface ResearchDatasetSummary {
  provider: string;
  barCount: number;
  firstTimestampMs: number | null;
  lastTimestampMs: number | null;
}

/**
 * First provider-neutral research boundary.
 * Strategy code will consume normalized bars rather than vendor payloads.
 */
export async function loadResearchWindow(
  provider: MarketDataProvider,
  window: ResearchWindow,
): Promise<ResearchDatasetSummary> {
  if (window.toMs <= window.fromMs) {
    throw new Error("Research window must end after it starts.");
  }

  const bars = await provider.getMinuteBars({
    productCode: "NQ",
    fromMs: window.fromMs,
    toMs: window.toMs,
  });

  for (let i = 1; i < bars.length; i += 1) {
    if (bars[i]!.timestampMs <= bars[i - 1]!.timestampMs) {
      throw new Error("Market bars must be strictly ascending with no duplicate timestamps.");
    }
  }

  return {
    provider: provider.name,
    barCount: bars.length,
    firstTimestampMs: bars[0]?.timestampMs ?? null,
    lastTimestampMs: bars.at(-1)?.timestampMs ?? null,
  };
}
