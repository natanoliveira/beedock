import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let seq = 0;
vi.mock("@/features/transactions/storage", () => ({
  uploadReceipt: vi.fn(async (orgId: string, txId: string) => `org/${orgId}/receipts/${txId}-fake${++seq}.pdf`),
  deleteReceipt: vi.fn(async () => {}),
  readReceipt: vi.fn(async () => null),
  receiptUploadEnabled: () => true,
}));

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 60_000;

type Client = import("@/generated/prisma/client").PrismaClient;
type Svc = typeof import("@/features/transactions/service");
type Ctx = import("@/lib/audit").TenantContext;
type Input = import("@/features/transactions/schemas").TransactionInput;

describe.skipIf(!APP_URL || !OWNER_URL)("service de lançamentos", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let svc: Svc;
  let storage: typeof import("@/features/transactions/storage");
  let perms: typeof import("@/lib/permissions");
  let period: typeof import("@/features/transactions/period");
  let db: typeof import("@/lib/db")["db"];
  const orgIds: string[] = [];
  const userIds: string[] = [];

  let orgA: string;
  let orgB: string;
  let admin: Ctx;
  let staff: Ctx;
  let adminB: Ctx;
  let incomeCat: string;
  let expenseCat: string;
  let otherOrgCat: string;
  let inactiveIncomeCat: string;
  let inactiveIncomeCat2: string;
  let pix: string;
  let today: string;

  const input = (over: Partial<Input> = {}): Input => ({
    type: "INCOME",
    amountCents: 10_000,
    occurredOn: today,
    categoryId: incomeCat,
    description: "Venda balcão",
    ...over,
  });
  const makeCtx = (userId: string, userName: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO"): Ctx => ({
    userId,
    userName,
    organizationId,
    role,
    meta,
  });
  const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "c.pdf", { type: "application/pdf" });

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ db } = await import("@/lib/db"));
    svc = await import("@/features/transactions/service");
    storage = await import("@/features/transactions/storage");
    perms = await import("@/lib/permissions");
    period = await import("@/features/transactions/period");

    const mkOrg = async (tag: string, monthStartDay: number) => {
      const o = await owner.organization.create({ data: { slug: `tx-${tag}-${suffix}`, name: `Tx ${tag}` } });
      orgIds.push(o.id);
      await owner.organizationSettings.create({
        data: { organizationId: o.id, monthStartDay, timezone: "America/Fortaleza" },
      });
      return o.id;
    };
    const mkUser = async (tag: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO") => {
      const u = await owner.user.create({ data: { name: `U ${tag}`, email: `${tag}-${suffix}@teste.local` } });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId, role } });
      return makeCtx(u.id, u.name, organizationId, role);
    };
    orgA = await mkOrg("a", 5);
    orgB = await mkOrg("b", 1);
    admin = await mkUser("admin", orgA, "ADMIN");
    staff = await mkUser("staff", orgA, "FUNCIONARIO");
    adminB = await mkUser("adminb", orgB, "ADMIN");

    const cat = (organizationId: string, type: "INCOME" | "EXPENSE", name: string, active = true) =>
      owner.category.create({ data: { organizationId, type, name, active } }).then((c) => c.id);
    incomeCat = await cat(orgA, "INCOME", "Vendas");
    expenseCat = await cat(orgA, "EXPENSE", "Insumos");
    inactiveIncomeCat = await cat(orgA, "INCOME", "Antiga 1", false);
    inactiveIncomeCat2 = await cat(orgA, "INCOME", "Antiga 2", false);
    otherOrgCat = await cat(orgB, "INCOME", "Vendas B");
    pix = (await owner.paymentMethod.create({ data: { organizationId: orgA, name: "Pix" } })).id;
    today = period.todayIn("America/Fortaleza");
  }, T);

  afterAll(async () => {
    const inOrgs = { organizationId: { in: orgIds } };
    await owner.transaction.deleteMany({ where: inOrgs });
    await owner.membership.deleteMany({ where: inOrgs });
    await owner.category.deleteMany({ where: inOrgs });
    await owner.paymentMethod.deleteMany({ where: inOrgs });
    await owner.organizationSettings.deleteMany({ where: inOrgs });
    await owner.organization.deleteMany({ where: { id: { in: orgIds } } });
    await owner.user.deleteMany({ where: { id: { in: userIds } } });
    await owner.$disconnect();
    await db.$disconnect();
  });

  const fieldErr = async (p: Promise<unknown>, field: string) => {
    const { FieldError } = await import("@/features/platform/errors");
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(FieldError);
    expect((e as InstanceType<typeof FieldError>).field).toBe(field);
  };

  it("settings financeiros", async () => {
    expect(await svc.getFinancialSettings(admin)).toEqual({ startDay: 5, timezone: "America/Fortaleza" });
  }, T);

  it("Admin cria entrada com pagador, audita mascarado e lista com totais", async () => {
    const { id } = await svc.createTransaction(
      admin,
      input({ amountCents: 12_345, payerName: "Maria", payerDocument: "52998224725", paymentMethodId: pix }),
    );
    const log = await owner.auditLog.findFirst({
      where: { organizationId: orgA, action: "transaction.create", entityId: id },
    });
    expect(log).toBeTruthy();
    const after = log!.after as Record<string, unknown>;
    expect(after.payerDocument).toBe("529******25");
    expect(after.description).toBe("Venda balcão");
    expect(after.hasReceipt).toBe(false);
    expect(JSON.stringify(log, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain("52998224725");
    const list = await svc.listTransactions(admin, { page: 1 });
    const row = list.rows.find((r) => r.id === id)!;
    expect(row.payerName).toBe("Maria");
    expect(row.occurredOn).toBe(today);
    expect(row.category.name).toBe("Vendas");
    expect(row.paymentMethod?.name).toBe("Pix");
    expect(list.totals.incomeCents).toBe(12_345);
    expect(list.totals.expenseCents).toBe(0);
    expect(list.totals.profitCents).toBe(12_345);
    expect(list.pageCount).toBe(1);
  }, T);

  it("saída com pagador falha em payerName", async () => {
    await fieldErr(
      svc.createTransaction(admin, input({ type: "EXPENSE", categoryId: expenseCat, payerName: "X" })),
      "payerName",
    );
  }, T);

  it("categoria de tipo errado ou de outra empresa falha em categoryId", async () => {
    await fieldErr(svc.createTransaction(admin, input({ categoryId: expenseCat })), "categoryId");
    await fieldErr(svc.createTransaction(admin, input({ categoryId: otherOrgCat })), "categoryId");
    await fieldErr(svc.createTransaction(admin, input({ categoryId: inactiveIncomeCat })), "categoryId");
    await fieldErr(svc.createTransaction(admin, input({ paymentMethodId: "inexistente" })), "paymentMethodId");
  }, T);

  it("data futura falha em occurredOn", async () => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    await fieldErr(svc.createTransaction(admin, input({ occurredOn: d.toISOString().slice(0, 10) })), "occurredOn");
  }, T);

  it("Funcionário cria e edita; não exclui (DENIED); sem lucro", async () => {
    const { id } = await svc.createTransaction(staff, input({ description: "Func cria" }));
    await svc.updateTransaction(staff, id, input({ description: "Func edita", amountCents: 500 }));
    expect((await svc.getTransaction(staff, id))?.description).toBe("Func edita");
    await expect(svc.deleteTransaction(staff, id)).rejects.toBeInstanceOf(perms.ForbiddenError);
    const denied = await owner.auditLog.findFirst({
      where: { organizationId: orgA, action: "transaction.delete", result: "DENIED", userId: staff.userId },
    });
    expect(denied).toBeTruthy();
    const list = await svc.listTransactions(staff, { page: 1 });
    expect("profitCents" in list.totals).toBe(false);
    const sum = await svc.monthSummary(staff);
    expect("profitCents" in sum).toBe(false);
    expect((await svc.monthSummary(admin)).profitCents).toBeDefined();
    const upd = await owner.auditLog.findFirst({ where: { action: "transaction.update", entityId: id } });
    expect((upd!.after as Record<string, unknown>).description).toBe("Func edita");
  }, T);

  it("excluído some da lista, totais e getTransaction", async () => {
    const before = await svc.listTransactions(admin, { page: 1 });
    const { id } = await svc.createTransaction(admin, input({ amountCents: 777_00, description: "Vai sumir" }));
    const mid = await svc.listTransactions(admin, { page: 1 });
    expect(mid.totals.incomeCents).toBe(before.totals.incomeCents + 777_00);
    await svc.deleteTransaction(admin, id);
    const after = await svc.listTransactions(admin, { page: 1 });
    expect(after.rows.find((r) => r.id === id)).toBeUndefined();
    expect(after.totals.incomeCents).toBe(before.totals.incomeCents);
    expect(await svc.getTransaction(admin, id)).toBeNull();
    expect(await owner.auditLog.findFirst({ where: { action: "transaction.delete", entityId: id } })).toBeTruthy();
  }, T);

  it("totais respeitam o mês financeiro (04/10 conta em setembro com startDay 5)", async () => {
    const { id } = await svc.createTransaction(
      admin,
      input({ occurredOn: "2026-10-04", amountCents: 1_00, description: "Virada" }),
    );
    const sep = await svc.listTransactions(admin, { page: 1, month: { year: 2026, month: 9 } });
    const oct = await svc.listTransactions(admin, { page: 1, month: { year: 2026, month: 10 } });
    expect(sep.rows.some((r) => r.id === id)).toBe(true);
    expect(oct.rows.some((r) => r.id === id)).toBe(false);
    expect(sep.range).toEqual({ from: "2026-09-05", to: "2026-10-04" });
  }, T);

  it("filtra por tipo e categoria", async () => {
    await svc.createTransaction(admin, input({ type: "EXPENSE", categoryId: expenseCat, amountCents: 3_00 }));
    const exp = await svc.listTransactions(admin, { page: 1, type: "EXPENSE" });
    expect(exp.rows.every((r) => r.type === "EXPENSE")).toBe(true);
    expect(exp.totals.incomeCents).toBe(0);
    const byCat = await svc.listTransactions(admin, { page: 1, categoryId: incomeCat });
    expect(byCat.rows.every((r) => r.category.id === incomeCat)).toBe(true);
  }, T);

  it("edição: keepPayerDocument preserva o documento; novo documento substitui; saída limpa", async () => {
    const { id } = await svc.createTransaction(
      admin,
      input({ description: "Doc", payerName: "Maria", payerDocument: "52998224725" }),
    );
    const doc = async () => (await owner.transaction.findUnique({ where: { id } }))!.payerDocument;
    await svc.updateTransaction(admin, id, input({ description: "Doc 2", payerName: "Maria", keepPayerDocument: true }));
    expect(await doc()).toBe("52998224725");
    expect((await svc.getTransaction(admin, id))!.payerDocumentMasked).toBe("529******25");
    await svc.updateTransaction(admin, id, input({ payerName: "Maria", payerDocument: "11144477735", keepPayerDocument: true }));
    expect(await doc()).toBe("11144477735");
    await svc.updateTransaction(admin, id, input({ payerName: "Maria" }));
    expect(await doc()).toBeNull();
    await svc.updateTransaction(admin, id, input({ payerName: "Maria", payerDocument: "52998224725" }));
    await svc.updateTransaction(
      admin,
      id,
      input({ type: "EXPENSE", categoryId: expenseCat, keepPayerDocument: true }),
    );
    expect(await doc()).toBeNull();
    expect((await owner.transaction.findUnique({ where: { id } }))!.payerName).toBeNull();
  }, T);

  it("edição: nome apagado limpa o documento mesmo com keepPayerDocument; sem a flag (remover) também limpa", async () => {
    const { id } = await svc.createTransaction(
      admin,
      input({ description: "Doc3", payerName: "Maria", payerDocument: "52998224725" }),
    );
    const doc = async () => (await owner.transaction.findUnique({ where: { id } }))!.payerDocument;
    await svc.updateTransaction(admin, id, input({ keepPayerDocument: true }));
    expect(await doc()).toBeNull();
    await svc.updateTransaction(admin, id, input({ payerName: "Maria", payerDocument: "52998224725" }));
    expect(await doc()).toBe("52998224725");
    await svc.updateTransaction(admin, id, input({ payerName: "Maria" }));
    expect(await doc()).toBeNull();
  }, T);

  it("usedCategoryIds traz as categorias usadas no mês, inclusive desativadas", async () => {
    const { id } = await svc.createTransaction(admin, input({ description: "Usada" }));
    await owner.transaction.update({ where: { id }, data: { categoryId: inactiveIncomeCat } });
    const list = await svc.listTransactions(admin, { page: 1, type: "EXPENSE" });
    expect(list.usedCategoryIds).toContain(inactiveIncomeCat);
    expect(list.usedCategoryIds).toContain(incomeCat);
    expect(list.usedCategoryIds).not.toContain(otherOrgCat);
  }, T);

  it("categoria desativada: mantém a atual, bloqueia troca para outra desativada", async () => {
    const { id } = await svc.createTransaction(admin, input({ description: "Cat ativa" }));
    await owner.transaction.update({ where: { id }, data: { categoryId: inactiveIncomeCat } });
    await svc.updateTransaction(admin, id, input({ categoryId: inactiveIncomeCat, description: "Mantida" }));
    await fieldErr(
      svc.updateTransaction(admin, id, input({ categoryId: inactiveIncomeCat2 })),
      "categoryId",
    );
    const opts = await svc.formOptions(admin, { categoryId: inactiveIncomeCat });
    expect(opts.categories.some((c) => c.id === inactiveIncomeCat)).toBe(true);
    expect(opts.categories.some((c) => c.id === inactiveIncomeCat2)).toBe(false);
    expect(opts.categories.some((c) => c.id === incomeCat)).toBe(true);
    expect(opts.paymentMethods.some((p) => p.id === pix)).toBe(true);
  }, T);

  it("falha na transação após upload apaga o comprovante novo", async () => {
    const del = vi.mocked(storage.deleteReceipt);
    const up = vi.mocked(storage.uploadReceipt);
    del.mockClear();
    up.mockClear();
    await fieldErr(svc.createTransaction(admin, input({ categoryId: otherOrgCat }), pdf()), "categoryId");
    expect(up).toHaveBeenCalledTimes(1);
    const path = await (up.mock.results[0]!.value as Promise<string>);
    expect(del).toHaveBeenCalledWith(orgA, path);
  }, T);

  it("troca comprovante apaga o antigo depois do update; remover zera", async () => {
    const del = vi.mocked(storage.deleteReceipt);
    const { id } = await svc.createTransaction(admin, input({ description: "Com comp" }), pdf());
    const first = (await owner.transaction.findUnique({ where: { id } }))!.receiptUrl!;
    expect(first).toContain(`org/${orgA}/receipts/${id}`);
    expect((await svc.getTransaction(admin, id))?.hasReceipt).toBe(true);
    del.mockClear();
    const seen: (string | null)[] = [];
    del.mockImplementationOnce(async () => {
      seen.push((await owner.transaction.findUnique({ where: { id } }))!.receiptUrl);
    });
    await svc.updateTransaction(admin, id, input({ description: "Com comp" }), pdf());
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(orgA, first);
    const row = await owner.transaction.findUnique({ where: { id } });
    const second = row!.receiptUrl!;
    expect(second).not.toBe(first);
    expect(seen).toEqual([second]);
    expect(del).not.toHaveBeenCalledWith(orgA, second);
    const swap = await owner.auditLog.findFirst({
      where: { action: "transaction.update", entityId: id },
      orderBy: { seq: "desc" },
    });
    expect((swap!.before as Record<string, unknown>).receipt).toBe(first.split("/").pop());
    expect((swap!.after as Record<string, unknown>).receipt).toBe(second.split("/").pop());
    del.mockClear();
    await svc.updateTransaction(admin, id, input({ description: "Com comp", removeReceipt: true }));
    expect(del).toHaveBeenCalledWith(orgA, second);
    expect((await owner.transaction.findUnique({ where: { id } }))!.receiptUrl).toBeNull();
    expect((await svc.getTransaction(admin, id))?.hasReceipt).toBe(false);
  }, T);

  it("empresa B não lê nem edita lançamento da empresa A", async () => {
    const { id } = await svc.createTransaction(admin, input({ description: "Só da A" }));
    expect(await svc.getTransaction(adminB, id)).toBeNull();
    const { NotFoundError } = await import("@/features/platform/errors");
    await expect(
      svc.updateTransaction(adminB, id, input({ categoryId: incomeCat })),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.deleteTransaction(adminB, id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await owner.transaction.findUnique({ where: { id } }))!.description).toBe("Só da A");
    expect((await svc.listTransactions(adminB, { page: 1 })).rows.some((r) => r.id === id)).toBe(false);
  }, T);

  it("recibo: saída, outra empresa e excluído → null; entrada válida audita emissão", async () => {
    const rc = await import("@/features/transactions/receipt");
    const out = await svc.createTransaction(admin, input({ type: "EXPENSE", categoryId: expenseCat }));
    expect(await rc.loadReceiptData(admin, out.id)).toBeNull();
    const inc = await svc.createTransaction(
      admin,
      input({ amountCents: 15_000, payerName: "Ana", payerDocument: "52998224725", paymentMethodId: pix }),
    );
    expect(await rc.loadReceiptData(adminB, inc.id)).toBeNull();
    const data = await rc.loadReceiptData(staff, inc.id);
    expect(data?.tx.amountCents).toBe(15_000);
    expect(data?.tx.paymentMethod).toBe("Pix");
    expect(data?.org.name).toBe("Tx a");
    expect(data?.org.timezone).toBe("America/Fortaleza");
    const log = await owner.auditLog.findFirst({
      where: { organizationId: orgA, action: "transaction.receipt_issue", entityId: inc.id },
    });
    expect(log?.userId).toBe(staff.userId);
    expect(JSON.stringify(log, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain("52998224725");
    const bytes = await rc.buildReceiptPdf(data!, null);
    expect(bytes.length).toBeGreaterThan(500);
    await svc.deleteTransaction(admin, inc.id);
    expect(await rc.loadReceiptData(admin, inc.id)).toBeNull();
    expect(await owner.auditLog.count({ where: { action: "transaction.receipt_issue", entityId: out.id } })).toBe(0);
  }, T);

  it("comprovante: sem arquivo, outra empresa e excluído → null; com arquivo lê do storage", async () => {
    const rc = await import("@/features/transactions/receipt");
    const read = vi.mocked(storage.readReceipt);
    const none = await svc.createTransaction(admin, input({ description: "Sem comp" }));
    expect(await rc.loadReceiptFile(admin, none.id)).toBeNull();
    const withFile = await svc.createTransaction(admin, input({ description: "Com comp 2" }), pdf());
    const path = (await owner.transaction.findUnique({ where: { id: withFile.id } }))!.receiptUrl!;
    expect(await rc.loadReceiptFile(adminB, withFile.id)).toBeNull();
    read.mockClear();
    read.mockResolvedValueOnce({ stream: new ReadableStream(), contentType: "application/pdf" });
    const file = await rc.loadReceiptFile(admin, withFile.id);
    expect(file?.contentType).toBe("application/pdf");
    expect(file?.filename).toMatch(/^comprovante-[\w.-]+\.pdf$/);
    expect(read).toHaveBeenCalledWith(orgA, path);
    read.mockRejectedValueOnce(new Error("network"));
    await expect(rc.loadReceiptFile(admin, withFile.id)).rejects.toBeInstanceOf(rc.ReceiptUnavailableError);
    await svc.deleteTransaction(admin, withFile.id);
    expect(await rc.loadReceiptFile(admin, withFile.id)).toBeNull();
  }, T);
});
