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
type Svc = typeof import("@/features/orders/service");
type Ctx = import("@/lib/audit").TenantContext;

describe.skipIf(!APP_URL || !OWNER_URL)("service de pedidos", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  const TZ = "America/Fortaleza";
  let owner: Client;
  let svc: Svc;
  let perms: typeof import("@/lib/permissions");
  let errs: typeof import("@/features/platform/errors");
  let today = "";
  let db: (typeof import("@/lib/db"))["db"];
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let orgA = "";
  let orgB = "";
  let admin: Ctx;
  let staff: Ctx;
  let adminB: Ctx;
  let customerA = "";
  let customerB = "";
  let typeA = "";
  let typeB = "";
  let methodA = "";

  const mk = (customerId: string, extra: Record<string, unknown> = {}) => ({
    customerId,
    productTypeId: typeA,
    description: "20 camisas time Unidos",
    totalCents: 60_000,
    dueDate: "2026-10-30",
    ...extra,
  });
  const fieldErr = async (p: Promise<unknown>, field: string) => {
    const e = await p.then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(errs.FieldError);
    expect((e as InstanceType<typeof errs.FieldError>).field).toBe(field);
  };
  const tomorrow = () => {
    const d = new Date(`${today}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

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
    svc = await import("@/features/orders/service");
    perms = await import("@/lib/permissions");
    errs = await import("@/features/platform/errors");
    today = (await import("@/features/transactions/period")).todayIn(TZ);

    const mkOrg = async (tag: string) => {
      const o = await owner.organization.create({ data: { slug: `ord-${tag}-${suffix}`, name: `Ord ${tag}` } });
      orgIds.push(o.id);
      await seedOrganizationDefaults(owner, o.id, { monthStartDay: 1, timezone: TZ });
      return o.id;
    };
    const mkUser = async (tag: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO") => {
      const u = await owner.user.create({ data: { name: `U ${tag}`, email: `${tag}-ord-${suffix}@teste.local` } });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId, role } });
      return { userId: u.id, userName: u.name, organizationId, role, meta } as Ctx;
    };
    orgA = await mkOrg("a");
    orgB = await mkOrg("b");
    admin = await mkUser("admin", orgA, "ADMIN");
    staff = await mkUser("staff", orgA, "FUNCIONARIO");
    adminB = await mkUser("adminb", orgB, "ADMIN");
    customerA = (await owner.customer.create({ data: { organizationId: orgA, name: "Cliente A", phone: "85988887777" } })).id;
    customerB = (await owner.customer.create({ data: { organizationId: orgB, name: "Cliente B", phone: "85988887777" } })).id;
    typeA = (await owner.productType.findFirstOrThrow({ where: { organizationId: orgA, name: "Camisa" } })).id;
    typeB = (await owner.productType.findFirstOrThrow({ where: { organizationId: orgB, name: "Camisa" } })).id;
    methodA = (await owner.paymentMethod.findFirstOrThrow({ where: { organizationId: orgA, name: "Pix" } })).id;
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

  it("numera por empresa e audita order.create", async () => {
    const a1 = await svc.createOrder(admin, mk(customerA));
    const a2 = await svc.createOrder(staff, mk(customerA));
    const b1 = await svc.createOrder(adminB, mk(customerB, { productTypeId: typeB }));
    expect([a1.number, a2.number]).toEqual([1, 2]);
    expect(b1.number).toBe(1);
    const log = await owner.auditLog.findFirstOrThrow({ where: { action: "order.create", entityId: a1.id } });
    expect(log.after).toMatchObject({ number: 1, customerId: customerA, totalCents: 60_000 });
  }, T);

  it("criação concorrente não repete número", async () => {
    const before = await owner.order.count({ where: { organizationId: orgA } });
    const made = await Promise.all(Array.from({ length: 5 }, () => svc.createOrder(admin, mk(customerA))));
    const numbers = made.map((m) => m.number).sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(5);
    expect(numbers[4] - numbers[0]).toBe(4);
    expect(numbers[0]).toBe(before + 1);
  }, T);

  it("cliente novo é criado na mesma transação", async () => {
    const { id } = await svc.createOrder(staff, {
      ...mk(customerA),
      customerId: undefined,
      newCustomer: { name: "Novo Inline", phone: "85999990000" },
    });
    const order = await owner.order.findUniqueOrThrow({ where: { id } });
    const cus = await owner.customer.findUniqueOrThrow({ where: { id: order.customerId } });
    expect(cus.name).toBe("Novo Inline");
    expect(await owner.auditLog.findFirst({ where: { action: "customer.create", entityId: cus.id } })).toBeTruthy();
  }, T);

  it("recusa cliente anonimizado, excluído, de outra empresa e tipo de outra empresa", async () => {
    const anon = await owner.customer.create({
      data: { organizationId: orgA, name: "Anon", phone: "", anonymizedAt: new Date() },
    });
    const gone = await owner.customer.create({
      data: { organizationId: orgA, name: "Gone", phone: "85900000000", deletedAt: new Date() },
    });
    for (const c of [anon.id, gone.id, customerB]) await fieldErr(svc.createOrder(admin, mk(c)), "customerId");
    await fieldErr(svc.createOrder(admin, mk(customerA, { productTypeId: typeB })), "productTypeId");
  }, T);

  it("tipo desativado: recusado na criação, aceito na edição se já era o do pedido", async () => {
    const t = await owner.productType.create({ data: { organizationId: orgA, name: `Velho ${suffix}`, active: true } });
    const { id } = await svc.createOrder(admin, mk(customerA, { productTypeId: t.id }));
    await owner.productType.update({ where: { id: t.id }, data: { active: false } });
    await fieldErr(svc.createOrder(admin, mk(customerA, { productTypeId: t.id })), "productTypeId");
    await svc.updateOrder(admin, id, { ...mk(customerA, { productTypeId: t.id }), description: "Editado ok" });
    expect((await owner.order.findUniqueOrThrow({ where: { id } })).description).toBe("Editado ok");
    const other = await owner.productType.create({ data: { organizationId: orgA, name: `Outro ${suffix}`, active: false } });
    await fieldErr(svc.updateOrder(admin, id, mk(customerA, { productTypeId: other.id })), "productTypeId");
  }, T);

  it("sinal cria recebimento + lançamento INCOME ligado; sinal inválido não cria o pedido", async () => {
    const { id } = await svc.createOrder(admin, {
      ...mk(customerA),
      deposit: { amountCents: 20_000, paymentMethodId: methodA, paidAt: today },
    });
    const pay = await owner.orderPayment.findFirstOrThrow({ where: { orderId: id }, include: { transaction: { include: { category: true } } } });
    expect(pay.amountCents).toBe(20_000);
    expect(pay.transaction).toMatchObject({ type: "INCOME", amountCents: 20_000, orderId: id, paymentMethodId: methodA });
    expect(pay.transaction.category.systemKey).toBe("ORDER_PAYMENT");
    const before = await owner.order.count({ where: { organizationId: orgA } });
    await fieldErr(
      svc.createOrder(admin, { ...mk(customerA), deposit: { amountCents: 100, paymentMethodId: methodA, paidAt: tomorrow() } }),
      "depositPaidAt",
    );
    expect(await owner.order.count({ where: { organizationId: orgA } })).toBe(before);
  }, T);

  it("editar total abaixo do recebido é recusado; cancelado não edita", async () => {
    const { id } = await svc.createOrder(admin, {
      ...mk(customerA),
      deposit: { amountCents: 30_000, paymentMethodId: methodA, paidAt: today },
    });
    await fieldErr(svc.updateOrder(admin, id, mk(customerA, { totalCents: 29_999 })), "total");
    await svc.updateOrder(admin, id, mk(customerA, { totalCents: 30_000 }));
    await owner.order.update({ where: { id }, data: { status: "CANCELED" } });
    await expect(svc.updateOrder(admin, id, mk(customerA))).rejects.toBeInstanceOf(errs.RuleError);
    await expect(svc.changeOrderStatus(admin, id, "OPEN")).rejects.toBeInstanceOf(errs.RuleError);
  }, T);

  it("status: avança, volta, grava deliveredOn e recusa transição inválida", async () => {
    const { id } = await svc.createOrder(staff, mk(customerA));
    await svc.changeOrderStatus(staff, id, "READY");
    await svc.changeOrderStatus(staff, id, "DELIVERED");
    const delivered = await owner.order.findUniqueOrThrow({ where: { id } });
    expect(delivered.status).toBe("DELIVERED");
    expect(delivered.deliveredOn?.toISOString().slice(0, 10)).toBe(today);
    await svc.changeOrderStatus(staff, id, "READY");
    expect((await owner.order.findUniqueOrThrow({ where: { id } })).deliveredOn).toBeNull();
    await expect(svc.changeOrderStatus(staff, id, "READY")).rejects.toBeInstanceOf(errs.RuleError);
    await expect(svc.changeOrderStatus(staff, id, "CANCELED")).rejects.toBeInstanceOf(errs.RuleError);
    const logs = await owner.auditLog.count({ where: { action: "order.status_change", entityId: id } });
    expect(logs).toBe(3);
  }, T);

  it("excluir: Admin sem dinheiro ok; com recebimento recusado; Funcionário negado", async () => {
    const free = await svc.createOrder(admin, mk(customerA));
    const paid = await svc.createOrder(admin, {
      ...mk(customerA),
      deposit: { amountCents: 100, paymentMethodId: methodA, paidAt: today },
    });
    await expect(svc.deleteOrder(staff, free.id)).rejects.toBeInstanceOf(perms.ForbiddenError);
    expect(
      await owner.auditLog.findFirst({ where: { organizationId: orgA, action: "order.delete", result: "DENIED", userId: staff.userId } }),
    ).toBeTruthy();
    await expect(svc.deleteOrder(admin, paid.id)).rejects.toBeInstanceOf(errs.RuleError);
    await svc.deleteOrder(admin, free.id);
    expect((await owner.order.findUniqueOrThrow({ where: { id: free.id } })).deletedAt).not.toBeNull();
    expect(await owner.auditLog.findFirst({ where: { action: "order.delete", entityId: free.id } })).toBeTruthy();
  }, T);

  it("pedido de A é invisível para B (NotFound)", async () => {
    const { id } = await svc.createOrder(admin, mk(customerA));
    await expect(svc.updateOrder(adminB, id, mk(customerB, { productTypeId: typeB }))).rejects.toBeInstanceOf(errs.NotFoundError);
    await expect(svc.changeOrderStatus(adminB, id, "READY")).rejects.toBeInstanceOf(errs.NotFoundError);
    await expect(svc.deleteOrder(adminB, id)).rejects.toBeInstanceOf(errs.NotFoundError);
  }, T);
});
