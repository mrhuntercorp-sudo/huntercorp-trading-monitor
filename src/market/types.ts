export type FuturesProduct = "NQ";

export interface FuturesContract {
  ticker: string;
  productCode: FuturesProduct;
  firstTradeDate?: string;
  lastTradeDate?: string;
  settlementDate?: string;
  tradeTickSize?: number;
}

export interface MinuteBar {
  contractTicker: string;
  productCode: FuturesProduct;
  /** UTC epoch milliseconds at the start of the bar. */
  timestampMs: number;
  sessionEndDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalBarRequest {
  productCode: FuturesProduct;
  fromMs: number;
  toMs: number;
}

export interface MarketDataProvider {
  readonly name: string;

  /** Resolve the actual listed contract to research for a specific trade date. */
  resolveContract(productCode: FuturesProduct, tradeDate: string): Promise<FuturesContract>;

  /** Return normalized one-minute bars in ascending UTC timestamp order. */
  getMinuteBars(request: HistoricalBarRequest): Promise<MinuteBar[]>;
}
