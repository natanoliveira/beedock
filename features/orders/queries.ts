import { customerOptions } from "@/features/customers/service";
import { todayIn } from "@/features/transactions/period";
import { getFinancialSettings } from "@/features/transactions/service";
import type { OrderStatus } from "@/generated/prisma/enums";
import { authorize, type TenantContext } from "@/lib/audit";
import { withScope } from "@/lib/db";
import { toIso } from "./payments";
import { balanceCents, isOverdue } from "./rules";
import type { OrderFilters } from "./schemas";

const PAGE_SIZE = 50;

export type OrderRow = {
  id: string;
  number: number;
  customer: { id: string; name: string };
  productType: { id: string; name: string };
  description: string;
  dueDate: string;
  status: OrderStatus;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  overdue: boolean;
};

export type OrderDetail = OrderRow & {
  deliveredOn: string | null;
  canceledAt: string | null;
  customer: { id: string; name: string; phone: string; anonymized: boolean };
  payments: {
    id: string;
    paidAt: string;
    amountCents: number;
    method: { id: string; name: string; active: boolean };
    transactionId: string;
  }[];
  refund: { amountCents: number; occurredOn: string; transactionId: string } | null;
};

const rowInclude = {
  customer: { select: { id: true, name: true } },
  productType: { select: { id: true, name: true } },
  payments: { where: { deletedAt: null }, select: { amountCents: true } },
} as const;

type DbRow = {
  id: string;
  number: number;
  customer: { id: string; name: string };
  productType: { id: string; name: string };
  description: string;
  dueDate: Date;
  status: OrderStatus;
  totalCents: number;
  payments: { amountCents: number }[];
};

function toRow(o: DbRow, today: string): OrderRow {
  const paid = o.payments.reduce((s, p) => s + p.amountCents, 0);
  const dueDate = toIso(o.dueDate);
  return {
    id: o.id,
    number: o.number,
    customer: o.customer,
    productType: o.productType,
    description: o.description,
    dueDate,
    status: o.status,
    totalCents: o.totalCents,
    paidCents: paid,
    balanceCents: balanceCents(o.totalCents, paid),
    overdue: (o.status === "OPEN" || o.status === "READY") && isOverdue(dueDate, today),
  };
}

const STATUS_WHERE = {
  "em-andamento": { status: { in: ["OPEN", "READY"] as OrderStatus[] } },
  entregues: { status: "DELIVERED" as OrderStatus },
  cancelados: { status: "CANCELED" as OrderStatus },
  todos: {},
};

