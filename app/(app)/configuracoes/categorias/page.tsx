import type { Metadata } from "next";
import { AdminOnlyNotice } from "@/components/molecules/AdminOnlyNotice";
import { CatalogTable } from "@/components/organisms/CatalogTable";
import { saveCategoryAction, setCategoryActiveAction } from "@/features/catalog/actions";
import { listCategories } from "@/features/catalog/service";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Categorias" };

export default async function Page() {
  const ctx = await requireTenant();
  const allowed = can(ctx.role, "settings.manage");
  const items = allowed ? await listCategories(ctx) : [];

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-extrabold md:text-3xl">Categorias</h1>
      {allowed ? (
        <CatalogTable kind="category" items={items} saveAction={saveCategoryAction} setActiveAction={setCategoryActiveAction} />
      ) : (
        <AdminOnlyNotice />
      )}
    </div>
  );
}
