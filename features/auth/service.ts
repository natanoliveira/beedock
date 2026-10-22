import { hash, verify } from "@node-rs/argon2";
import { actorScope, appendAudit, recordAudit, type Actor, type RequestMeta } from "@/lib/audit";
import { db, withScope } from "@/lib/db";
import { logger } from "@/lib/logger";

export const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const IP_WINDOW_MINUTES = 15;
export const IP_MAX_FAILURES = 20;
const SESSION_MAX_DAYS = 7;
export const DEFAULT_IDLE_MINUTES = 60;

export type LoginResult =
  { ok: true; sessionId: string } | { ok: false; reason: "invalid" | "locked" | "rate" | "inactive" };

let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string) {
  return hash(password); // Argon2id (padrão da lib)
}

const anonymous = (meta: RequestMeta): Actor => ({
  userId: null,
  userName: null,
  role: null,
  organizationId: null,
  meta,
});

export async function ipBlocked(ip: string | null) {
  if (!ip) return false;
  // ponytail: rate limit por IP contando falhas na própria auditoria; trocar por Redis/Upstash se o volume crescer
  const since = new Date(Date.now() - IP_WINDOW_MINUTES * 60_000);
  const failures = await withScope({ platform: true }, (tx) =>
    tx.auditLog.count({ where: { action: "auth.login_failed", ip, occurredAt: { gte: since } } }),
  );
  return failures >= IP_MAX_FAILURES;
}

/** Bloqueio, verificação em tempo constante, contagem atômica de falhas e eventos auth.*; compartilhada com o aceite de convite. */
export async function verifyPassword(
  user: { id: string; passwordHash: string; lockedUntil: Date | null },
  password: string,
  actor: Actor,
): Promise<"ok" | "invalid" | "locked"> {
  dummyHash ??= hash("tempo-constante");
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await verify(await dummyHash, password); // bloqueado responde no mesmo tempo
    await recordAudit(actor, { action: "auth.login_blocked", entityType: "User", entityId: user.id, result: "DENIED" });
    return "locked";
  }

  if (!(await verify(user.passwordHash, password))) {
    // incremento atômico: tentativas em paralelo não escapam do bloqueio
    await db.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } } });
    const { count } = await db.user.updateMany({
      where: { id: user.id, failedLoginCount: { gte: MAX_FAILED_LOGINS } },
      data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
    });
    const lock = count > 0;
    // ip entra no evento para o rate limit; falha sem empresa vai para a cadeia da plataforma
    await recordAudit(actor, { action: "auth.login_failed", entityType: "User", entityId: user.id, result: "FAILED" });
    if (lock)
      await recordAudit(actor, { action: "auth.locked", entityType: "User", entityId: user.id, result: "DENIED" });
    return lock ? "locked" : "invalid";
  }
  return "ok";
}

export async function verifyCredentials(email: string, password: string, meta: RequestMeta): Promise<LoginResult> {
  if (await ipBlocked(meta.ip)) {
    // não audita cada tentativa bloqueada: evita enxurrada na cadeia da plataforma (as falhas já estão lá)
    logger.warn("auth.rate_limited", { ip: meta.ip });
    return { ok: false, reason: "rate" };
  }

  // empresa ainda desconhecida: vínculos (RLS) lidos no escopo da plataforma
  const user = await withScope({ platform: true }, (tx) =>
    tx.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          where: { active: true, organization: { status: "ACTIVE" } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  );

  dummyHash ??= hash("tempo-constante");

  if (!user?.passwordHash || user.anonymizedAt) {
    await verify(await dummyHash, password); // mesmo custo de tempo de um usuário real
    await recordAudit(anonymous(meta), { action: "auth.login_failed", result: "FAILED" });
    return { ok: false, reason: "invalid" };
  }

  // entra na empresa da sessão mais recente; sem histórico, no vínculo mais antigo
  const lastSession = user.memberships.length > 1
    ? await db.session.findFirst({
        where: { userId: user.id, organizationId: { in: user.memberships.map((m) => m.organizationId) } },
        orderBy: { lastSeenAt: "desc" },
        select: { organizationId: true },
      })
    : null;
  const membership = user.memberships.find((m) => m.organizationId === lastSession?.organizationId) ?? user.memberships[0];
  const actor: Actor = {
    userId: user.id,
    userName: user.name,
    role: user.platformRole === "MASTER" ? "MASTER" : (membership?.role ?? null),
    organizationId: user.platformRole === "MASTER" ? null : (membership?.organizationId ?? null),
    meta,
  };

  const check = await verifyPassword({ id: user.id, passwordHash: user.passwordHash, lockedUntil: user.lockedUntil }, password, actor);
  if (check !== "ok") return { ok: false, reason: check };

  if (user.platformRole !== "MASTER" && !membership) {
    await recordAudit(actor, {
      action: "auth.login_inactive",
      entityType: "User",
      entityId: user.id,
      result: "DENIED",
    });
    return { ok: false, reason: "inactive" };
  }

  // sessão, reset das falhas e auditoria na mesma transação: sem login sem rastro
  const session = await withScope(actorScope(actor), async (tx) => {
    const settings = actor.organizationId
      ? await tx.organizationSettings.findFirst({ select: { sessionIdleMinutes: true } })
      : null;
    const created = await tx.session.create({
      data: {
        userId: user.id,
        organizationId: actor.organizationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        idleMinutes: settings?.sessionIdleMinutes ?? DEFAULT_IDLE_MINUTES,
        expiresAt: new Date(Date.now() + SESSION_MAX_DAYS * 86_400_000),
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await appendAudit(tx, actor, { action: "auth.login", entityType: "Session", entityId: created.id });
    return created;
  });
  return { ok: true, sessionId: session.id };
}

export async function revokeSession(sessionId: string, actor: Actor) {
  await withScope(actorScope(actor), async (tx) => {
    await tx.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    await appendAudit(tx, actor, { action: "auth.logout", entityType: "Session", entityId: sessionId });
  });
}
