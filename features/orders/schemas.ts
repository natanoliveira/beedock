import { z } from "zod";
import { nameField, phoneField } from "@/features/customers/schemas";
import { amountField, dateField, optional, pageParam, textParam } from "@/features/shared/zod";
import { parseBrl } from "@/features/transactions/money";

const cents = (v: string) => parseBrl(v)!;

const orderBase = z.object({
  customerId: optional(z.string()),
  productTypeId: z.string("Escolha o tipo de produto.").min(1, "Escolha o tipo de produto."),
  description: z
    .string("Informe a descrição.")
    .trim()
    .min(2, "Mínimo de 2 caracteres.")
    .max(200, "Máximo de 200 caracteres."),
  total: amountField,
  dueDate: dateField,
});

export const orderUpdateSchema = orderBase
  .refine((v) => !!v.customerId, { path: ["customerId"], message: "Escolha o cliente." })
  .transform(({ total, ...rest }) => ({ ...rest, customerId: rest.customerId!, totalCents: cents(total) }));
export type OrderUpdateInput = z.output<typeof orderUpdateSchema>;

export const orderSchema = orderBase
  .extend({
    newCustomerName: optional(nameField),
    newCustomerPhone: optional(phoneField),
    depositAmount: optional(amountField),
    depositPaymentMethodId: optional(z.string()),
    depositPaidAt: optional(dateField),
  })
  .superRefine((v, ctx) => {
    const isNew = v.newCustomerName !== undefined || v.newCustomerPhone !== undefined;
    if (!v.customerId && !isNew) ctx.addIssue({ code: "custom", path: ["customerId"], message: "Escolha o cliente." });
    if (v.customerId && isNew) {
      ctx.addIssue({ code: "custom", path: ["customerId"], message: "Escolha um cliente ou crie um novo, não os dois." });
    }
    if (isNew && !v.newCustomerName) ctx.addIssue({ code: "custom", path: ["newCustomerName"], message: "Informe o nome." });
    if (isNew && !v.newCustomerPhone) {
      ctx.addIssue({ code: "custom", path: ["newCustomerPhone"], message: "Informe o WhatsApp." });
    }
    if (v.depositAmount !== undefined) {
      if (!v.depositPaymentMethodId) {
        ctx.addIssue({ code: "custom", path: ["depositPaymentMethodId"], message: "Escolha a forma de pagamento." });
      }
      if (!v.depositPaidAt) ctx.addIssue({ code: "custom", path: ["depositPaidAt"], message: "Informe a data." });
      const total = parseBrl(v.total);
      const dep = parseBrl(v.depositAmount);
      if (total !== null && dep !== null && dep > total) {
        ctx.addIssue({ code: "custom", path: ["depositAmount"], message: "O sinal não pode passar do total." });
      }
    }
  })
  .transform((v) => ({
    customerId: v.customerId,
    newCustomer: v.newCustomerName ? { name: v.newCustomerName, phone: v.newCustomerPhone! } : undefined,
    productTypeId: v.productTypeId,
    description: v.description,
    totalCents: cents(v.total),
    dueDate: v.dueDate,
    deposit:
      v.depositAmount !== undefined
        ? { amountCents: cents(v.depositAmount), paymentMethodId: v.depositPaymentMethodId!, paidAt: v.depositPaidAt! }
        : undefined,
  }));
/** Chaves opcionais ausentes (não `undefined` obrigatório) para os services serem chamados fora do form. */
export type OrderInput = {
  customerId?: string;
  newCustomer?: { name: string; phone: string };
  productTypeId: string;
  description: string;
  totalCents: number;
  dueDate: string;
  deposit?: PaymentInput;
};

export const paymentSchema = z
  .object({
    amount: amountField,
    paymentMethodId: z.string("Escolha a forma de pagamento.").min(1, "Escolha a forma de pagamento."),
    paidAt: dateField,
  })
  .transform(({ amount, ...rest }) => ({ amountCents: cents(amount), ...rest }));
export type PaymentInput = z.output<typeof paymentSchema>;

export const cancelSchema = z
  .object({
    reason: optional(z.string().trim().max(500, "Máximo de 500 caracteres.")),
    refundAmount: optional(amountField),
    refundPaymentMethodId: optional(z.string()),
    refundPaidAt: optional(dateField),
  })
  .superRefine((v, ctx) => {
    if (v.refundAmount === undefined) return;
    if (!v.refundPaymentMethodId) {
      ctx.addIssue({ code: "custom", path: ["refundPaymentMethodId"], message: "Escolha a forma de pagamento." });
    }
    if (!v.refundPaidAt) ctx.addIssue({ code: "custom", path: ["refundPaidAt"], message: "Informe a data." });
  })
  .transform((v) => ({
    ...(v.reason ? { reason: v.reason } : {}),
    ...(v.refundAmount !== undefined
      ? {
          refund: {
            amountCents: cents(v.refundAmount),
            paymentMethodId: v.refundPaymentMethodId!,
            paidAt: v.refundPaidAt!,
          },
        }
      : {}),
  }));
export type CancelInput = z.output<typeof cancelSchema>;

export const ORDER_STATUS_FILTERS = ["em-andamento", "entregues", "cancelados", "a-receber", "todos"] as const;
export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];

export const orderFiltersSchema = z
  .object({
    status: z.unknown().optional(),
    q: z.unknown().optional(),
    tipo: z.unknown().optional(),
    pagina: z.unknown().optional(),
  })
  .transform((v) => {
    const status = ORDER_STATUS_FILTERS.find((s) => s === textParam(v.status)) ?? "em-andamento";
    return {
      status,
      ...(textParam(v.q) ? { q: textParam(v.q)! } : {}),
      ...(textParam(v.tipo) ? { productTypeId: textParam(v.tipo)! } : {}),
      page: pageParam(v.pagina),
    };
  });
export type OrderFilters = z.output<typeof orderFiltersSchema>;
