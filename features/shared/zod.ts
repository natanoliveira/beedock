import { z } from "zod";
import { parseBrlDetailed } from "@/features/transactions/money";

export const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

export const AMOUNT_MSG = "Informe um valor maior que zero.";

export const isRealDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
};

/** Texto em reais ("1.234,56"); a conversão para centavos fica no transform do schema dono. */
export const amountField = z.string(AMOUNT_MSG).superRefine((v, ctx) => {
  const r = parseBrlDetailed(v);
  if (!r.ok) {
    ctx.addIssue({
      code: "custom",
      message: r.reason === "too_big" ? "Valor máximo de R$ 1.000.000,00." : AMOUNT_MSG,
    });
  }
});

export const dateField = z.string("Informe a data.").refine(isRealDate, "Informe uma data válida.");

/** Página da URL: inteiro 1..10000, senão 1. */
export const pageParam = (v: unknown) => {
  const n = Number(typeof v === "string" ? v.trim() : undefined);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
};

export const textParam = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
