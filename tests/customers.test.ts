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
type Svc = typeof import("@/features/customers/service");
type Ctx = import("@/lib/audit").TenantContext;

describe.skipIf(!APP_URL || !OWNER_URL)("service de clientes", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let svc: Svc;
  let perms: typeof import("@/lib/permissions");
  let errs: typeof import("@/features/platform/errors");
  let db: (typeof import("@/lib/db"))["db"];
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let orgA = "";
  let orgB = "";
  let admin: Ctx;
  let staff: Ctx;
  let adminB: Ctx;
  let productTypeId = "";
  let categoryId = "";
  let methodId = "";
  let orderSeq = 0;

  const person = { name: "Maria Souza", phone: "85988887777" };

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    svc = await import("@/features/customers/service");
    perms = await import("@/lib/permissions");
    errs = await import("@/features/platform/errors");

    const mkOrg = async (tag: string) => {
      const o = await owner.organization.create({ data: { slug: `cus-${tag}-${suffix}`, name: `Cus ${tag}` } });
      orgIds.push(o.id);
      await owner.organizationSettings.create({
        data: { organizationId: o.id, monthStartDay: 1, timezone: "America/Fortaleza" },
      });
      return o.id;
    };
    const mkUser = async (tag: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO") => {
      const u = await owner.user.create({ data: { name: `U ${tag}`, email: `${tag}-cus-${suffix}@teste.local` } });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId, role } });
      return { userId: u.id, userName: u.name, organizationId, role, meta } as Ctx;
    };
    orgA = await mkOrg("a");
    orgB = await mkOrg("b");
    admin = await mkUser("admin", orgA, "ADMIN");
    staff = await mkUser("staff", orgA, "FUNCIONARIO");
    adminB = await mkUser("adminb", orgB, "ADMIN");
    productTypeId = (await owner.productType.create({ data: { organizationId: orgA, name: "Camisa" } })).id;
    categoryId = (
      await owner.category.create({
        data: { organizationId: orgA, type: "INCOME", name: "Pedidos", systemKey: "ORDER_PAYMENT" },
      })
    ).id;
    methodId = (await owner.paymentMethod.create({ data: { organizationId: orgA, name: "Pix" } })).id;
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

  const mkOrder = async (customerId: string, status: "OPEN" | "DELIVERED" | "CANCELED", totalCents = 10_000, paid = 0) => {
    const o = await owner.order.create({
      data: {
        organizationId: orgA,
        number: ++orderSeq,
        customerId,
        productTypeId,
        description: "Pedido teste",
        totalCents,
        dueDate: new Date("2026-10-30"),
        status,
      },
    });
    if (paid > 0) {
      const t = await owner.transaction.create({
        data: {
          organizationId: orgA,
          type: "INCOME",
          amountCents: paid,
          occurredOn: new Date("2026-10-20"),
          categoryId,
          paymentMethodId: methodId,
          description: "Recebimento",
          payerName: "Maria Souza",
          payerDocument: "52998224725",
          orderId: o.id,
        },
      });
      await owner.orderPayment.create({
        data: {
          organizationId: orgA,
          orderId: o.id,
          paymentMethodId: methodId,
          transactionId: t.id,
          amountCents: paid,
          paidAt: new Date("2026-10-20"),
        },
      });
    }
    return o;
  };

  it("Funcionário cria e edita; auditoria mascara o contato", async () => {
    const { id } = await svc.createCustomer(staff, { ...person, document: "52998224725", note: "segredo" });
    const created = await owner.auditLog.findFirst({ where: { action: "customer.create", entityId: id } });
    const after = created!.after as Record<string, unknown>;
    expect(after.name).toBe("Maria Souza");
    expect(after.phone).not.toBe(person.phone);
    expect(JSON.stringify(after)).not.toContain("segredo");
    expect(JSON.stringify(after)).not.toContain("52998224725");
    await svc.updateCustomer(staff, id, { name: "Maria S. Souza", phone: "85988887777" });
    const upd = await owner.auditLog.findFirst({ where: { action: "customer.update", entityId: id } });
    expect((upd!.after as Record<string, unknown>).name).toBe("Maria S. Souza");
  }, T);

  it("Funcionário não exclui, não anonimiza e não vê a revisão (DENIED)", async () => {
    const { id } = await svc.createCustomer(admin, person);
    for (const run of [
      () => svc.deleteCustomer(staff, id),
      () => svc.anonymizeCustomer(staff, id, { reason: "motivo qualquer ok" }),
      () => svc.listCustomersForReview(staff),
    ]) {
      await expect(run()).rejects.toBeInstanceOf(perms.ForbiddenError);
    }
    for (const action of ["customer.delete", "customer.anonymize"]) {
      expect(
        await owner.auditLog.findFirst({ where: { organizationId: orgA, action, result: "DENIED", userId: staff.userId } }),
      ).toBeTruthy();
    }
  }, T);

  it("excluir cliente com pedido é recusado; sem pedido faz soft delete", async () => {
    const withOrder = await svc.createCustomer(admin, person);
    await mkOrder(withOrder.id, "OPEN");
    await expect(svc.deleteCustomer(admin, withOrder.id)).rejects.toBeInstanceOf(errs.RuleError);
    const free = await svc.createCustomer(admin, person);
    await svc.deleteCustomer(admin, free.id);
    expect((await owner.customer.findUniqueOrThrow({ where: { id: free.id } })).deletedAt).not.toBeNull();
    expect(await owner.auditLog.findFirst({ where: { action: "customer.delete", entityId: free.id } })).toBeTruthy();
    expect(await svc.getCustomer(admin, free.id)).toBeNull();
  }, T);

  it("anonimizar: recusado com pedido em andamento", async () => {
    const { id } = await svc.createCustomer(admin, person);
    await mkOrder(id, "OPEN");
    await expect(svc.anonymizeCustomer(admin, id, { reason: "pedido do titular" })).rejects.toBeInstanceOf(errs.RuleError);
    expect((await owner.customer.findUniqueOrThrow({ where: { id } })).anonymizedAt).toBeNull();
  }, T);

  it("anonimizar: troca os dados, limpa o pagador e audita sem PII", async () => {
    const { anonymizedName } = await import("@/features/customers/rules");
    const { id } = await svc.createCustomer(admin, { ...person, email: "m@x.com", document: "52998224725", address: "Rua A" });
    const order = await mkOrder(id, "DELIVERED", 10_000, 4000);
    await svc.anonymizeCustomer(admin, id, { reason: "pedido do titular via WhatsApp" });
    const c = await owner.customer.findUniqueOrThrow({ where: { id } });
    expect(c).toMatchObject({ name: anonymizedName(id), phone: "", email: null, document: null, address: null, note: null });
    expect(c.anonymizedAt).not.toBeNull();
    const t = await owner.transaction.findFirstOrThrow({ where: { orderId: order.id } });
    expect(t).toMatchObject({ payerName: anonymizedName(id), payerDocument: null });
    const log = await owner.auditLog.findFirstOrThrow({ where: { action: "customer.anonymize", entityId: id } });
    expect(log.reason).toBe("pedido do titular via WhatsApp");
    expect(log.before).toEqual({ anonymizedAt: null });
    expect(JSON.stringify([log.before, log.after, log.reason])).not.toContain("Maria");
    await expect(svc.anonymizeCustomer(admin, id, { reason: "de novo, por favor" })).rejects.toBeInstanceOf(errs.RuleError);
    await expect(svc.updateCustomer(admin, id, person)).rejects.toBeInstanceOf(errs.RuleError);
    expect((await svc.customerOptions(admin)).find((o) => o.id === id)).toBeUndefined();
  }, T);

  it("lista: busca por nome e telefone, saldo e pedidos em andamento", async () => {
    const tag = `Zélia${suffix}`;
    const { id } = await svc.createCustomer(admin, { name: tag, phone: "85911112222" });
    await mkOrder(id, "OPEN", 10_000, 4000);
    await mkOrder(id, "CANCELED", 99_000, 0);
    const byName = await svc.listCustomers(admin, { page: 1, q: tag.toLowerCase() });
    expect(byName.rows).toHaveLength(1);
    expect(byName.rows[0]).toMatchObject({ id, ordersOpen: 1, balanceCents: 6000, anonymized: false });
    expect(byName.rows[0].lastOrderOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const byPhone = await svc.listCustomers(admin, { page: 1, q: "(85) 91111-2222" });
    expect(byPhone.rows.map((r) => r.id)).toContain(id);
    const detail = await svc.getCustomer(admin, id);
    expect(detail!.balanceCents).toBe(6000);
    expect(detail!.orders).toHaveLength(2);
  }, T);

  it("revisão por retenção: movimentação antiga entra, recente não", async () => {
    const old = await svc.createCustomer(admin, { name: `Antigo ${suffix}`, phone: "85900000001" });
    const recent = await svc.createCustomer(admin, { name: `Recente ${suffix}`, phone: "85900000002" });
    const oldWithOrder = await svc.createCustomer(admin, { name: `AntigoComPedido ${suffix}`, phone: "85900000003" });
    const longAgo = new Date(Date.now() - 40 * 30 * 24 * 3600 * 1000);
    await owner.customer.updateMany({ where: { id: { in: [old.id, oldWithOrder.id] } }, data: { createdAt: longAgo } });
    await mkOrder(oldWithOrder.id, "DELIVERED"); // pedido de hoje = movimentação recente
    const ids = (await svc.listCustomersForReview(admin)).map((r) => r.id);
    expect(ids).toContain(old.id);
    expect(ids).not.toContain(recent.id);
    expect(ids).not.toContain(oldWithOrder.id);
  }, T);

  it("isolamento: B não lê nem altera cliente de A", async () => {
    const { id } = await svc.createCustomer(admin, person);
    expect(await svc.getCustomer(adminB, id)).toBeNull();
    await expect(svc.updateCustomer(adminB, id, person)).rejects.toBeInstanceOf(errs.NotFoundError);
    await expect(svc.deleteCustomer(adminB, id)).rejects.toBeInstanceOf(errs.NotFoundError);
    expect((await svc.listCustomers(adminB, { page: 1 })).rows.map((r) => r.id)).not.toContain(id);
  }, T);
});
