import type { Metadata } from "next";
import { AdminOnlyNotice } from "@/components/molecules/AdminOnlyNotice";
import { CatalogTable } from "@/components/organisms/CatalogTable";
import { savePaymentMethodAction, setPaymentMethodActiveAction } from "@/features/catalog/actions";
import { listPaymentMethods } from "@/features/catalog/service";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Formas de pagamento" };

export default async function Page() {
  const ctx = await requireTenant();
  const allowed = can(ctx.role, "settings.manage");
  const items = allowed ? await listPaymentMethods(ctx) : [];

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-extrabold md:text-3xl">Formas de pagamento</h1>
      {allowed ? (
        <CatalogTable kind="method" items={items} saveAction={savePaymentMethodAction} setActiveAction={setPaymentMethodActiveAction} />
      ) : (
        <AdminOnlyNotice />
      )}
    </div>
  );
}
