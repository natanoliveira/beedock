import { z } from "zod";

export const LEGAL_PLACEHOLDER = "[PREENCHER";

export const publishLegalSchema = z.object({
  type: z.enum(["TERMS", "PRIVACY"]),
  content: z
    .string()
    .trim()
    .min(10, "Mínimo de 10 caracteres.")
    .max(100_000, "Máximo de 100.000 caracteres.")
    .refine((c) => !c.includes(LEGAL_PLACEHOLDER), "Substitua os trechos [PREENCHER …] antes de publicar."),
});
export type PublishLegalInput = z.infer<typeof publishLegalSchema>;

export const acceptTermsSchema = z.array(z.string().min(1)).min(1).max(2);
