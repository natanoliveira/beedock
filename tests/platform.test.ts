import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;

type Client = import("@/generated/prisma/client").PrismaClient;
type Service = typeof import("@/features/platform/service");
type Errors = typeof import("@/features/platform/errors");
type Actor = import("@/features/platform/service").PlatformActor;

describe.skipIf(!APP_URL || !OWNER_URL)("service de empresas", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let svc: Service;
  let errs: Errors;
  let db: typeof import("@/lib/db")["db"];
  let master: Actor;
  let user: Actor;
  const orgIds: string[] = [];
  const emails: string[] = [];
  const userIds: string[] = [];

  const orgInput = (slug: string, name = `Empresa ${slug}`, monthStartDay = 5) =>
    ({
      name,
      slug,
      primaryColor: "#F5A400",
      settings: { monthStartDay, timezone: "America/Fortaleza", sessionIdleMinutes: 60, customerRetentionMonths: 24 },
    }) as import("@/features/platform/schemas").OrganizationInput;
  const adminInput = (email: string) => ({ name: "Admin Teste", email });
  const email = (tag: string) => {
    const e = `${tag}-${suffix}@teste.local`;
    emails.push(e);
    return e;
  };
  const create = async (slug: string, e = email(slug)) => {
    const r = await svc.createOrganization(master, orgInput(slug), adminInput(e));
    orgIds.push(r.organizationId);
    return r;
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
    svc = await import("@/features/platform/service");
    errs = await import("@/features/platform/errors");

    const m = await owner.user.create({
      data: { name: "Master T", email: email("master"), platformRole: "MASTER" },
    });
    const u = await owner.user.create({ data: { name: "User T", email: email("user") } });
    userIds.push(m.id, u.id);
    master = { userId: m.id, userName: m.name, role: null, organizationId: null, meta, isMaster: true };
    user = { userId: u.id, userName: u.name, role: null, organizationId: null, meta, isMaster: false };
  });

  afterAll(async () => {
    const inOrgs = { organizationId: { in: orgIds } };
    await owner.session.deleteMany({ where: inOrgs });
    await owner.invitation.deleteMany({ where: inOrgs });
    await owner.membership.deleteMany({ where: inOrgs });
    await owner.category.deleteMany({ where: inOrgs });
    await owner.paymentMethod.deleteMany({ where: inOrgs });
    await owner.productType.deleteMany({ where: inOrgs });
    await owner.organizationSettings.deleteMany({ where: inOrgs });
    await owner.organization.deleteMany({ where: { id: { in: orgIds } } });
    await owner.user.deleteMany({ where: { OR: [{ id: { in: userIds } }, { email: { in: emails } }] } });
    await owner.$disconnect();
    await db.$disconnect();
  });

  it("cria org + settings + padrões + convite e audita sem vazar token", async () => {
    const { organizationId, inviteUrl } = await create(`a-${suffix}`);
    const settings = await owner.organizationSettings.findUnique({ where: { organizationId } });
    expect(settings?.monthStartDay).toBe(5);
    expect(await owner.category.count({ where: { organizationId } })).toBeGreaterThan(0);
    expect(await owner.paymentMethod.count({ where: { organizationId } })).toBeGreaterThan(0);
    expect(await owner.productType.count({ where: { organizationId } })).toBeGreaterThan(0);
    const invites = await owner.invitation.findMany({ where: { organizationId } });
    expect(invites).toHaveLength(1);
    expect(invites[0]!.role).toBe("ADMIN");

    const logs = await owner.auditLog.findMany({ where: { organizationId } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("platform.organization_create");
    expect(actions).toContain("invitation.create");
    const token = inviteUrl.split("/convite/")[1]!;
    for (const l of logs) expect(JSON.stringify(l.after) + JSON.stringify(l.before)).not.toContain(token);
    expect(createHash("sha256").update(token).digest("hex")).toBe(invites[0]!.tokenHash);
  });

  it("slug repetido e concorrente vira FieldError(slug)", async () => {
    const slug = `b-${suffix}`;
    await create(slug);
    await expect(create(slug)).rejects.toMatchObject({ field: "slug" });

    const slug2 = `c-${suffix}`;
    const res = await Promise.allSettled([create(slug2), create(slug2)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rej = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rej.reason).toBeInstanceOf(errs.FieldError);
    expect(rej.reason.field).toBe("slug");
  });

  it("e-mail de Admin já existente vira FieldError(email) sem org órfã", async () => {
    const slug = `d-${suffix}`;
    await expect(create(slug, emails[0])).rejects.toMatchObject({ field: "email" });
    expect(await owner.organization.count({ where: { slug } })).toBe(0);
  });

  it("ator USER é negado e auditado", async () => {
    const slug = `e-${suffix}`;
    await expect(svc.createOrganization(user, orgInput(slug), adminInput(email(slug)))).rejects.toThrow(
      "permissão",
    );
    expect(await owner.organization.count({ where: { slug } })).toBe(0);
    const denied = await owner.auditLog.findFirst({
      where: { userId: user.userId, result: "DENIED" },
      orderBy: { seq: "desc" },
    });
    expect(denied?.action).toBeTruthy();
  });

  it("updateOrganization audita before/after", async () => {
    const { organizationId } = await create(`f-${suffix}`);
    await svc.updateOrganization(master, organizationId, orgInput(`f-${suffix}`, "Nome Novo"));
    const log = await owner.auditLog.findFirst({
      where: { organizationId, action: "platform.organization_update" },
    });
    expect((log?.before as { name: string }).name).toBe(`Empresa f-${suffix}`);
    expect((log?.after as { name: string }).name).toBe("Nome Novo");
    const got = await svc.getOrganization(master, organizationId);
    expect(got?.name).toBe("Nome Novo");
    expect(got?.settings.monthStartDay).toBe(5);
  });

  it("listOrganizations traz agregados coerentes", async () => {
    const { organizationId } = await create(`g-${suffix}`);
    const adminEmail = email(`adm-g`);
    const adm = await owner.user.create({ data: { name: "Adm G", email: adminEmail } });
    userIds.push(adm.id);
    await owner.membership.create({ data: { userId: adm.id, organizationId, role: "ADMIN" } });
    const seen = new Date("2026-01-02T03:04:05Z");
    await owner.session.create({
      data: { userId: adm.id, organizationId, idleMinutes: 60, expiresAt: new Date(Date.now() + 1e7), lastSeenAt: seen },
    });
    const rows = await svc.listOrganizations(master);
    const row = rows.find((r) => r.id === organizationId)!;
    expect(row.activeUsers).toBe(1);
    expect(row.lastSeenAt?.getTime()).toBe(seen.getTime());
    expect(row.pendingInvite?.expiresAt).toBeInstanceOf(Date);
    expect(row.admin?.email).toBe(adminEmail);
    expect(row.admin?.name).toBe("Adm G");
    const other = rows.find((r) => r.id === orgIds[0])!;
    expect(other.activeUsers).toBe(0);
    expect(other.lastSeenAt).toBeNull();
    expect(other.admin).toBeNull();
    expect(other.pendingInvite?.email).toBe(emails.find((e) => e.startsWith("a-")));
  });

  describe("convites", { timeout: 90_000 }, () => {
    let inv: typeof import("@/features/platform/invitations");
    let ipN = 0;
    const freshMeta = () => ({ ip: `2001:db8::${suffix}:${++ipN}`, userAgent: "vitest", requestId: null });
    const tokenOf = (url: string) => url.split("/convite/")[1]!;
    const invalids = (ip: string) => owner.auditLog.count({ where: { action: "invitation.invalid", ip } });
    const track = async (e: string) => {
      const u = await owner.user.findUnique({ where: { email: e } });
      if (u) userIds.push(u.id);
    };
    beforeAll(async () => {
      inv = await import("@/features/platform/invitations");
    });

    it("resendInvitation revoga o anterior e cria novo com e-mail corrigido", async () => {
      const { organizationId } = await create(`r-${suffix}`);
      const fixed = email("fixed-r");
      const { inviteUrl } = await inv.resendInvitation(master, organizationId, adminInput(fixed));
      const all = await owner.invitation.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
      expect(all).toHaveLength(2);
      expect(all[0]!.revokedAt).not.toBeNull();
      expect(all[1]!.revokedAt).toBeNull();
      expect(all[1]!.email).toBe(fixed);
      expect(all[1]!.tokenHash).toBe(svc.hashToken(tokenOf(inviteUrl)));
    });

    it("findInvitation: válido devolve dados; inválidos devolvem null e auditam", async () => {
      const e = email("find");
      const { organizationId, inviteUrl } = await create(`s-${suffix}`, e);
      const m = freshMeta();
      expect(await inv.findInvitation(tokenOf(inviteUrl), m)).toEqual({
        organizationName: `Empresa s-${suffix}`,
        name: "Admin Teste",
        email: e,
      });
      expect(await invalids(m.ip)).toBe(0);

      const mk = async (slug: string, patch: object) => {
        const r = await create(`${slug}-${suffix}`);
        await owner.invitation.updateMany({ where: { organizationId: r.organizationId }, data: patch });
        return tokenOf(r.inviteUrl);
      };
      const bad = [
        await mk("x1", { expiresAt: new Date(Date.now() - 1000) }),
        await mk("x2", { revokedAt: new Date() }),
        await mk("x3", { acceptedAt: new Date() }),
        "token-inexistente",
      ];
      const inactive = await create(`x4-${suffix}`);
      await owner.organization.update({ where: { id: inactive.organizationId }, data: { status: "SUSPENDED" } });
      bad.push(tokenOf(inactive.inviteUrl));
      for (const t of bad) expect(await inv.findInvitation(t, m)).toBeNull();
      expect(await invalids(m.ip)).toBe(bad.length);
      const ev = await owner.auditLog.findFirst({ where: { action: "invitation.invalid", ip: m.ip } });
      expect(ev?.result).toBe("FAILED");
      expect(ev?.organizationId).toBeNull();
      expect(organizationId).toBeTruthy();
    });

    it("acceptInvitation cria User + Membership ADMIN; segunda chamada falha; reenviar é recusado", async () => {
      const e = email("acc");
      const { organizationId, inviteUrl } = await create(`t-${suffix}`, e);
      const token = tokenOf(inviteUrl);
      const m = freshMeta();
      expect(await inv.acceptInvitation({ token, password: "senha-segura-123" }, m)).toEqual({ ok: true, email: e });
      await track(e);
      const u = await owner.user.findUnique({ where: { email: e }, include: { memberships: true } });
      expect(u?.platformRole).toBe("USER");
      expect(u?.passwordHash).toBeTruthy();
      expect(u?.memberships[0]).toMatchObject({ organizationId, role: "ADMIN", active: true });
      expect((await owner.invitation.findFirst({ where: { organizationId } }))?.acceptedAt).not.toBeNull();
      const actions = (await owner.auditLog.findMany({ where: { organizationId } })).map((l) => l.action);
      expect(actions).toContain("invitation.accept");
      expect(actions).toContain("member.create");
      expect(await inv.acceptInvitation({ token, password: "senha-segura-123" }, m)).toEqual({ ok: false });
      await expect(inv.resendInvitation(master, organizationId, adminInput(email("novo")))).rejects.toMatchObject({
        field: "email",
        message: "Esta empresa já tem um Admin ativo.",
      });
    });

    it("aceite concorrente: exatamente um ok", async () => {
      const e = email("conc");
      const { inviteUrl } = await create(`u-${suffix}`, e);
      const token = tokenOf(inviteUrl);
      const res = await Promise.all([
        inv.acceptInvitation({ token, password: "senha-segura-123" }, freshMeta()),
        inv.acceptInvitation({ token, password: "senha-segura-123" }, freshMeta()),
      ]);
      await track(e);
      expect(res.filter((r) => r.ok)).toHaveLength(1);
      expect(await owner.user.count({ where: { email: e } })).toBe(1);
    });

    it("e-mail virou User depois do convite (caixa diferente) -> ok false", async () => {
      const e = email("late");
      const { organizationId, inviteUrl } = await create(`v-${suffix}`, e);
      const u = await owner.user.create({ data: { name: "Late", email: e.toLowerCase() } });
      userIds.push(u.id);
      await owner.invitation.updateMany({ where: { organizationId }, data: { email: e.toUpperCase() } });
      expect(await inv.acceptInvitation({ token: tokenOf(inviteUrl), password: "senha-segura-123" }, freshMeta())).toEqual({
        ok: false,
      });
      expect(await owner.membership.count({ where: { organizationId } })).toBe(0);
      expect((await owner.invitation.findFirst({ where: { organizationId } }))?.acceptedAt).toBeNull();
    });

    it("rate limit: 20 invitation.invalid do IP bloqueiam busca sem novo evento", async () => {
      const { inviteUrl } = await create(`w-${suffix}`);
      const m = freshMeta();
      const { recordAudit } = await import("@/lib/audit");
      const anon = { userId: null, userName: null, role: null, organizationId: null, meta: m };
      for (let i = 0; i < inv.INVITE_IP_MAX_FAILURES; i++) {
        await recordAudit(anon, { action: "invitation.invalid", result: "FAILED" });
      }
      expect(await inv.findInvitation(tokenOf(inviteUrl), m)).toBeNull();
      expect(await invalids(m.ip)).toBe(inv.INVITE_IP_MAX_FAILURES);
    });
  });

  describe("suspensão", { timeout: 90_000 }, () => {
    const setup = async (tag: string) => {
      const e = email(`susp-${tag}`);
      const { organizationId, inviteUrl } = await create(`${tag}-${suffix}`, e);
      const token = inviteUrl.split("/convite/")[1]!;
      const inv = await import("@/features/platform/invitations");
      const m = { ip: `2001:db8::${suffix}:s${tag}`, userAgent: "vitest", requestId: null };
      await inv.acceptInvitation({ token, password: "senha-segura-123" }, m);
      const u = await owner.user.findUniqueOrThrow({ where: { email: e } });
      userIds.push(u.id);
      const mk = () =>
        owner.session.create({
          data: { userId: u.id, organizationId, idleMinutes: 60, expiresAt: new Date(Date.now() + 1e7) },
        });
      await mk();
      await mk();
      return { organizationId, email: e, token, inv, m };
    };
    const open = (organizationId: string) =>
      owner.session.count({ where: { organizationId, revokedAt: null } });
    const actionOf = (organizationId: string, action: string) =>
      owner.auditLog.findFirst({ where: { organizationId, action } });

    it("suspender revoga sessões, audita com reason, bloqueia convite e login", async () => {
      const s = await setup("s1");
      expect(await open(s.organizationId)).toBe(2);
      await svc.setOrganizationStatus(master, s.organizationId, "SUSPENDED", "inadimplência");
      expect((await owner.organization.findUniqueOrThrow({ where: { id: s.organizationId } })).status).toBe("SUSPENDED");
      expect(await open(s.organizationId)).toBe(0);
      const ev = await actionOf(s.organizationId, "platform.organization_suspend");
      expect(ev?.result).toBe("SUCCESS");
      expect(JSON.stringify(ev?.after)).toContain("inadimplência");
      expect(await s.inv.findInvitation(s.token, s.m)).toBeNull();
      const { verifyCredentials } = await import("@/features/auth/service");
      expect(await verifyCredentials(s.email, "senha-segura-123", s.m)).toEqual({ ok: false, reason: "inactive" });
    });

    it("reativar volta ACTIVE, mantém sessões revogadas e audita", async () => {
      const s = await setup("s2");
      await svc.setOrganizationStatus(master, s.organizationId, "SUSPENDED");
      await svc.setOrganizationStatus(master, s.organizationId, "ACTIVE");
      expect((await owner.organization.findUniqueOrThrow({ where: { id: s.organizationId } })).status).toBe("ACTIVE");
      expect(await open(s.organizationId)).toBe(0);
      expect(await actionOf(s.organizationId, "platform.organization_reactivate")).toBeTruthy();
    });

    it("USER é negado e auditado; nada muda", async () => {
      const s = await setup("s3");
      await expect(svc.setOrganizationStatus(user, s.organizationId, "SUSPENDED")).rejects.toBeInstanceOf(
        (await import("@/lib/permissions")).ForbiddenError,
      );
      expect((await owner.organization.findUniqueOrThrow({ where: { id: s.organizationId } })).status).toBe("ACTIVE");
      expect(await open(s.organizationId)).toBe(2);
      const denied = await owner.auditLog.findFirst({
        where: { userId: user.userId, action: "platform.organization_suspend", result: "DENIED" },
      });
      expect(denied).toBeTruthy();
    });
  });
});
