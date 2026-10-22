import { z } from "zod";
import { isValidDocument, onlyDigits } from "@/lib/document";
import { parseBrl, parseBrlDetailed } from "./money";
import { parseYearMonth, type YearMonth } from "./period";

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

const AMOUNT_MSG = "Informe um valor maior que zero.";

const isRealDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
};

export const transactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"], "Escolha entrada ou saída."),
    amount: z
      .string(AMOUNT_MSG)
      .superRefine((v, ctx) => {
        const r = parseBrlDetailed(v);
        if (!r.ok) {
          ctx.addIssue({
            code: "custom",
            message: r.reason === "too_big" ? "Valor máximo de R$ 1.000.000,00." : AMOUNT_MSG,
          });
        }
      }),
    occurredOn: z
      .string("Informe a data.")
      .refine(isRealDate, "Informe uma data válida."),
    categoryId: z.string("Escolha uma categoria.").min(1, "Escolha uma categoria."),
    paymentMethodId: optional(z.string()),
    description: z
      .string("Informe a descrição.")
      .trim()
      .min(2, "Mínimo de 2 caracteres.")
      .max(120, "Máximo de 120 caracteres."),
    payerName: optional(z.string().trim().max(120, "Máximo de 120 caracteres.")),
    payerDocument: optional(
      z
        .string()
        .refine(isValidDocument, "CPF ou CNPJ inválido.")
        .transform(onlyDigits),
    ),
    keepPayerDocument: z.preprocess(
      (v) => (v === true || v === "1" || v === "on" || v === "true" ? true : undefined),
      z.literal(true).optional(),
    ),
    removeReceipt: z.preprocess(
      (v) => (v === true || v === "on" || v === "true" ? true : undefined),
      z.literal(true).optional(),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.type === "EXPENSE" && (v.payerName || v.payerDocument)) {
      ctx.addIssue({
        code: "custom",
        path: [v.payerName ? "payerName" : "payerDocument"],
        message: "Saída não tem pagador.",
      });
    }
  })
  .transform(({ amount, ...rest }) => ({ ...rest, amountCents: parseBrl(amount)! }));
export type TransactionInput = z.output<typeof transactionSchema>;

const param = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

export const listFiltersSchema = z
  .object({
    mes: z.unknown().optional(),
    tipo: z.unknown().optional(),
    categoria: z.unknown().optional(),
    pagina: z.unknown().optional(),
  })
  .transform((v) => {
    const page = Number(param(v.pagina));
    const tipo = param(v.tipo);
    const out: {
      month?: YearMonth;
      type?: "INCOME" | "EXPENSE";
      categoryId?: string;
      page: number;
    } = { page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1 };
    const month = parseYearMonth(param(v.mes));
    if (month) out.month = month;
    if (tipo === "entrada") out.type = "INCOME";
    else if (tipo === "saida") out.type = "EXPENSE";
    const categoryId = param(v.categoria);
    if (categoryId) out.categoryId = categoryId;
    return out;
  });
export type ListFilters = z.output<typeof listFiltersSchema>;
