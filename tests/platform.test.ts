import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Simula documento publicado sem gravar LegalDocument (publicar de verdade bloquearia o dev em /aceite)
const legal = vi.hoisted(() => ({
  docs: null as null | { id: string; type: "TERMS"; version: number }[],
  calls: [] as { userId: string; ids: string[] }[],
}));
vi.mock("@/features/legal/service", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/legal/service")>();
  const audit = await import("@/lib/audit");
  return {
    ...real,
    currentLegalDocuments: ((client: Parameters<typeof real.currentLegalDocuments>[0]) =>
      legal.docs ? Promise.resolve(legal.docs) : real.currentLegalDocuments(client)) as typeof real.currentLegalDocuments,
    acceptLegalDocumentsTx: (async (
      tx: Parameters<typeof real.acceptLegalDocumentsTx>[0],
      actor: Parameters<typeof real.acceptLegalDocumentsTx>[1],
      ids: string[],
    ) => {
      legal.calls.push({ userId: actor.userId, ids });
      await audit.appendPlatformAudit(tx, actor, {
        action: "auth.terms_accept",
        entityType: "User",
        entityId: actor.userId,
        after: { documents: ids },
      });
    }) as typeof real.acceptLegalDocumentsTx,
  };
});

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
    const token = inviteUrl!.split("/convite/")[1]!;
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

  it("e-mail de Admin que já é usuário vira vínculo direto, sem convite", async () => {
    const slug = `d-${suffix}`;
    const r = await create(slug, emails[1]);
    expect(r.inviteUrl).toBeNull();
    const m = await owner.membership.findMany({ where: { organizationId: r.organizationId } });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ userId: user.userId, role: "ADMIN", active: true });
    expect(await owner.invitation.count({ where: { organizationId: r.organizationId } })).toBe(0);
    expect(await owner.auditLog.count({ where: { organizationId: r.organizationId, action: "member.create" } })).toBe(1);
  });

  it("e-mail de usuário anonimizado não é vinculado e não deixa org órfã", async () => {
    const e = email("anon");
    const a = await owner.user.create({ data: { name: "Anon", email: e, anonymizedAt: new Date() } });
    userIds.push(a.id);
    const slug = `d2-${suffix}`;
    await expect(create(slug, e)).rejects.toMatchObject({ field: "email", message: "Este usuário não pode ser vinculado." });
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
    let members: typeof import("@/features/members/service");
    let ipN = 0;
    const freshMeta = () => ({ ip: `2001:db8::${suffix}:${++ipN}`, userAgent: "vitest", requestId: null });
    const tokenOf = (url: string | null) => url!.split("/convite/")[1]!;
    const invalids = (ip: string) => owner.auditLog.count({ where: { action: "invitation.invalid", ip } });
    const track = async (e: string) => {
      const u = await owner.user.findUnique({ where: { email: e } });
      if (u) userIds.push(u.id);
    };
    beforeAll(async () => {
      inv = await import("@/features/platform/invitations");
      members = await import("@/features/members/service");
    });

    it("inviteMember (reenvio) revoga o anterior do mesmo e-mail e cria novo", async () => {
      const fixed = email("fixed-r");
      const { organizationId } = await create(`r-${suffix}`, fixed);
      const { inviteUrl } = await members.inviteMember(master, organizationId, { ...adminInput(fixed), role: "ADMIN" });
      const all = await owner.invitation.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
      expect(all).toHaveLength(2);
      expect(all[0]!.revokedAt).not.toBeNull();
      expect(all[1]!.revokedAt).toBeNull();
      expect(all[1]!.email).toBe(fixed);
      expect(all[1]!.tokenHash).toBe(svc.hashToken(tokenOf(inviteUrl)));
    });

    it("findInvitation: válido devolve dados; inválidos devolvem null e auditam", async (ctx) => {
      // requireTerms depende do banco: com documento publicado (dev) vira true; o caminho com documento é da Task 4/9
      if ((await owner.legalDocument.count()) > 0) return ctx.skip();
      const e = email("find");
      const { organizationId, inviteUrl } = await create(`s-${suffix}`, e);
      const m = freshMeta();
      expect(await inv.findInvitation(tokenOf(inviteUrl), m)).toEqual({
        organizationName: `Empresa s-${suffix}`,
        name: "Admin Teste",
        email: e,
        existingUser: false,
        requireTerms: false,
      });
      const e2 = email("find-ex");
      const exInv = await create(`fx-${suffix}`, e2);
      userIds.push((await owner.user.create({ data: { name: "Ex", email: e2, passwordHash: "x" } })).id);
      expect((await inv.findInvitation(tokenOf(exInv.inviteUrl), m))?.existingUser).toBe(true);
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

    it("acceptInvitation cria User + Membership ADMIN; segunda chamada falha; reenviar depois do aceite devolve novo link", async () => {
      const e = email("acc");
      const { organizationId, inviteUrl } = await create(`t-${suffix}`, e);
      const token = tokenOf(inviteUrl);
      const m = freshMeta();
      expect(await inv.acceptInvitation({ token, password: "senha-segura-123", acceptTerms: false }, m)).toEqual({ ok: true, email: e, existingUser: false });
      await track(e);
      const u = await owner.user.findUnique({ where: { email: e }, include: { memberships: true } });
      expect(u?.platformRole).toBe("USER");
      expect(u?.passwordHash).toBeTruthy();
      expect(u?.memberships[0]).toMatchObject({ organizationId, role: "ADMIN", active: true });
      expect((await owner.invitation.findFirst({ where: { organizationId } }))?.acceptedAt).not.toBeNull();
      const actions = (await owner.auditLog.findMany({ where: { organizationId } })).map((l) => l.action);
      expect(actions).toContain("invitation.accept");
      expect(actions).toContain("member.create");
      expect(await inv.acceptInvitation({ token, password: "senha-segura-123", acceptTerms: false }, m)).toMatchObject({ ok: false });
      const again = await members.inviteMember(master, organizationId, { ...adminInput(email("novo")), role: "ADMIN" });
      expect(again.inviteUrl).toContain("/convite/");
    });

    it("com documento publicado: sem aceite reverte o convite; com aceite audita na cadeia da plataforma", async () => {
      const e = email("terms");
      const { organizationId, inviteUrl } = await create(`tm-${suffix}`, e);
      const token = tokenOf(inviteUrl);
      const input = { token, password: "senha-segura-123" };
      legal.docs = [{ id: "fake-terms", type: "TERMS", version: 1 }];
      legal.calls.length = 0;
      try {
        expect(await inv.acceptInvitation({ ...input, acceptTerms: false }, freshMeta())).toEqual({
          ok: false,
          reason: "terms",
        });
        expect((await owner.invitation.findFirstOrThrow({ where: { organizationId } })).acceptedAt).toBeNull();
        expect(await owner.user.count({ where: { email: e } })).toBe(0);
        expect(await owner.membership.count({ where: { organizationId } })).toBe(0);
        expect(await owner.auditLog.count({ where: { organizationId, action: "invitation.accept" } })).toBe(0);
        expect(legal.calls).toHaveLength(0);

        const before = await owner.auditLog.count({ where: { organizationId: null, action: "auth.terms_accept" } });
        expect(await inv.acceptInvitation({ ...input, acceptTerms: true }, freshMeta())).toMatchObject({ ok: true });
        await track(e);
        const u = await owner.user.findUniqueOrThrow({ where: { email: e } });
        expect(legal.calls).toEqual([{ userId: u.id, ids: ["fake-terms"] }]);
        expect(
          await owner.auditLog.count({ where: { organizationId: null, action: "auth.terms_accept", entityId: u.id } }),
        ).toBe(1);
        expect(await owner.auditLog.count({ where: { organizationId: null, action: "auth.terms_accept" } })).toBe(
          before + 1,
        );
      } finally {
        legal.docs = null;
      }
    });

    it("aceite concorrente: exatamente um ok", async () => {
      const e = email("conc");
      const { inviteUrl } = await create(`u-${suffix}`, e);
      const token = tokenOf(inviteUrl);
      const res = await Promise.all([
        inv.acceptInvitation({ token, password: "senha-segura-123", acceptTerms: false }, freshMeta()),
        inv.acceptInvitation({ token, password: "senha-segura-123", acceptTerms: false }, freshMeta()),
      ]);
      await track(e);
      expect(res.filter((r) => r.ok)).toHaveLength(1);
      expect(await owner.user.count({ where: { email: e } })).toBe(1);
    });

    // convite de e-mail novo que depois virou usuário (com senha conhecida)
    const lateUser = async (tag: string, role: "ADMIN" | "FUNCIONARIO" = "ADMIN") => {
      const e = email(tag);
      const { organizationId, inviteUrl } = await create(`${tag}-${suffix}`, e);
      if (role !== "ADMIN") await owner.invitation.updateMany({ where: { organizationId }, data: { role } });
      const { hashPassword } = await import("@/features/auth/service");
      const u = await owner.user.create({ data: { name: "Late", email: e, passwordHash: await hashPassword("senha-atual-123") } });
      userIds.push(u.id);
      return { e, u, organizationId, token: tokenOf(inviteUrl) };
    };

    it("aceite por quem já tem conta: senha errada não consome, conta falha e audita", async () => {
      const t = await lateUser("late");
      const before = t.u.passwordHash;
      const m = freshMeta();
      expect(await inv.acceptInvitation({ token: t.token, password: "senha-do-convite-1", acceptTerms: false }, m)).toEqual({
        ok: false,
        reason: "password",
      });
      expect(await owner.membership.count({ where: { organizationId: t.organizationId } })).toBe(0);
      expect((await owner.invitation.findFirst({ where: { organizationId: t.organizationId } }))?.acceptedAt).toBeNull();
      const u = await owner.user.findUniqueOrThrow({ where: { id: t.u.id } });
      expect(u.failedLoginCount).toBe(1);
      expect(u.passwordHash).toBe(before);
      expect(await owner.auditLog.count({ where: { action: "auth.login_failed", entityId: t.u.id } })).toBe(1);
    });

    it("aceite por quem já tem conta: senha certa vincula com o papel do convite e não troca a senha", async () => {
      const t = await lateUser("late2", "FUNCIONARIO");
      await owner.user.update({ where: { id: t.u.id }, data: { failedLoginCount: 3 } });
      expect(await inv.acceptInvitation({ token: t.token, password: "senha-atual-123", acceptTerms: false }, freshMeta())).toEqual({
        ok: true,
        email: t.e,
        existingUser: true,
      });
      const u = await owner.user.findUniqueOrThrow({ where: { id: t.u.id }, include: { memberships: true } });
      expect(u.passwordHash).toBe(t.u.passwordHash);
      expect(u.failedLoginCount).toBe(0);
      expect(u.memberships[0]).toMatchObject({ organizationId: t.organizationId, role: "FUNCIONARIO", active: true });
      const actions = (await owner.auditLog.findMany({ where: { organizationId: t.organizationId } })).map((l) => l.action);
      expect(actions).toEqual(expect.arrayContaining(["invitation.accept", "member.create"]));
    });

    it("aceite por quem já tem conta: 5 senhas erradas bloqueiam a conta", async () => {
      const t = await lateUser("late3");
      const m = freshMeta();
      const res = [];
      for (let i = 0; i < 5; i++) res.push(await inv.acceptInvitation({ token: t.token, password: `errada-numero-${i}`, acceptTerms: false }, m));
      expect(res.slice(0, 4).every((r) => !r.ok && r.reason === "password")).toBe(true);
      expect(res[4]).toEqual({ ok: false, reason: "locked" });
      expect((await owner.user.findUniqueOrThrow({ where: { id: t.u.id } })).lockedUntil).not.toBeNull();
      expect(await inv.acceptInvitation({ token: t.token, password: "senha-atual-123", acceptTerms: false }, m)).toEqual({ ok: false, reason: "locked" });
      expect((await owner.invitation.findFirst({ where: { organizationId: t.organizationId } }))?.acceptedAt).toBeNull();
    });

    it("aceite por conta existente respeita o rate limit de IP do login", async () => {
      const t = await lateUser("late5");
      const m = freshMeta();
      const { recordAudit } = await import("@/lib/audit");
      const { IP_MAX_FAILURES } = await import("@/features/auth/service");
      const anon = { userId: null, userName: null, role: null, organizationId: null, meta: m };
      for (let i = 0; i < IP_MAX_FAILURES; i++) await recordAudit(anon, { action: "auth.login_failed", result: "FAILED" });
      expect(await inv.acceptInvitation({ token: t.token, password: "senha-atual-123", acceptTerms: false }, m)).toEqual({ ok: false, reason: "locked" });
      expect((await owner.invitation.findFirst({ where: { organizationId: t.organizationId } }))?.acceptedAt).toBeNull();
      expect(await owner.membership.count({ where: { organizationId: t.organizationId } })).toBe(0);
    });

    it("vínculo inativo reativa com o papel do convite", async () => {
      const t = await lateUser("late4", "FUNCIONARIO");
      await owner.membership.create({ data: { userId: t.u.id, organizationId: t.organizationId, role: "ADMIN", active: false } });
      expect((await inv.acceptInvitation({ token: t.token, password: "senha-atual-123", acceptTerms: false }, freshMeta())).ok).toBe(true);
      expect(await owner.membership.findFirstOrThrow({ where: { userId: t.u.id, organizationId: t.organizationId } })).toMatchObject({
        active: true,
        role: "FUNCIONARIO",
      });
      expect(await owner.auditLog.count({ where: { organizationId: t.organizationId, action: "member.reactivate" } })).toBe(1);
    });

    it("senha curta para e-mail novo -> invalid", async () => {
      const { inviteUrl } = await create(`short-${suffix}`);
      expect(await inv.acceptInvitation({ token: tokenOf(inviteUrl), password: "curta", acceptTerms: false }, freshMeta())).toEqual({
        ok: false,
        reason: "invalid",
      });
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
      const token = inviteUrl!.split("/convite/")[1]!;
      const inv = await import("@/features/platform/invitations");
      const m = { ip: `2001:db8::${suffix}:s${tag}`, userAgent: "vitest", requestId: null };
      await inv.acceptInvitation({ token, password: "senha-segura-123", acceptTerms: false }, m);
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
