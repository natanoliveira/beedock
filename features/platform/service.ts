import { createHash, randomBytes, randomUUID } from "node:crypto";
import { seedOrganizationDefaults } from "@/features/organizations/defaults";
import { Prisma } from "@/generated/prisma/client";
import type { OrganizationStatus } from "@/generated/prisma/enums";
import { type Actor, appendAudit, diff, recordAudit } from "@/lib/audit";
import { withScope, type Tx, db } from "@/lib/db";
import { env } from "@/lib/env";
import { ForbiddenError } from "@/lib/permissions";
import { EMAIL_TAKEN, FieldError, SLUG_TAKEN } from "./errors";
import type { AdminInviteInput, OrganizationInput } from "./schemas";

export type PlatformActor = Actor & { userId: string; userName: string; isMaster: boolean };

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  activeUsers: number;
  lastSeenAt: Date | null;
  pendingInvite: { expiresAt: Date; name: string; email: string; phone: string | null } | null;
  admin: { name: string; email: string } | null;
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export async function assertMaster(actor: PlatformActor, action: string): Promise<void> {
  if (actor.isMaster) return;
  await recordAudit(actor, { action, result: "DENIED" });
  throw new ForbiddenError();
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Converte violação de unicidade (corrida entre checagem e insert) em erro de campo. */
async function mapUnique<T>(field: "slug" | "email", fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isUnique(e)) throw new FieldError(field, field === "slug" ? SLUG_TAKEN : EMAIL_TAKEN);
    throw e;
  }
}

function orgData(o: OrganizationInput) {
  return {
    name: o.name,
    slug: o.slug,
    legalName: o.legalName ?? null,
    document: o.document ?? null,
    phone: o.phone ?? null,
    email: o.email ?? null,
    zipCode: o.zipCode ?? null,
    street: o.street ?? null,
    number: o.number ?? null,
    complement: o.complement ?? null,
    district: o.district ?? null,
    city: o.city ?? null,
    state: o.state ?? null,
    pixKey: o.pixKey ?? null,
    primaryColor: o.primaryColor,
  };
}

function settingsData(s: OrganizationInput["settings"]) {
  return {
    monthStartDay: s.monthStartDay,
    timezone: s.timezone,
    sessionIdleMinutes: s.sessionIdleMinutes,
    customerRetentionMonths: s.customerRetentionMonths,
    dpoName: s.dpoName ?? null,
    dpoEmail: s.dpoEmail ?? null,
    dpoPhone: s.dpoPhone ?? null,
  };
}

/** Revoga convites ADMIN pendentes, cria o novo e devolve o link. O token só existe aqui e no link. */
export async function issueInvite(tx: Tx, actor: Actor, organizationId: string, admin: AdminInviteInput): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  await tx.invitation.updateMany({
    where: { organizationId, role: "ADMIN", acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const invite = await tx.invitation.create({
    data: {
      email: admin.email,
      name: admin.name,
      phone: admin.phone ?? null,
      role: "ADMIN",
      tokenHash,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdById: actor.userId,
    },
  });
  await appendAudit(tx, { ...actor, organizationId }, {
    action: "invitation.create",
    entityType: "Invitation",
    entityId: invite.id,
    after: { name: admin.name, email: admin.email, role: "ADMIN" },
  });
  return `${env.AUTH_URL}/convite/${token}`;
}

export async function createOrganization(
  actor: PlatformActor,
  org: OrganizationInput,
  admin: AdminInviteInput,
): Promise<{ organizationId: string; inviteUrl: string }> {
  await assertMaster(actor, "platform.organization_create");

  if (await db.organization.findUnique({ where: { slug: org.slug }, select: { id: true } })) {
    throw new FieldError("slug", SLUG_TAKEN);
  }
  if (await db.user.findUnique({ where: { email: admin.email }, select: { id: true } })) {
    throw new FieldError("email", EMAIL_TAKEN);
  }

  const organizationId = randomUUID();
  const orgActor = { ...actor, organizationId };
  const inviteUrl = await mapUnique("slug", () =>
    withScope({ organizationId }, async (tx) => {
      await tx.organization.create({ data: { id: organizationId, ...orgData(org) } });
      if (await tx.user.findUnique({ where: { email: admin.email }, select: { id: true } })) {
        throw new FieldError("email", EMAIL_TAKEN);
      }
      await seedOrganizationDefaults(tx, organizationId, settingsData(org.settings));
      await appendAudit(tx, orgActor, {
        action: "platform.organization_create",
        entityType: "Organization",
        entityId: organizationId,
        after: { name: org.name, slug: org.slug },
      });
      return issueInvite(tx, actor, organizationId, admin);
    }),
  );
  return { organizationId, inviteUrl };
}

export async function updateOrganization(actor: PlatformActor, id: string, org: OrganizationInput): Promise<void> {
  await assertMaster(actor, "platform.organization_update");
  await mapUnique("slug", () =>
    withScope({ organizationId: id }, async (tx) => {
      const [current, currentSettings] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id } }),
        tx.organizationSettings.findUniqueOrThrow({ where: { organizationId: id } }),
      ]);
      const data = orgData(org);
      const sData = settingsData(org.settings);
      await tx.organization.update({ where: { id }, data });
      await tx.organizationSettings.update({ where: { organizationId: id }, data: { ...sData, updatedById: actor.userId } });
      const pickKeys = <T extends object>(src: T, keys: object) =>
        Object.fromEntries(Object.keys(keys).map((k) => [k, src[k as keyof T]]));
      const { before, after } = diff(
        { ...pickKeys(current, data), settings: pickKeys(currentSettings, sData) },
        { ...data, settings: sData },
      );
      await appendAudit(tx, { ...actor, organizationId: id }, {
        action: "platform.organization_update",
        entityType: "Organization",
        entityId: id,
        before,
        after,
      });
    }),
  );
}

