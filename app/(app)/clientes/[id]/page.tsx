import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDetail } from "@/components/organisms/CustomerDetail";
import { anonymizeCustomerAction, deleteCustomerAction, saveCustomerAction } from "@/features/customers/actions";
import { getCustomer } from "@/features/customers/service";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Cliente" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;
  const customer = await getCustomer(ctx, id);
  if (!customer) notFound();
  return (
    <CustomerDetail
      customer={customer}
      canDelete={can(ctx.role, "customer.delete")}
      canAnonymize={can(ctx.role, "customer.anonymize")}
      saveAction={saveCustomerAction}
      deleteAction={deleteCustomerAction}
      anonymizeAction={anonymizeCustomerAction}
    />
  );
}
