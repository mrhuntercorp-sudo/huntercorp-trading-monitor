import { NQ_SPEC } from "../market/nq-spec.js";

export interface FrictionModel {
  roundTripCommissionUsd: number;
  slippageTicksPerSide: number;
}

export function roundTripFrictionUsd(model: FrictionModel, contracts = 1): number {
  if (model.roundTripCommissionUsd < 0 || model.slippageTicksPerSide < 0) {
    throw new Error("Trading frictions cannot be negative.");
  }
  const slippage =
    model.slippageTicksPerSide * 2 * NQ_SPEC.tickValueUsd * contracts;
  return model.roundTripCommissionUsd * contracts + slippage;
}
