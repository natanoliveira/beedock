import { FieldError, NotFoundError, RuleError } from "@/features/platform/errors";
import { todayIn } from "@/features/transactions/period";
import { getFinancialSettings } from "@/features/transactions/service";
import { appendAudit, authorize, diff, type TenantContext } from "@/lib/audit";
import { withScope, type Tx } from "@/lib/db";
import { balanceCents, formatBrl } from "./rules";
import type { PaymentInput } from "./schemas";

export const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** Nome do campo do formulário: "" + amount → amount; "deposit" + amount → depositAmount. */
export const fieldName = (prefix: string, base: string) =>
  prefix ? `${prefix}${base[0].toUpperCase()}${base.slice(1)}` : base;

export type OrderRef = { id: string; number: number; description: string; totalCents: number };

/** Forma de pagamento existente, ativa (ou a atual, na edição) e data não futura. */
export async function checkMoneyRefs(
  tx: Tx,
  input: { paymentMethodId: string; paidAt: string },
  timezone: string,
  prefix: string,
  currentMethodId?: string,
) {
  const pm = await tx.paymentMethod.findFirst({
    where: { id: input.paymentMethodId, deletedAt: null },
    select: { active: true },
  });
  const field = fieldName(prefix, "paymentMethodId");
  if (!pm) throw new FieldError(field, "Forma de pagamento inválida.");
  if (!pm.active && input.paymentMethodId !== currentMethodId) {
    throw new FieldError(field, "Esta forma de pagamento está desativada.");
  }
  if (input.paidAt > todayIn(timezone)) throw new FieldError(fieldName(prefix, "paidAt"), "A data não pode ser futura.");
}

export async function systemCategoryId(tx: Tx, key: "ORDER_PAYMENT" | "ORDER_REFUND"): Promise<string> {
  const c = await tx.category.findFirst({ where: { systemKey: key, deletedAt: null }, select: { id: true } });
  if (!c) throw new RuleError("Categoria do sistema não encontrada. Fale com o suporte.");
  return c.id;
}

export const paidCents = async (tx: Tx, orderId: string, exceptPaymentId?: string): Promise<number> =>
  (
    await tx.orderPayment.aggregate({
      where: { orderId, deletedAt: null, ...(exceptPaymentId ? { NOT: { id: exceptPaymentId } } : {}) },
      _sum: { amountCents: true },
    })
  )._sum.amountCents ?? 0;

/** Descrição do lançamento ligado, no máximo 120 caracteres como nos lançamentos manuais. */
export const paymentDescription = (o: OrderRef) => {
  const head = `Recebimento pedido #${o.number} — `;
  return head + o.description.slice(0, 120 - head.length);
};

/**
 * Recebimento + lançamento INCOME ligado, na transação do chamador, com os eventos. O chamador já
 * travou o pedido (FOR UPDATE ou criação na mesma tx).
 */
