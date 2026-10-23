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

describe.skipIf(!APP_URL || !OWNER_URL)("recibo do pedido", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let rcpt: typeof import("@/features/orders/receipt");
  let osvc: typeof import("@/features/orders/service");
  let psvc: typeof import("@/features/orders/payments");
  let perms: typeof import("@/lib/permissions");
  let db: (typeof import("@/lib/db"))["db"];
  let today = "";
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let admin: Ctx;
  let adminB: Ctx;
  let customerA = "";
  let typeA = "";
  let methodA = "";

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
    rcpt = await import("@/features/orders/receipt");
    osvc = await import("@/features/orders/service");
    psvc = await import("@/features/orders/payments");
    perms = await import("@/lib/permissions");
    today = (await import("@/features/transactions/period")).todayIn("America/Fortaleza");

    const mkOrg = async (tag: string) => {
      const o = await owner.organization.create({ data: { slug: `rcp-${tag}-${suffix}`, name: `Rcp ${tag}` } });
      orgIds.push(o.id);
      await seedOrganizationDefaults(owner, o.id, { monthStartDay: 1, timezone: "America/Fortaleza" });
      return o.id;
    };
    const mkUser = async (tag: string, organizationId: string) => {
      const u = await owner.user.create({ data: { name: `U ${tag}`, email: `${tag}-rcp-${suffix}@teste.local` } });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId, role: "ADMIN" } });
      return { userId: u.id, userName: u.name, organizationId, role: "ADMIN", meta } as Ctx;
    };
    const a = await mkOrg("a");
    const b = await mkOrg("b");
    admin = await mkUser("admin", a);
    adminB = await mkUser("adminb", b);
    customerA = (await owner.customer.create({ data: { organizationId: a, name: "Ana Souza", phone: "85988887777" } })).id;
    typeA = (await owner.productType.findFirstOrThrow({ where: { organizationId: a, name: "Camisa" } })).id;
    methodA = (await owner.paymentMethod.findFirstOrThrow({ where: { organizationId: a, name: "Pix" } })).id;
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

  const mkOrder = async (paid = 0) => {
    const { id, number } = await osvc.createOrder(admin, {
      customerId: customerA,
      productTypeId: typeA,
      description: "20 camisas",
      totalCents: 10_000,
      dueDate: "2026-10-30",
    });
    if (paid) await psvc.registerPayment(admin, id, { amountCents: paid, paymentMethodId: methodA, paidAt: today });
    return { id, number };
  };

  it("carrega os dados, audita order.receipt_issue e gera PDF", async () => {
    const { id, number } = await mkOrder(4_000);
    const data = (await rcpt.loadOrderReceiptData(admin, id))!;
    expect(data.order).toMatchObject({ number, totalCents: 10_000, paidCents: 4_000, balanceCents: 6_000 });
    expect(data.customer).toEqual({ name: "Ana Souza", phone: "85988887777" });
    expect(data.payments).toHaveLength(1);
    expect(data.org.name).toBe("Rcp a");
    const log = await owner.auditLog.findFirst({ where: { action: "order.receipt_issue", entityId: id } });
    expect(log?.after).toMatchObject({ number });
    const bytes = await rcpt.buildOrderReceiptPdf(data, null);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  }, T);

  it("pedido de outra empresa, excluído ou inexistente devolve null (sem auditoria)", async () => {
    const { id } = await mkOrder();
    expect(await rcpt.loadOrderReceiptData(adminB, id)).toBeNull();
    expect(await rcpt.loadOrderReceiptData(admin, "inexistente")).toBeNull();
    await owner.order.update({ where: { id }, data: { deletedAt: new Date() } });
    expect(await rcpt.loadOrderReceiptData(admin, id)).toBeNull();
    expect(await owner.auditLog.count({ where: { action: "order.receipt_issue", entityId: id } })).toBe(0);
  }, T);

  it("cancelado traz o estorno; cliente anonimizado perde o telefone", async () => {
    const { id } = await mkOrder(4_000);
    await osvc.cancelOrder(admin, id, { refund: { amountCents: 1_500, paymentMethodId: methodA, paidAt: today } });
    const data = (await rcpt.loadOrderReceiptData(admin, id))!;
    expect(data.order.status).toBe("CANCELED");
    expect(data.refund).toMatchObject({ amountCents: 1_500 });
    await owner.customer.update({ where: { id: customerA }, data: { name: "Cliente removido #ab12", phone: "", anonymizedAt: new Date() } });
    try {
      expect((await rcpt.loadOrderReceiptData(admin, id))!.customer).toEqual({ name: "Cliente removido #ab12", phone: null });
    } finally {
      await owner.customer.update({ where: { id: customerA }, data: { name: "Ana Souza", phone: "85988887777", anonymizedAt: null } });
    }
  }, T);

  it("sem permissão de visualização é negado", async () => {
    const { id } = await mkOrder();
    const bogus = { ...admin, role: "NADA" } as unknown as Ctx;
    await expect(rcpt.loadOrderReceiptData(bogus, id)).rejects.toBeInstanceOf(perms.ForbiddenError);
  }, T);
});
