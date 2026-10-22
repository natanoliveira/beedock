import { z } from "zod";
import type { MemberRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db";
import { assertMaster, type PlatformActor } from "./service";

export const USERS_PAGE_SIZE = 50;

export type UserRow = {
  id: string;
  name: string;
  email: string;
  isMaster: boolean;
  locked: boolean;
  lastSeenAt: Date | null;
  memberships: { id: string; organizationId: string; organizationName: string; role: MemberRole; active: boolean }[];
};

/** Lê os searchParams `?q=&empresa=&pagina=`. */
export const usersFiltersSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    empresa: z.string().min(1).optional(),
    pagina: z.coerce.number().int().catch(1).default(1),
  })
  .transform(({ q, empresa, pagina }) => ({
    ...(q ? { q } : {}),
    ...(empresa ? { organizationId: empresa } : {}),
    page: Math.max(1, pagina),
  }));

export type UsersFilters = { q?: string; organizationId?: string; page: number };

const include = {
  memberships: { include: { organization: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.UserInclude;

type UserWithMemberships = Prisma.UserGetPayload<{ include: typeof include }>;

function toRow(u: UserWithMemberships, lastSeenAt: Date | null, now: Date): UserRow {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isMaster: u.platformRole === "MASTER",
    locked: !!u.lockedUntil && u.lockedUntil > now,
    lastSeenAt,
    memberships: u.memberships.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      role: m.role,
      active: m.active,
    })),
  };
}

export async function listUsers(actor: PlatformActor, filters: UsersFilters): Promise<{ rows: UserRow[]; total: number }> {
  await assertMaster(actor, "platform.user_list");
  const where: Prisma.UserWhereInput = {
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" } },
            { email: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.organizationId ? { memberships: { some: { organizationId: filters.organizationId } } } : {}),
  };
  const now = new Date();
  // Membership/Session sob RLS: tudo numa única transação de plataforma.
  return withScope({ platform: true }, async (tx) => {
    const [users, total] = await Promise.all([
      tx.user.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (filters.page - 1) * USERS_PAGE_SIZE,
        take: USERS_PAGE_SIZE,
        include,
      }),
      tx.user.count({ where }),
    ]);
    const seen = await tx.session.groupBy({
      by: ["userId"],
      where: { userId: { in: users.map((u) => u.id) } },
      _max: { lastSeenAt: true },
    });
    const lastSeen = new Map(seen.map((s) => [s.userId, s._max.lastSeenAt]));
    return { rows: users.map((u) => toRow(u, lastSeen.get(u.id) ?? null, now)), total };
  });
}

export async function getUser(actor: PlatformActor, id: string) {
  await assertMaster(actor, "platform.user_view");
  const now = new Date();
  return withScope({ platform: true }, async (tx) => {
    const u = await tx.user.findUnique({ where: { id }, include });
    if (!u) return null;
    const seen = await tx.session.aggregate({ where: { userId: id }, _max: { lastSeenAt: true } });
    return { ...toRow(u, seen._max.lastSeenAt, now), phone: u.phone, createdAt: u.createdAt };
  });
}

export async function findUserByEmail(actor: PlatformActor, email: string): Promise<{ name: string } | null> {
  await assertMaster(actor, "platform.user_view");
  return withScope({ platform: true }, (tx) =>
    tx.user.findFirst({
      where: { email: email.trim().toLowerCase(), anonymizedAt: null },
      select: { name: true },
    }),
  );
}
