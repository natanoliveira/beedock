import { z } from "zod";
import { isValidDocument, onlyDigits } from "@/lib/document";
import { amountField, dateField, optional, textParam } from "@/features/shared/zod";
import { parseBrl } from "./money";
import { parseYearMonth, type YearMonth } from "./period";

export const transactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"], "Escolha entrada ou saída."),
    amount: amountField,
    occurredOn: dateField,
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

const param = textParam;

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
