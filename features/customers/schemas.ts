import { z } from "zod";
import { optional, pageParam, textParam } from "@/features/shared/zod";
import { isValidDocument, onlyDigits } from "@/lib/document";

export const phoneField = z
  .string("Informe o WhatsApp.")
  .transform(onlyDigits)
  .pipe(z.string().min(10, "Informe DDD e número.").max(11, "Número com mais dígitos que o permitido."));

export const nameField = z
  .string("Informe o nome.")
  .trim()
  .min(2, "Mínimo de 2 caracteres.")
  .max(120, "Máximo de 120 caracteres.");

export const customerSchema = z.object({
  name: nameField,
  phone: phoneField,
  email: optional(z.email("E-mail inválido.").max(120, "Máximo de 120 caracteres.")),
  document: optional(z.string().refine(isValidDocument, "CPF ou CNPJ inválido.").transform(onlyDigits)),
  address: optional(z.string().trim().max(200, "Máximo de 200 caracteres.")),
  note: optional(z.string().trim().max(500, "Máximo de 500 caracteres.")),
});
export type CustomerInput = z.output<typeof customerSchema>;

export const anonymizeSchema = z.object({
  reason: z
    .string("Informe o motivo.")
    .trim()
    .min(10, "Descreva o motivo (mínimo de 10 caracteres).")
    .max(500, "Máximo de 500 caracteres."),
});

export const customerFiltersSchema = z
  .object({ q: z.unknown().optional(), pagina: z.unknown().optional(), aba: z.unknown().optional() })
  .transform((v) => ({
    page: pageParam(v.pagina),
    ...(textParam(v.q) ? { q: textParam(v.q)! } : {}),
    ...(textParam(v.aba) === "revisar" ? { review: true as const } : {}),
  }));
export type CustomerFilters = z.output<typeof customerFiltersSchema>;
