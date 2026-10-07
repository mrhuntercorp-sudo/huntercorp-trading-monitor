import type {
  FuturesContract, FuturesProduct, HistoricalBarRequest, MarketDataProvider, MinuteBar,
} from "../market/types.js";

const BASE_URL = "https://api.massive.com";
interface MassiveContract { ticker?:string; first_trade_date?:string; last_trade_date?:string; settlement_date?:string; trade_tick_size?:number; days_to_maturity?:number; }
interface MassiveAgg { ticker?:string; open?:number; high?:number; low?:number; close?:number; volume?:number; window_start?:number; session_end_date?:string; }
interface MassiveResponse<T> { results?:T[]; next_url?:string; }

export class MassiveHistoricalProvider implements MarketDataProvider {
  readonly name = "massive";
  constructor(private readonly apiKey:string) {
    if (!apiKey.trim()) throw new Error("Massive API key is required.");
  }
  private async get<T>(url:URL):Promise<MassiveResponse<T>> {
    url.searchParams.set("apiKey",this.apiKey);
    const response=await fetch(url);
    if(!response.ok) throw new Error(`Massive HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
    return await response.json() as MassiveResponse<T>;
  }
  async resolveContract(productCode:FuturesProduct,tradeDate:string):Promise<FuturesContract> {
    const url=new URL("/futures/v1/contracts",BASE_URL);
    url.searchParams.set("product_code",productCode); url.searchParams.set("date",tradeDate);
    url.searchParams.set("type","single"); url.searchParams.set("limit","100");
    const payload=await this.get<MassiveContract>(url);
    const candidates=(payload.results??[]).filter(c=>c.ticker && c.days_to_maturity!=null && c.days_to_maturity>=0)
      .sort((a,b)=>a.days_to_maturity!-b.days_to_maturity!);
    const selected=candidates[0];
    if(!selected?.ticker) throw new Error(`No active ${productCode} contract found for ${tradeDate}.`);
    return {ticker:selected.ticker,productCode,
      ...(selected.first_trade_date?{firstTradeDate:selected.first_trade_date}:{}),
      ...(selected.last_trade_date?{lastTradeDate:selected.last_trade_date}:{}),
      ...(selected.settlement_date?{settlementDate:selected.settlement_date}:{}),
      ...(selected.trade_tick_size!=null?{tradeTickSize:selected.trade_tick_size}:{})};
  }
  async getContractMinuteBars(contract:FuturesContract,fromDate:string,toDate:string):Promise<MinuteBar[]> {
    let next:URL|null=new URL(`/futures/v1/aggs/${encodeURIComponent(contract.ticker)}`,BASE_URL);
    next.searchParams.set("resolution","1min"); next.searchParams.set("window_start.gte",fromDate);
    next.searchParams.set("window_start.lt", new Date(Date.parse(toDate + "T00:00:00Z") + 86400000).toISOString().slice(0,10)); next.searchParams.set("limit","50000");
    next.searchParams.set("sort","window_start.asc");
    const bars:MinuteBar[]=[];
    while(next){
      const payload: MassiveResponse<MassiveAgg> = await this.get<MassiveAgg>(next);
      for(const row of payload.results??[]){
        if(row.window_start==null||row.open==null||row.high==null||row.low==null||row.close==null||row.volume==null||!row.session_end_date) continue;
        bars.push({contractTicker:row.ticker??contract.ticker,productCode:contract.productCode,
          timestampMs:Math.floor(row.window_start/1_000_000),sessionEndDate:row.session_end_date,
          open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume});
      }
      next=payload.next_url?new URL(payload.next_url):null;
    }
    return bars.sort((a,b)=>a.timestampMs-b.timestampMs);
  }
  async getMinuteBars(_request:HistoricalBarRequest):Promise<MinuteBar[]> {
    throw new Error("Use resolveContract + getContractMinuteBars until rollover-aware multi-contract retrieval is implemented.");
  }
}
