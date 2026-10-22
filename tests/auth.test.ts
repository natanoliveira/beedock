import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 60_000;

type Client = import("@/generated/prisma/client").PrismaClient;
type Svc = typeof import("@/features/auth/service");

describe.skipIf(!APP_URL || !OWNER_URL)("login", () => {
  const suffix = Date.now().toString(36);
  // sem ip: o rate limit por IP não interfere entre execuções
  const meta = { ip: null, userAgent: "vitest", requestId: null };
  const email = `lockout-${suffix}@teste.local`;
  let owner: Client;
  let svc: Svc;
  let db: typeof import("@/lib/db")["db"];
  let userId = "";
  let memberId = "";
  let orgId = ""; // vazio, não undefined: no Prisma `where: { organizationId: undefined }` apaga tudo se o beforeAll falhar

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    svc = await import("@/features/auth/service");
    const u = await owner.user.create({
      data: { name: "Lockout T", email, passwordHash: await svc.hashPassword("senha-certa-123") },
    });
    userId = u.id;
    orgId = (await owner.organization.create({ data: { name: "Login T", slug: `login-${suffix}` } })).id;
    await owner.organizationSettings.create({ data: { organizationId: orgId, sessionIdleMinutes: 30 } });
    const m = await owner.user.create({
      data: { name: "Membro T", email: `membro-${suffix}@teste.local`, passwordHash: await svc.hashPassword("senha-certa-123") },
    });
    memberId = m.id;
    await owner.membership.create({ data: { userId: m.id, organizationId: orgId, role: "ADMIN" } });
  }, T);

  afterAll(async () => {
    await owner.session.deleteMany({ where: { userId: { in: [userId, memberId] } } });
    await owner.membership.deleteMany({ where: { organizationId: orgId } });
    await owner.organizationSettings.deleteMany({ where: { organizationId: orgId } });
    await owner.organization.deleteMany({ where: { id: orgId } });
    await owner.user.deleteMany({ where: { id: { in: [userId, memberId] } } });
    await owner.$disconnect();
    await db.$disconnect();
  });

  it(
    "tentativas erradas em paralelo bloqueiam a conta uma única vez",
    async () => {
      const attempts = svc.MAX_FAILED_LOGINS + 1;
      const results = await Promise.all(
        Array.from({ length: attempts }, () => svc.verifyCredentials(email, "senha-errada", meta)),
      );
      expect(results.every((r) => !r.ok)).toBe(true);

      const u = await owner.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      // 6 incrementos, um bloqueio que zera em 5: sobra no máximo 1
      expect(u.failedLoginCount).toBeLessThanOrEqual(1);
      expect(await owner.auditLog.count({ where: { action: "auth.locked", entityId: userId } })).toBe(1);
      expect(await owner.auditLog.count({ where: { action: "auth.login_failed", entityId: userId } })).toBe(attempts);

      expect(await svc.verifyCredentials(email, "senha-certa-123", meta)).toEqual({ ok: false, reason: "locked" });
    },
    T,
  );

  it(
    "login lê o vínculo sob RLS, cria a sessão auditada e o logout revoga auditado",
    async () => {
      const r = await svc.verifyCredentials(`membro-${suffix}@teste.local`, "senha-certa-123", meta);
      if (!r.ok) throw new Error(`login falhou: ${r.reason}`);
      const session = await owner.session.findUniqueOrThrow({ where: { id: r.sessionId } });
      expect(session).toMatchObject({ userId: memberId, organizationId: orgId, idleMinutes: 30, revokedAt: null });
      const audited = (action: string) =>
        owner.auditLog.count({ where: { action, entityId: r.sessionId, organizationId: orgId } });
      expect(await audited("auth.login")).toBe(1);

      const actor = { userId: memberId, userName: "Membro T", role: "ADMIN", organizationId: orgId, meta };
      await svc.revokeSession(r.sessionId, actor);
      expect((await owner.session.findUniqueOrThrow({ where: { id: r.sessionId } })).revokedAt).not.toBeNull();
      expect(await audited("auth.logout")).toBe(1);
    },
    T,
  );

  it(
    "login entra na empresa da sessão mais recente; sem vínculo ativo cai na mais antiga",
    async () => {
      const org2 = (await owner.organization.create({ data: { name: "Login T2", slug: `login2-${suffix}` } })).id;
      await owner.organizationSettings.create({ data: { organizationId: org2, sessionIdleMinutes: 20 } });
      const link = await owner.membership.create({ data: { userId: memberId, organizationId: org2, role: "ADMIN" } });
      await owner.session.create({
        data: { userId: memberId, organizationId: org2, idleMinutes: 20, expiresAt: new Date(Date.now() + 86_400_000) },
      });
      try {
        const r = await svc.verifyCredentials(`membro-${suffix}@teste.local`, "senha-certa-123", meta);
        if (!r.ok) throw new Error(`login falhou: ${r.reason}`);
        expect((await owner.session.findUniqueOrThrow({ where: { id: r.sessionId } })).organizationId).toBe(org2);

        await owner.membership.update({ where: { id: link.id }, data: { active: false } });
        const r2 = await svc.verifyCredentials(`membro-${suffix}@teste.local`, "senha-certa-123", meta);
        if (!r2.ok) throw new Error(`login falhou: ${r2.reason}`);
        expect((await owner.session.findUniqueOrThrow({ where: { id: r2.sessionId } })).organizationId).toBe(orgId);
      } finally {
        await owner.session.deleteMany({ where: { userId: memberId } });
        await owner.membership.deleteMany({ where: { organizationId: org2 } });
        await owner.organizationSettings.deleteMany({ where: { organizationId: org2 } });
        await owner.organization.deleteMany({ where: { id: org2 } });
      }
    },
    T,
  );
});
