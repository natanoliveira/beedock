import { authorize, type TenantContext } from "@/lib/audit";
import { toCsv, csvDate, csvMoney } from "@/lib/csv";
import { withScope } from "@/lib/db";
import { financialMonthRange, type YearMonth } from "@/features/transactions/period";
import { getFinancialSettings, toDate } from "@/features/transactions/service";

const TYPE_LABEL = { INCOME: "Entrada", EXPENSE: "Saída" } as const;

export async function transactionsCsv(ctx: TenantContext, ym: YearMonth): Promise<string> {
  await authorize(ctx, "report.export");
  const { startDay } = await getFinancialSettings(ctx);
  const range = financialMonthRange(ym, startDay);
  const rows = await withScope({ organizationId: ctx.organizationId }, (tx) =>
    tx.transaction.findMany({
      where: { deletedAt: null, occurredOn: { gte: toDate(range.from), lte: toDate(range.to) } },
      include: {
        category: { select: { name: true } },
        paymentMethod: { select: { name: true } },
        order: { select: { number: true } },
      },
      orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }],
    }),
  );
  return toCsv(
    ["Data", "Tipo", "Categoria", "Forma de pagamento", "Descrição", "Pedido", "Valor"],
    rows.map((r) => [
      csvDate(r.occurredOn.toISOString().slice(0, 10)),
      TYPE_LABEL[r.type],
      r.category.name,
      r.paymentMethod?.name ?? null,
      r.description,
      r.order ? `#${r.order.number}` : null,
      csvMoney(r.type === "EXPENSE" ? -r.amountCents : r.amountCents),
    ]),
  );
}
