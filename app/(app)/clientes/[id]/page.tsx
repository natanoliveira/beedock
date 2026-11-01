import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDetail } from "@/components/organisms/CustomerDetail";
import { anonymizeCustomerAction, deleteCustomerAction, saveCustomerAction } from "@/features/customers/actions";
import { getFinancialSettings } from "@/features/transactions/service";
import { getCustomer } from "@/features/customers/service";
import { recordHistory } from "@/features/audit/queries";
import { RecordHistory } from "@/components/organisms/RecordHistory";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Cliente" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;
  const customer = await getCustomer(ctx, id);
  if (!customer) notFound();
  const history = can(ctx.role, "audit.view") ? await recordHistory(ctx, { type: "Customer", id }) : null;
  const { timezone } = await getFinancialSettings(ctx);
  return (
    <>
      <CustomerDetail
        customer={customer}
        canDelete={can(ctx.role, "customer.delete")}
        canAnonymize={can(ctx.role, "customer.anonymize")}
      canExport={can(ctx.role, "customer.export")}
        saveAction={saveCustomerAction}
        deleteAction={deleteCustomerAction}
        anonymizeAction={anonymizeCustomerAction}
      />
      {history && (
        <RecordHistory
          rows={history}
          timezone={timezone}
          auditHref={`/configuracoes/auditoria?entityType=Customer&entityId=${id}`}
        />
      )}
    </>
  );
}
