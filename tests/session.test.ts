import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 60_000;

type Client = import("@/generated/prisma/client").PrismaClient;

describe.skipIf(!APP_URL || !OWNER_URL)("sessão: MASTER dentro da empresa", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let sess: typeof import("@/lib/session");
  let svc: typeof import("@/features/catalog/service");
  let perms: typeof import("@/lib/permissions");
  let db: (typeof import("@/lib/db"))["db"];
  let orgId: string;
  let masterId: string;
  let userId: string;
  let masterSid: string;
  let userSid: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    sess = await import("@/lib/session");
    svc = await import("@/features/catalog/service");
    perms = await import("@/lib/permissions");

    const o = await owner.organization.create({ data: { slug: `ses-${suffix}`, name: "Ses" } });
    orgId = o.id;
    await owner.organizationSettings.create({
      data: { organizationId: orgId, monthStartDay: 5, timezone: "America/Fortaleza", sessionIdleMinutes: 60, customerRetentionMonths: 24 },
    });
    const m = await owner.user.create({
      data: { name: "Master S", email: `master-ses-${suffix}@teste.local`, platformRole: "MASTER" },
    });
    const u = await owner.user.create({ data: { name: "User S", email: `user-ses-${suffix}@teste.local` } });
    masterId = m.id;
    userId = u.id;
    userIds.push(m.id, u.id);
    await owner.membership.create({ data: { userId, organizationId: orgId, role: "FUNCIONARIO" } });
    const mk = async (uid: string) =>
      (
        await owner.session.create({
          data: { userId: uid, organizationId: orgId, idleMinutes: 60, expiresAt: new Date(Date.now() + 86_400_000) },
        })
      ).id;
    masterSid = await mk(masterId);
    userSid = await mk(userId);
  }, T);

  afterAll(async () => {
    const inOrg = { organizationId: orgId };
    await owner.session.deleteMany({ where: { userId: { in: userIds } } });
    await owner.membership.deleteMany({ where: inOrg });
    await owner.category.deleteMany({ where: inOrg });
    await owner.organizationSettings.deleteMany({ where: inOrg });
    await owner.organization.deleteMany({ where: { id: orgId } });
    await owner.user.deleteMany({ where: { id: { in: userIds } } });
    await owner.$disconnect();
    await db.$disconnect();
  });

  const masterMembership = (active = true) =>
    owner.membership.create({ data: { userId: masterId, organizationId: orgId, role: "FUNCIONARIO", active } });

  it("MASTER sem vínculo vira ADMIN e actingAsMaster", async () => {
    const s = await sess.loadSession(masterSid);
    expect(s?.role).toBe("ADMIN");
    expect(s?.actingAsMaster).toBe(true);
  }, T);

  it("MASTER com vínculo ativo usa o papel do vínculo", async () => {
    await masterMembership();
    try {
      const s = await sess.loadSession(masterSid);
      expect(s?.role).toBe("FUNCIONARIO");
      expect(s?.actingAsMaster).toBe(false);
    } finally {
      await owner.membership.deleteMany({ where: { userId: masterId, organizationId: orgId } });
    }
  }, T);

  it("usuário com vínculo desativado fica sem sessão", async () => {
    await owner.membership.updateMany({ where: { userId, organizationId: orgId }, data: { active: false } });
    try {
      expect(await sess.loadSession(userSid)).toBeNull();
    } finally {
      await owner.membership.updateMany({ where: { userId, organizationId: orgId }, data: { active: true } });
    }
  }, T);

  it("empresa suspensa derruba a sessão do MASTER", async () => {
    await owner.organization.update({ where: { id: orgId }, data: { status: "SUSPENDED" } });
    try {
      expect(await sess.loadSession(masterSid)).toBeNull();
    } finally {
      await owner.organization.update({ where: { id: orgId }, data: { status: "ACTIVE" } });
    }
  }, T);

  it("ação do MASTER na empresa é auditada com userRole MASTER", async () => {
    const s = (await sess.loadSession(masterSid))!;
    const { id } = await svc.createCategory(sess.toTenantContext(s, meta), { name: `Cat ${suffix}`, type: "INCOME" });
    const log = await owner.auditLog.findFirst({ where: { action: "category.create", entityId: id, organizationId: orgId } });
    expect(log?.userRole).toBe("MASTER");
    expect(log?.userId).toBe(masterId);
  }, T);

  it("MASTER com vínculo FUNCIONARIO é negado e auditado como FUNCIONARIO", async () => {
    await masterMembership();
    try {
      const s = (await sess.loadSession(masterSid))!;
      await expect(
        svc.createCategory(sess.toTenantContext(s, meta), { name: `Nega ${suffix}`, type: "INCOME" }),
      ).rejects.toBeInstanceOf(perms.ForbiddenError);
      const denied = await owner.auditLog.findFirst({
        where: { organizationId: orgId, result: "DENIED", userId: masterId },
        orderBy: { seq: "desc" },
      });
      expect(denied?.userRole).toBe("FUNCIONARIO");
    } finally {
      await owner.membership.deleteMany({ where: { userId: masterId, organizationId: orgId } });
    }
  }, T);
});
