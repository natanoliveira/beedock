import type { MemberRole } from "@/generated/prisma/enums";
import { type Actor, appendAudit, recordAudit } from "@/lib/audit";
import { type Tx, withScope } from "@/lib/db";
import { can, ForbiddenError } from "@/lib/permissions";
import { FieldError, NotFoundError } from "@/features/platform/errors";
import { assertMaster, issueInvite, type PlatformActor } from "@/features/platform/service";
import type { LinkUserInput, MemberInviteInput } from "./schemas";

export type MemberActor = Actor & { userId: string; userName: string; isMaster?: boolean };

export const LAST_ADMIN = "A empresa precisa de pelo menos um Admin ativo.";
export const ALREADY_MEMBER = "Esta pessoa já faz parte da equipe.";
export const USER_NOT_FOUND = "Nenhum usuário com este e-mail. Use Convidar.";

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  active: boolean;
  lastSeenAt: Date | null;
};

export type PendingInviteRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: MemberRole;
  expiresAt: Date;
};

export async function assertCanManage(actor: MemberActor, organizationId: string, action: string): Promise<void> {
  if (actor.isMaster) return;
  const role = actor.role as MemberRole | null;
  if (actor.organizationId === organizationId && role && can(role, "member.manage")) return;
  await recordAudit(actor, { action, result: "DENIED" });
  throw new ForbiddenError();
}

/** Admins ativos da empresa, travados (FOR UPDATE): serializa rebaixamentos concorrentes. Deve ser a 1ª query da tx. */
async function lockActiveAdmins(tx: Tx, organizationId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Membership" WHERE "organizationId" = ${organizationId} AND role = 'ADMIN'::"MemberRole" AND active ORDER BY id FOR UPDATE`;
  return rows.map((r) => r.id);
}

async function findMembership(tx: Tx, membershipId: string) {
  const m = await tx.membership.findUnique({ where: { id: membershipId } });
  if (!m) throw new NotFoundError();
  return m;
}

export async function listTeam(
  actor: MemberActor,
  organizationId: string,
): Promise<{ members: MemberRow[]; invites: PendingInviteRow[] }> {
  await assertCanManage(actor, organizationId, "member.list");
  return withScope({ organizationId }, async (tx) => {
    const [memberships, invites, seen] = await Promise.all([
      tx.membership.findMany({ include: { user: { select: { name: true, email: true } } } }),
      tx.invitation.findMany({
        where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, name: true, email: true, phone: true, role: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
      }),
      tx.session.groupBy({ by: ["userId"], where: { organizationId }, _max: { lastSeenAt: true } }),
    ]);
    const lastSeen = new Map(seen.map((s) => [s.userId, s._max.lastSeenAt]));
    const members = memberships
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        active: m.active,
        lastSeenAt: lastSeen.get(m.userId) ?? null,
      }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
    return { members, invites };
  });
}

export async function changeMemberRole(
  actor: MemberActor,
  organizationId: string,
  membershipId: string,
  role: MemberRole,
): Promise<void> {
  await assertCanManage(actor, organizationId, "member.role_change");
  await withScope({ organizationId }, async (tx) => {
    const admins = role === "FUNCIONARIO" ? await lockActiveAdmins(tx, organizationId) : [];
    const m = await findMembership(tx, membershipId);
    if (m.role === role) return;
    if (admins.length === 1 && admins[0] === m.id) throw new FieldError("role", LAST_ADMIN);
    await tx.membership.update({ where: { id: m.id }, data: { role } });
    await appendAudit(tx, { ...actor, organizationId }, {
      action: "member.role_change",
      entityType: "Membership",
      entityId: m.id,
      before: { role: m.role },
      after: { role },
    });
  });
}

export async function setMemberActive(
  actor: MemberActor,
  organizationId: string,
  membershipId: string,
  active: boolean,
): Promise<void> {
  const action = active ? "member.reactivate" : "member.deactivate";
  await assertCanManage(actor, organizationId, action);
  await withScope({ organizationId }, async (tx) => {
    const admins = active ? [] : await lockActiveAdmins(tx, organizationId);
    const m = await findMembership(tx, membershipId);
    if (m.active === active) return;
    if (admins.length === 1 && admins[0] === m.id) throw new FieldError("role", LAST_ADMIN);
    await tx.membership.update({ where: { id: m.id }, data: { active } });
    if (!active) {
      await tx.session.updateMany({
        where: { userId: m.userId, organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await appendAudit(tx, { ...actor, organizationId }, {
      action,
      entityType: "Membership",
      entityId: m.id,
      before: { active: m.active },
      after: { active },
    });
  });
}

export async function linkUser(actor: PlatformActor, input: LinkUserInput): Promise<void> {
  await assertMaster(actor, "member.create");
  const { organizationId, role } = input;
  const email = input.email.trim().toLowerCase();
  await withScope({ organizationId }, async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });
    if (!user || user.anonymizedAt) throw new FieldError("email", USER_NOT_FOUND);
    const existing = await tx.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    if (existing?.active) throw new FieldError("email", ALREADY_MEMBER);
    const audit = { ...actor, organizationId };
    if (existing) {
      await tx.membership.update({ where: { id: existing.id }, data: { active: true, role } });
      await appendAudit(tx, audit, {
        action: "member.reactivate",
        entityType: "Membership",
        entityId: existing.id,
        before: { active: false, role: existing.role },
        after: { active: true, role },
      });
      return;
    }
    const created = await tx.membership.create({ data: { userId: user.id, organizationId, role } });
    await appendAudit(tx, audit, {
      action: "member.create",
      entityType: "Membership",
      entityId: created.id,
      after: { name: user.name, email: user.email, role },
    });
  });
}

export async function inviteMember(
  actor: MemberActor,
  organizationId: string,
  input: MemberInviteInput,
): Promise<{ inviteUrl: string }> {
  await assertCanManage(actor, organizationId, "invitation.create");
  // não consulta User: a resposta é a mesma para e-mail novo ou com conta (anti-enumeração)
  const inviteUrl = await withScope({ organizationId }, async (tx) => {
    const member = await tx.membership.findFirst({
      where: { active: true, user: { email: input.email } },
      select: { id: true },
    });
    if (member) throw new FieldError("email", ALREADY_MEMBER);
    return issueInvite(tx, actor, organizationId, input);
  });
  return { inviteUrl };
}

export async function revokeInvitation(actor: MemberActor, organizationId: string, invitationId: string): Promise<void> {
  await assertCanManage(actor, organizationId, "invitation.revoke");
  await withScope({ organizationId }, async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count !== 1) throw new NotFoundError();
    await appendAudit(tx, { ...actor, organizationId }, {
      action: "invitation.revoke",
      entityType: "Invitation",
      entityId: invitationId,
    });
  });
}
