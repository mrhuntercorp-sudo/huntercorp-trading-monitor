import type { MinuteBar } from "../market/types.js";
import { newYorkClock } from "../market/time.js";

export interface PriceRange { high: number; low: number; bars: number; }
export interface SessionFeatures {
  tradeDate: string;
  overnight: PriceRange | null;
  previousRth: PriceRange | null;
  opening5: PriceRange | null;
  opening15: PriceRange | null;
  rthBars: number;
}

function dateAfter(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function range(bars: MinuteBar[]): PriceRange | null {
  if (!bars.length) return null;
  return { high: Math.max(...bars.map(b => b.high)), low: Math.min(...bars.map(b => b.low)), bars: bars.length };
}
function clock(bar: MinuteBar) {
  const c = newYorkClock(bar.timestampMs);
  return { date: c.date, minutes: c.hour * 60 + c.minute };
}
function rth(bars: readonly MinuteBar[], date: string): MinuteBar[] {
  return bars.filter(b => { const c = clock(b); return c.date === date && c.minutes >= 570 && c.minutes < 960; });
}
/** Globex overnight: 18:00 ET previous calendar day through 09:29 ET trade date. */
export function overnightBars(bars: readonly MinuteBar[], tradeDate: string): MinuteBar[] {
  return bars.filter(b => {
    const c = clock(b);
    return (c.minutes >= 1080 && dateAfter(c.date) === tradeDate) ||
      (c.date === tradeDate && c.minutes < 570);
  });
}
export function buildSessionFeatures(
  bars: readonly MinuteBar[], tradeDate: string, previousTradeDate: string,
): SessionFeatures {
  const current = rth(bars, tradeDate);
  const previous = rth(bars, previousTradeDate);
  const opening = (minutes: number) => range(current.filter(b => clock(b).minutes < 570 + minutes));
  return {
    tradeDate,
    overnight: range(overnightBars(bars, tradeDate)),
    previousRth: range(previous),
    opening5: opening(5),
    opening15: opening(15),
    rthBars: current.length,
  };
}
