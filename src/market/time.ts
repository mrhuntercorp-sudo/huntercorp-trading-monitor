const NEW_YORK = "America/New_York";

export interface NewYorkClock {
  date: string;
  hour: number;
  minute: number;
  weekday: string;
}

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: NEW_YORK,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

export function newYorkClock(timestampMs: number): NewYorkClock {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestampMs)).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday!,
  };
}

export function minutesAfterEt(timestampMs: number, hour: number, minute: number): number {
  const clock = newYorkClock(timestampMs);
  return clock.hour * 60 + clock.minute - (hour * 60 + minute);
}
