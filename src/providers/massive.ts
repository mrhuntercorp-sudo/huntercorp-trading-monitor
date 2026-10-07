import type {
  FuturesContract,
  FuturesProduct,
  HistoricalBarRequest,
  MarketDataProvider,
  MinuteBar,
} from "../market/types.js";

/**
 * Massive REST adapter boundary.
 *
 * Deliberately contains no embedded API key and no strategy logic.
 * Authentication will be injected at runtime through environment configuration.
 *
 * Implementation gate:
 * - resolve the listed NQ contract for each trade date;
 * - fetch minute aggregates for that contract;
 * - normalize Massive nanosecond/UTC fields to MinuteBar;
 * - respect provider pagination and rate limits;
 * - never synthesize a continuous contract by blindly concatenating expiries.
 */
export class MassiveHistoricalProvider implements MarketDataProvider {
  readonly name = "massive";

  async resolveContract(
    _productCode: FuturesProduct,
    _tradeDate: string,
  ): Promise<FuturesContract> {
    throw new Error("Massive contract resolution not implemented yet.");
  }

  async getMinuteBars(_request: HistoricalBarRequest): Promise<MinuteBar[]> {
    throw new Error("Massive minute-bar retrieval not implemented yet.");
  }
}
