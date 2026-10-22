export const MAX_AMOUNT_CENTS = 100_000_000;

export type BrlParse =
  | { ok: true; cents: number }
  | { ok: false; reason: "invalid" | "too_big" };

export function parseBrlDetailed(input: string): BrlParse {
  const s = input.replace(/^\s*R\$\s*/i, "").trim();
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(s)) return { ok: false, reason: "invalid" };
  const [int, frac = ""] = s.replace(/\./g, "").split(",");
  const cents = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  if (cents <= 0) return { ok: false, reason: "invalid" };
  if (cents > MAX_AMOUNT_CENTS) return { ok: false, reason: "too_big" };
  return { ok: true, cents };
}

export function parseBrl(input: string): number | null {
  const r = parseBrlDetailed(input);
  return r.ok ? r.cents : null;
}

const UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function below1000(n: number): string {
  if (n === 100) return "cem";
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) parts.push(r < 20 ? UNITS[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ` e ${UNITS[r % 10]}` : ""));
  return parts.join(" e ");
}

function integerToWords(n: number): string {
  if (n === 0) return "zero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "um milhão" : `${below1000(millions)} milhões`);
  if (thousands) parts.push(thousands === 1 ? "mil" : `${below1000(thousands)} mil`);
  if (rest) parts.push(below1000(rest));
  // "e" antes do último bloco quando ele é < 100 ou centena exata
  const joinLast = rest && (rest < 100 || rest % 100 === 0);
  const head = parts.slice(0, -1);
  const last = parts[parts.length - 1];
  if (!head.length) return last;
  return joinLast || (!rest && thousands && millions && (thousands < 100 || thousands % 100 === 0))
    ? `${head.join(" ")} e ${last}`
    : `${head.join(" ")} ${last}`;
}

export function valorPorExtenso(cents: number): string {
  const reais = Math.floor(cents / 100);
  const c = cents % 100;
  const parts: string[] = [];
  if (reais > 0 || c === 0) {
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? " de" : "";
    parts.push(`${integerToWords(reais)}${de} ${reais === 1 ? "real" : reais === 0 ? "real" : "reais"}`);
  }
  if (c > 0) parts.push(`${integerToWords(c)} ${c === 1 ? "centavo" : "centavos"}`);
  return parts.join(" e ");
}
