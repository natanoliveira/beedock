import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/features/transactions/storage", () => ({
  uploadReceipt: vi.fn(async () => ""),
  deleteReceipt: vi.fn(async () => {}),
  readReceipt: vi.fn(async () => null),
  receiptUploadEnabled: () => true,
}));

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 60_000;

type Client = import("@/generated/prisma/client").PrismaClient;
type Ctx = import("@/lib/audit").TenantContext;

describe.skipIf(!APP_URL || !OWNER_URL)("recebimentos de pedido", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  const TZ = "America/Fortaleza";
  let owner: Client;
  let osvc: typeof import("@/features/orders/service");
  let psvc: typeof import("@/features/orders/payments");
  let tsvc: typeof import("@/features/transactions/service");
  let period: typeof import("@/features/transactions/period");
  let perms: typeof import("@/lib/permissions");
  let errs: typeof import("@/features/platform/errors");
  let db: (typeof import("@/lib/db"))["db"];
  let today = "";
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const orgs: Record<string, string> = {};
  let admin: Ctx;
  let staff: Ctx;
  let adminB: Ctx;
  let adminC: Ctx;
  const cust: Record<string, string> = {};
  const types: Record<string, string> = {};
  const methods: Record<string, string> = {};

  const newOrder = async (ctx: Ctx, key: "a" | "c", totalCents = 10_000) =>
    (
      await osvc.createOrder(ctx, {
        customerId: cust[key],
        productTypeId: types[key],
        description: "20 camisas time Unidos",
        totalCents,
        dueDate: "2026-10-30",
      })
    ).id;
  const pay = (amountCents: number, extra: Record<string, unknown> = {}) => ({
    amountCents,
    paymentMethodId: methods.a,
    paidAt: today,
    ...extra,
  });
  const fieldErr = async (p: Promise<unknown>, field: string) => {
    const e = await p.then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(errs.FieldError);
    expect((e as InstanceType<typeof errs.FieldError>).field).toBe(field);
  };
  const linked = (paymentId: string) =>
    owner.orderPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { transaction: true } });

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { seedOrganizationDefaults } = await import("@/features/organizations/defaults");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    osvc = await import("@/features/orders/service");
    psvc = await import("@/features/orders/payments");
    tsvc = await import("@/features/transactions/service");
    period = await import("@/features/transactions/period");
    perms = await import("@/lib/permissions");
    errs = await import("@/features/platform/errors");
    today = period.todayIn(TZ);

    const mkOrg = async (tag: string, monthStartDay = 1) => {
      const o = await owner.organization.create({ data: { slug: `pay-${tag}-${suffix}`, name: `Pay ${tag}` } });
      orgIds.push(o.id);
      await seedOrganizationDefaults(owner, o.id, { monthStartDay, timezone: TZ });
      orgs[tag] = o.id;
      cust[tag] = (await owner.customer.create({ data: { organizationId: o.id, name: `Cliente ${tag}`, phone: "85988887777" } })).id;
      types[tag] = (await owner.productType.findFirstOrThrow({ where: { organizationId: o.id, name: "Camisa" } })).id;
      methods[tag] = (await owner.paymentMethod.findFirstOrThrow({ where: { organizationId: o.id, name: "Pix" } })).id;
      return o.id;
    };
    const mkUser = async (tag: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO") => {
      const u = await owner.user.create({ data: { name: `U ${tag}`, email: `${tag}-pay-${suffix}@teste.local` } });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId, role } });
      return { userId: u.id, userName: u.name, organizationId, role, meta } as Ctx;
    };
    const a = await mkOrg("a");
    const b = await mkOrg("b");
    const c = await mkOrg("c", 5);
    admin = await mkUser("admin", a, "ADMIN");
    staff = await mkUser("staff", a, "FUNCIONARIO");
    adminB = await mkUser("adminb", b, "ADMIN");
    adminC = await mkUser("adminc", c, "ADMIN");
  }, T);

  afterAll(async () => {
    const inOrgs = { organizationId: { in: orgIds } };
    await owner.orderPayment.deleteMany({ where: inOrgs });
    await owner.transaction.deleteMany({ where: inOrgs });
    await owner.order.deleteMany({ where: inOrgs });
    await owner.customer.deleteMany({ where: inOrgs });
    await owner.membership.deleteMany({ where: inOrgs });
    await owner.category.deleteMany({ where: inOrgs });
    await owner.paymentMethod.deleteMany({ where: inOrgs });
    await owner.productType.deleteMany({ where: inOrgs });
    await owner.organizationSettings.deleteMany({ where: inOrgs });
    await owner.organization.deleteMany({ where: { id: { in: orgIds } } });
    await owner.user.deleteMany({ where: { id: { in: userIds } } });
    await owner.$disconnect();
    await db.$disconnect();
  });

  it("registrar cria recebimento + lançamento INCOME ligado e os dois eventos", async () => {
    const orderId = await newOrder(staff, "a", 60_000);
    const { id } = await psvc.registerPayment(staff, orderId, pay(20_000));
    const p = await linked(id);
    expect(p.transaction).toMatchObject({
      type: "INCOME",
      amountCents: 20_000,
      paymentMethodId: methods.a,
      orderId,
      payerName: "Cliente a",
    });
    expect(p.transaction.occurredOn.toISOString().slice(0, 10)).toBe(today);
    expect(p.transaction.description).toMatch(/^Recebimento pedido #\d+ — 20 camisas/);
    const cat = await owner.category.findUniqueOrThrow({ where: { id: p.transaction.categoryId } });
    expect(cat.systemKey).toBe("ORDER_PAYMENT");
    expect(await owner.auditLog.findFirst({ where: { action: "order_payment.create", entityId: id } })).toBeTruthy();
    const tl = await owner.auditLog.findFirstOrThrow({ where: { action: "transaction.create", entityId: p.transactionId } });
    expect(tl.after).toMatchObject({ orderId });
  }, T);

  it("editar valor, data e forma move o lançamento junto", async () => {
    const orderId = await newOrder(admin, "a", 60_000);
    const other = await owner.paymentMethod.findFirstOrThrow({ where: { organizationId: orgs.a, name: "Dinheiro" } });
    const { id } = await psvc.registerPayment(admin, orderId, pay(10_000));
    const d = new Date(`${today}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    await psvc.updatePayment(staff, id, { amountCents: 25_000, paymentMethodId: other.id, paidAt: yesterday });
    const p = await linked(id);
    expect(p).toMatchObject({ amountCents: 25_000, paymentMethodId: other.id });
    expect(p.transaction).toMatchObject({ amountCents: 25_000, paymentMethodId: other.id });
    expect(p.transaction.occurredOn.toISOString().slice(0, 10)).toBe(yesterday);
    expect(await owner.auditLog.findFirst({ where: { action: "order_payment.update", entityId: id } })).toBeTruthy();
    expect(await owner.auditLog.findFirst({ where: { action: "transaction.update", entityId: p.transactionId } })).toBeTruthy();
  }, T);

  it("mudar a data para outro mês financeiro move o valor entre os resumos (monthStartDay = 5)", async () => {
    const cur = period.currentFinancialMonth(5, TZ);
    const prev = period.shiftMonth(cur, -1);
    const prevFrom = period.financialMonthRange(prev, 5).from;
    const orderId = await newOrder(adminC, "c", 50_000);
    const { id } = await psvc.registerPayment(adminC, orderId, { ...pay(10_000), paymentMethodId: methods.c });
    const income = async (m: typeof cur) => (await tsvc.listTransactions(adminC, { page: 1, month: m })).totals.incomeCents;
    expect([await income(cur), await income(prev)]).toEqual([10_000, 0]);
    await psvc.updatePayment(adminC, id, { amountCents: 10_000, paymentMethodId: methods.c, paidAt: prevFrom });
    expect([await income(cur), await income(prev)]).toEqual([0, 10_000]);
  }, T);

  it("excluir (Admin) apaga recebimento e lançamento; Funcionário negado; some do resumo", async () => {
    const orderId = await newOrder(admin, "a", 60_000);
    const { id } = await psvc.registerPayment(admin, orderId, pay(5_000));
    const tid = (await linked(id)).transactionId;
    await expect(psvc.deletePayment(staff, id)).rejects.toBeInstanceOf(perms.ForbiddenError);
    expect(
      await owner.auditLog.findFirst({ where: { organizationId: orgs.a, action: "order.delete", result: "DENIED", userId: staff.userId } }),
    ).toBeTruthy();
    await psvc.deletePayment(admin, id);
    const p = await linked(id);
    expect(p.deletedAt).not.toBeNull();
    expect(p.transaction.deletedAt).not.toBeNull();
    for (const [action, entityId] of [["order_payment.delete", id], ["transaction.delete", tid]] as const) {
      expect(await owner.auditLog.findFirst({ where: { action, entityId } })).toBeTruthy();
    }
    await psvc.registerPayment(admin, orderId, pay(60_000)); // o excluído liberou o saldo
  }, T);

  it("soma dos recebimentos não passa do total (registrar e editar)", async () => {
    const orderId = await newOrder(admin, "a", 10_000);
    const first = await psvc.registerPayment(admin, orderId, pay(7_000));
    await fieldErr(psvc.registerPayment(admin, orderId, pay(3_001)), "amount");
    const second = await psvc.registerPayment(admin, orderId, pay(3_000));
    await fieldErr(psvc.updatePayment(admin, first.id, pay(7_001)), "amount");
    await psvc.updatePayment(admin, second.id, pay(2_000)); // o próprio valor sai da soma
    expect(await owner.orderPayment.count({ where: { orderId, deletedAt: null } })).toBe(2);
  }, T);

  it("dois recebimentos concorrentes que passam do total: um falha", async () => {
    const orderId = await newOrder(admin, "a", 10_000);
    const results = await Promise.allSettled([
      psvc.registerPayment(admin, orderId, pay(6_000)),
      psvc.registerPayment(staff, orderId, pay(6_000)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(errs.FieldError);
    expect(await owner.orderPayment.count({ where: { orderId, deletedAt: null } })).toBe(1);
  }, T);

  it("pedido cancelado ou excluído não aceita registrar, editar nem excluir recebimento", async () => {
    const orderId = await newOrder(admin, "a", 10_000);
    const { id } = await psvc.registerPayment(admin, orderId, pay(1_000));
    await owner.order.update({ where: { id: orderId }, data: { status: "CANCELED" } });
    await expect(psvc.registerPayment(admin, orderId, pay(1_000))).rejects.toBeInstanceOf(errs.RuleError);
    await expect(psvc.updatePayment(admin, id, pay(2_000))).rejects.toBeInstanceOf(errs.RuleError);
    await expect(psvc.deletePayment(admin, id)).rejects.toBeInstanceOf(errs.RuleError);
    const gone = await newOrder(admin, "a", 10_000);
    await owner.order.update({ where: { id: gone }, data: { deletedAt: new Date() } });
    await expect(psvc.registerPayment(admin, gone, pay(1_000))).rejects.toBeInstanceOf(errs.NotFoundError);
  }, T);

  it("data futura, forma de outra empresa e forma desativada são recusadas", async () => {
    const orderId = await newOrder(admin, "a", 10_000);
    const d = new Date(`${today}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    await fieldErr(psvc.registerPayment(admin, orderId, pay(100, { paidAt: d.toISOString().slice(0, 10) })), "paidAt");
    await fieldErr(psvc.registerPayment(admin, orderId, pay(100, { paymentMethodId: methods.b })), "paymentMethodId");
    const { id } = await psvc.registerPayment(admin, orderId, pay(100));
    await owner.paymentMethod.update({ where: { id: methods.a }, data: { active: false } });
    try {
      await fieldErr(psvc.registerPayment(admin, orderId, pay(100)), "paymentMethodId");
      await psvc.updatePayment(admin, id, pay(200)); // forma atual desativada continua valendo na edição
    } finally {
      await owner.paymentMethod.update({ where: { id: methods.a }, data: { active: true } });
    }
  }, T);

  it("B não registra nem edita recebimento de A", async () => {
    const orderId = await newOrder(admin, "a", 10_000);
    const { id } = await psvc.registerPayment(admin, orderId, pay(100));
    await expect(psvc.registerPayment(adminB, orderId, pay(100, { paymentMethodId: methods.b }))).rejects.toBeInstanceOf(errs.NotFoundError);
    await expect(psvc.updatePayment(adminB, id, pay(200, { paymentMethodId: methods.b }))).rejects.toBeInstanceOf(errs.NotFoundError);
    await expect(psvc.deletePayment(adminB, id)).rejects.toBeInstanceOf(errs.NotFoundError);
  }, T);
});