export async function listOrders(
  ctx: TenantContext,
  filters: OrderFilters,
): Promise<{ rows: OrderRow[]; page: number; pageCount: number }> {
  await authorize(ctx, "order.view");
  const { timezone } = await getFinancialSettings(ctx);
  const today = todayIn(timezone);
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    // ponytail: ids em memória para "a receber"; trocar por HAVING paginado se a lista passar de alguns milhares
    const owing =
      filters.status === "a-receber"
        ? (
            await tx.$queryRaw<{ id: string }[]>`
              SELECT o.id FROM "Order" o
              LEFT JOIN "OrderPayment" p ON p."orderId" = o.id AND p."deletedAt" IS NULL
              WHERE o."deletedAt" IS NULL AND o.status <> 'CANCELED'
              GROUP BY o.id
              HAVING o."totalCents" - COALESCE(SUM(p."amountCents"), 0) > 0`
          ).map((r) => r.id)
        : null;
    const q = filters.q?.trim();
    const num = q && /^#?\d{1,9}$/.test(q) ? Number(q.replace("#", "")) : null;
    const where = {
      deletedAt: null,
      ...(filters.status === "a-receber" ? { id: { in: owing! } } : STATUS_WHERE[filters.status]),
      ...(filters.productTypeId ? { productTypeId: filters.productTypeId } : {}),
      ...(q
        ? {
            OR: [
              ...(num !== null ? [{ number: num }] : []),
              { description: { contains: q.replace(/^#/, ""), mode: "insensitive" as const } },
              { customer: { name: { contains: q.replace(/^#/, ""), mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const count = await tx.order.count({ where });
    const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const rows = await tx.order.findMany({
      where,
      include: rowInclude,
      orderBy:
        filters.status === "em-andamento"
          ? [{ dueDate: "asc" }, { number: "asc" }]
          : [{ createdAt: "desc" }, { number: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { rows: rows.map((r) => toRow(r, today)), page, pageCount };
  });
}

export async function getOrder(ctx: TenantContext, id: string): Promise<OrderDetail | null> {
  await authorize(ctx, "order.view");
  const { timezone } = await getFinancialSettings(ctx);
  const today = todayIn(timezone);
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const o = await tx.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { select: { id: true, name: true, phone: true, anonymizedAt: true } },
        productType: { select: { id: true, name: true } },
        payments: {
          where: { deletedAt: null },
          include: { paymentMethod: { select: { id: true, name: true, active: true } } },
          orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
        },
        transactions: { where: { type: "EXPENSE", deletedAt: null }, take: 1, orderBy: { createdAt: "desc" } },
      },
    });
    if (!o) return null;
    const refund = o.transactions[0];
    return {
      ...toRow(o, today),
      customer: { id: o.customer.id, name: o.customer.name, phone: o.customer.phone, anonymized: o.customer.anonymizedAt !== null },
      deliveredOn: o.deliveredOn ? toIso(o.deliveredOn) : null,
      canceledAt: o.canceledAt ? toIso(o.canceledAt) : null,
      payments: o.payments.map((p) => ({
        id: p.id,
        paidAt: toIso(p.paidAt),
        amountCents: p.amountCents,
        method: p.paymentMethod,
        transactionId: p.transactionId,
      })),
      refund: refund ? { amountCents: refund.amountCents, occurredOn: toIso(refund.occurredOn), transactionId: refund.id } : null,
    };
  });
}

/** Posição de hoje: soma dos saldos positivos dos pedidos não cancelados e não excluídos. */
export async function amountToReceive(ctx: TenantContext): Promise<number> {
  await authorize(ctx, "order.view");
  const [r] = await withScope({ organizationId: ctx.organizationId }, (tx) =>
    tx.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(GREATEST(0, o."totalCents" - COALESCE(p.paid, 0))), 0) AS total
      FROM "Order" o
      LEFT JOIN (
        SELECT "orderId", SUM("amountCents") AS paid FROM "OrderPayment" WHERE "deletedAt" IS NULL GROUP BY "orderId"
      ) p ON p."orderId" = o.id
      WHERE o."deletedAt" IS NULL AND o.status <> 'CANCELED'`,
  );
  return Number(r.total);
}

export async function upcomingDeliveries(ctx: TenantContext, limit = 8): Promise<OrderRow[]> {
  await authorize(ctx, "order.view");
  const { timezone } = await getFinancialSettings(ctx);
  const today = todayIn(timezone);
  const rows = await withScope({ organizationId: ctx.organizationId }, (tx) =>
    tx.order.findMany({
      where: { deletedAt: null, status: { in: ["OPEN", "READY"] } },
      include: rowInclude,
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
      take: limit,
    }),
  );
  return rows.map((r) => toRow(r, today));
}

/** Cadastros para o OrderForm; desativado só aparece quando é o atual do pedido em edição. */
export async function orderFormOptions(
  ctx: TenantContext,
  current?: { productTypeId?: string; paymentMethodId?: string },
): Promise<{
  customers: { id: string; name: string; phoneTail: string }[];
  productTypes: { id: string; name: string; active: boolean }[];
  paymentMethods: { id: string; name: string; active: boolean }[];
}> {
  await authorize(ctx, "order.view");
  const customers = await customerOptions(ctx);
  const keep = (id?: string) => (id ? [{ id }] : []);
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const [productTypes, paymentMethods] = await Promise.all([
      tx.productType.findMany({
        where: { deletedAt: null, OR: [{ active: true }, ...keep(current?.productTypeId)] },
        select: { id: true, name: true, active: true },
        orderBy: { name: "asc" },
      }),
      tx.paymentMethod.findMany({
        where: { deletedAt: null, OR: [{ active: true }, ...keep(current?.paymentMethodId)] },
        select: { id: true, name: true, active: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { customers, productTypes, paymentMethods };
  });
}
