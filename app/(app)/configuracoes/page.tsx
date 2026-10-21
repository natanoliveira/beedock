import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/molecules/EmptyState";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Configurações" };

export default async function Page() {
  const { role } = await requireTenant();
  if (!can(role, "settings.manage")) redirect("/inicio");

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-extrabold md:text-3xl">Configurações</h1>
      <EmptyState title="Em construção" description="Esta tela chega na Fase 2." />
    </div>
  );
}
