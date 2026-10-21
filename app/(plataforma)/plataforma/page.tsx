import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AppButton } from "@/components/atoms/AppButton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { OrganizationList } from "@/components/organisms/OrganizationList";
import { platformActor } from "@/features/platform/actor";
import { listOrganizations } from "@/features/platform/service";
import { requireMaster } from "@/lib/session";

export const metadata: Metadata = { title: "Empresas" };

const NewButton = () => (
  <AppButton asChild>
    <Link href="/plataforma/empresas/nova">
      <Plus aria-hidden />
      Nova empresa
    </Link>
  </AppButton>
);

export default async function PlataformaPage() {
  await requireMaster();
  const organizations = await listOrganizations(await platformActor());
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl leading-none font-black">Empresas</h1>
        {organizations.length > 0 && <NewButton />}
      </div>
      {organizations.length === 0 ? (
        <EmptyState
          title="Nenhuma empresa ainda"
          description="Cadastre a primeira empresa e envie o convite ao Admin."
          action={<NewButton />}
        />
      ) : (
        <OrganizationList organizations={organizations} />
      )}
    </div>
  );
}
