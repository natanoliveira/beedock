import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminOnlyNotice } from "@/components/molecules/AdminOnlyNotice";
import { LogoDropzone } from "@/components/molecules/LogoDropzone";
import { OrganizationForm } from "@/components/organisms/OrganizationForm";
import { toFormValues } from "@/components/organisms/OrganizationForm/values";
import {
  removeCompanyLogoAction,
  updateCompanySettingsAction,
  uploadCompanyLogoAction,
} from "@/features/organizations/actions";
import { getCompanySettings } from "@/features/organizations/service";
import { blobUploadEnabled } from "@/lib/blob";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Empresa" };

export default async function Page() {
  const ctx = await requireTenant();
  if (!can(ctx.role, "settings.manage")) {
    return (
      <div className="grid gap-6">
        <h1 className="text-2xl font-extrabold md:text-3xl">Empresa</h1>
        <AdminOnlyNotice />
      </div>
    );
  }
  const org = await getCompanySettings(ctx);
  if (!org) notFound();

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-extrabold md:text-3xl">Empresa</h1>
      <OrganizationForm
        mode="tenant"
        action={updateCompanySettingsAction}
        defaults={toFormValues(org)}
        logo={
          <LogoDropzone
            uploadAction={uploadCompanyLogoAction}
            removeAction={removeCompanyLogoAction}
            logoUrl={org.logoUrl}
            enabled={blobUploadEnabled()}
          />
        }
      />
    </div>
  );
}
