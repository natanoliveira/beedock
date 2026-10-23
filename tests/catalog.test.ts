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
type Svc = typeof import("@/features/catalog/service");
type Ctx = import("@/lib/audit").TenantContext;

describe.skipIf(!APP_URL || !OWNER_URL)("service de categorias e formas de pagamento", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let svc: Svc;
  let tsvc: typeof import("@/features/transactions/service");
  let perms: typeof import("@/lib/permissions");
  let db: (typeof import("@/lib/db"))["db"];
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let orgA: string;
  let orgB: string;
  let admin: Ctx;
  let staff: Ctx;
  let adminB: Ctx;

  const makeCtx = (userId: string, userName: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO"): Ctx => ({
    userId,
    userName,
    organizationId,
    role,
    meta,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    svc = await import("@/features/catalog/service");
    tsvc = await import("@/features/transactions/service");
    perms = await import("@/lib/permissions");

    const mkOrg = async (tag: string) => {
      const o = await owner.organization.create({ data: { slug: `cat-${tag}-${suffix}`, name: `Cat ${tag}` } });
      orgIds.push(o.id);
      await owner.organizationSettings.create({
        data: { organizationId: o.id, monthStartDay: 1, timezone: "America/Fortaleza" },
      });
      return o.id;
    };
    const mkUser = async (tag: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO") => {
      const u = await owner.user.create({ data: { name: `U ${tag}`, email: `${tag}-cat-${suffix}@teste.local` } });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId, role } });
      return makeCtx(u.id, u.name, organizationId, role);
    };
    orgA = await mkOrg("a");
    orgB = await mkOrg("b");
    admin = await mkUser("admin", orgA, "ADMIN");
    staff = await mkUser("staff", orgA, "FUNCIONARIO");
    adminB = await mkUser("adminb", orgB, "ADMIN");
  }, T);

  afterAll(async () => {
    const inOrgs = { organizationId: { in: orgIds } };
    await owner.transaction.deleteMany({ where: inOrgs });
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

  const fieldErr = async (p: Promise<unknown>, field: string, message: string) => {
    const { FieldError } = await import("@/features/platform/errors");
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(FieldError);
    expect((e as InstanceType<typeof FieldError>).field).toBe(field);
    expect((e as Error).message).toBe(message);
  };

  it("cria, renomeia e desativa categoria com auditoria", async () => {
    const { id } = await svc.createCategory(admin, { name: "Insumos", type: "EXPENSE" });
    const created = await owner.auditLog.findFirst({ where: { action: "category.create", entityId: id } });
    expect((created!.after as Record<string, unknown>).name).toBe("Insumos");
    await svc.updateCategory(admin, id, { name: "Matéria-prima" });
    await svc.updateCategory(admin, id, { active: false });
    const logs = await owner.auditLog.findMany({
      where: { action: "category.update", entityId: id },
      orderBy: { occurredAt: "asc" },
    });
    expect(logs).toHaveLength(2);
    expect((logs[0].after as Record<string, unknown>).name).toBe("Matéria-prima");
    expect((logs[1].after as Record<string, unknown>).active).toBe(false);
    const row = (await svc.listCategories(admin)).find((c) => c.id === id)!;
    expect(row).toMatchObject({ name: "Matéria-prima", type: "EXPENSE", active: false, usage: 0 });
  }, T);

  it("nome repetido sem diferenciar maiúsculas vira erro de campo", async () => {
    await svc.createCategory(admin, { name: "Vendas", type: "INCOME" });
    await fieldErr(svc.createCategory(admin, { name: "vendas", type: "INCOME" }), "name", "Já existe 'vendas'.");
    await svc.createCategory(admin, { name: "Vendas", type: "EXPENSE" });
    const other = await svc.createCategory(admin, { name: "Outra", type: "INCOME" });
    await fieldErr(svc.updateCategory(admin, other.id, { name: "VENDAS" }), "name", "Já existe 'VENDAS'.");
    await svc.createPaymentMethod(admin, { name: "Pix" });
    await fieldErr(svc.createPaymentMethod(admin, { name: "PIX" }), "name", "Já existe 'PIX'.");
  }, T);

  it("nome igual a desativado pede para reativar", async () => {
    const { id } = await svc.createCategory(admin, { name: "Antiga", type: "INCOME" });
    await svc.updateCategory(admin, id, { active: false });
    const msg = "Já existe 'antiga' (desativada). Reative em vez de criar outra.";
    await fieldErr(svc.createCategory(admin, { name: "antiga", type: "INCOME" }), "name", msg);
    const pm = await svc.createPaymentMethod(admin, { name: "Cheque" });
    await svc.updatePaymentMethod(admin, pm.id, { active: false });
    await fieldErr(
      svc.createPaymentMethod(admin, { name: "cheque" }),
      "name",
      "Já existe 'cheque' (desativada). Reative em vez de criar outra.",
    );
    await svc.updatePaymentMethod(admin, pm.id, { active: true });
    expect((await svc.listPaymentMethods(admin)).find((p) => p.id === pm.id)?.active).toBe(true);
  }, T);

  it("forma de pagamento: cria, renomeia e audita", async () => {
    const { id } = await svc.createPaymentMethod(admin, { name: "Dinheiro" });
    await svc.updatePaymentMethod(admin, id, { name: "Espécie" });
    expect(await owner.auditLog.findFirst({ where: { action: "payment_method.create", entityId: id } })).toBeTruthy();
    expect(await owner.auditLog.findFirst({ where: { action: "payment_method.update", entityId: id } })).toBeTruthy();
    expect((await svc.listPaymentMethods(admin)).find((p) => p.id === id)?.name).toBe("Espécie");
  }, T);

  it("Funcionário é negado (DENIED settings.manage)", async () => {
    await expect(svc.createCategory(staff, { name: "Nada", type: "INCOME" })).rejects.toBeInstanceOf(
      perms.ForbiddenError,
    );
    await expect(svc.listCategories(staff)).rejects.toBeInstanceOf(perms.ForbiddenError);
    const denied = await owner.auditLog.findFirst({
      where: { organizationId: orgA, action: "settings.manage", result: "DENIED", userId: staff.userId },
    });
    expect(denied).toBeTruthy();
  }, T);

  it("id de outra empresa ou inexistente vira NotFoundError", async () => {
    const { NotFoundError } = await import("@/features/platform/errors");
    const { id } = await svc.createCategory(adminB, { name: "De B", type: "INCOME" });
    await expect(svc.updateCategory(admin, id, { name: "Invadida" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.updatePaymentMethod(admin, "inexistente", { active: false })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  }, T);

  it("usage conta só lançamentos não excluídos; desativada some de formOptions", async () => {
    const cat = await svc.createCategory(admin, { name: "Em uso", type: "INCOME" });
    const pm = await svc.createPaymentMethod(admin, { name: "Cartão" });
    const today = (await import("@/features/transactions/period")).todayIn("America/Fortaleza");
    const mk = () =>
      tsvc.createTransaction(admin, {
        type: "INCOME",
        amountCents: 1000,
        occurredOn: today,
        categoryId: cat.id,
        paymentMethodId: pm.id,
        description: "Uso",
      });
    await mk();
    await mk();
    const gone = await mk();
    await tsvc.deleteTransaction(admin, gone.id);
    expect((await svc.listCategories(admin)).find((c) => c.id === cat.id)?.usage).toBe(2);
    expect((await svc.listPaymentMethods(admin)).find((p) => p.id === pm.id)?.usage).toBe(2);

    await svc.updateCategory(admin, cat.id, { active: false });
    await svc.updatePaymentMethod(admin, pm.id, { active: false });
    const opts = await tsvc.formOptions(admin);
    expect(opts.categories.find((c) => c.id === cat.id)).toBeUndefined();
    expect(opts.paymentMethods.find((p) => p.id === pm.id)).toBeUndefined();
  }, T);

  it("tipo de produto: cria, renomeia, desativa e audita", async () => {
    const { id } = await svc.createProductType(admin, { name: "Avental" });
    await svc.updateProductType(admin, id, { name: "Avental PRO" });
    await svc.updateProductType(admin, id, { active: false });
    expect(await owner.auditLog.findFirst({ where: { action: "product_type.create", entityId: id } })).toBeTruthy();
    expect(await owner.auditLog.count({ where: { action: "product_type.update", entityId: id } })).toBe(2);
    expect((await svc.listProductTypes(admin)).find((p) => p.id === id)).toMatchObject({
      name: "Avental PRO",
      active: false,
      usage: 0,
    });
  }, T);

  it("tipo de produto: nome repetido (inclusive desativado) vira erro de campo", async () => {
    const { id } = await svc.createProductType(admin, { name: "Chinelo" });
    await fieldErr(svc.createProductType(admin, { name: "CHINELO" }), "name", "Já existe 'CHINELO'.");
    await svc.updateProductType(admin, id, { active: false });
    await fieldErr(
      svc.createProductType(admin, { name: "chinelo" }),
      "name",
      "Já existe 'chinelo' (desativada). Reative em vez de criar outra.",
    );
  }, T);

  it("tipo de produto: Funcionário negado, id de outra empresa é NotFound", async () => {
    const { NotFoundError } = await import("@/features/platform/errors");
    await expect(svc.createProductType(staff, { name: "Nada" })).rejects.toBeInstanceOf(perms.ForbiddenError);
    await expect(svc.listProductTypes(staff)).rejects.toBeInstanceOf(perms.ForbiddenError);
    const { id } = await svc.createProductType(adminB, { name: "De B" });
    await expect(svc.updateProductType(admin, id, { name: "Invadido" })).rejects.toBeInstanceOf(NotFoundError);
  }, T);

  it("categoria de sistema: renomear ok, desativar recusado", async () => {
    const sys = await owner.category.create({
      data: { organizationId: orgA, type: "INCOME", name: "Pedidos", systemKey: "ORDER_PAYMENT" },
    });
    await svc.updateCategory(admin, sys.id, { name: "Encomendas" });
    await fieldErr(
      svc.updateCategory(admin, sys.id, { active: false }),
      "name",
      "Esta categoria é usada pelo sistema e não pode ser desativada.",
    );
    expect((await owner.category.findUniqueOrThrow({ where: { id: sys.id } })).active).toBe(true);
  }, T);
});
