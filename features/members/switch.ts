import { DEFAULT_IDLE_MINUTES } from "@/features/auth/service";
import { appendAudit, recordAudit, type RequestMeta } from "@/lib/audit";
import { withScope } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";

export type SessionActor = {
  sessionId: string;
  userId: string;
  userName: string;
  isMaster: boolean;
  currentOrganizationId: string | null;
  meta: RequestMeta;
};

/** Empresas ativas que o usuário pode abrir: vínculos ativos (USER) ou todas (MASTER). */
export function listOrganizationOptions(actor: Pick<SessionActor, "userId" | "isMaster">) {
  return withScope({ platform: true }, (tx) =>
    tx.organization.findMany({
      where: {
        status: "ACTIVE",
        ...(actor.isMaster ? {} : { memberships: { some: { userId: actor.userId, active: true } } }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  );
}

const baseActor = (a: SessionActor) => ({
  userId: a.userId,
  userName: a.userName,
  role: a.isMaster ? "MASTER" : null,
  organizationId: a.currentOrganizationId,
  meta: a.meta,
});

async function deny(a: SessionActor, action: string, entityType: string, entityId: string): Promise<never> {
  await recordAudit(baseActor(a), { action, entityType, entityId, result: "DENIED" });
  throw new ForbiddenError();
}

export async function switchOrganization(actor: SessionActor, organizationId: string): Promise<void> {
  const target = await withScope({ platform: true }, (tx) =>
    tx.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE" },
      select: {
        id: true,
        memberships: { where: { userId: actor.userId, active: true }, select: { role: true } },
      },
    }),
  );
  const membership = target?.memberships[0];
  if (!target || (!actor.isMaster && !membership)) return deny(actor, "auth.switch_org", "Organization", organizationId);
  if (organizationId === actor.currentOrganizationId) return;

  await withScope({ organizationId }, async (tx) => {
    const settings = await tx.organizationSettings.findFirst({ select: { sessionIdleMinutes: true } });
    const { count } = await tx.session.updateMany({
      where: { id: actor.sessionId, userId: actor.userId, revokedAt: null },
      data: {
        organizationId,
        idleMinutes: settings?.sessionIdleMinutes ?? DEFAULT_IDLE_MINUTES,
        lastSeenAt: new Date(),
      },
    });
    if (count !== 1) throw new ForbiddenError();
    await appendAudit(
      tx,
      { ...baseActor(actor), role: membership ? membership.role : "MASTER", organizationId },
      {
        action: membership ? "auth.switch_org" : "platform.org_enter",
        entityType: "Session",
        entityId: actor.sessionId,
        before: { organizationId: actor.currentOrganizationId },
        after: { organizationId },
      },
    );
  });
}

export async function leaveOrganization(actor: SessionActor): Promise<void> {
  const current = actor.currentOrganizationId;
  if (!actor.isMaster) return deny(actor, "platform.org_leave", "Session", actor.sessionId);
  if (!current) return;
  await withScope({ organizationId: current }, async (tx) => {
    const { count } = await tx.session.updateMany({
      where: { id: actor.sessionId, userId: actor.userId, revokedAt: null },
      data: { organizationId: null, idleMinutes: DEFAULT_IDLE_MINUTES },
    });
    if (count !== 1) throw new ForbiddenError();
    await appendAudit(tx, baseActor(actor), {
      action: "platform.org_leave",
      entityType: "Session",
      entityId: actor.sessionId,
      before: { organizationId: current },
      after: { organizationId: null },
    });
  });
}
