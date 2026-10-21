import type { Metadata } from "next";
import Link from "next/link";
import { LogoDropzone } from "@/components/molecules/LogoDropzone";
import { OrganizationForm } from "@/components/organisms/OrganizationForm";
import { createOrganizationAction } from "@/features/platform/actions";
import { logoUploadEnabled } from "@/features/platform/logo";
import { requireMaster } from "@/lib/session";

export const metadata: Metadata = { title: "Nova empresa" };

export default async function NovaEmpresaPage() {
  await requireMaster();
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Link href="/plataforma" className="text-muted-foreground w-fit text-sm underline-offset-4 hover:underline">
          ← Empresas
        </Link>
        <h1 className="text-3xl leading-none font-black">Nova empresa</h1>
      </div>
      <OrganizationForm mode="create" action={createOrganizationAction} logo={<LogoDropzone enabled={logoUploadEnabled()} />} />
    </div>
  );
}
