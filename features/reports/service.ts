import type { TransactionType } from "@/generated/prisma/enums";
import { authorize, type TenantContext } from "@/lib/audit";
import { withScope, type Tx } from "@/lib/db";
import { amountToReceive } from "@/features/orders/queries";
import { financialMonthRange, shiftMonth, type YearMonth } from "@/features/transactions/period";
import { getFinancialSettings, sumByType, toDate } from "@/features/transactions/service";

export type CategoryTotal = { name: string; totalCents: number; pct: number };
type MonthTotals = { month: YearMonth; incomeCents: number; expenseCents: number; profitCents: number };
type Range = { from: string; to: string };

export type MonthlyReport = {
  month: YearMonth;
  range: Range;
  incomeCents: number;
  expenseCents: number;
  profitCents: number;
  incomeByCategory: CategoryTotal[];
  expenseByCategory: CategoryTotal[];
  last6: MonthTotals[];
  toReceiveCents: number;
  orders: {
    created: { count: number; totalCents: number };
    delivered: { count: number; totalCents: number };
    canceled: { count: number; refundedCents: number };
  };
};

const periodWhere = (r: Range) => ({ deletedAt: null, occurredOn: { gte: toDate(r.from), lte: toDate(r.to) } });

async function byCategory(tx: Tx, r: Range, type: TransactionType, total: number): Promise<CategoryTotal[]> {
  const groups = await tx.transaction.groupBy({
    by: ["categoryId"],
    where: { ...periodWhere(r), type },
    _sum: { amountCents: true },
  });
  const cats = await tx.category.findMany({
    where: { id: { in: groups.map((g) => g.categoryId) } },
    select: { id: true, name: true },
  });
  const name = new Map(cats.map((c) => [c.id, c.name]));
  return groups
    .map((g) => {
      const totalCents = g._sum.amountCents ?? 0;
      return {
        name: name.get(g.categoryId) ?? "—",
        totalCents,
        pct: total > 0 ? Math.round((totalCents * 100) / total) : 0,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);
}

type OrderAgg = { count: bigint; total: bigint };

async function orderBlocks(tx: Tx, r: Range, tz: string): Promise<MonthlyReport["orders"]> {
  const [created] = await tx.$queryRaw<OrderAgg[]>`
    SELECT COUNT(*) AS count, COALESCE(SUM("totalCents"), 0) AS total FROM "Order"
    WHERE "deletedAt" IS NULL
      AND ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${r.from}::date AND ${r.to}::date`;
  const [delivered] = await tx.$queryRaw<OrderAgg[]>`
    SELECT COUNT(*) AS count, COALESCE(SUM("totalCents"), 0) AS total FROM "Order"
    WHERE "deletedAt" IS NULL AND status = 'DELIVERED'
      AND "deliveredOn" BETWEEN ${r.from}::date AND ${r.to}::date`;
  const canceled = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order"
    WHERE "deletedAt" IS NULL AND status = 'CANCELED'
      AND ("canceledAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${r.from}::date AND ${r.to}::date`;
  const refunds = canceled.length
    ? await tx.transaction.aggregate({
        where: {
          deletedAt: null,
          type: "EXPENSE",
          orderId: { in: canceled.map((o) => o.id) },
          category: { systemKey: "ORDER_REFUND" },
        },
        _sum: { amountCents: true },
      })
    : null;
  return {
    created: { count: Number(created.count), totalCents: Number(created.total) },
    delivered: { count: Number(delivered.count), totalCents: Number(delivered.total) },
    canceled: { count: canceled.length, refundedCents: refunds?._sum.amountCents ?? 0 },
  };
}

export async function monthlyReport(ctx: TenantContext, ym: YearMonth): Promise<MonthlyReport> {
  await authorize(ctx, "report.view");
  const { startDay, timezone } = await getFinancialSettings(ctx);
  const range = financialMonthRange(ym, startDay);
  const toReceiveCents = await amountToReceive(ctx);
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const last6: MonthTotals[] = [];
    for (let i = 5; i >= 0; i--) {
      const month = shiftMonth(ym, -i);
      const t = await sumByType(tx, periodWhere(financialMonthRange(month, startDay)));
      last6.push({ month, ...t, profitCents: t.incomeCents - t.expenseCents });
    }
    const cur = last6[5];
    return {
      month: ym,
      range,
      incomeCents: cur.incomeCents,
      expenseCents: cur.expenseCents,
      profitCents: cur.profitCents,
      incomeByCategory: await byCategory(tx, range, "INCOME", cur.incomeCents),
      expenseByCategory: await byCategory(tx, range, "EXPENSE", cur.expenseCents),
      last6,
      toReceiveCents,
      orders: await orderBlocks(tx, range, timezone),
    };
  });
}
