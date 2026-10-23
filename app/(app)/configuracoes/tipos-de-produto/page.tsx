import type { Metadata } from "next";
import { AdminOnlyNotice } from "@/components/molecules/AdminOnlyNotice";
import { CatalogTable } from "@/components/organisms/CatalogTable";
import { saveProductTypeAction, setProductTypeActiveAction } from "@/features/catalog/actions";
import { listProductTypes } from "@/features/catalog/service";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Tipos de produto" };

export default async function Page() {
  const ctx = await requireTenant();
  const allowed = can(ctx.role, "settings.manage");
  const items = allowed ? await listProductTypes(ctx) : [];

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-extrabold md:text-3xl">Tipos de produto</h1>
      {allowed ? (
        <CatalogTable kind="productType" items={items} saveAction={saveProductTypeAction} setActiveAction={setProductTypeActiveAction} />
      ) : (
        <AdminOnlyNotice />
      )}
    </div>
  );
}
