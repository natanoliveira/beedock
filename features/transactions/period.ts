export type YearMonth = { year: number; month: number };

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function shiftMonth(ref: YearMonth, delta: number): YearMonth {
  const idx = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (((idx % 12) + 12) % 12) + 1 };
}

export function currentFinancialMonth(startDay: number, timezone: string, now: Date = new Date()): YearMonth {
  const [y, m, d] = todayIn(timezone, now).split("-").map(Number);
  const civil = { year: y, month: m };
  return d >= startDay ? civil : shiftMonth(civil, -1);
}

export function financialMonthRange(ref: YearMonth, startDay: number): { from: string; to: string } {
  const from = iso(ref.year, ref.month, startDay);
  if (startDay === 1) {
    const last = new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();
    return { from, to: iso(ref.year, ref.month, last) };
  }
  const next = shiftMonth(ref, 1);
  return { from, to: iso(next.year, next.month, startDay - 1) };
}

export function parseYearMonth(v: string | undefined): YearMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { year, month };
}

export const formatYearMonth = (ym: YearMonth): string => `${ym.year}-${pad(ym.month)}`;

export function monthLabel(ref: YearMonth, startDay: number): { title: string; range: string | null } {
  const title = `${MONTHS[ref.month - 1]} de ${ref.year}`;
  if (startDay === 1) return { title, range: null };
  const next = shiftMonth(ref, 1);
  return { title, range: `${startDay}/${ref.month} a ${startDay - 1}/${next.month}` };
}
