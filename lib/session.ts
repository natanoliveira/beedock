import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { MemberRole } from "@/generated/prisma/enums";
import type { RequestMeta, TenantContext } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db, withScope } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { hasPendingLegalDocuments } from "@/features/legal/service";

const TOUCH_AFTER_MS = 60_000;

export type CurrentSession = {
  sessionId: string;
  user: { id: string; name: string; email: string; isMaster: boolean };
  organization: { id: string; name: string; logoUrl: string | null; primaryColor: string } | null;
  role: MemberRole | null;
  /** MASTER dentro da empresa sem vínculo próprio: age como ADMIN, auditado como MASTER. */
  actingAsMaster: boolean;
  /** Há termos/privacidade vigentes não aceitos. MASTER é isento (sempre false). */
  pendingTerms: boolean;
};

/** Sessão validada no banco: revogada, expirada, ociosa ou empresa suspensa = sem sessão. */
export async function loadSession(sid: string): Promise<CurrentSession | null> {
  const row = await db.session.findUnique({
    where: { id: sid },
    include: { user: true, organization: true },
  });
  const now = Date.now();
  if (
    !row ||
    row.revokedAt ||
    row.expiresAt.getTime() < now ||
    now - row.lastSeenAt.getTime() > row.idleMinutes * 60_000 ||
    row.user.anonymizedAt
  ) {
    return null;
  }

  const isMaster = row.user.platformRole === "MASTER";
  let role: MemberRole | null = null;
  let actingAsMaster = false;
  if (row.organization) {
    if (row.organization.status !== "ACTIVE") return null;
    const organizationId = row.organization.id;
    const membership = await withScope({ organizationId }, (tx) =>
      tx.membership.findUnique({ where: { userId_organizationId: { userId: row.userId, organizationId } } }),
    );
    if (!membership?.active && !isMaster) return null;
    if (membership?.active) role = membership.role;
    else {
      role = "ADMIN";
      actingAsMaster = true;
    }
  } else if (!isMaster) {
    return null;
  }

  const [pendingTerms] = await Promise.all([
    !isMaster && hasPendingLegalDocuments(row.userId),
    now - row.lastSeenAt.getTime() > TOUCH_AFTER_MS &&
      db.session.update({ where: { id: sid }, data: { lastSeenAt: new Date() } }),
  ]);

  return {
    sessionId: row.id,
    user: { id: row.user.id, name: row.user.name, email: row.user.email, isMaster },
    organization: row.organization && {
      id: row.organization.id,
      name: row.organization.name,
      logoUrl: row.organization.logoUrl,
      primaryColor: row.organization.primaryColor,
    },
    role,
    actingAsMaster,
    pendingTerms,
  };
}

export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const sid = (await auth())?.sid;
  return sid ? loadSession(sid) : null;
});

export function toTenantContext(
  session: CurrentSession,
  meta: RequestMeta,
): TenantContext & { session: CurrentSession } {
  if (!session.organization || !session.role) throw new Error("Sessão sem empresa.");
  return {
    session,
    userId: session.user.id,
    userName: session.user.name,
    organizationId: session.organization.id,
    role: session.role,
    auditRole: session.actingAsMaster ? "MASTER" : undefined,
    meta,
  };
}

/** Guard único da área logada: sem sessão → /login; termos pendentes → /aceite. */
export async function requireAcceptedSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.pendingTerms) redirect("/aceite");
  return session;
}

/** Contexto de empresa para Server Actions e páginas da área logada. */
export async function requireTenant(): Promise<TenantContext & { session: CurrentSession }> {
  const session = await requireAcceptedSession();
  if (!session.organization || !session.role) redirect(session.user.isMaster ? "/plataforma" : "/login");
  return toTenantContext(session, requestMeta(await headers()));
}

export async function requireMaster(): Promise<CurrentSession> {
  const session = await requireAcceptedSession();
  if (!session.user.isMaster) redirect("/inicio");
  return session;
}
