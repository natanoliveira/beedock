import { createCustomerInTx } from "@/features/customers/service";
import { FieldError, NotFoundError, RuleError } from "@/features/platform/errors";
import { getFinancialSettings } from "@/features/transactions/service";
import { todayIn } from "@/features/transactions/period";
import type { OrderStatus } from "@/generated/prisma/enums";
import { appendAudit, authorize, diff, withAudit, type TenantContext } from "@/lib/audit";
import { withScope, type Tx } from "@/lib/db";
import { checkMoneyRefs, createLinkedPayment, paidCents, systemCategoryId, toDate, toIso } from "./payments";
import { canTransition, formatBrl } from "./rules";
import type { CancelInput, OrderInput, OrderUpdateInput } from "./schemas";

const STATUS_LABEL: Record<OrderStatus, string> = {
  OPEN: "Aberto",
  READY: "Pronto",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

type Snap = {
  number: number;
  customerId: string;
  productTypeId: string;
  description: string;
  totalCents: number;
  dueDate: Date;
};

const snapshot = (o: Snap) => ({
  number: o.number,
  customerId: o.customerId,
  productTypeId: o.productTypeId,
  description: o.description,
  totalCents: o.totalCents,
  dueDate: toIso(o.dueDate),
});

const lockOrder = (tx: Tx, id: string) => tx.$executeRaw`SELECT 1 FROM "Order" WHERE id = ${id} FOR UPDATE`;

async function loadForWrite(tx: Tx, id: string) {
  await lockOrder(tx, id);
  const order = await tx.order.findFirst({ where: { id, deletedAt: null } });
  if (!order) throw new NotFoundError("Pedido não encontrado.");
  return order;
}

async function checkCustomer(tx: Tx, customerId: string): Promise<{ name: string }> {
  const c = await tx.customer.findFirst({
    where: { id: customerId, deletedAt: null, anonymizedAt: null },
    select: { name: true },
  });
  if (!c) throw new FieldError("customerId", "Cliente inválido.");
  return c;
}

async function checkProductType(tx: Tx, productTypeId: string, currentId?: string) {
  const t = await tx.productType.findFirst({ where: { id: productTypeId, deletedAt: null }, select: { active: true } });
  if (!t) throw new FieldError("productTypeId", "Tipo de produto inválido.");
  if (!t.active && productTypeId !== currentId) {
    throw new FieldError("productTypeId", "Este tipo de produto está desativado.");
  }
}

export async function createOrder(ctx: TenantContext, input: OrderInput): Promise<{ id: string; number: number }> {
  await authorize(ctx, "order.create");
  const { timezone } = await getFinancialSettings(ctx);
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    // numeração: lock próprio e primeiro da transação (o do audit vem depois), sem ciclo de espera
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${ctx.organizationId}`}))`;
    let customerId = input.customerId;
    let customerName: string;
    if (input.newCustomer) {
      ({ id: customerId } = await createCustomerInTx(tx, ctx, input.newCustomer));
      customerName = input.newCustomer.name;
    } else {
      customerName = (await checkCustomer(tx, customerId!)).name;
    }
    await checkProductType(tx, input.productTypeId);
    const max = await tx.order.aggregate({ _max: { number: true } });
    const order = await tx.order.create({
      data: {
        number: (max._max.number ?? 0) + 1,
        customerId: customerId!,
        productTypeId: input.productTypeId,
        description: input.description,
        totalCents: input.totalCents,
        dueDate: toDate(input.dueDate),
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
    });
    await appendAudit(tx, ctx, {
      action: "order.create",
      entityType: "Order",
      entityId: order.id,
      after: snapshot(order),
    });
    if (input.deposit) {
      await createLinkedPayment(tx, ctx, order, customerName, input.deposit, timezone, "deposit");
    }
    return { id: order.id, number: order.number };
  });
}

export async function updateOrder(ctx: TenantContext, id: string, input: OrderUpdateInput): Promise<void> {
  await authorize(ctx, "order.update");
  await withAudit(
    ctx,
    (r: { before: Record<string, unknown>; after: Record<string, unknown> }) => ({
      action: "order.update",
      entityType: "Order",
      entityId: id,
      ...diff(r.before, r.after),
    }),
    async (tx) => {
      const existing = await loadForWrite(tx, id);
      if (existing.status === "CANCELED") throw new RuleError("Pedido cancelado não pode ser editado.");
      if (input.customerId !== existing.customerId) await checkCustomer(tx, input.customerId);
      await checkProductType(tx, input.productTypeId, existing.productTypeId);
      const paid = await paidCents(tx, id);
      if (input.totalCents < paid) throw new FieldError("total", `Já foram recebidos ${formatBrl(paid)}.`);
      const row = await tx.order.update({
        where: { id },
        data: {
          customerId: input.customerId,
          productTypeId: input.productTypeId,
          description: input.description,
          totalCents: input.totalCents,
          dueDate: toDate(input.dueDate),
          updatedById: ctx.userId,
        },
      });
      return { before: snapshot(existing), after: snapshot(row) };
    },
  );
}

