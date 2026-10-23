import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 60_000;

type Client = import("@/generated/prisma/client").PrismaClient;

describe.skipIf(!APP_URL || !OWNER_URL)("migration orders_customers", () => {
  const suffix = Date.now().toString(36);
  let owner: Client;
  let orgId = "";
  let customerId = "";
  let productTypeId = "";
  let orderId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { seedOrganizationDefaults } = await import("@/features/organizations/defaults");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    const o = await owner.organization.create({ data: { slug: `mig-${suffix}`, name: "Mig" } });
    orgId = o.id;
    await seedOrganizationDefaults(owner, orgId);
    const c = await owner.customer.create({ data: { organizationId: orgId, name: "Cli", phone: "85988887777" } });
    customerId = c.id;
    const p = await owner.productType.findFirstOrThrow({ where: { organizationId: orgId } });
    productTypeId = p.id;
    const ord = await owner.order.create({
      data: { organizationId: orgId, number: 1, customerId, productTypeId, description: "x", totalCents: 100, dueDate: new Date("2026-10-30") },
    });
    orderId = ord.id;
  }, T);

  afterAll(async () => {
    if (orgId) {
      await owner.orderPayment.deleteMany({ where: { organizationId: orgId } });
      await owner.transaction.deleteMany({ where: { organizationId: orgId } });
      await owner.order.deleteMany({ where: { organizationId: orgId } });
      await owner.customer.deleteMany({ where: { organizationId: orgId } });
      await owner.category.deleteMany({ where: { organizationId: orgId } });
      await owner.paymentMethod.deleteMany({ where: { organizationId: orgId } });
      await owner.productType.deleteMany({ where: { organizationId: orgId } });
      await owner.organizationSettings.deleteMany({ where: { organizationId: orgId } });
      await owner.organization.deleteMany({ where: { id: orgId } });
    }
    await owner?.$disconnect();
  }, T);

  it("defaults criam Pedidos e Estorno com systemKey", async () => {
    const cats = await owner.category.findMany({ where: { organizationId: orgId, NOT: { systemKey: null } } });
    const by = Object.fromEntries(cats.map((c) => [c.systemKey, c]));
    expect(by.ORDER_PAYMENT).toMatchObject({ name: "Pedidos", type: "INCOME" });
    expect(by.ORDER_REFUND).toMatchObject({ name: "Estorno", type: "EXPENSE" });
  }, T);

  it("systemKey repetido na empresa viola o unique", async () => {
    await expect(
      owner.category.create({ data: { organizationId: orgId, type: "INCOME", name: "Outro", systemKey: "ORDER_PAYMENT" } }),
    ).rejects.toThrow();
  }, T);

  it("systemKey fora da lista viola o CHECK", async () => {
    await expect(
      owner.category.create({ data: { organizationId: orgId, type: "INCOME", name: "Zzz", systemKey: "X" } }),
    ).rejects.toThrow();
  }, T);

  it("Order.totalCents = 0 viola o CHECK", async () => {
    await expect(
      owner.order.create({
        data: { organizationId: orgId, number: 2, customerId, productTypeId, description: "x", totalCents: 0, dueDate: new Date("2026-10-30") },
      }),
    ).rejects.toThrow();
  }, T);

  it("Order.number repetido na empresa viola o unique", async () => {
    await expect(
      owner.order.create({
        data: { organizationId: orgId, number: 1, customerId, productTypeId, description: "x", totalCents: 100, dueDate: new Date("2026-10-30") },
      }),
    ).rejects.toThrow();
  }, T);

  it("OrderPayment.amountCents = 0 viola o CHECK", async () => {
    const pm = await owner.paymentMethod.findFirstOrThrow({ where: { organizationId: orgId } });
    const cat = await owner.category.findFirstOrThrow({ where: { organizationId: orgId, systemKey: "ORDER_PAYMENT" } });
    const t = await owner.transaction.create({
      data: { organizationId: orgId, type: "INCOME", amountCents: 100, occurredOn: new Date("2026-10-20"), categoryId: cat.id, description: "t", orderId },
    });
    await expect(
      owner.orderPayment.create({
        data: { organizationId: orgId, orderId, paymentMethodId: pm.id, transactionId: t.id, amountCents: 0, paidAt: new Date("2026-10-20") },
      }),
    ).rejects.toThrow();
  }, T);
});
