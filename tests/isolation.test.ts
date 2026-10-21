import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Isolamento entre empresas contra um banco real (Neon branch de teste).
 * TEST_DATABASE_URL = papel beedock_app (RLS); TEST_DIRECT_URL = papel dono (preparo).
 */
const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;

type Db = typeof import("@/lib/db");
type Client = import("@/generated/prisma/client").PrismaClient;

describe.skipIf(!APP_URL || !OWNER_URL)("isolamento entre empresas", () => {
  const suffix = Date.now().toString(36);
  let owner: Client;
  let db: Db["db"];
  let withScope: Db["withScope"];
  let orgA = "";
  let orgB = "";
  let customerA = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3000";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    ({ db, withScope } = await import("@/lib/db"));
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });

    orgA = (await owner.organization.create({ data: { name: "Teste A", slug: `teste-a-${suffix}` } })).id;
    orgB = (await owner.organization.create({ data: { name: "Teste B", slug: `teste-b-${suffix}` } })).id;
    customerA = await withScope({ organizationId: orgA }, async (tx) => {
      const c = await tx.customer.create({ data: { name: "Cliente A", phone: "86999990000" } });
      return c.id;
    });
  });

  afterAll(async () => {
    await owner.customer.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await owner.productType.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await owner.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await owner.$disconnect();
    await db.$disconnect();
  });

  it("A cria com organizationId preenchido pelo banco", async () => {
    const row = await owner.customer.findUnique({ where: { id: customerA } });
    expect(row?.organizationId).toBe(orgA);
  });

  it("B não lê dados de A", async () => {
    const found = await withScope({ organizationId: orgB }, (tx) =>
      tx.customer.findUnique({ where: { id: customerA } }),
    );
    expect(found).toBeNull();
  });

  it("B não altera nem exclui dados de A", async () => {
    const updated = await withScope({ organizationId: orgB }, (tx) =>
      tx.customer.updateMany({ where: { id: customerA }, data: { name: "invadido" } }),
    );
    const deleted = await withScope({ organizationId: orgB }, (tx) =>
      tx.customer.deleteMany({ where: { id: customerA } }),
    );
    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);
    expect((await owner.customer.findUnique({ where: { id: customerA } }))?.name).toBe("Cliente A");
  });

  it("RLS bloqueia mesmo sem a extension (SQL cru)", async () => {
    const rows = await withScope(
      { organizationId: orgB },
      (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE id = ${customerA}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("RLS impede B de gravar com organizationId de A", async () => {
    await expect(
      withScope(
        { organizationId: orgB },
        (tx) =>
          tx.$executeRaw`INSERT INTO "Customer" (id, "organizationId", name, phone, "updatedAt") VALUES (${`x${suffix}`}, ${orgA}, 'x', 'x', now())`,
      ),
    ).rejects.toThrow();
  });

  it("B não referencia registro de A por chave estrangeira", async () => {
    await expect(
      withScope({ organizationId: orgB }, async (tx) => {
        const productType = await tx.productType.create({ data: { name: `Camisa ${suffix}` } });
        return tx.order.create({
          data: {
            customerId: customerA,
            productTypeId: productType.id,
            description: "invasão",
            totalCents: 100,
            dueDate: new Date(),
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("sem contexto de empresa, acesso a tabela de empresa falha", async () => {
    await expect(db.customer.findMany()).rejects.toThrow(/fora de withScope/);
  });

  it("auditoria é append-only", async () => {
    await expect(
      withScope({ platform: true }, (tx) => tx.$executeRaw`UPDATE "AuditLog" SET action = 'x'`),
    ).rejects.toThrow();
  });
});