export async function createLinkedPayment(
  tx: Tx,
  ctx: TenantContext,
  order: OrderRef,
  payerName: string,
  input: PaymentInput,
  timezone: string,
  prefix = "",
): Promise<{ id: string; transactionId: string }> {
  await checkMoneyRefs(tx, input, timezone, prefix);
  const already = await paidCents(tx, order.id);
  if (input.amountCents > balanceCents(order.totalCents, already)) {
    throw new FieldError(
      fieldName(prefix, "amount"),
      `O valor passa do saldo do pedido (saldo ${formatBrl(balanceCents(order.totalCents, already))}).`,
    );
  }
  const categoryId = await systemCategoryId(tx, "ORDER_PAYMENT");
  const t = await tx.transaction.create({
    data: {
      type: "INCOME",
      amountCents: input.amountCents,
      occurredOn: toDate(input.paidAt),
      categoryId,
      paymentMethodId: input.paymentMethodId,
      description: paymentDescription(order),
      payerName,
      orderId: order.id,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  const p = await tx.orderPayment.create({
    data: {
      orderId: order.id,
      paymentMethodId: input.paymentMethodId,
      transactionId: t.id,
      amountCents: input.amountCents,
      paidAt: toDate(input.paidAt),
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  await appendAudit(tx, ctx, {
    action: "order_payment.create",
    entityType: "OrderPayment",
    entityId: p.id,
    after: { orderId: order.id, amountCents: p.amountCents, paidAt: input.paidAt, paymentMethodId: p.paymentMethodId },
  });
  await appendAudit(tx, ctx, {
    action: "transaction.create",
    entityType: "Transaction",
    entityId: t.id,
    after: {
      type: t.type,
      amountCents: t.amountCents,
      occurredOn: input.paidAt,
      categoryId,
      paymentMethodId: t.paymentMethodId,
      description: t.description,
      payerName: t.payerName,
      orderId: order.id,
    },
  });
  return { id: p.id, transactionId: t.id };
}

const lockOrder = (tx: Tx, id: string) => tx.$executeRaw`SELECT 1 FROM "Order" WHERE id = ${id} FOR UPDATE`;

/** Trava o pedido e recusa excluído (NotFound) ou cancelado (somente leitura). */
async function lockActiveOrder(tx: Tx, orderId: string) {
  await lockOrder(tx, orderId);
  const order = await tx.order.findFirst({ where: { id: orderId, deletedAt: null }, include: { customer: true } });
  if (!order) throw new NotFoundError("Pedido não encontrado.");
  if (order.status === "CANCELED") throw new RuleError("Pedido cancelado não aceita alterações de recebimento.");
  return order;
}

/** O pedido do recebimento, sem travar; o chamador trava o pedido e relê o recebimento. */
async function orderIdOfPayment(tx: Tx, paymentId: string): Promise<string> {
  const p = await tx.orderPayment.findFirst({ where: { id: paymentId, deletedAt: null }, select: { orderId: true } });
  if (!p) throw new NotFoundError("Recebimento não encontrado.");
  return p.orderId;
}

const txSnapshot = (t: { amountCents: number; occurredOn: Date; paymentMethodId: string | null; orderId: string | null }) => ({
  amountCents: t.amountCents,
  occurredOn: toIso(t.occurredOn),
  paymentMethodId: t.paymentMethodId,
  orderId: t.orderId,
});

const paymentSnapshot = (p: { amountCents: number; paidAt: Date; paymentMethodId: string }) => ({
  amountCents: p.amountCents,
  paidAt: toIso(p.paidAt),
  paymentMethodId: p.paymentMethodId,
});

export async function registerPayment(ctx: TenantContext, orderId: string, input: PaymentInput): Promise<{ id: string }> {
  await authorize(ctx, "order.update");
  const { timezone } = await getFinancialSettings(ctx);
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const order = await lockActiveOrder(tx, orderId);
    const { id } = await createLinkedPayment(tx, ctx, order, order.customer.name, input, timezone);
    return { id };
  });
}

export async function updatePayment(ctx: TenantContext, paymentId: string, input: PaymentInput): Promise<void> {
  await authorize(ctx, "order.update");
  const { timezone } = await getFinancialSettings(ctx);
  await withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const order = await lockActiveOrder(tx, await orderIdOfPayment(tx, paymentId));
    const existing = await tx.orderPayment.findFirst({
      where: { id: paymentId, deletedAt: null },
      include: { transaction: true },
    });
    if (!existing) throw new NotFoundError("Recebimento não encontrado.");
    await checkMoneyRefs(tx, input, timezone, "", existing.paymentMethodId);
    const others = await paidCents(tx, order.id, paymentId);
    if (others + input.amountCents > order.totalCents) {
      throw new FieldError(
        "amount",
        `O valor passa do saldo do pedido (saldo ${formatBrl(balanceCents(order.totalCents, others))}).`,
      );
    }
    const data = { amountCents: input.amountCents, paymentMethodId: input.paymentMethodId, updatedById: ctx.userId };
    const p = await tx.orderPayment.update({ where: { id: paymentId }, data: { ...data, paidAt: toDate(input.paidAt) } });
    const t = await tx.transaction.update({
      where: { id: existing.transactionId },
      data: { ...data, occurredOn: toDate(input.paidAt) },
    });
    await appendAudit(tx, ctx, {
      action: "order_payment.update",
      entityType: "OrderPayment",
      entityId: paymentId,
      ...diff(paymentSnapshot(existing), paymentSnapshot(p)),
    });
    await appendAudit(tx, ctx, {
      action: "transaction.update",
      entityType: "Transaction",
      entityId: t.id,
      ...diff(txSnapshot(existing.transaction), txSnapshot(t)),
    });
  });
}

export async function deletePayment(ctx: TenantContext, paymentId: string): Promise<void> {
  await authorize(ctx, "order.delete");
  await withScope({ organizationId: ctx.organizationId }, async (tx) => {
    await lockActiveOrder(tx, await orderIdOfPayment(tx, paymentId));
    const existing = await tx.orderPayment.findFirst({
      where: { id: paymentId, deletedAt: null },
      include: { transaction: true },
    });
    if (!existing) throw new NotFoundError("Recebimento não encontrado.");
    const at = new Date();
    await tx.orderPayment.update({ where: { id: paymentId }, data: { deletedAt: at, updatedById: ctx.userId } });
    await tx.transaction.update({ where: { id: existing.transactionId }, data: { deletedAt: at, updatedById: ctx.userId } });
    await appendAudit(tx, ctx, {
      action: "order_payment.delete",
      entityType: "OrderPayment",
      entityId: paymentId,
      before: { ...paymentSnapshot(existing), orderId: existing.orderId },
    });
    await appendAudit(tx, ctx, {
      action: "transaction.delete",
      entityType: "Transaction",
      entityId: existing.transactionId,
      before: txSnapshot(existing.transaction),
    });
  });
}
