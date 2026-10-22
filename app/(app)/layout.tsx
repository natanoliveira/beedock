import type { CSSProperties } from "react";
import { AppNavigation } from "@/components/organisms/AppNavigation";
import { OrgAccount } from "@/components/organisms/OrgAccount";
import { MasterBanner } from "@/components/organisms/MasterBanner";
import { OrgHeader } from "@/components/organisms/OrgHeader";
import { OrgSwitcher } from "@/components/organisms/OrgSwitcher";
import { AppShellTemplate } from "@/components/templates/AppShellTemplate";
import { logoutAction } from "@/features/auth/actions";
import { leaveOrganizationAction, switchOrganizationAction } from "@/features/members/actions";
import { listOrganizationOptions } from "@/features/members/switch";
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

  const options = await listOrganizationOptions({ userId: session.user.id, isMaster: session.user.isMaster });

  return (
    <AppShellTemplate
      brandStyle={brandStyle}
      brand={
        <div className="flex min-w-0 shrink items-center gap-1">
          <OrgHeader organizationName={org.name} logoUrl={org.logoUrl} />
          <OrgSwitcher options={options} currentId={org.id} label="Trocar empresa" switchAction={switchOrganizationAction} />
        </div>
      }
      banner={
        session.user.isMaster ? (
          <MasterBanner organizationName={org.name} actingAsMaster={session.actingAsMaster} leaveAction={leaveOrganizationAction} />
        ) : undefined
      }
      account={
        <OrgAccount
          userName={session.user.name}
          roleLabel={session.actingAsMaster ? "MASTER" : ROLE_LABELS[role]}
          logoutAction={logoutAction}
        />
      }
      navigation={
        <AppNavigation
          showReports={can(role, "report.view")}
          showAudit={can(role, "audit.view")}
          showSettings={can(role, "settings.manage")}
          showTeam={can(role, "member.manage")}
        />
      }
    >
      {children}
    </AppShellTemplate>
  );
}
