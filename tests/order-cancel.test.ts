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

describe.skipIf(!APP_URL || !OWNER_URL)("cancelamento com estorno e guarda dos lançamentos de pedido", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  const TZ = "America/Fortaleza";
  let owner: Client;
  let osvc: typeof import("@/features/orders/service");
  let psvc: typeof import("@/features/orders/payments");
  let tsvc: typeof import("@/features/transactions/service");
  let errs: typeof import("@/features/platform/errors");
  let db: (typeof import("@/lib/db"))["db"];
  let today = "";
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let orgA = "";
  let admin: Ctx;
  let staff: Ctx;
  let adminB: Ctx;
  let customerA = "";
  let typeA = "";
  let methodA = "";
  let methodB = "";

  const newOrder = async (totalCents = 10_000, paid = 0) => {
    const { id } = await osvc.createOrder(admin, {
      customerId: customerA,
      productTypeId: typeA,
      description: "20 camisas time Unidos",
      totalCents,
      dueDate: "2026-10-30",
    });
    const payments: { id: string; transactionId: string }[] = [];
    if (paid > 0) {
      const p = await psvc.registerPayment(admin, id, { amountCents: paid, paymentMethodId: methodA, paidAt: today });
      const row = await owner.orderPayment.findUniqueOrThrow({ where: { id: p.id } });
      payments.push({ id: p.id, transactionId: row.transactionId });
    }
    return { id, payments };
  };
  const refund = (amountCents: number, extra: Record<string, unknown> = {}) => ({
    amountCents,
    paymentMethodId: methodA,
    paidAt: today,
    ...extra,
  });
  const fieldErr = async (p: Promise<unknown>, field: string) => {
    const e = await p.then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(errs.FieldError);
    expect((e as InstanceType<typeof errs.FieldError>).field).toBe(field);
  };
  const GUARD = "Este lançamento é de um pedido. Altere pelo pedido.";

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
    errs = await import("@/features/platform/errors");
    today = (await import("@/features/transactions/period")).todayIn(TZ);

    const mkOrg = async (tag: string) => {
      const o = await owner.organization.create({ data: { slug: `can-${tag}-${suffix}`, name: `Can ${tag}` } });
      orgIds.push(o.id);
      await seedOrganizationDefaults(owner, o.id, { monthStartDay: 1, timezone: TZ });
      return o.id;
    };
    const mkUser = async (tag: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO") => {
      const u = await owner.user.create({ data: { name: `U ${tag}`, email: `${tag}-can-${suffix}@teste.local` } });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId, role } });
      return { userId: u.id, userName: u.name, organizationId, role, meta } as Ctx;
    };
    orgA = await mkOrg("a");
    const orgB = await mkOrg("b");
    admin = await mkUser("admin", orgA, "ADMIN");
    staff = await mkUser("staff", orgA, "FUNCIONARIO");
    adminB = await mkUser("adminb", orgB, "ADMIN");
    customerA = (await owner.customer.create({ data: { organizationId: orgA, name: "Cliente A", phone: "85988887777" } })).id;
    typeA = (await owner.productType.findFirstOrThrow({ where: { organizationId: orgA, name: "Camisa" } })).id;
    methodA = (await owner.paymentMethod.findFirstOrThrow({ where: { organizationId: orgA, name: "Pix" } })).id;
    methodB = (await owner.paymentMethod.findFirstOrThrow({ where: { organizationId: orgB, name: "Pix" } })).id;
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

  it("sem recebimentos: cancela, grava canceledAt e o motivo, sem lançamento", async () => {
    const { id } = await newOrder();
    const r = await osvc.cancelOrder(staff, id, { reason: "cliente desistiu" });
    expect(r.refundTransactionId).toBeNull();
    const o = await owner.order.findUniqueOrThrow({ where: { id } });
    expect(o.status).toBe("CANCELED");
    expect(o.canceledAt).not.toBeNull();
    const log = await owner.auditLog.findFirstOrThrow({ where: { action: "order.cancel", entityId: id } });
    expect(log.reason).toBe("cliente desistiu");
    expect(log.after).toMatchObject({ refundCents: 0 });
    expect(await owner.transaction.count({ where: { orderId: id } })).toBe(0);
  }, T);

  it("com recebimentos: gera saída ORDER_REFUND com o valor informado e mantém os recebimentos", async () => {
    const { id, payments } = await newOrder(10_000, 4_000);
    const { refundTransactionId } = await osvc.cancelOrder(admin, id, { refund: refund(3_000) });
    const t = await owner.transaction.findUniqueOrThrow({ where: { id: refundTransactionId! }, include: { category: true } });
    expect(t).toMatchObject({ type: "EXPENSE", amountCents: 3_000, orderId: id, paymentMethodId: methodA });
    expect(t.category.systemKey).toBe("ORDER_REFUND");
    expect(t.description).toMatch(/^Estorno pedido #\d+$/);
    const kept = await owner.orderPayment.findUniqueOrThrow({ where: { id: payments[0].id }, include: { transaction: true } });
    expect(kept.deletedAt).toBeNull();
    expect(kept.transaction.deletedAt).toBeNull();
    const log = await owner.auditLog.findFirstOrThrow({ where: { action: "order.cancel", entityId: id } });
    expect(log.after).toMatchObject({ refundCents: 3_000 });
    expect(await owner.auditLog.findFirst({ where: { action: "transaction.create", entityId: t.id } })).toBeTruthy();
  }, T);

  it("estorno: obrigatório com recebimentos, entre R$ 0,01 e o recebido, proibido sem recebimentos", async () => {
    const paid = await newOrder(10_000, 4_000);
    await fieldErr(osvc.cancelOrder(admin, paid.id, {}), "refundAmount");
    await fieldErr(osvc.cancelOrder(admin, paid.id, { refund: refund(0) }), "refundAmount");
    await fieldErr(osvc.cancelOrder(admin, paid.id, { refund: refund(4_001) }), "refundAmount");
    await fieldErr(osvc.cancelOrder(admin, paid.id, { refund: refund(100, { paymentMethodId: methodB }) }), "refundPaymentMethodId");
    expect((await owner.order.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe("OPEN");
    expect(await owner.transaction.count({ where: { orderId: paid.id, type: "EXPENSE" } })).toBe(0);
    await osvc.cancelOrder(admin, paid.id, { refund: refund(1) });
    const free = await newOrder();
    await fieldErr(osvc.cancelOrder(admin, free.id, { refund: refund(100) }), "refundAmount");
  }, T);

  it("Entregue e já cancelado não cancelam; cancelado não aceita recebimento", async () => {
    const delivered = await newOrder();
    await osvc.changeOrderStatus(admin, delivered.id, "DELIVERED");
    await expect(osvc.cancelOrder(admin, delivered.id, {})).rejects.toBeInstanceOf(errs.RuleError);
    const o = await newOrder();
    await osvc.cancelOrder(admin, o.id, {});
    await expect(osvc.cancelOrder(admin, o.id, {})).rejects.toBeInstanceOf(errs.RuleError);
    await expect(
      psvc.registerPayment(admin, o.id, { amountCents: 100, paymentMethodId: methodA, paidAt: today }),
    ).rejects.toBeInstanceOf(errs.RuleError);
  }, T);

  it("pedido de A é invisível para B", async () => {
    const { id } = await newOrder();
    await expect(osvc.cancelOrder(adminB, id, {})).rejects.toBeInstanceOf(errs.NotFoundError);
  }, T);

  it("lançamento com orderId não é editável nem excluível pela tela de lançamentos", async () => {
    const { id, payments } = await newOrder(10_000, 4_000);
    const { refundTransactionId } = await osvc.cancelOrder(admin, id, { refund: refund(1_000) });
    const edit = (tid: string) =>
      tsvc.updateTransaction(admin, tid, {
        type: "INCOME",
        amountCents: 1,
        occurredOn: today,
        categoryId: "x",
        description: "Tentativa",
      });
    for (const tid of [payments[0].transactionId, refundTransactionId!]) {
      await expect(edit(tid)).rejects.toThrow(GUARD);
      await expect(tsvc.deleteTransaction(admin, tid)).rejects.toThrow(GUARD);
      expect((await owner.transaction.findUniqueOrThrow({ where: { id: tid } })).deletedAt).toBeNull();
    }
  }, T);
});
