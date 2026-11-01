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

describe.skipIf(!APP_URL || !OWNER_URL)("relatório mensal", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  const TZ = "America/Fortaleza";
  const ym = { year: 2026, month: 3 };
  let owner: Client;
  let db: (typeof import("@/lib/db"))["db"];
  let svc: typeof import("@/features/reports/service");
  let txSvc: typeof import("@/features/transactions/service");
  let perms: typeof import("@/lib/permissions");
  let org = "";
  let emptyOrg = "";
  let admin: Ctx;
  let adminEmpty: Ctx;
  let staff: Ctx;
  const orgIds: string[] = [];
  const userIds: string[] = [];

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
    svc = await import("@/features/reports/service");
    txSvc = await import("@/features/transactions/service");
    perms = await import("@/lib/permissions");

    const mkOrg = async (tag: string) => {
      const o = await owner.organization.create({ data: { slug: `rep-${tag}-${suffix}`, name: `Rep ${tag}` } });
      orgIds.push(o.id);
      await seedOrganizationDefaults(owner, o.id, { monthStartDay: 5, timezone: TZ });
      return o.id;
    };
    const mkUser = async (tag: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO") => {
      const u = await owner.user.create({ data: { name: `U ${tag}`, email: `${tag}-rep-${suffix}@teste.local` } });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId, role } });
      return { userId: u.id, userName: u.name, organizationId, role, meta } as Ctx;
    };
    org = await mkOrg("a");
    emptyOrg = await mkOrg("e");
    admin = await mkUser("admin", org, "ADMIN");
    adminEmpty = await mkUser("adminE", emptyOrg, "ADMIN");
    staff = await mkUser("staff", org, "FUNCIONARIO");

    const cat = (type: "INCOME" | "EXPENSE", systemKey?: string) =>
      owner.category.findFirstOrThrow({
        where: { organizationId: org, type, ...(systemKey ? { systemKey } : { systemKey: null }) },
        orderBy: { name: "asc" },
      });
    const income = await cat("INCOME");
    const expense = await cat("EXPENSE");
    const refundCat = await cat("EXPENSE", "ORDER_REFUND");
    const customer = await owner.customer.create({ data: { organizationId: org, name: "Cliente R", phone: "85988887777" } });
    const productType = await owner.productType.findFirstOrThrow({ where: { organizationId: org } });
    const order = await owner.order.create({
      data: {
        organizationId: org, number: 1, customerId: customer.id, productTypeId: productType.id,
        description: "x", totalCents: 50_000, dueDate: new Date("2026-03-20T00:00:00Z"),
        status: "CANCELED", canceledAt: new Date("2026-03-10T15:00:00Z"),
        createdAt: new Date("2026-03-06T15:00:00Z"),
      },
    });
    await owner.order.create({
      data: {
        organizationId: org, number: 2, customerId: customer.id, productTypeId: productType.id,
        description: "y", totalCents: 30_000, dueDate: new Date("2026-03-20T00:00:00Z"),
        status: "DELIVERED", deliveredOn: new Date("2026-03-15T00:00:00Z"),
        createdAt: new Date("2026-02-20T15:00:00Z"),
      },
    });
    const tx = (type: "INCOME" | "EXPENSE", categoryId: string, amountCents: number, day: string, extra = {}) =>
      owner.transaction.create({
        data: { organizationId: org, type, categoryId, amountCents, occurredOn: new Date(`${day}T00:00:00Z`), description: "t", ...extra },
      });
    await tx("INCOME", income.id, 100_00, "2026-03-05");
    await tx("INCOME", income.id, 50_00, "2026-04-04");
    await tx("INCOME", income.id, 999_00, "2026-03-10", { deletedAt: new Date() });
    await tx("EXPENSE", expense.id, 30_00, "2026-03-20");
    await tx("EXPENSE", refundCat.id, 20_00, "2026-03-11", { orderId: order.id });
    await tx("INCOME", income.id, 70_00, "2025-12-10");
  }, T);

  afterAll(async () => {
    const inOrgs = { organizationId: { in: orgIds } };
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

  it("totais do mês batem com listTransactions e ignoram excluídos", async () => {
    const r = await svc.monthlyReport(admin, ym);
    const list = await txSvc.listTransactions(admin, { month: ym, page: 1 } as never);
    expect(r.range).toEqual({ from: "2026-03-05", to: "2026-04-04" });
    expect(r.incomeCents).toBe(150_00);
    expect(r.expenseCents).toBe(50_00);
    expect(r.profitCents).toBe(100_00);
    expect(r.incomeCents).toBe(list.totals.incomeCents);
    expect(r.expenseCents).toBe(list.totals.expenseCents);
  }, T);

  it("categorias somam o total do tipo; estorno aparece nas saídas", async () => {
    const r = await svc.monthlyReport(admin, ym);
    expect(r.incomeByCategory.reduce((s, c) => s + c.totalCents, 0)).toBe(r.incomeCents);
    expect(r.expenseByCategory.reduce((s, c) => s + c.totalCents, 0)).toBe(r.expenseCents);
    expect(r.expenseByCategory.map((c) => c.totalCents)).toEqual([30_00, 20_00]);
    expect(r.expenseByCategory[0].pct).toBe(60);
  }, T);

  it("last6 tem 6 meses consecutivos, com virada de ano", async () => {
    const r = await svc.monthlyReport(admin, ym);
    expect(r.last6.map((m) => `${m.month.year}-${m.month.month}`)).toEqual([
      "2025-10", "2025-11", "2025-12", "2026-1", "2026-2", "2026-3",
    ]);
    expect(r.last6[2].incomeCents).toBe(70_00);
  }, T);

  it("blocos de pedidos no fuso da empresa", async () => {
    const r = await svc.monthlyReport(admin, ym);
    expect(r.orders.created).toEqual({ count: 1, totalCents: 50_000 });
    expect(r.orders.delivered).toEqual({ count: 1, totalCents: 30_000 });
    expect(r.orders.canceled).toEqual({ count: 1, refundedCents: 20_00 });
  }, T);

  it("mês vazio: zeros e pct 0", async () => {
    const r = await svc.monthlyReport(adminEmpty, ym);
    expect([r.incomeCents, r.expenseCents, r.profitCents]).toEqual([0, 0, 0]);
    expect(r.incomeByCategory).toEqual([]);
    expect(r.orders.created.count).toBe(0);
  }, T);

  it("CSV: cabeçalho, escape, negativo, sem excluídos e sem pagador", async () => {
    const { transactionsCsv } = await import("@/features/reports/csv");
    const cat = await owner.category.findFirstOrThrow({ where: { organizationId: org, type: "INCOME", systemKey: null } });
    await owner.transaction.create({
      data: {
        organizationId: org, type: "INCOME", categoryId: cat.id, amountCents: 1, occurredOn: new Date("2026-03-06T00:00:00Z"),
        description: "=1+1; \"x\"", payerName: "Fulano Pagador", payerDocument: "12345678901",
      },
    });
    const csv = await transactionsCsv(admin, ym);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("\uFEFFData;Tipo;Categoria;Forma de pagamento;Descrição;Pedido;Valor");
    expect(csv).toContain("-30,00");
    expect(csv).toContain(`"'=1+1; ""x"""`);
    expect(csv).not.toContain("999,00");
    expect(csv).not.toContain("Fulano");
    expect(csv).not.toContain("12345678901");
    await expect(transactionsCsv(staff, ym)).rejects.toBeInstanceOf(perms.ForbiddenError);
  }, T);

  it("Funcionário negado e auditado", async () => {
    await expect(svc.monthlyReport(staff, ym)).rejects.toBeInstanceOf(perms.ForbiddenError);
    const log = await owner.auditLog.findFirst({
      where: { organizationId: org, result: "DENIED", userId: staff.userId },
    });
    expect(log).not.toBeNull();
  }, T);
});
