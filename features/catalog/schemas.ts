import { z } from "zod";

const name = z
  .string("Informe o nome.")
  .trim()
  .min(2, "Mínimo de 2 caracteres.")
  .max(40, "Máximo de 40 caracteres.");

export const categorySchema = z.object({
  name,
  type: z.enum(["INCOME", "EXPENSE"], "Escolha entrada ou saída."),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const paymentMethodSchema = z.object({ name });
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

export const productTypeSchema = z.object({ name });
export type ProductTypeInput = z.infer<typeof productTypeSchema>;
