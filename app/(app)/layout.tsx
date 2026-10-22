import type { CSSProperties } from "react";
import { AppNavigation } from "@/components/organisms/AppNavigation";
import { OrgAccount } from "@/components/organisms/OrgAccount";
import { OrgHeader } from "@/components/organisms/OrgHeader";
import { AppShellTemplate } from "@/components/templates/AppShellTemplate";
import { logoutAction } from "@/features/auth/actions";
import { ROLE_LABELS } from "@/features/shared/labels";
import { readableOn } from "@/lib/color";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, role } = await requireTenant();
  const org = session.organization!;
  const brandStyle = {
    "--primary": org.primaryColor,
    "--primary-foreground": readableOn(org.primaryColor),
  } as CSSProperties;

  return (
    <AppShellTemplate
      brandStyle={brandStyle}
      brand={<OrgHeader organizationName={org.name} logoUrl={org.logoUrl} />}
      account={<OrgAccount userName={session.user.name} roleLabel={ROLE_LABELS[role]} logoutAction={logoutAction} />}
      navigation={
        <AppNavigation
          showReports={can(role, "report.view")}
          showAudit={can(role, "audit.view")}
          showSettings={can(role, "settings.manage")}
        />
      }
    >
      {children}
    </AppShellTemplate>
  );
}
