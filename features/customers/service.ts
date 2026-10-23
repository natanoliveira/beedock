import { NotFoundError, RuleError } from "@/features/platform/errors";
import { balanceCents } from "@/features/orders/rules";
import type { OrderStatus } from "@/generated/prisma/enums";
import { appendAudit, authorize, diff, withAudit, type TenantContext } from "@/lib/audit";
import { withScope, type Tx } from "@/lib/db";
import { onlyDigits } from "@/lib/document";
import { getFinancialSettings } from "@/features/transactions/service";
import { todayIn } from "@/features/transactions/period";
import { anonymizedName } from "./rules";
import type { CustomerFilters, CustomerInput } from "./schemas";

const PAGE_SIZE = 50;

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  ordersOpen: number;
  balanceCents: number;
  lastOrderOn: string | null;
  anonymized: boolean;
};

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  address: string | null;
  note: string | null;
  anonymized: boolean;
  balanceCents: number;
  orders: {
    id: string;
    number: number;
    description: string;
    status: OrderStatus;
    dueDate: string;
    totalCents: number;
    paidCents: number;
    balanceCents: number;
  }[];
};

const toIso = (d: Date) => d.toISOString().slice(0, 10);

type Snap = {
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  address: string | null;
  note: string | null;
  anonymizedAt: Date | null;
};

// sanitize mascara phone/email/document/address; a observação livre não vai para a auditoria
const snapshot = (c: Snap) => ({
  name: c.name,
  phone: c.phone,
  email: c.email,
  document: c.document,
  address: c.address,
  hasNote: c.note !== null,
  anonymized: c.anonymizedAt !== null,
});

const fields = (input: CustomerInput) => ({
  name: input.name,
  phone: input.phone,
  email: input.email ?? null,
  document: input.document ?? null,
  address: input.address ?? null,
  note: input.note ?? null,
});

const lock = (tx: Tx, id: string) => tx.$executeRaw`SELECT 1 FROM "Customer" WHERE id = ${id} FOR UPDATE`;

async function toRows(
  tx: Tx,
  customers: { id: string; name: string; phone: string; anonymizedAt: Date | null }[],
): Promise<CustomerRow[]> {
  const orders = await tx.order.findMany({
    where: { customerId: { in: customers.map((c) => c.id) }, deletedAt: null },
    select: {
      customerId: true,
      status: true,
      totalCents: true,
      createdAt: true,
      payments: { where: { deletedAt: null }, select: { amountCents: true } },
    },
  });
  return customers.map((c) => {
    const mine = orders.filter((o) => o.customerId === c.id);
    const open = mine.filter((o) => o.status === "OPEN" || o.status === "READY").length;
    const balance = mine
      .filter((o) => o.status !== "CANCELED")
      .reduce((sum, o) => sum + balanceCents(o.totalCents, o.payments.reduce((s, p) => s + p.amountCents, 0)), 0);
    const last = mine.reduce<Date | null>((m, o) => (m === null || o.createdAt > m ? o.createdAt : m), null);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      ordersOpen: open,
      balanceCents: balance,
      lastOrderOn: last ? toIso(last) : null,
      anonymized: c.anonymizedAt !== null,
    };
  });
}

const listSelect = { id: true, name: true, phone: true, anonymizedAt: true } as const;

export async function listCustomers(
  ctx: TenantContext,
  filters: CustomerFilters,
): Promise<{ rows: CustomerRow[]; page: number; pageCount: number }> {
  await authorize(ctx, "customer.view");
  const digits = filters.q ? onlyDigits(filters.q) : "";
  const where = {
    deletedAt: null,
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" as const } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : {}),
  };
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const count = await tx.customer.count({ where });
    const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const customers = await tx.customer.findMany({
      where,
      select: listSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { rows: await toRows(tx, customers), page, pageCount };
  });
}

export async function getCustomer(ctx: TenantContext, id: string): Promise<CustomerDetail | null> {
  await authorize(ctx, "customer.view");
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const c = await tx.customer.findFirst({ where: { id, deletedAt: null } });
    if (!c) return null;
    const orders = await tx.order.findMany({
      where: { customerId: id, deletedAt: null },
      select: {
        id: true,
        number: true,
        description: true,
        status: true,
        dueDate: true,
        totalCents: true,
        payments: { where: { deletedAt: null }, select: { amountCents: true } },
      },
      orderBy: { number: "desc" },
    });
    const rows = orders.map(({ payments, dueDate, ...o }) => {
      const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
      return { ...o, dueDate: toIso(dueDate), paidCents, balanceCents: balanceCents(o.totalCents, paidCents) };
    });
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      document: c.document,
      address: c.address,
      note: c.note,
      anonymized: c.anonymizedAt !== null,
      balanceCents: rows.filter((o) => o.status !== "CANCELED").reduce((s, o) => s + o.balanceCents, 0),
      orders: rows,
    };
  });
}

