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
type Status = "OPEN" | "READY" | "DELIVERED" | "CANCELED";

describe.skipIf(!APP_URL || !OWNER_URL)("consultas de pedidos", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  const TZ = "America/Fortaleza";
  let owner: Client;
  let q: typeof import("@/features/orders/queries");
  let db: (typeof import("@/lib/db"))["db"];
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const org: Record<string, string> = {};
  const ctx: Record<string, Ctx> = {};
  const cust: Record<string, string> = {};
  const type: Record<string, string> = {};
  const method: Record<string, string> = {};
  const category: Record<string, string> = {};
  const seq: Record<string, number> = {};
  const PAST = "2000-01-01";
  const FUTURE = "2099-01-01";

  const mkOrder = async (
    tag: string,
    o: { status?: Status; totalCents?: number; dueDate?: string; description?: string; customerId?: string; productTypeId?: string; deleted?: boolean } = {},
  ) =>
    owner.order.create({
      data: {
        organizationId: org[tag],
        number: (seq[tag] = (seq[tag] ?? 0) + 1),
        customerId: o.customerId ?? cust[tag],
        productTypeId: o.productTypeId ?? type[tag],
        description: o.description ?? "Pedido teste",
        totalCents: o.totalCents ?? 10_000,
        dueDate: new Date(`${o.dueDate ?? FUTURE}T00:00:00.000Z`),
        status: o.status ?? "OPEN",
        deletedAt: o.deleted ? new Date() : null,
      },
    });
  const addPayment = async (tag: string, orderId: string, amountCents: number, deleted = false) => {
    const t = await owner.transaction.create({
      data: {
        organizationId: org[tag],
        type: "INCOME",
        amountCents,
        occurredOn: new Date("2026-10-20"),
        categoryId: category[tag],
        paymentMethodId: method[tag],
        description: "Recebimento",
        orderId,
        deletedAt: deleted ? new Date() : null,
      },
    });
    return owner.orderPayment.create({
      data: {
        organizationId: org[tag],
        orderId,
        paymentMethodId: method[tag],
        transactionId: t.id,
        amountCents,
        paidAt: new Date("2026-10-20"),
        deletedAt: deleted ? new Date() : null,
      },
    });
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
    q = await import("@/features/orders/queries");
    const mk = async (tag: string) => {
      const o = await owner.organization.create({ data: { slug: `qry-${tag}-${suffix}`, name: `Qry ${tag}` } });
      orgIds.push(o.id);
      org[tag] = o.id;
      await seedOrganizationDefaults(owner, o.id, { monthStartDay: 1, timezone: TZ });
      cust[tag] = (await owner.customer.create({ data: { organizationId: o.id, name: `Maria ${tag}`, phone: "85988887777" } })).id;
      type[tag] = (await owner.productType.findFirstOrThrow({ where: { organizationId: o.id, name: "Camisa" } })).id;
      method[tag] = (await owner.paymentMethod.findFirstOrThrow({ where: { organizationId: o.id, name: "Pix" } })).id;
      category[tag] = (await owner.category.findFirstOrThrow({ where: { organizationId: o.id, systemKey: "ORDER_PAYMENT" } })).id;
      const u = await owner.user.create({ data: { name: `U ${tag}`, email: `${tag}-qry-${suffix}@teste.local` } });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId: o.id, role: "ADMIN" } });
      ctx[tag] = { userId: u.id, userName: u.name, organizationId: o.id, role: "ADMIN", meta };
    };
    for (const tag of ["recv", "up", "list", "page", "det", "iso"]) await mk(tag);
    const s = await owner.user.create({ data: { name: "Staff", email: `staff-qry-${suffix}@teste.local` } });
    userIds.push(s.id);
    await owner.membership.create({ data: { userId: s.id, organizationId: org.list, role: "FUNCIONARIO" } });
    ctx.staff = { userId: s.id, userName: s.name, organizationId: org.list, role: "FUNCIONARIO", meta };
  }, 120_000);

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
  }, 120_000);

  it("amountToReceive ignora cancelado, excluído e recebimento excluído; inclui Entregue com saldo", async () => {
    const open = await mkOrder("recv", { totalCents: 10_000 });
    await addPayment("recv", open.id, 4_000);
    await mkOrder("recv", { status: "DELIVERED", totalCents: 5_000 });
    await mkOrder("recv", { status: "CANCELED", totalCents: 9_999 });
    await mkOrder("recv", { deleted: true, totalCents: 7_777 });
    const withDeletedPay = await mkOrder("recv", { totalCents: 3_000 });
    await addPayment("recv", withDeletedPay.id, 1_000);
    await addPayment("recv", withDeletedPay.id, 2_000, true);
    expect(await q.amountToReceive(ctx.recv)).toBe(6_000 + 5_000 + 2_000);
    expect(await q.amountToReceive(ctx.iso)).toBe(0);
  }, T);

  it("upcomingDeliveries: só Aberto/Pronto por entrega, atrasado marcado, respeita o limite", async () => {
    await mkOrder("up", { status: "OPEN", dueDate: "2099-03-01", description: "c" });
    await mkOrder("up", { status: "READY", dueDate: PAST, description: "a" });
    await mkOrder("up", { status: "OPEN", dueDate: "2099-02-01", description: "b" });
    await mkOrder("up", { status: "DELIVERED", dueDate: PAST });
    await mkOrder("up", { status: "CANCELED", dueDate: PAST });
    await mkOrder("up", { status: "OPEN", dueDate: PAST, deleted: true });
    const rows = await q.upcomingDeliveries(ctx.up);
    expect(rows.map((r) => r.description)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.overdue)).toEqual([true, false, false]);
    expect((await q.upcomingDeliveries(ctx.up, 2)).map((r) => r.description)).toEqual(["a", "b"]);
  }, T);

  it("listOrders: filtros de status, busca e tipo; Funcionário também lê", async () => {
    const other = await owner.productType.create({ data: { organizationId: org.list, name: "Caneca X" } });
    const otherCust = await owner.customer.create({ data: { organizationId: org.list, name: "Joana Zeta", phone: "85911112222" } });
    const open = await mkOrder("list", { description: "camisas time", dueDate: "2099-05-01" });
    const ready = await mkOrder("list", { status: "READY", description: "bonés", dueDate: "2099-04-01" });
    const delivered = await mkOrder("list", { status: "DELIVERED", totalCents: 5_000, description: "canecas", productTypeId: other.id });
    await addPayment("list", delivered.id, 2_000);
    const paidOff = await mkOrder("list", { status: "DELIVERED", totalCents: 1_000, description: "quitado" });
    await addPayment("list", paidOff.id, 1_000);
    const canceled = await mkOrder("list", { status: "CANCELED", description: "cancelado" });
    const joana = await mkOrder("list", { description: "sacolas", customerId: otherCust.id, dueDate: "2099-06-01" });
    const ids = async (f: Record<string, unknown>) =>
      (await q.listOrders(ctx.list, { status: "em-andamento", page: 1, ...f } as never)).rows.map((r) => r.id);

    expect(await ids({})).toEqual([ready.id, open.id, joana.id]); // dueDate asc
    expect(await ids({ status: "entregues" })).toEqual(expect.arrayContaining([delivered.id, paidOff.id]));
    expect((await ids({ status: "entregues" })).includes(open.id)).toBe(false);
    expect(await ids({ status: "cancelados" })).toEqual([canceled.id]);
    const receber = await ids({ status: "a-receber" });
    expect(receber).toEqual(expect.arrayContaining([open.id, ready.id, joana.id, delivered.id]));
    expect(receber).not.toContain(paidOff.id);
    expect(receber).not.toContain(canceled.id);
    expect((await ids({ status: "todos" })).length).toBe(6);
    expect(await ids({ q: "bonés" })).toEqual([ready.id]);
    expect(await ids({ q: "joana" })).toEqual([joana.id]);
    expect(await ids({ q: `#${open.number}`, status: "todos" })).toEqual([open.id]);
    expect(await ids({ q: String(open.number), status: "todos" })).toContain(open.id);
    expect(await ids({ status: "todos", productTypeId: other.id })).toEqual([delivered.id]);

    const row = (await q.listOrders(ctx.staff, { status: "todos", page: 1 })).rows.find((r) => r.id === delivered.id)!;
    expect(row).toMatchObject({ number: delivered.number, totalCents: 5_000, paidCents: 2_000, balanceCents: 3_000, overdue: false });
    expect(row.customer.name).toBe("Maria list");
    expect(row.productType.name).toBe("Caneca X");
  }, T);

  it("listOrders pagina de 50 em 50", async () => {
    await owner.order.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({
        organizationId: org.page,
        number: i + 1,
        customerId: cust.page,
        productTypeId: type.page,
        description: `Lote ${i}`,
        totalCents: 100,
        dueDate: new Date("2099-01-01T00:00:00.000Z"),
      })),
    });
    const p1 = await q.listOrders(ctx.page, { status: "em-andamento", page: 1 });
    const p2 = await q.listOrders(ctx.page, { status: "em-andamento", page: 2 });
    const p9 = await q.listOrders(ctx.page, { status: "em-andamento", page: 9 });
    expect([p1.rows.length, p2.rows.length, p1.pageCount]).toEqual([50, 5, 2]);
    expect(p9.page).toBe(2);
  }, T);

  it("getOrder traz recebimentos, estorno e cliente; B e excluídos recebem null", async () => {
    const o = await mkOrder("det", { status: "CANCELED", totalCents: 10_000 });
    const pay = await addPayment("det", o.id, 4_000);
    await addPayment("det", o.id, 500, true);
    await owner.transaction.create({
      data: {
        organizationId: org.det,
        type: "EXPENSE",
        amountCents: 3_000,
        occurredOn: new Date("2026-10-21"),
        categoryId: (await owner.category.findFirstOrThrow({ where: { organizationId: org.det, systemKey: "ORDER_REFUND" } })).id,
        paymentMethodId: method.det,
        description: "Estorno",
        orderId: o.id,
      },
    });
    const d = (await q.getOrder(ctx.det, o.id))!;
    expect(d).toMatchObject({ id: o.id, status: "CANCELED", paidCents: 4_000, balanceCents: 6_000 });
    expect(d.payments).toHaveLength(1);
    expect(d.payments[0]).toMatchObject({ id: pay.id, amountCents: 4_000, transactionId: pay.transactionId });
    expect(d.payments[0].method.name).toBe("Pix");
    expect(d.refund).toMatchObject({ amountCents: 3_000, occurredOn: "2026-10-21" });
    expect(d.customer).toMatchObject({ id: cust.det, name: "Maria det", anonymized: false });
    expect(await q.getOrder(ctx.iso, o.id)).toBeNull();
    const gone = await mkOrder("det", { deleted: true });
    expect(await q.getOrder(ctx.det, gone.id)).toBeNull();
  }, T);

  it("orderFormOptions: tipo desativado só aparece se for o atual", async () => {
    const old = await owner.productType.create({ data: { organizationId: org.iso, name: "Antigo", active: false } });
    const without = await q.orderFormOptions(ctx.iso);
    expect(without.productTypes.map((p) => p.id)).not.toContain(old.id);
    expect(without.customers.map((c) => c.id)).toContain(cust.iso);
    const withCurrent = await q.orderFormOptions(ctx.iso, { productTypeId: old.id });
    expect(withCurrent.productTypes.map((p) => p.id)).toContain(old.id);
    expect(withCurrent.paymentMethods.map((m) => m.id)).toContain(method.iso);
  }, T);
});
