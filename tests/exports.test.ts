import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 120_000;

type Client = import("@/generated/prisma/client").PrismaClient;
type Ctx = import("@/lib/audit").TenantContext;

describe.skipIf(!APP_URL || !OWNER_URL)("exportação de dados", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  let owner: Client;
  let svc: typeof import("@/features/exports/service");
  let perms: typeof import("@/lib/permissions");
  let db: (typeof import("@/lib/db"))["db"];
  const orgIds: string[] = [];
  const userIds: string[] = [];
  let orgA = "";
  let orgB = "";
  let orgEmpty = "";
  let admin: Ctx;
  let adminEmpty: Ctx;
  let staff: Ctx;
  let customerA = "";
  let anonId = "";
  let customerB = "";
  let memberB = "";
  let memberA = "";

  const events = (organizationId: string, action: string) =>
    owner.auditLog.count({ where: { organizationId, action } });

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
    svc = await import("@/features/exports/service");
    perms = await import("@/lib/permissions");

    const mkOrg = async (tag: string) => {
      const o = await owner.organization.create({ data: { slug: `exp-${tag}-${suffix}`, name: `Exp ${tag}` } });
      orgIds.push(o.id);
      await seedOrganizationDefaults(owner, o.id, { monthStartDay: 1, timezone: "America/Fortaleza" });
      return o.id;
    };
    const mkUser = async (tag: string, organizationId: string, role: "ADMIN" | "FUNCIONARIO") => {
      const u = await owner.user.create({
        data: { name: `U ${tag}`, email: `${tag}-exp-${suffix}@teste.local`, passwordHash: "segredo-hash" },
      });
      userIds.push(u.id);
      await owner.membership.create({ data: { userId: u.id, organizationId, role } });
      return { userId: u.id, userName: u.name, organizationId, role, meta } as Ctx;
    };
    orgA = await mkOrg("a");
    orgB = await mkOrg("b");
    orgEmpty = await mkOrg("e");
    admin = await mkUser("admin", orgA, "ADMIN");
    staff = await mkUser("staff", orgA, "FUNCIONARIO");
    adminEmpty = await mkUser("adminE", orgEmpty, "ADMIN");
    const adminB = await mkUser("adminB", orgB, "ADMIN");
    memberA = admin.userId;
    memberB = adminB.userId;
    customerA = (await owner.customer.create({ data: { organizationId: orgA, name: "Ana", phone: "85988887777", document: "12345678901" } })).id;
    customerB = (await owner.customer.create({ data: { organizationId: orgB, name: "Bia", phone: "85977776666" } })).id;
    anonId = (await owner.customer.create({ data: { organizationId: orgA, name: "Anonimizado", phone: "00000000000", anonymizedAt: new Date() } })).id;
    const type = await owner.productType.findFirstOrThrow({ where: { organizationId: orgA } });
    const mkOrder = (organizationId: string, customerId: string, number: number, productTypeId: string) =>
      owner.order.create({
        data: { organizationId, number, customerId, productTypeId, description: "x", totalCents: 1000, dueDate: new Date("2026-03-20T00:00:00Z") },
      });
    await mkOrder(orgA, customerA, 1, type.id);
    const typeB = await owner.productType.findFirstOrThrow({ where: { organizationId: orgB } });
    await mkOrder(orgB, customerB, 1, typeB.id);
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

  it("cliente: dados sem máscara, só os pedidos dele, 1 evento", async () => {
    const before = await events(orgA, "customer.export");
    const d = (await svc.exportCustomerData(admin, customerA)) as { customer: { document: string }; orders: unknown[] };
    expect(d.customer.document).toBe("12345678901");
    expect(d.orders).toHaveLength(1);
    expect(await events(orgA, "customer.export")).toBe(before + 1);
    expect(await svc.exportCustomerData(admin, customerB)).toBeNull();
  }, T);

  it("cliente anonimizado exporta sem PII", async () => {
    const d = JSON.stringify(await svc.exportCustomerData(admin, anonId));
    expect(d).toContain("anonymizedAt");
    expect(d).not.toContain("Ana");
  }, T);

  it("membro: dados do vínculo; de outra empresa → null", async () => {
    const d = (await svc.exportMemberData(admin, memberA)) as { member: { email: string; role: string } };
    expect(d.member.email).toContain("admin-exp");
    expect(d.member.role).toBe("ADMIN");
    expect(JSON.stringify(d)).not.toMatch(/passwordHash|segredo-hash/);
    expect(await svc.exportMemberData(admin, memberB)).toBeNull();
  }, T);

  it("empresa: sem segredos, contagens batem, 1 evento; vazia → listas vazias", async () => {
    const before = await events(orgA, "organization.export");
    const d = (await svc.exportOrganizationData(admin)) as Record<string, unknown[]>;
    expect(JSON.stringify(d)).not.toMatch(/passwordHash|tokenHash|sessionToken|segredo-hash/);
    expect(d.customers).toHaveLength(await owner.customer.count({ where: { organizationId: orgA, deletedAt: null } }));
    expect(d.orders).toHaveLength(1);
    expect(await events(orgA, "organization.export")).toBe(before + 1);
    const e = (await svc.exportOrganizationData(adminEmpty)) as Record<string, unknown[]>;
    expect(e.customers).toEqual([]);
    expect(e.orders).toEqual([]);
    expect(e.transactions).toEqual([]);
  }, T);

  it("Funcionário negado nas três (DENIED)", async () => {
    await expect(svc.exportCustomerData(staff, customerA)).rejects.toBeInstanceOf(perms.ForbiddenError);
    await expect(svc.exportMemberData(staff, memberA)).rejects.toBeInstanceOf(perms.ForbiddenError);
    await expect(svc.exportOrganizationData(staff)).rejects.toBeInstanceOf(perms.ForbiddenError);
    const denied = await owner.auditLog.count({ where: { organizationId: orgA, userId: staff.userId, result: "DENIED" } });
    expect(denied).toBe(3);
  }, T);

  it("MASTER: evento platform.organization_export na cadeia da empresa com papel MASTER", async () => {
    const master = { userId: `m-${suffix}`, userName: "Master", role: "MASTER", organizationId: null, meta, isMaster: true } as never;
    const plain = { userId: `p-${suffix}`, userName: "Plain", role: null, organizationId: null, meta, isMaster: false } as never;
    const d = (await svc.exportOrganizationDataAsMaster(master, orgB)) as { organization: { slug: string } };
    expect(d.organization.slug).toBe(`exp-b-${suffix}`);
    const ev = await owner.auditLog.findFirstOrThrow({ where: { organizationId: orgB, action: "platform.organization_export" } });
    expect(ev.userRole).toBe("MASTER");
    expect(await svc.exportOrganizationDataAsMaster(master, "inexistente")).toBeNull();
    await expect(svc.exportOrganizationDataAsMaster(plain, orgB)).rejects.toBeInstanceOf(perms.ForbiddenError);
  }, T);
});