export async function changeOrderStatus(ctx: TenantContext, id: string, to: OrderStatus): Promise<void> {
  await authorize(ctx, "order.update");
  const { timezone } = await getFinancialSettings(ctx);
  await withAudit(
    ctx,
    (r: { before: Record<string, unknown>; after: Record<string, unknown> }) => ({
      action: "order.status_change",
      entityType: "Order",
      entityId: id,
      before: r.before,
      after: r.after,
    }),
    async (tx) => {
      const existing = await loadForWrite(tx, id);
      if (to === "CANCELED") throw new RuleError("Use o cancelamento do pedido.");
      if (!canTransition(existing.status, to)) {
        throw new RuleError(`Não é possível mudar de ${STATUS_LABEL[existing.status]} para ${STATUS_LABEL[to]}.`);
      }
      const deliveredOn = to === "DELIVERED" ? toDate(todayIn(timezone)) : null;
      await tx.order.update({ where: { id }, data: { status: to, deliveredOn, updatedById: ctx.userId } });
      return {
        before: { status: existing.status, deliveredOn: existing.deliveredOn ? toIso(existing.deliveredOn) : null },
        after: { status: to, deliveredOn: deliveredOn ? toIso(deliveredOn) : null },
      };
    },
  );
}

/** Pedido lançado por engano: só sem recebimento nem estorno ativos. */
export async function deleteOrder(ctx: TenantContext, id: string): Promise<void> {
  await authorize(ctx, "order.delete");
  await withAudit(
    ctx,
    (before: Record<string, unknown>) => ({ action: "order.delete", entityType: "Order", entityId: id, before }),
    async (tx) => {
      const existing = await loadForWrite(tx, id);
      if ((await tx.transaction.count({ where: { orderId: id, deletedAt: null } })) > 0) {
        throw new RuleError("Exclua os recebimentos ou cancele o pedido.");
      }
      await tx.order.update({ where: { id }, data: { deletedAt: new Date(), updatedById: ctx.userId } });
      return snapshot(existing);
    },
  );
}

/**
 * Cancelar é final. Com recebimentos, exige o estorno (R$ 0,01 até o recebido) e gera uma saída
 * ORDER_REFUND; os recebimentos ficam como estão (o dinheiro entrou e saiu, cada fato no seu mês).
 */
export async function cancelOrder(
  ctx: TenantContext,
  id: string,
  input: CancelInput,
): Promise<{ refundTransactionId: string | null }> {
  await authorize(ctx, "order.update");
  const { timezone } = await getFinancialSettings(ctx);
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const order = await loadForWrite(tx, id);
    if (order.status === "CANCELED") throw new RuleError("Este pedido já está cancelado.");
    if (!canTransition(order.status, "CANCELED")) throw new RuleError("Pedido entregue não pode ser cancelado.");
    const paid = await paidCents(tx, id);
    const refund = input.refund;
    if (paid === 0 && refund) {
      throw new FieldError("refundAmount", "Este pedido não tem recebimentos para estornar.");
    }
    if (paid > 0) {
      if (!refund) throw new FieldError("refundAmount", `Informe o estorno (recebido ${formatBrl(paid)}).`);
      if (refund.amountCents < 1 || refund.amountCents > paid) {
        throw new FieldError("refundAmount", `O estorno vai de R$ 0,01 até ${formatBrl(paid)} (o recebido).`);
      }
      await checkMoneyRefs(tx, refund, timezone, "refund");
    }
    let refundTransactionId: string | null = null;
    await tx.order.update({
      where: { id },
      data: { status: "CANCELED", canceledAt: new Date(), deliveredOn: null, updatedById: ctx.userId },
    });
    await appendAudit(tx, ctx, {
      action: "order.cancel",
      entityType: "Order",
      entityId: id,
      before: { status: order.status },
      after: { status: "CANCELED", refundCents: refund?.amountCents ?? 0 },
      ...(input.reason ? { reason: input.reason } : {}),
    });
    if (refund) {
      const t = await tx.transaction.create({
        data: {
          type: "EXPENSE",
          amountCents: refund.amountCents,
          occurredOn: toDate(refund.paidAt),
          categoryId: await systemCategoryId(tx, "ORDER_REFUND"),
          paymentMethodId: refund.paymentMethodId,
          description: `Estorno pedido #${order.number}`,
          orderId: id,
          createdById: ctx.userId,
          updatedById: ctx.userId,
        },
      });
      refundTransactionId = t.id;
      await appendAudit(tx, ctx, {
        action: "transaction.create",
        entityType: "Transaction",
        entityId: t.id,
        after: {
          type: t.type,
          amountCents: t.amountCents,
          occurredOn: refund.paidAt,
          categoryId: t.categoryId,
          paymentMethodId: t.paymentMethodId,
          description: t.description,
          orderId: id,
        },
      });
    }
    return { refundTransactionId };
  });
}
