import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;

type Client = import("@/generated/prisma/client").PrismaClient;
type Users = typeof import("@/features/platform/users");
type Actor = import("@/features/platform/service").PlatformActor;

describe.skipIf(!APP_URL || !OWNER_URL)("service da lista global de usuários", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let svc: Users;
  let db: typeof import("@/lib/db")["db"];
  let master: Actor;
  let user: Actor;
  let orgId = ""; // vazio, não undefined: no Prisma `where: { organizationId: undefined }` apaga tudo se o beforeAll falhar
  const userIds: string[] = [];
  const emails: string[] = [];
  // atores sem o suffix no e-mail/nome, para não entrarem na busca por suffix
  const mail = (tag: string, actor = false) => {
    const e = actor ? `${tag}-${Math.random().toString(36).slice(2)}@teste.local` : `${tag}-${suffix}@teste.local`;
    emails.push(e);
    return e;
  };
  let activeId: string;
  let inactiveId: string;
  const activeEmail = () => `ativo-${suffix}@teste.local`;

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    svc = await import("@/features/platform/users");

    const m = await owner.user.create({ data: { name: "Master U", email: mail("master", true), platformRole: "MASTER" } });
    const u = await owner.user.create({ data: { name: "User U", email: mail("user", true) } });
    userIds.push(m.id, u.id);
    master = { userId: m.id, userName: m.name, role: null, organizationId: null, meta, isMaster: true };
    user = { userId: u.id, userName: u.name, role: null, organizationId: null, meta, isMaster: false };

    const org = await owner.organization.create({ data: { name: `Empresa U ${suffix}`, slug: `u-${suffix}` } });
    orgId = org.id;
    const a = await owner.user.create({ data: { name: `Zeta A ${suffix}`, email: activeEmail() } });
    const i = await owner.user.create({ data: { name: `Zeta I ${suffix}`, email: mail("inativo") } });
    const f = await owner.user.create({ data: { name: `Zeta F ${suffix}`, email: mail("livre") } });
    [activeId, inactiveId] = [a.id, i.id];
    userIds.push(a.id, i.id, f.id);
    await owner.membership.create({ data: { userId: a.id, organizationId: orgId, role: "ADMIN" } });
    await owner.membership.create({ data: { userId: i.id, organizationId: orgId, role: "FUNCIONARIO", active: false } });
  });

  afterAll(async () => {
    await owner.session.deleteMany({ where: { organizationId: orgId } });
    await owner.membership.deleteMany({ where: { organizationId: orgId } });
    await owner.organizationSettings.deleteMany({ where: { organizationId: orgId } });
    await owner.organization.deleteMany({ where: { id: orgId } });
    await owner.user.deleteMany({ where: { OR: [{ id: { in: userIds } }, { email: { in: emails } }] } });
    await owner.$disconnect();
    await db.$disconnect();
  });

  it("busca por nome/e-mail sem diferenciar maiúsculas", async () => {
    const r = await svc.listUsers(master, { q: suffix, page: 1 });
    expect(r.rows).toHaveLength(3);
    expect(r.total).toBe(3);
    const up = await svc.listUsers(master, { q: suffix.toUpperCase(), page: 1 });
    expect(up.rows.map((x) => x.id).sort()).toEqual(r.rows.map((x) => x.id).sort());
  });

  it("filtra por empresa e traz vínculos lidos no escopo da plataforma", async () => {
    const r = await svc.listUsers(master, { q: suffix, organizationId: orgId, page: 1 });
    expect(r.rows).toHaveLength(2);
    for (const row of r.rows) {
      const m = row.memberships.find((x) => x.organizationId === orgId);
      expect(m?.organizationName).toBe(`Empresa U ${suffix}`);
    }
    const inactive = r.rows.find((x) => x.id === inactiveId)!;
    expect(inactive.memberships[0].active).toBe(false);
    expect(r.rows.find((x) => x.id === activeId)!.memberships[0].role).toBe("ADMIN");
  });

  it("getUser traz vínculos; inexistente é null", async () => {
    const u = await svc.getUser(master, activeId);
    expect(u?.memberships).toHaveLength(1);
    expect(u?.createdAt).toBeInstanceOf(Date);
    expect(await svc.getUser(master, "nao-existe")).toBeNull();
  });

  it("findUserByEmail normaliza e ignora inexistentes", async () => {
    expect(await svc.findUserByEmail(master, ` ${activeEmail().toUpperCase()} `)).toEqual({ name: `Zeta A ${suffix}` });
    expect(await svc.findUserByEmail(master, `nada-${suffix}@teste.local`)).toBeNull();
  });

  it("USER é negado e auditado", async () => {
    const { ForbiddenError } = await import("@/lib/permissions");
    await expect(svc.listUsers(user, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.getUser(user, activeId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.findUserByEmail(user, "a@b.c")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await owner.auditLog.count({ where: { userId: user.userId, action: "platform.user_list", result: "DENIED" } })).toBe(1);
  });

  it("usersFiltersSchema: página mínima 1, q aparado", () => {
    expect(svc.usersFiltersSchema.parse({ pagina: "0" }).page).toBe(1);
    expect(svc.usersFiltersSchema.parse({}).page).toBe(1);
    expect(svc.usersFiltersSchema.parse({ q: "  ab  ", empresa: "x", pagina: "3" })).toEqual({ q: "ab", organizationId: "x", page: 3 });
  });
});
