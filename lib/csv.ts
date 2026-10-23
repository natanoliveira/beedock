const BOM = "﻿";

// Excel executa células que começam com = + - @ (injeção de fórmula); o apóstrofo as torna texto.
function cell(v: string | number | null): string {
  if (v === null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** CSV pt-BR para Excel: BOM, `;`, CRLF. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return BOM + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export function csvMoney(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export const csvDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