/** Clientes ativos para o seletor do pedido. */
export async function customerOptions(
  ctx: TenantContext,
): Promise<{ id: string; name: string; phoneTail: string }[]> {
  await authorize(ctx, "customer.view");
  const rows = await withScope({ organizationId: ctx.organizationId }, (tx) =>
    tx.customer.findMany({
      where: { deletedAt: null, anonymizedAt: null },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  );
  return rows.map((r) => ({ id: r.id, name: r.name, phoneTail: r.phone.slice(-4) }));
}

/** Cria o cliente e o evento na transação do chamador (pedido com cliente novo reaproveita). */
export async function createCustomerInTx(tx: Tx, ctx: TenantContext, input: CustomerInput): Promise<{ id: string }> {
  const row = await tx.customer.create({ data: { ...fields(input), createdById: ctx.userId, updatedById: ctx.userId } });
  await appendAudit(tx, ctx, {
    action: "customer.create",
    entityType: "Customer",
    entityId: row.id,
    after: snapshot(row),
  });
  return { id: row.id };
}

export async function createCustomer(ctx: TenantContext, input: CustomerInput): Promise<{ id: string }> {
  await authorize(ctx, "customer.create");
  return withScope({ organizationId: ctx.organizationId }, (tx) => createCustomerInTx(tx, ctx, input));
}

export async function updateCustomer(ctx: TenantContext, id: string, input: CustomerInput): Promise<void> {
  await authorize(ctx, "customer.update");
  await withAudit(
    ctx,
    (r: { before: Record<string, unknown>; after: Record<string, unknown> }) => ({
      action: "customer.update",
      entityType: "Customer",
      entityId: id,
      ...diff(r.before, r.after),
    }),
    async (tx) => {
      await lock(tx, id);
      const existing = await tx.customer.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError("Cliente não encontrado.");
      if (existing.anonymizedAt) throw new RuleError("Cliente anonimizado não pode ser editado.");
      const row = await tx.customer.update({ where: { id }, data: { ...fields(input), updatedById: ctx.userId } });
      return { before: snapshot(existing), after: snapshot(row) };
    },
  );
}

export async function deleteCustomer(ctx: TenantContext, id: string): Promise<void> {
  await authorize(ctx, "customer.delete");
  await withAudit(
    ctx,
    (before: Record<string, unknown>) => ({ action: "customer.delete", entityType: "Customer", entityId: id, before }),
    async (tx) => {
      await lock(tx, id);
      const existing = await tx.customer.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError("Cliente não encontrado.");
      if ((await tx.order.count({ where: { customerId: id, deletedAt: null } })) > 0) {
        throw new RuleError("Este cliente tem pedidos. Use Anonimizar.");
      }
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date(), updatedById: ctx.userId } });
      return snapshot(existing);
    },
  );
}

/** LGPD: troca os dados pessoais por marcadores e limpa o pagador dos lançamentos dos pedidos. Irreversível. */
export async function anonymizeCustomer(ctx: TenantContext, id: string, input: { reason: string }): Promise<void> {
  await authorize(ctx, "customer.anonymize");
  await withAudit(
    ctx,
    (r: { cleared: number; at: Date }) => ({
      action: "customer.anonymize",
      entityType: "Customer",
      entityId: id,
      before: { anonymizedAt: null },
      after: { anonymizedAt: r.at, transactionsCleared: r.cleared },
      reason: input.reason,
    }),
    async (tx) => {
      await lock(tx, id);
      const existing = await tx.customer.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError("Cliente não encontrado.");
      if (existing.anonymizedAt) throw new RuleError("Este cliente já foi anonimizado.");
      const inProgress = await tx.order.count({
        where: { customerId: id, deletedAt: null, status: { in: ["OPEN", "READY"] } },
      });
      if (inProgress > 0) throw new RuleError("Conclua ou cancele os pedidos em andamento antes.");
      const at = new Date();
      const name = anonymizedName(id);
      await tx.customer.update({
        where: { id },
        data: {
          name,
          phone: "",
          email: null,
          document: null,
          address: null,
          note: null,
          anonymizedAt: at,
          updatedById: ctx.userId,
        },
      });
      const orderIds = (await tx.order.findMany({ where: { customerId: id }, select: { id: true } })).map((o) => o.id);
      const cleared = await tx.transaction.updateMany({
        where: { orderId: { in: orderIds } },
        data: { payerName: name, payerDocument: null },
      });
      return { cleared: cleared.count, at };
    },
  );
}

/** Admin: clientes cuja última movimentação é anterior à retenção da empresa. Nada é automático. */
export async function listCustomersForReview(ctx: TenantContext): Promise<CustomerRow[]> {
  await authorize(ctx, "customer.anonymize");
  const { timezone } = await getFinancialSettings(ctx);
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const settings = await tx.organizationSettings.findUnique({ where: { organizationId: ctx.organizationId } });
    const cutoff = new Date(`${todayIn(timezone)}T00:00:00.000Z`);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - (settings?.customerRetentionMonths ?? 24));
    const ids = await tx.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM "Customer" c
      LEFT JOIN "Order" o ON o."organizationId" = c."organizationId" AND o."customerId" = c.id AND o."deletedAt" IS NULL
      LEFT JOIN "OrderPayment" p ON p."orderId" = o.id AND p."deletedAt" IS NULL
      WHERE c."deletedAt" IS NULL AND c."anonymizedAt" IS NULL
      GROUP BY c.id
      HAVING GREATEST(
        c."createdAt",
        COALESCE(MAX(o."createdAt"), c."createdAt"),
        COALESCE(MAX(p."paidAt")::timestamp, c."createdAt")
      ) < ${cutoff}::timestamp`;
    const customers = await tx.customer.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      select: listSelect,
      orderBy: { name: "asc" },
    });
    return toRows(tx, customers);
  });
}

