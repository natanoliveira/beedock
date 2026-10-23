import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 60_000;

type Client = import("@/generated/prisma/client").PrismaClient;
type Svc = typeof import("@/features/organizations/service");
type Schemas = typeof import("@/features/organizations/schemas");
type Ctx = import("@/lib/audit").TenantContext;

describe.skipIf(!APP_URL || !OWNER_URL)("service de configurações da empresa", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let svc: Svc;
  let ForbiddenError: typeof import("@/lib/permissions").ForbiddenError;
  let schemas: Schemas;
  let db: (typeof import("@/lib/db"))["db"];
  let orgA = ""; // vazio, não undefined: `where: { x: undefined }` apaga a tabela inteira
  let orgB = "";
  let adminA: Ctx;
  let funcA: Ctx;
  let adminB: Ctx;
  let masterCtx: Ctx;
  const userIds: string[] = [];
  const sessions: Record<string, string> = {};

  const valid = (name = "A2") => ({
    name,
    primaryColor: "#123456",
    settings: { monthStartDay: 10, timezone: "America/Manaus", sessionIdleMinutes: 60, customerRetentionMonths: 24 },
  });
  type Valid = ReturnType<typeof valid>;
  const input = (over: Partial<Omit<Valid, "settings">> & { settings?: Partial<Valid["settings"]> } = {}) => {
    const v = valid();
    return schemas.companySettingsSchema.parse({ ...v, ...over, settings: { ...v.settings, ...over.settings } });
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    svc = await import("@/features/organizations/service");
    ({ ForbiddenError } = await import("@/lib/permissions"));
    schemas = await import("@/features/organizations/schemas");

    const mkOrg = async (tag: string) => {
      const o = await owner.organization.create({ data: { slug: `cs-${tag}-${suffix}`, name: `Cs ${tag}` } });
      await owner.organizationSettings.create({
        data: {
          organizationId: o.id,
          monthStartDay: 5,
          timezone: "America/Fortaleza",
          sessionIdleMinutes: 60,
          customerRetentionMonths: 24,
        },
      });
      return o.id;
    };
    orgA = await mkOrg("a");
    orgB = await mkOrg("b");
    const mkUser = async (tag: string, orgId: string | null, role: "ADMIN" | "FUNCIONARIO" | null, master = false) => {
      const u = await owner.user.create({
        data: {
          name: `U ${tag}`,
          email: `cs-${tag}-${suffix}@teste.local`,
          ...(master ? { platformRole: "MASTER" as const } : {}),
        },
      });
      userIds.push(u.id);
      if (orgId && role) await owner.membership.create({ data: { userId: u.id, organizationId: orgId, role } });
      if (orgId) {
        sessions[tag] = (
          await owner.session.create({
            data: {
              userId: u.id,
              organizationId: orgId,
              idleMinutes: 60,
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          })
        ).id;
      }
      return u;
    };
    const ctx = (
      u: { id: string; name: string },
      organizationId: string,
      role: "ADMIN" | "FUNCIONARIO",
      auditRole?: string,
    ): Ctx => ({
      userId: u.id,
      userName: u.name,
      organizationId,
      role,
      auditRole,
      meta,
    });
    adminA = ctx(await mkUser("adma", orgA, "ADMIN"), orgA, "ADMIN");
    funcA = ctx(await mkUser("funa", orgA, "FUNCIONARIO"), orgA, "FUNCIONARIO");
    adminB = ctx(await mkUser("admb", orgB, "ADMIN"), orgB, "ADMIN");
    masterCtx = ctx(await mkUser("mst", null, null, true), orgA, "ADMIN", "MASTER");
  }, T);

  afterAll(async () => {
    const inOrgs = { organizationId: { in: [orgA, orgB] } };
    await owner.session.deleteMany({ where: { userId: { in: userIds } } });
    await owner.membership.deleteMany({ where: inOrgs });
    await owner.organizationSettings.deleteMany({ where: inOrgs });
    await owner.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await owner.user.deleteMany({ where: { id: { in: userIds } } });
    await owner.$disconnect();
    await db.$disconnect();
  }, T);

  it(
    "Admin salva org + settings e audita",
    async () => {
      await svc.updateCompanySettings(adminA, input({ name: "A2" }));
      const o = await owner.organization.findUniqueOrThrow({ where: { id: orgA } });
      const s = await owner.organizationSettings.findUniqueOrThrow({ where: { organizationId: orgA } });
      expect(o.name).toBe("A2");
      expect(o.primaryColor).toBe("#123456");
      expect(s.monthStartDay).toBe(10);
      expect(s.timezone).toBe("America/Manaus");
      expect(s.updatedById).toBe(adminA.userId);
      const log = await owner.auditLog.findFirstOrThrow({
        where: { organizationId: orgA, action: "organization.update" },
        orderBy: { seq: "desc" },
      });
      const after = log.after as { primaryColor: string; settings: { monthStartDay: number } };
      expect(after.primaryColor).toBe("#123456");
      expect(after.settings.monthStartDay).toBe(10);
    },
    T,
  );

  it(
    "slug/status forjados são descartados pelo schema e não mudam",
    async () => {
      const parsed = schemas.companySettingsSchema.parse({ ...valid(), slug: "x", status: "SUSPENDED" });
      expect(parsed).not.toHaveProperty("slug");
      expect(parsed).not.toHaveProperty("status");
      const before = await owner.organization.findUniqueOrThrow({ where: { id: orgA } });
      await svc.updateCompanySettings(adminA, parsed);
      const after = await owner.organization.findUniqueOrThrow({ where: { id: orgA } });
      expect(after.slug).toBe(before.slug);
      expect(after.status).toBe("ACTIVE");
    },
    T,
  );

  it(
    "Funcionário é negado e auditado",
    async () => {
      await expect(svc.updateCompanySettings(funcA, input({ name: "Hack" }))).rejects.toBeInstanceOf(ForbiddenError);
      const o = await owner.organization.findUniqueOrThrow({ where: { id: orgA } });
      expect(o.name).not.toBe("Hack");
      const denied = await owner.auditLog.findFirst({
        where: { organizationId: orgA, action: "settings.manage", result: "DENIED", userId: funcA.userId },
      });
      expect(denied).not.toBeNull();
    },
    T,
  );

  it(
    "Admin de B altera só B",
    async () => {
      await svc.updateCompanySettings(adminB, input({ name: "B2" }));
      expect((await owner.organization.findUniqueOrThrow({ where: { id: orgB } })).name).toBe("B2");
      expect((await owner.organization.findUniqueOrThrow({ where: { id: orgA } })).name).not.toBe("B2");
    },
    T,
  );

  it(
    "sessionIdleMinutes propaga só para sessões da empresa",
    async () => {
      await svc.updateCompanySettings(adminA, input({ settings: { sessionIdleMinutes: 15 } }));
      const a = await owner.session.findMany({ where: { organizationId: orgA } });
      expect(a.length).toBeGreaterThan(0);
      expect(a.every((s) => s.idleMinutes === 15)).toBe(true);
      expect((await owner.session.findUniqueOrThrow({ where: { id: sessions.admb } })).idleMinutes).toBe(60);
    },
    T,
  );

  it(
    "MASTER dentro da empresa audita como MASTER",
    async () => {
      await svc.updateCompanySettings(masterCtx, input({ name: "A3" }));
      const log = await owner.auditLog.findFirstOrThrow({
        where: { organizationId: orgA, action: "organization.update", userId: masterCtx.userId },
        orderBy: { seq: "desc" },
      });
      expect(log.userRole).toBe("MASTER");
    },
    T,
  );

  it(
    "aceita fuso America/New_York",
    async () => {
      await svc.updateCompanySettings(adminA, input({ settings: { timezone: "America/New_York" } }));
      expect((await owner.organizationSettings.findUniqueOrThrow({ where: { organizationId: orgA } })).timezone).toBe(
        "America/New_York",
      );
    },
    T,
  );

  it(
    "getCompanySettings lê só a empresa do ctx",
    async () => {
      const r = await svc.getCompanySettings(adminB);
      expect(r?.id).toBe(orgB);
    },
    T,
  );

  it(
    "setCompanyLogo grava, remove e é no-op com a mesma URL",
    async () => {
      const url = `https://x.public.blob.vercel-storage.com/org/${orgA}/logo-1.webp`;
      const events = () =>
        owner.auditLog.findMany({
          where: { organizationId: orgA, action: "organization.update", userId: adminA.userId },
          orderBy: { seq: "desc" },
        });
      const base = (await events()).length;
      expect((await svc.setCompanyLogo(adminA, url)).previous).toBeNull();
      expect((await owner.organization.findUniqueOrThrow({ where: { id: orgA } })).logoUrl).toBe(url);
      const [first] = await events();
      expect((first.after as { logoUrl: string }).logoUrl).toBe("logo-1.webp");
      await svc.setCompanyLogo(adminA, url);
      expect((await events()).length).toBe(base + 1);
      expect((await svc.setCompanyLogo(adminA, null)).previous).toBe(url);
      expect((await owner.organization.findUniqueOrThrow({ where: { id: orgA } })).logoUrl).toBeNull();
      const [last] = await events();
      expect((last.before as { logoUrl: string }).logoUrl).toBe("logo-1.webp");
    },
    T,
  );

  it(
    "setCompanyLogo concorrente: cada gravação devolve o logo que de fato substituiu",
    async () => {
      const u = (n: number) => `https://x.public.blob.vercel-storage.com/org/${orgA}/logo-c${n}.webp`;
      const res = await Promise.all([svc.setCompanyLogo(adminA, u(1)), svc.setCompanyLogo(adminA, u(2))]);
      const final = (await owner.organization.findUniqueOrThrow({ where: { id: orgA } })).logoUrl;
      // serializado: um substituiu null, o outro substituiu o do primeiro (nenhum blob órfão)
      expect(res.map((r) => r.previous)).toEqual(expect.arrayContaining([null, final === u(1) ? u(2) : u(1)]));
      expect((await svc.setCompanyLogo(adminA, null)).previous).toBe(final);
    },
    T,
  );

  it(
    "Funcionário não altera o logo",
    async () => {
      await expect(svc.setCompanyLogo(funcA, "https://x/logo-2.webp")).rejects.toBeInstanceOf(ForbiddenError);
      expect((await owner.organization.findUniqueOrThrow({ where: { id: orgA } })).logoUrl).toBeNull();
    },
    T,
  );
});
