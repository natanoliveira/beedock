import type { Metadata } from "next";
import { AdminOnlyNotice } from "@/components/molecules/AdminOnlyNotice";
import { TeamManager } from "@/components/organisms/TeamManager";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  revokeInvitationAction,
  setMemberActiveAction,
} from "@/features/members/actions";
import { listTeam } from "@/features/members/service";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Equipe" };

export default async function Page() {
  const ctx = await requireTenant();
  const allowed = can(ctx.role, "member.manage");
  const team = allowed
    ? await listTeam(
        {
          userId: ctx.userId,
          userName: ctx.userName,
          role: ctx.role,
          auditRole: ctx.auditRole,
          organizationId: ctx.organizationId,
          isMaster: ctx.session.user.isMaster,
          meta: ctx.meta,
        },
        ctx.organizationId,
      )
    : null;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-extrabold md:text-3xl">Equipe</h1>
      {team ? (
        <TeamManager
          members={team.members}
          invites={team.invites}
          currentUserId={ctx.userId}
          inviteAction={inviteMemberAction.bind(null, null)}
          changeRoleAction={changeMemberRoleAction.bind(null, null)}
          setActiveAction={setMemberActiveAction.bind(null, null)}
          revokeInviteAction={revokeInvitationAction.bind(null, null)}
        />
      ) : (
        <AdminOnlyNotice />
      )}
    </div>
  );
}
