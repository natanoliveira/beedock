import { hashPassword, ipBlocked as loginIpBlocked, verifyPassword } from "@/features/auth/service";
import { type Actor, appendAudit, recordAudit, type RequestMeta } from "@/lib/audit";
import { db, withScope } from "@/lib/db";
import { hashToken, isUnique } from "./service";

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

const lookup = (token: string) =>
  withScope({ platform: true }, (tx) =>
    tx.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: { select: { name: true, status: true } } },
    }),
  );

const usable = (i: NonNullable<Awaited<ReturnType<typeof lookup>>>) =>
  !i.acceptedAt && !i.revokedAt && i.expiresAt > new Date() && i.organization.status === "ACTIVE";

// e-mails são gravados em minúsculas; busca case-insensitive por segurança
const findAccount = (email: string) =>
  db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });

export async function findInvitation(
  token: string,
  meta: RequestMeta,
): Promise<{ organizationName: string; name: string; email: string; existingUser: boolean } | null> {
  if (await ipBlocked(meta.ip)) return null;
  const inv = await lookup(token);
  if (!inv || !usable(inv)) {
    await invalid(meta);
    return null;
  }
  const account = await findAccount(inv.email);
  return {
    organizationName: inv.organization.name,
    name: inv.name,
    email: inv.email,
    existingUser: !!account?.passwordHash && !account.anonymizedAt,
  };
}

class Rejected extends Error {}

export type AcceptResult =
  | { ok: true; email: string; existingUser: boolean }
  | { ok: false; reason: "invalid" | "password" | "locked" };

export async function acceptInvitation(
  input: { token: string; password: string },
  meta: RequestMeta,
): Promise<AcceptResult> {
  if (await ipBlocked(meta.ip)) return { ok: false, reason: "invalid" };
  const inv = await lookup(input.token);
  if (!inv || !usable(inv)) {
    await invalid(meta);
    return { ok: false, reason: "invalid" };
  }
  const organizationId = inv.organizationId;
  const account = await findAccount(inv.email);
  const existing = account?.passwordHash && !account.anonymizedAt ? { ...account, passwordHash: account.passwordHash } : null;

  let passwordHash: string | undefined;
  if (existing) {
    // rate limit por IP do login; sem auditar cada tentativa, como em verifyCredentials
    if (await loginIpBlocked(meta.ip)) return { ok: false, reason: "locked" };
    // mesma verificação do login: bloqueio, contagem de falhas e auditoria; o convite só é consumido com a senha certa
    const check = await verifyPassword(existing, input.password, {
      userId: existing.id,
      userName: existing.name,
      role: null,
      organizationId: null,
      meta,
    });
    if (check !== "ok") return { ok: false, reason: check === "locked" ? "locked" : "password" };
  } else {
    if (input.password.length < 10) return { ok: false, reason: "invalid" };
    passwordHash = await hashPassword(input.password);
  }

  try {
    await withScope({ organizationId }, async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (count !== 1) throw new Rejected();
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { failedLoginCount: 0, lockedUntil: null } })
        : await tx.user.create({
            data: { name: inv.name, email: inv.email.toLowerCase(), phone: inv.phone, passwordHash },
          });
      const actor: Actor = { userId: user.id, userName: user.name, role: inv.role, organizationId, meta };
      await appendAudit(tx, actor, {
        action: "invitation.accept",
        entityType: "Invitation",
        entityId: inv.id,
        after: { role: inv.role },
      });
      const link = await tx.membership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId } },
      });
      if (link?.active) return;
      if (link) {
        await tx.membership.update({ where: { id: link.id }, data: { active: true, role: inv.role } });
        await appendAudit(tx, actor, {
          action: "member.reactivate",
          entityType: "Membership",
          entityId: link.id,
          before: { active: false, role: link.role },
          after: { active: true, role: inv.role },
        });
        return;
      }
      const created = await tx.membership.create({ data: { userId: user.id, organizationId, role: inv.role } });
      await appendAudit(tx, actor, {
        action: "member.create",
        entityType: "Membership",
        entityId: created.id,
        after: { name: user.name, email: user.email, role: inv.role },
      });
    });
  } catch (e) {
    if (e instanceof Rejected || isUnique(e)) {
      await invalid(meta);
      return { ok: false, reason: "invalid" };
    }
    throw e;
  }
  return { ok: true, email: inv.email.toLowerCase(), existingUser: !!existing };
}
