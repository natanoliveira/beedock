import type { Metadata } from "next";
import { TransactionList } from "@/components/organisms/TransactionList";
import { saveTransactionAction, deleteTransactionAction } from "@/features/transactions/actions";
import {
  currentFinancialMonth,
  formatYearMonth,
  monthLabel,
  shiftMonth,
  todayIn,
} from "@/features/transactions/period";
import { listFiltersSchema } from "@/features/transactions/schemas";
import { formOptions, listTransactions } from "@/features/transactions/service";
import { receiptUploadEnabled } from "@/features/transactions/storage";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Lançamentos" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireTenant();
  const raw = await searchParams;
  const filters = listFiltersSchema.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );

  const [data, options] = await Promise.all([
    listTransactions(ctx, filters),
    formOptions(ctx, { categoryId: filters.categoryId }),
  ]);
  const { settings } = data;

  const current = currentFinancialMonth(settings.startDay, settings.timezone);
  const label = monthLabel(data.month, settings.startDay);
  const isCurrentOrLater = formatYearMonth(data.month) >= formatYearMonth(current);
  // filtro: categorias ativas + as usadas no mês (inclusive desativadas)
  const filterCategories = [...options.categories, ...data.usedCategories].filter(
    (c, i, all) => all.findIndex((x) => x.id === c.id) === i,
  );

  return (
    <TransactionList
      rows={data.rows}
      page={data.page}
      pageCount={data.pageCount}
      totals={data.totals}
      month={{
        year: data.month.year,
        title: label.title,
        range: label.range,
        selected: formatYearMonth(data.month),
        current: formatYearMonth(current),
        prev: formatYearMonth(shiftMonth(data.month, -1)),
        next: isCurrentOrLater ? null : formatYearMonth(shiftMonth(data.month, 1)),
      }}
      filters={{
        tipo: filters.type === "INCOME" ? "entrada" : filters.type === "EXPENSE" ? "saida" : undefined,
        categoria: filters.categoryId,
      }}
      filterCategories={filterCategories}
      canDelete={can(ctx.role, "transaction.delete")}
      deleteAction={deleteTransactionAction}
      form={{
        categories: options.categories,
        paymentMethods: options.paymentMethods,
        today: todayIn(settings.timezone),
        uploadEnabled: receiptUploadEnabled(),
        saveAction: saveTransactionAction,
      }}
    />
  );
}
