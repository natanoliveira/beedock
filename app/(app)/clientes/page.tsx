import type { Metadata } from "next";
import { CustomerList } from "@/components/organisms/CustomerList";
import { anonymizeCustomerAction, saveCustomerAction } from "@/features/customers/actions";
import { customerFiltersSchema } from "@/features/customers/schemas";
import { listCustomers, listCustomersForReview } from "@/features/customers/service";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Clientes" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireTenant();
  const raw = await searchParams;
  const filters = customerFiltersSchema.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const canReview = can(ctx.role, "customer.anonymize");
  const review = canReview && filters.review === true;
  const data = review
    ? { rows: await listCustomersForReview(ctx), page: 1, pageCount: 1 }
    : await listCustomers(ctx, filters);

  return (
    <CustomerList
      rows={data.rows}
      page={data.page}
      pageCount={data.pageCount}
      q={filters.q ?? ""}
      review={review}
      canReview={canReview}
      saveAction={saveCustomerAction}
      anonymizeAction={anonymizeCustomerAction}
    />
  );
}
