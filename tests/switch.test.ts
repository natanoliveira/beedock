import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 60_000;

type Client = import("@/generated/prisma/client").PrismaClient;

describe.skipIf(!APP_URL || !OWNER_URL)("troca de empresa da sessão", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let sw: typeof import("@/features/members/switch");
  let sess: typeof import("@/lib/session");
  let db: (typeof import("@/lib/db"))["db"];
  let A = "";
  let B = "";
  let C = "";
  let userId = "";
  let masterId = "";
  let userSid = "";
  let masterSid = "";
  const orgIds: string[] = [];
  const userIds: string[] = [];

  const actor = (kind: "user" | "master", sid: string, current: string | null) => ({
    sessionId: sid,
    userId: kind === "user" ? userId : masterId,
    userName: kind === "user" ? "User SW" : "Master SW",
    isMaster: kind === "master",
    currentOrganizationId: current,
    meta,
  });
  const mkSession = async (uid: string, organizationId: string | null) =>
    (
      await owner.session.create({
        data: { userId: uid, organizationId, idleMinutes: 60, expiresAt: new Date(Date.now() + 86_400_000) },
      })
    ).id;
  const row = (sid: string) => owner.session.findUniqueOrThrow({ where: { id: sid } });

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    sw = await import("@/features/members/switch");
    sess = await import("@/lib/session");

    const mkOrg = async (key: string, idle: number, status: "ACTIVE" | "SUSPENDED") => {
      const o = await owner.organization.create({ data: { slug: `sw${key}-${suffix}`, name: `SW ${key} ${suffix}`, status } });
      await owner.organizationSettings.create({ data: { organizationId: o.id, sessionIdleMinutes: idle } });
      orgIds.push(o.id);
      return o.id;
    };
    A = await mkOrg("a", 45, "ACTIVE");
    B = await mkOrg("b", 30, "ACTIVE");
    C = await mkOrg("c", 20, "SUSPENDED");
    const u = await owner.user.create({ data: { name: "User SW", email: `user-sw-${suffix}@teste.local` } });
    const m = await owner.user.create({
      data: { name: "Master SW", email: `master-sw-${suffix}@teste.local`, platformRole: "MASTER" },
    });
    userId = u.id;
    masterId = m.id;
    userIds.push(u.id, m.id);
    for (const organizationId of [A, B, C])
      await owner.membership.create({ data: { userId, organizationId, role: "FUNCIONARIO" } });
    userSid = await mkSession(userId, A);
    masterSid = await mkSession(masterId, null);
  }, T);

  afterAll(async () => {
    await owner.session.deleteMany({ where: { userId: { in: userIds } } });
    await owner.membership.deleteMany({ where: { organizationId: { in: orgIds } } });
    await owner.organizationSettings.deleteMany({ where: { organizationId: { in: orgIds } } });
    await owner.organization.deleteMany({ where: { id: { in: orgIds } } });
    await owner.user.deleteMany({ where: { id: { in: userIds } } });
    await owner.$disconnect();
    await db.$disconnect();
  });

  it("lista as empresas: USER só as vinculadas e ativas, MASTER todas as ativas", async () => {
    const u = await sw.listOrganizationOptions({ userId, isMaster: false });
    expect(u.map((o) => o.id).sort()).toEqual([A, B].sort());
    const m = (await sw.listOrganizationOptions({ userId: masterId, isMaster: true })).map((o) => o.id);
    expect(m).toEqual(expect.arrayContaining([A, B]));
    expect(m).not.toContain(C);
  }, T);

  it("USER troca A->B: sessão, idle da empresa e auditoria", async () => {
    await sw.switchOrganization(actor("user", userSid, A), B);
    expect(await row(userSid)).toMatchObject({ organizationId: B, idleMinutes: 30 });
    const log = await owner.auditLog.findFirst({ where: { organizationId: B, action: "auth.switch_org", entityId: userSid } });
    expect(log?.before).toMatchObject({ organizationId: A });
    expect(log?.after).toMatchObject({ organizationId: B });
    expect(log?.userRole).toBe("FUNCIONARIO");
    await sw.switchOrganization(actor("user", userSid, B), A);
  }, T);

  it("troca para a mesma empresa é no-op", async () => {
    const before = await owner.auditLog.count({ where: { action: "auth.switch_org", entityId: userSid } });
    await sw.switchOrganization(actor("user", userSid, A), A);
    expect(await owner.auditLog.count({ where: { action: "auth.switch_org", entityId: userSid } })).toBe(before);
  }, T);

  it("USER sem vínculo ou em empresa suspensa: Forbidden, sessão intacta, DENIED", async () => {
    const other = await owner.organization.create({ data: { slug: `swx-${suffix}`, name: `SW X ${suffix}` } });
    orgIds.push(other.id);
    await expect(sw.switchOrganization(actor("user", userSid, A), other.id)).rejects.toThrow();
    await expect(sw.switchOrganization(actor("user", userSid, A), C)).rejects.toThrow();
    expect((await row(userSid)).organizationId).toBe(A);
    const denied = await owner.auditLog.count({ where: { organizationId: A, action: "auth.switch_org", result: "DENIED", entityId: other.id } });
    expect(denied).toBe(1);
  }, T);

  it("MASTER entra em A (platform.org_enter) e sai (platform.org_leave)", async () => {
    await sw.switchOrganization(actor("master", masterSid, null), A);
    const enter = await owner.auditLog.findFirst({ where: { organizationId: A, action: "platform.org_enter", entityId: masterSid } });
    expect(enter?.userRole).toBe("MASTER");
    expect((await sess.loadSession(masterSid))?.actingAsMaster).toBe(true);

    await sw.leaveOrganization(actor("master", masterSid, A));
    expect(await row(masterSid)).toMatchObject({ organizationId: null, idleMinutes: 60 });
    const leave = await owner.auditLog.findFirst({ where: { organizationId: A, action: "platform.org_leave", entityId: masterSid } });
    expect(leave?.userRole).toBe("MASTER");
    expect((await sess.loadSession(masterSid))?.organization).toBeNull();
  }, T);

  it("USER não pode sair da empresa", async () => {
    await expect(sw.leaveOrganization(actor("user", userSid, A))).rejects.toThrow();
  }, T);

  it("sessão revogada não troca", async () => {
    const sid = await mkSession(userId, A);
    await owner.session.update({ where: { id: sid }, data: { revokedAt: new Date() } });
    await expect(sw.switchOrganization(actor("user", sid, A), B)).rejects.toThrow();
  }, T);
});
