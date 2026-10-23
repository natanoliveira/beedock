import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 120_000;

type Client = import("@/generated/prisma/client").PrismaClient;
type Ctx = import("@/lib/audit").TenantContext;
type Actor = import("@/features/platform/service").PlatformActor;

describe.skipIf(!APP_URL || !OWNER_URL)("consultas de auditoria", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let q: typeof import("@/features/audit/queries");
  let audit: typeof import("@/lib/audit");
  let db: (typeof import("@/lib/db"))["db"];
  let scope: (typeof import("@/lib/db"))["withScope"];
  let perms: typeof import("@/lib/permissions");
  const orgIds: string[] = [];
  const org: Record<string, string> = {};
  const ctx: Record<string, Ctx> = {};
  let master: Actor;
  let plain: Actor;

  const log = (tag: string, e: Parameters<typeof audit.appendAudit>[2], c: Ctx = ctx[tag]) =>
    scope({ organizationId: org[tag] }, (tx) => audit.appendAudit(tx, c, e));

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { seedOrganizationDefaults } = await import("@/features/organizations/defaults");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db, withScope: scope } = await import("@/lib/db"));
    q = await import("@/features/audit/queries");
    audit = await import("@/lib/audit");
    perms = await import("@/lib/permissions");
    for (const tag of ["a", "b", "page", "hist"]) {
      const o = await owner.organization.create({ data: { slug: `aud-${tag}-${suffix}`, name: `Aud ${tag}` } });
      orgIds.push(o.id);
      org[tag] = o.id;
      await seedOrganizationDefaults(owner, o.id, { monthStartDay: 1, timezone: "America/Fortaleza" });
      ctx[tag] = { userId: `u-admin-${tag}-${suffix}`, userName: `Admin ${tag}`, organizationId: o.id, role: "ADMIN", meta };
    }
    ctx.staff = { ...ctx.a, userId: `u-staff-${suffix}`, userName: "Staff", role: "FUNCIONARIO" };
    master = { userId: `u-master-${suffix}`, userName: "Master", role: "MASTER", organizationId: null, meta, isMaster: true };
    plain = { ...master, userId: `u-plain-${suffix}`, isMaster: false, role: null };
  }, T);

  afterAll(async () => {
    const inOrgs = { organizationId: { in: orgIds } };
    await owner.orderPayment.deleteMany({ where: inOrgs });
    await owner.transaction.deleteMany({ where: inOrgs });
    await owner.order.deleteMany({ where: inOrgs });
    await owner.customer.deleteMany({ where: inOrgs });
    await owner.category.deleteMany({ where: inOrgs });
    await owner.paymentMethod.deleteMany({ where: inOrgs });
    await owner.productType.deleteMany({ where: inOrgs });
    await owner.organizationSettings.deleteMany({ where: inOrgs });
    await owner.organization.deleteMany({ where: { id: { in: orgIds } } });
    await owner.$disconnect();
    await db.$disconnect();
  }, T);

  it("Admin lista só a própria cadeia; filtros por pessoa, grupo, resultado, registro e período", async () => {
    await log("a", { action: "transaction.create", entityType: "Transaction", entityId: `t-${suffix}`, after: { description: "Tinta", amountCents: 100 } });
    await log("a", { action: "customer.create", entityType: "Customer", entityId: `c-${suffix}`, after: { name: "Ana" } });
    await log("b", { action: "transaction.create", entityType: "Transaction", entityId: `tb-${suffix}`, after: { description: "Outra" } });
    await audit.recordAudit({ ...master, organizationId: null }, { action: "platform.legal_publish" });
    const all = await q.listAuditEvents(ctx.a, {});
    const mine = await owner.auditLog.findMany({ where: { organizationId: org.a }, select: { seq: true } });
    expect(all.rows.map((r) => r.seq).sort()).toEqual(mine.map((r) => String(r.seq)).sort());
    expect(all.rows.every((r) => r.organizationId === org.a)).toBe(true);

    const byGroup = await q.listAuditEvents(ctx.a, { group: "lancamentos" });
    expect(byGroup.rows.map((r) => r.action)).toEqual(["transaction.create"]);
    expect(byGroup.rows[0].text).toContain("registrou o lançamento 'Tinta'");
    expect((await q.listAuditEvents(ctx.a, { userId: ctx.a.userId })).rows).toHaveLength(2);
    expect((await q.listAuditEvents(ctx.a, { userId: "system" })).rows).toHaveLength(0);
    expect((await q.listAuditEvents(ctx.a, { userId: "master" })).rows).toHaveLength(0);
    expect((await q.listAuditEvents(ctx.a, { entityType: "Customer", entityId: `c-${suffix}` })).rows).toHaveLength(1);
    expect((await q.listAuditEvents(ctx.a, { result: "DENIED" })).rows).toHaveLength(0);
    expect((await q.listAuditEvents(ctx.a, { from: "2099-01-01" })).rows).toHaveLength(0);
    expect((await q.listAuditEvents(ctx.a, { from: "2020-01-01", to: "2099-01-01" })).rows.length).toBeGreaterThanOrEqual(2);
  }, T);

  it("registro de outra empresa não vaza; filtros inválidos viram erro de campo", async () => {
    expect((await q.listAuditEvents(ctx.a, { entityId: `tb-${suffix}` })).rows).toEqual([]);
    expect((await q.recordHistory(ctx.a, { type: "Transaction", id: `tb-${suffix}` }))).toEqual([]);
    const { FieldError } = await import("@/features/platform/errors");
    await expect(q.listAuditEvents(ctx.a, { from: "31/12/2026" })).rejects.toBeInstanceOf(FieldError);
    await expect(q.listAuditEvents(ctx.a, {}, "abc")).rejects.toBeInstanceOf(FieldError);
    await expect(q.listAuditEvents(ctx.a, { group: "x" as never })).rejects.toBeInstanceOf(FieldError);
  }, T);

  it("Funcionário é negado e a negação é auditada", async () => {
    await expect(q.listAuditEvents(ctx.staff, {})).rejects.toBeInstanceOf(perms.ForbiddenError);
    await expect(q.recordHistory(ctx.staff, { type: "Order", id: "x" })).rejects.toBeInstanceOf(perms.ForbiddenError);
    await expect(q.verifyOrgChain(ctx.staff)).rejects.toBeInstanceOf(perms.ForbiddenError);
    const denied = await owner.auditLog.count({ where: { organizationId: org.a, action: "audit.view", result: "DENIED", userId: ctx.staff.userId } });
    expect(denied).toBe(3);
    expect((await q.listAuditEvents(ctx.a, { result: "DENIED", group: "negados" })).rows.length).toBe(3);
  }, T);

  it("paginação por cursor sem repetir nem pular", async () => {
    // lotes pequenos: cada append é um round-trip ao Neon e a transação expira em 15s
    for (let b = 0; b < 4; b++) {
      await scope({ organizationId: org.page }, async (tx) => {
        for (let i = 0; i < 15; i++) await audit.appendAudit(tx, ctx.page, { action: "auth.login", entityType: "Session", entityId: `s${b}-${i}` });
      });
    }
    const p1 = await q.listAuditEvents(ctx.page, {});
    expect(p1.rows).toHaveLength(50);
    expect(p1.next).toBe(p1.rows[49].seq);
    const p2 = await q.listAuditEvents(ctx.page, {}, p1.next!);
    expect(p2.rows).toHaveLength(10);
    expect(p2.next).toBeNull();
    const seqs = [...p1.rows, ...p2.rows].map((r) => BigInt(r.seq));
    expect(new Set(seqs).size).toBe(60);
    expect(seqs.every((s, i) => i === 0 || s < seqs[i - 1])).toBe(true);
  }, T);

  it("exportação recusa acima do limite", async () => {
    const { RuleError } = await import("@/features/platform/errors");
    await expect(q.exportAuditEvents(ctx.page, {}, 5)).rejects.toBeInstanceOf(RuleError);
    expect(await q.exportAuditEvents(ctx.page, {}, 100)).toHaveLength(60);
  }, T);

  it("verificação: cadeia da empresa íntegra, inclusive em vários lotes", async () => {
    expect(await q.verifyOrgChain(ctx.page)).toEqual({ checked: 60, brokenCount: 0, broken: [] });
    expect(await q.verifyOrgChain(ctx.page, 7)).toEqual({ checked: 60, brokenCount: 0, broken: [] });
    const empty = await q.verifyOrgChain(ctx.hist);
    expect(empty).toEqual({ checked: 0, brokenCount: 0, broken: [] });
  }, T);

  it("histórico: pedido junta pedido + recebimentos + lançamentos ligados; cliente junta criação/cancelamento dos pedidos", async () => {
    const o = org.hist;
    const cust = await owner.customer.create({ data: { organizationId: o, name: "Maria", phone: "85988887777" } });
    const type = await owner.productType.findFirstOrThrow({ where: { organizationId: o, name: "Camisa" } });
    const method = await owner.paymentMethod.findFirstOrThrow({ where: { organizationId: o, name: "Pix" } });
    const cat = await owner.category.findFirstOrThrow({ where: { organizationId: o, systemKey: "ORDER_PAYMENT" } });
    const order = await owner.order.create({
      data: { organizationId: o, number: 1, customerId: cust.id, productTypeId: type.id, description: "Camisas", totalCents: 10_000, dueDate: new Date("2099-01-01") },
    });
    const other = await owner.order.create({
      data: { organizationId: o, number: 2, customerId: cust.id, productTypeId: type.id, description: "Outro", totalCents: 500, dueDate: new Date("2099-01-01") },
    });
    const t = await owner.transaction.create({
      data: { organizationId: o, type: "INCOME", amountCents: 4_000, occurredOn: new Date("2026-10-20"), categoryId: cat.id, paymentMethodId: method.id, description: "Rec", orderId: order.id, deletedAt: new Date() },
    });
    const pay = await owner.orderPayment.create({
      data: { organizationId: o, orderId: order.id, paymentMethodId: method.id, transactionId: t.id, amountCents: 4_000, paidAt: new Date("2026-10-20"), deletedAt: new Date() },
    });
    const c = ctx.hist;
    await log("hist", { action: "order.create", entityType: "Order", entityId: order.id, after: { number: 1, totalCents: 10_000 } });
    await log("hist", { action: "order_payment.create", entityType: "OrderPayment", entityId: pay.id, after: { amountCents: 4_000 } });
    await log("hist", { action: "transaction.create", entityType: "Transaction", entityId: t.id, after: { description: "Rec" } });
    await log("hist", { action: "order.update", entityType: "Order", entityId: order.id, before: { totalCents: 10_000 }, after: { totalCents: 12_000 } });
    await log("hist", { action: "order.create", entityType: "Order", entityId: other.id, after: { number: 2 } });
    await log("hist", { action: "order.update", entityType: "Order", entityId: other.id, after: { number: 2 } });
    await log("hist", { action: "customer.update", entityType: "Customer", entityId: cust.id, after: { name: "Maria" } });

    const h = await q.recordHistory(c, { type: "Order", id: order.id });
    expect(h.map((r) => r.action)).toEqual(["order.create", "order_payment.create", "transaction.create", "order.update"]);
    expect(h[3].text).toContain("R$ 100,00");
    expect(h[3].text).toContain("R$ 120,00");

    const hc = await q.recordHistory(c, { type: "Customer", id: cust.id });
    expect(hc.map((r) => r.action)).toEqual(["order.create", "order.create", "customer.update"]);
  }, T);

  it("plataforma: MASTER vê todas, filtra empresa e plataforma; não-MASTER é negado", async () => {
    const all = await q.listAuditEventsPlatform(master, {});
    expect(all.rows.some((r) => r.organizationId === org.page)).toBe(true);
    const onlyPlatform = await q.listAuditEventsPlatform(master, { organizationId: "platform" });
    expect(onlyPlatform.rows.some((r) => r.action === "platform.legal_publish")).toBe(true);
    expect(onlyPlatform.rows.every((r) => r.organizationId === null)).toBe(true);
    const onlyB = await q.listAuditEventsPlatform(master, { organizationId: org.b });
    expect(onlyB.rows.length).toBeGreaterThan(0);
    expect(onlyB.rows.every((r) => r.organizationId === org.b)).toBe(true);
    await expect(q.listAuditEventsPlatform(plain, {})).rejects.toBeInstanceOf(perms.ForbiddenError);
    await expect(q.verifyPlatformChains(plain, "all")).rejects.toBeInstanceOf(perms.ForbiddenError);
    expect(await q.verifyPlatformChains(master, org.page, 7)).toEqual({ checked: 60, brokenCount: 0, broken: [] });
  }, T);
});
