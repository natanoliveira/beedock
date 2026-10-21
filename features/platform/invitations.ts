import { hashPassword } from "@/features/auth/service";
import { Prisma } from "@/generated/prisma/client";
import { type Actor, appendAudit, recordAudit, type RequestMeta } from "@/lib/audit";
import { db, withScope } from "@/lib/db";
import { EMAIL_TAKEN, FieldError } from "./errors";
import type { AdminInviteInput } from "./schemas";
import { assertMaster, hashToken, issueInvite, type PlatformActor } from "./service";

export const INVITE_IP_WINDOW_MINUTES = 15;
export const INVITE_IP_MAX_FAILURES = 20;

const anonymous = (meta: RequestMeta): Actor => ({
  userId: null,
  userName: null,
  role: null,
  organizationId: null,
  meta,
});

async function ipBlocked(ip: string | null) {
  if (!ip) return false;
  // ponytail: mesmo critério do login (falhas na própria auditoria); Redis se o volume crescer
  const since = new Date(Date.now() - INVITE_IP_WINDOW_MINUTES * 60_000);
  const failures = await withScope({ platform: true }, (tx) =>
    tx.auditLog.count({ where: { action: "invitation.invalid", ip, occurredAt: { gte: since } } }),
  );
  return failures >= INVITE_IP_MAX_FAILURES;
}

const invalid = (meta: RequestMeta) =>
  recordAudit(anonymous(meta), { action: "invitation.invalid", entityType: "Invitation", result: "FAILED" });

export async function resendInvitation(
  actor: PlatformActor,
  organizationId: string,
  admin: AdminInviteInput,
): Promise<{ inviteUrl: string }> {
  await assertMaster(actor, "platform.invitation_resend");
  if (await db.membership.findFirst({ where: { organizationId, role: "ADMIN", active: true }, select: { id: true } })) {
    throw new FieldError("email", "Esta empresa já tem um Admin ativo.");
  }
  if (await db.user.findUnique({ where: { email: admin.email }, select: { id: true } })) {
    throw new FieldError("email", EMAIL_TAKEN);
  }
  const inviteUrl = await withScope({ organizationId }, (tx) => issueInvite(tx, actor, organizationId, admin));
  return { inviteUrl };
}

const lookup = (token: string) =>
  withScope({ platform: true }, (tx) =>
    tx.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: { select: { name: true, status: true } } },
    }),
  );

const usable = (i: NonNullable<Awaited<ReturnType<typeof lookup>>>) =>
  !i.acceptedAt && !i.revokedAt && i.expiresAt > new Date() && i.organization.status === "ACTIVE";

export async function findInvitation(
  token: string,
  meta: RequestMeta,
): Promise<{ organizationName: string; name: string; email: string } | null> {
  if (await ipBlocked(meta.ip)) return null;
  const inv = await lookup(token);
  if (!inv || !usable(inv)) {
    await invalid(meta);
    return null;
  }
  return { organizationName: inv.organization.name, name: inv.name, email: inv.email };
}

class Rejected extends Error {}

export async function acceptInvitation(
  input: { token: string; password: string },
  meta: RequestMeta,
): Promise<{ ok: true; email: string } | { ok: false }> {
  if (await ipBlocked(meta.ip)) return { ok: false };
  const inv = await lookup(input.token);
  if (!inv || !usable(inv)) {
    await invalid(meta);
    return { ok: false };
  }
  const passwordHash = await hashPassword(input.password);
  const organizationId = inv.organizationId;
  try {
    await withScope({ organizationId }, async (tx) => {
      // e-mails são gravados em minúsculas; checagem case-insensitive por segurança
      if (await tx.user.findFirst({ where: { email: { equals: inv.email, mode: "insensitive" } }, select: { id: true } })) {
        throw new Rejected();
      }
      const { count } = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (count !== 1) throw new Rejected();
      const user = await tx.user.create({
        data: { name: inv.name, email: inv.email.toLowerCase(), phone: inv.phone, passwordHash },
      });
      await tx.membership.create({ data: { userId: user.id, organizationId, role: inv.role } });
      const actor: Actor = { userId: user.id, userName: user.name, role: inv.role, organizationId, meta };
      await appendAudit(tx, actor, {
        action: "invitation.accept",
        entityType: "Invitation",
        entityId: inv.id,
        after: { role: inv.role },
      });
      await appendAudit(tx, actor, {
        action: "member.create",
        entityType: "User",
        entityId: user.id,
        after: { name: user.name, email: user.email, role: inv.role },
      });
    });
  } catch (e) {
    if (e instanceof Rejected || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      await invalid(meta);
      return { ok: false };
    }
    throw e;
  }
  return { ok: true, email: inv.email.toLowerCase() };
}