export async function listOrganizations(actor: PlatformActor): Promise<OrganizationRow[]> {
  await assertMaster(actor, "platform.organization_list");
  const [orgs, counts, seen, invites, admins] = await Promise.all([
    db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, status: true } }),
    db.membership.groupBy({ by: ["organizationId"], where: { active: true }, _count: { _all: true } }),
    db.session.groupBy({ by: ["organizationId"], where: { organizationId: { not: null } }, _max: { lastSeenAt: true } }),
    withScope({ platform: true }, (tx) =>
      tx.invitation.findMany({
        where: { role: "ADMIN", acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { organizationId: true, expiresAt: true, name: true, email: true, phone: true },
      }),
    ),
    db.membership.findMany({
      where: { role: "ADMIN", active: true },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  const activeUsers = new Map(counts.map((c) => [c.organizationId, c._count._all]));
  const lastSeen = new Map(seen.map((s) => [s.organizationId, s._max.lastSeenAt]));
  const invite = new Map<string, (typeof invites)[number]>();
  for (const i of invites) if (!invite.has(i.organizationId)) invite.set(i.organizationId, i);
  const admin = new Map<string, { name: string; email: string }>();
  for (const a of admins) if (!admin.has(a.organizationId)) admin.set(a.organizationId, a.user);

  return orgs.map((o) => {
    const inv = invite.get(o.id);
    return {
      ...o,
      activeUsers: activeUsers.get(o.id) ?? 0,
      lastSeenAt: lastSeen.get(o.id) ?? null,
      pendingInvite: inv ? { expiresAt: inv.expiresAt, name: inv.name, email: inv.email, phone: inv.phone } : null,
      admin: admin.get(o.id) ?? null,
    };
  });
}

export async function getOrganization(actor: PlatformActor, id: string) {
  await assertMaster(actor, "platform.organization_view");
  return withScope({ organizationId: id }, async (tx) => {
    const o = await tx.organization.findUnique({ where: { id } });
    const s = await tx.organizationSettings.findUnique({ where: { organizationId: id } });
    if (!o || !s) return null;
    const u = <T>(v: T | null) => v ?? undefined;
    return {
      id: o.id,
      status: o.status,
      logoUrl: o.logoUrl,
      name: o.name,
      slug: o.slug,
      primaryColor: o.primaryColor,
      legalName: u(o.legalName),
      document: u(o.document),
      phone: u(o.phone),
      email: u(o.email),
      zipCode: u(o.zipCode),
      street: u(o.street),
      number: u(o.number),
      complement: u(o.complement),
      district: u(o.district),
      city: u(o.city),
      state: u(o.state),
      pixKey: u(o.pixKey),
      settings: {
        monthStartDay: s.monthStartDay,
        timezone: s.timezone,
        sessionIdleMinutes: s.sessionIdleMinutes,
        customerRetentionMonths: s.customerRetentionMonths,
        dpoName: u(s.dpoName),
        dpoEmail: u(s.dpoEmail),
        dpoPhone: u(s.dpoPhone),
      },
    };
  });
}

export async function setOrganizationStatus(
  actor: PlatformActor,
  id: string,
  status: "ACTIVE" | "SUSPENDED",
  reason?: string,
): Promise<void> {
  const suspend = status === "SUSPENDED";
  const action = suspend ? "platform.organization_suspend" : "platform.organization_reactivate";
  await assertMaster(actor, action);
  await withScope({ organizationId: id }, async (tx) => {
    const current = await tx.organization.findUniqueOrThrow({ where: { id }, select: { status: true } });
    await tx.organization.update({ where: { id }, data: { status } });
    if (suspend) {
      await tx.session.updateMany({ where: { organizationId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await appendAudit(tx, { ...actor, organizationId: id }, {
      action,
      entityType: "Organization",
      entityId: id,
      before: { status: current.status },
      after: { status, ...(reason ? { reason } : {}) },
    });
  });
}
