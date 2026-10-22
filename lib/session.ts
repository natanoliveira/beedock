import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { MemberRole } from "@/generated/prisma/enums";
import type { TenantContext } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db, withScope } from "@/lib/db";
import { requestMeta } from "@/lib/request";

const TOUCH_AFTER_MS = 60_000;

export type CurrentSession = {
  sessionId: string;
  user: { id: string; name: string; email: string; isMaster: boolean };
  organization: { id: string; name: string; logoUrl: string | null; primaryColor: string } | null;
  role: MemberRole | null;
};

/** Sessão validada no banco: revogada, expirada, ociosa ou empresa suspensa = sem sessão. */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const sid = (await auth())?.sid;
  if (!sid) return null;

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
  if (row.organization) {
    if (row.organization.status !== "ACTIVE") return null;
    const organizationId = row.organization.id;
    const membership = await withScope({ organizationId }, (tx) =>
      tx.membership.findUnique({ where: { userId_organizationId: { userId: row.userId, organizationId } } }),
    );
    if (!membership?.active && !isMaster) return null;
    role = membership?.active ? membership.role : null;
  } else if (!isMaster) {
    return null;
  }

  if (now - row.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    await db.session.update({ where: { id: sid }, data: { lastSeenAt: new Date() } });
  }

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
  };
});

/** Contexto de empresa para Server Actions e páginas da área logada. */
export async function requireTenant(): Promise<TenantContext & { session: CurrentSession }> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.organization || !session.role) redirect(session.user.isMaster ? "/plataforma" : "/login");
  return {
    session,
    userId: session.user.id,
    userName: session.user.name,
    organizationId: session.organization.id,
    role: session.role,
    meta: requestMeta(await headers()),
  };
}

export async function requireMaster(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.user.isMaster) redirect("/inicio");
  return session;
}
