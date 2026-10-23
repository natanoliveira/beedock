import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 60_000;

type Client = import("@/generated/prisma/client").PrismaClient;
type Svc = typeof import("@/features/members/service");
type Ctx = import("@/lib/audit").TenantContext;

describe.skipIf(!APP_URL || !OWNER_URL)("equipe: papéis, desativação e vínculo direto", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let svc: Svc;
  let sess: typeof import("@/lib/session");
  let db: (typeof import("@/lib/db"))["db"];
  let X = "";
  let Y = "";
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const u: Record<string, { id: string; email: string }> = {};
  const mem: Record<string, string> = {};
  let sidFX = "";
  let sidFY = "";
  let master: import("@/features/platform/service").PlatformActor;

  const ctx = (k: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO"): Ctx => ({
    userId: u[k].id,
    userName: `Pessoa ${k}`,
    organizationId,
    role,
    meta,
  });
  const mkUser = async (k: string, platformRole?: "MASTER") => {
    const email = `mb-${k.toLowerCase()}-${suffix}@teste.local`;
    const user = await owner.user.create({ data: { name: `Pessoa ${k}`, email, platformRole } });
    u[k] = { id: user.id, email };
    userIds.push(user.id);
  };
  const mkMem = async (k: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO", key = k) => {
    mem[key] = (await owner.membership.create({ data: { userId: u[k].id, organizationId, role } })).id;
  };
  const mkOrg = async (key: string) => {
    const o = await owner.organization.create({ data: { slug: `mb${key}-${suffix}`, name: `MB ${key} ${suffix}`, status: "ACTIVE" } });
    await owner.organizationSettings.create({ data: { organizationId: o.id } });
    orgIds.push(o.id);
    return o.id;
  };
  const mkSession = async (userId: string, organizationId: string) =>
    (
      await owner.session.create({
        data: { userId, organizationId, idleMinutes: 60, expiresAt: new Date(Date.now() + 86_400_000) },
      })
    ).id;
  const audit = (organizationId: string, action: string) =>
    owner.auditLog.findFirst({ where: { organizationId, action }, orderBy: { seq: "desc" } });
  const activeAdmins = () => owner.membership.count({ where: { organizationId: X, role: "ADMIN", active: true } });

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    svc = await import("@/features/members/service");
    sess = await import("@/lib/session");

    X = await mkOrg("x");
    Y = await mkOrg("y");
    for (const k of ["A1", "A2", "F", "O"]) await mkUser(k);
    await mkUser("M", "MASTER");
    await mkMem("A1", X, "ADMIN");
    await mkMem("A2", X, "ADMIN");
    await mkMem("F", X, "FUNCIONARIO", "FX");
    await mkMem("F", Y, "FUNCIONARIO", "FY");
    await mkMem("O", Y, "ADMIN");
    sidFX = await mkSession(u.F.id, X);
    sidFY = await mkSession(u.F.id, Y);
    master = { userId: u.M.id, userName: "Pessoa M", role: "MASTER", organizationId: null, isMaster: true, meta };
  }, T);

  afterAll(async () => {
    await owner.session.deleteMany({ where: { userId: { in: userIds } } });
    await owner.invitation.deleteMany({ where: { organizationId: { in: orgIds } } });
    await owner.membership.deleteMany({ where: { organizationId: { in: orgIds } } });
    await owner.organizationSettings.deleteMany({ where: { organizationId: { in: orgIds } } });
    await owner.organization.deleteMany({ where: { id: { in: orgIds } } });
    await owner.user.deleteMany({ where: { id: { in: userIds } } });
    await owner.$disconnect();
    await db.$disconnect();
  });

  it("listTeam: membros com última atividade e convites pendentes", async () => {
    await owner.invitation.create({
      data: { organizationId: X, email: `conv-${suffix}@teste.local`, name: "Convidada", role: "FUNCIONARIO", tokenHash: `h-${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    await owner.invitation.create({
      data: { organizationId: X, email: `exp-${suffix}@teste.local`, name: "Expirada", role: "FUNCIONARIO", tokenHash: `e-${suffix}`, expiresAt: new Date(Date.now() - 1000) },
    });
    const { members, invites } = await svc.listTeam(ctx("A1", X, "ADMIN"), X);
    expect(members).toHaveLength(3);
    expect(members.find((m) => m.userId === u.F.id)?.lastSeenAt).toBeInstanceOf(Date);
    expect(members.find((m) => m.userId === u.A1.id)?.lastSeenAt).toBeNull();
    expect(invites.map((i) => i.name)).toEqual(["Convidada"]);
  }, T);

  it("troca de papel é auditada e o último Admin não pode ser rebaixado", async () => {
    await svc.changeMemberRole(ctx("A1", X, "ADMIN"), X, mem.A2, "FUNCIONARIO");
    const log = await audit(X, "member.role_change");
    expect(log?.before).toMatchObject({ role: "ADMIN" });
    expect(log?.after).toMatchObject({ role: "FUNCIONARIO" });
    await expect(svc.changeMemberRole(ctx("A1", X, "ADMIN"), X, mem.A1, "FUNCIONARIO")).rejects.toThrow(svc.LAST_ADMIN);
    await expect(svc.setMemberActive(ctx("A1", X, "ADMIN"), X, mem.A1, false)).rejects.toThrow(svc.LAST_ADMIN);
    expect(await activeAdmins()).toBe(1);
  }, T);

  it("concorrência: dois Admins se rebaixando — sobra exatamente um", async () => {
    await owner.membership.update({ where: { id: mem.A2 }, data: { role: "ADMIN" } });
    const r = await Promise.allSettled([
      svc.changeMemberRole(ctx("A1", X, "ADMIN"), X, mem.A2, "FUNCIONARIO"),
      svc.changeMemberRole(ctx("A2", X, "ADMIN"), X, mem.A1, "FUNCIONARIO"),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rej = r.filter((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(rej).toHaveLength(1);
    expect(rej[0].reason.message).toBe(svc.LAST_ADMIN);
    expect(await activeAdmins()).toBe(1);
    await owner.membership.updateMany({ where: { id: { in: [mem.A1, mem.A2] } }, data: { role: "ADMIN", active: true } });
  }, T);

  it("desativar revoga só as sessões da empresa; reativar volta", async () => {
    await svc.setMemberActive(ctx("A1", X, "ADMIN"), X, mem.FX, false);
    expect((await owner.session.findUniqueOrThrow({ where: { id: sidFX } })).revokedAt).not.toBeNull();
    expect((await owner.session.findUniqueOrThrow({ where: { id: sidFY } })).revokedAt).toBeNull();
    expect(await audit(X, "member.deactivate")).not.toBeNull();
    expect(await sess.loadSession(sidFX)).toBeNull();

    await svc.setMemberActive(ctx("A1", X, "ADMIN"), X, mem.FX, true);
    expect((await owner.membership.findUniqueOrThrow({ where: { id: mem.FX } })).active).toBe(true);
    expect(await audit(X, "member.reactivate")).not.toBeNull();
  }, T);

  it("Funcionário não gerencia; Admin de outra empresa não alcança vínculo alheio", async () => {
    const before = await owner.auditLog.count({ where: { organizationId: X, result: "DENIED" } });
    await expect(svc.changeMemberRole(ctx("F", X, "FUNCIONARIO"), X, mem.A2, "FUNCIONARIO")).rejects.toThrow(/permissão/);
    expect(await owner.auditLog.count({ where: { organizationId: X, result: "DENIED" } })).toBe(before + 1);
    await expect(svc.changeMemberRole(ctx("O", Y, "ADMIN"), Y, mem.FX, "ADMIN")).rejects.toThrow("Registro não encontrado.");
    await expect(svc.changeMemberRole(ctx("O", Y, "ADMIN"), X, mem.FX, "ADMIN")).rejects.toThrow(/permissão/);
    expect((await owner.membership.findUniqueOrThrow({ where: { id: mem.FX } })).role).toBe("FUNCIONARIO");
  }, T);

  it("linkUser: cria, recusa duplicado, reativa com novo papel, valida e-mail e ator", async () => {
    await svc.linkUser(master, { organizationId: X, email: u.O.email, role: "FUNCIONARIO" });
    const m = await owner.membership.findFirstOrThrow({ where: { userId: u.O.id, organizationId: X } });
    expect(m).toMatchObject({ role: "FUNCIONARIO", active: true });
    expect((await audit(X, "member.create"))?.userRole).toBe("MASTER");

    await expect(svc.linkUser(master, { organizationId: X, email: u.O.email, role: "ADMIN" })).rejects.toThrow(svc.ALREADY_MEMBER);

    await svc.setMemberActive(ctx("A1", X, "ADMIN"), X, m.id, false);
    await svc.linkUser(master, { organizationId: X, email: u.O.email.toUpperCase(), role: "ADMIN" });
    expect(await owner.membership.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ role: "ADMIN", active: true });
    expect((await audit(X, "member.reactivate"))?.userRole).toBe("MASTER");

    await expect(svc.linkUser(master, { organizationId: X, email: `nao-${suffix}@teste.local`, role: "ADMIN" })).rejects.toThrow(svc.USER_NOT_FOUND);

    const before = await owner.auditLog.count({ where: { action: "member.create", result: "DENIED" } });
    const asUser = { ...master, userId: u.A1.id, isMaster: false, role: "ADMIN", organizationId: X };
    await expect(svc.linkUser(asUser, { organizationId: X, email: u.O.email, role: "ADMIN" })).rejects.toThrow(/permissão/);
    expect(await owner.auditLog.count({ where: { action: "member.create", result: "DENIED" } })).toBe(before + 1);
  }, T);

  it("ator de tenant sem isMaster (MASTER na própria empresa como Funcionário) não gerencia equipe", async () => {
    await expect(svc.changeMemberRole(ctx("F", X, "FUNCIONARIO"), X, mem.A2, "FUNCIONARIO")).rejects.toThrow(/permissão/);
  }, T);

  it("inviteMember: sem enumeração, ALREADY_MEMBER, revogação por e-mail, aceite e revoke", async () => {
    const a1 = ctx("A1", X, "ADMIN");
    await mkUser("P");
    const r1 = await svc.inviteMember(a1, X, { name: "Nova", email: `n1-${suffix}@teste.local`, role: "FUNCIONARIO" });
    const r2 = await svc.inviteMember(a1, X, { name: "Existente", email: u.P.email, role: "FUNCIONARIO" });
    expect(Object.keys(r1)).toEqual(Object.keys(r2));
    expect(typeof r1.inviteUrl).toBe("string");
    expect(typeof r2.inviteUrl).toBe("string");
    const logs = await owner.auditLog.findMany({ where: { organizationId: X, action: "invitation.create" }, orderBy: { seq: "desc" }, take: 2 });
    expect(Object.keys(logs[0].after as object).sort()).toEqual(Object.keys(logs[1].after as object).sort());

    await expect(svc.inviteMember(a1, X, { name: "F", email: u.F.email, role: "ADMIN" })).rejects.toMatchObject({
      field: "email",
      message: svc.ALREADY_MEMBER,
    });

    const e1 = `rv1-${suffix}@teste.local`;
    const e2 = `rv2-${suffix}@teste.local`;
    await svc.inviteMember(a1, X, { name: "E1", email: e1, role: "FUNCIONARIO" });
    await svc.inviteMember(a1, X, { name: "E2", email: e2, role: "FUNCIONARIO" });
    await svc.inviteMember(master, Y, { name: "E1", email: e1, role: "FUNCIONARIO" });
    await svc.inviteMember(a1, X, { name: "E1 de novo", email: e1, role: "ADMIN" });
    const open = (org: string, email: string) => owner.invitation.findMany({ where: { organizationId: org, email }, orderBy: { createdAt: "asc" } });
    const x1 = await open(X, e1);
    expect(x1.map((i) => i.revokedAt !== null)).toEqual([true, false]);
    expect(x1[1].role).toBe("ADMIN");
    expect((await open(X, e2))[0].revokedAt).toBeNull();
    expect((await open(Y, e1))[0].revokedAt).toBeNull();

    const { inviteUrl } = await svc.inviteMember(a1, X, { name: "Aceita", email: `acc-${suffix}@teste.local`, role: "FUNCIONARIO" });
    const inv = await import("@/features/platform/invitations");
    expect(await inv.acceptInvitation({ token: inviteUrl.split("/convite/")[1], password: "senha-segura-123", acceptTerms: false }, { ...meta, ip: `2001:db8::${suffix}:m1` })).toMatchObject({ ok: true, existingUser: false });
    const created = await owner.user.findUniqueOrThrow({ where: { email: `acc-${suffix}@teste.local` }, include: { memberships: true } });
    userIds.push(created.id);
    expect(created.memberships[0]).toMatchObject({ organizationId: X, role: "FUNCIONARIO" });

    expect((await audit(Y, "invitation.create"))?.userRole).toBe("MASTER");

    const target = x1[1];
    await svc.revokeInvitation(a1, X, target.id);
    expect((await owner.invitation.findUniqueOrThrow({ where: { id: target.id } })).revokedAt).not.toBeNull();
    expect(await audit(X, "invitation.revoke")).not.toBeNull();
    await expect(svc.revokeInvitation(a1, X, target.id)).rejects.toThrow("Registro não encontrado.");
    const other = (await open(Y, e1))[0];
    await expect(svc.revokeInvitation(master, X, other.id)).rejects.toThrow("Registro não encontrado.");
    expect((await owner.invitation.findUniqueOrThrow({ where: { id: other.id } })).revokedAt).toBeNull();

    const before = await owner.auditLog.count({ where: { organizationId: X, result: "DENIED", action: "invitation.create" } });
    await expect(svc.inviteMember(ctx("F", X, "FUNCIONARIO"), X, { name: "Z", email: `z-${suffix}@teste.local`, role: "FUNCIONARIO" })).rejects.toThrow(/permissão/);
    expect(await owner.auditLog.count({ where: { organizationId: X, result: "DENIED", action: "invitation.create" } })).toBe(before + 1);
  }, T);
});
