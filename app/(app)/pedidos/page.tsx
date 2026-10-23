import type { Metadata } from "next";
import { OrderList } from "@/components/organisms/OrderList";
import { saveOrderAction } from "@/features/orders/actions";
import { listOrders, orderFormOptions } from "@/features/orders/queries";
import { orderFiltersSchema } from "@/features/orders/schemas";
import { toViewRow } from "@/features/orders/view";
import { todayIn } from "@/features/transactions/period";
import { getFinancialSettings } from "@/features/transactions/service";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Pedidos" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireTenant();
  const raw = await searchParams;
  const filters = orderFiltersSchema.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const [data, options, settings] = await Promise.all([
    listOrders(ctx, filters),
    orderFormOptions(ctx),
    getFinancialSettings(ctx),
  ]);
  const today = todayIn(settings.timezone);

  return (
    <OrderList
      rows={data.rows.map((o) => toViewRow(o, today))}
      page={data.page}
      pageCount={data.pageCount}
      filters={{ status: filters.status, q: filters.q ?? "", productTypeId: filters.productTypeId ?? "" }}
      productTypes={options.productTypes.map(({ id, name }) => ({ id, name }))}
      options={options}
      today={today}
      saveAction={saveOrderAction}
    />
  );
}
