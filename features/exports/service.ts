import { appendAudit, authorize, withAudit, type TenantContext } from "@/lib/audit";
import { withScope, type Tx } from "@/lib/db";
import { assertMaster, type PlatformActor } from "@/features/platform/service";

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function controller(tx: Tx, organizationId: string) {
  const [org, settings] = await Promise.all([
    tx.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, legalName: true, document: true, email: true, phone: true },
    }),
    tx.organizationSettings.findUnique({
      where: { organizationId },
      select: { dpoName: true, dpoEmail: true, dpoPhone: true },
    }),
  ]);
  return { controller: org, dpo: settings };
}

export async function exportCustomerData(ctx: TenantContext, id: string): Promise<object | null> {
  await authorize(ctx, "customer.export");
  return withAudit(ctx, (r) => ({ action: "customer.export", entityType: "Customer", entityId: id, after: { format: "json", found: r !== null } }), async (tx) => {
    const c = await tx.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        orders: {
          where: { deletedAt: null },
          orderBy: { number: "asc" },
          include: { payments: { where: { deletedAt: null }, orderBy: { paidAt: "asc" } }, productType: { select: { name: true } } },
        },
      },
    });
    if (!c) return null;
    return {
      exportedAt: new Date().toISOString(),
      ...(await controller(tx, ctx.organizationId)),
      customer: {
        id: c.id, name: c.name, phone: c.phone, email: c.email, document: c.document, address: c.address,
        note: c.note, anonymizedAt: c.anonymizedAt, createdAt: c.createdAt,
      },
      orders: c.orders.map((o) => ({
        number: o.number, description: o.description, productType: o.productType.name, totalCents: o.totalCents,
        dueDate: iso(o.dueDate), status: o.status, deliveredOn: o.deliveredOn ? iso(o.deliveredOn) : null,
        canceledAt: o.canceledAt, createdAt: o.createdAt,
        payments: o.payments.map((p) => ({ paidAt: iso(p.paidAt), amountCents: p.amountCents })),
      })),
    };
  });
}

export async function exportMemberData(ctx: TenantContext, userId: string): Promise<object | null> {
  await authorize(ctx, "member.manage");
  return withAudit(ctx, (r) => ({ action: "member.export", entityType: "User", entityId: userId, after: { format: "json", found: r !== null } }), async (tx) => {
    const m = await tx.membership.findFirst({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true, createdAt: true } } },
    });
    if (!m) return null;
    const acceptances = await tx.legalAcceptance.findMany({
      where: { userId },
      include: { document: { select: { type: true, version: true } } },
      orderBy: { acceptedAt: "asc" },
    });
    return {
      exportedAt: new Date().toISOString(),
      ...(await controller(tx, ctx.organizationId)),
      member: {
        ...m.user,
        role: m.role,
        active: m.active,
        memberSince: m.createdAt,
        updatedAt: m.updatedAt,
      },
      acceptances: acceptances.map((a) => ({ document: a.document.type, version: a.document.version, acceptedAt: a.acceptedAt })),
    };
  });
}

async function organizationData(tx: Tx, organizationId: string) {
  const [org, settings, categories, paymentMethods, productTypes, customers, orders, orderPayments, transactions, members] =
    await Promise.all([
      tx.organization.findUnique({ where: { id: organizationId } }),
      tx.organizationSettings.findUnique({ where: { organizationId } }),
      tx.category.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      tx.paymentMethod.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      tx.productType.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      tx.customer.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      tx.order.findMany({ where: { deletedAt: null }, orderBy: { number: "asc" } }),
      tx.orderPayment.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
      tx.transaction.findMany({ where: { deletedAt: null }, orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }] }),
      tx.membership.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    ]);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    organization: org && {
      slug: org.slug, name: org.name, legalName: org.legalName, document: org.document, phone: org.phone, email: org.email,
      zipCode: org.zipCode, street: org.street, number: org.number, complement: org.complement, district: org.district,
      city: org.city, state: org.state, pixKey: org.pixKey, plan: org.plan, status: org.status, createdAt: org.createdAt,
    },
    settings: settings && {
      monthStartDay: settings.monthStartDay, timezone: settings.timezone, currency: settings.currency,
      sessionIdleMinutes: settings.sessionIdleMinutes, customerRetentionMonths: settings.customerRetentionMonths,
      dpoName: settings.dpoName, dpoEmail: settings.dpoEmail, dpoPhone: settings.dpoPhone,
    },
    categories: categories.map((c) => ({ id: c.id, type: c.type, name: c.name, active: c.active, systemKey: c.systemKey })),
    paymentMethods: paymentMethods.map((p) => ({ id: p.id, name: p.name, active: p.active })),
    productTypes: productTypes.map((p) => ({ id: p.id, name: p.name, active: p.active })),
    customers: customers.map((c) => ({
      id: c.id, name: c.name, phone: c.phone, email: c.email, document: c.document, address: c.address, note: c.note,
      anonymizedAt: c.anonymizedAt, createdAt: c.createdAt,
    })),
    orders: orders.map((o) => ({
      id: o.id, number: o.number, customerId: o.customerId, productTypeId: o.productTypeId, description: o.description,
      totalCents: o.totalCents, dueDate: iso(o.dueDate), status: o.status, deliveredOn: o.deliveredOn ? iso(o.deliveredOn) : null,
      canceledAt: o.canceledAt, createdAt: o.createdAt,
    })),
    orderPayments: orderPayments.map((p) => ({
      id: p.id, orderId: p.orderId, paymentMethodId: p.paymentMethodId, transactionId: p.transactionId,
      amountCents: p.amountCents, paidAt: iso(p.paidAt),
    })),
    transactions: transactions.map((t) => ({
      id: t.id, type: t.type, amountCents: t.amountCents, occurredOn: iso(t.occurredOn), categoryId: t.categoryId,
      paymentMethodId: t.paymentMethodId, orderId: t.orderId, description: t.description, payerName: t.payerName,
      payerDocument: t.payerDocument, hasReceipt: t.receiptUrl !== null,
    })),
    members: members.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role, active: m.active })),
  };
}

export async function exportOrganizationData(ctx: TenantContext): Promise<object> {
  await authorize(ctx, "company.export");
  return withAudit(ctx, { action: "organization.export", entityType: "Organization", entityId: ctx.organizationId, after: { format: "json" } }, (tx) =>
    organizationData(tx, ctx.organizationId),
  );
}

export async function exportOrganizationDataAsMaster(actor: PlatformActor, organizationId: string): Promise<object | null> {
  await assertMaster(actor, "platform.organization_export");
  return withScope({ organizationId }, async (tx) => {
    const data = await organizationData(tx, organizationId);
    if (!data.organization) return null;
    await appendAudit(tx, { ...actor, organizationId, role: "MASTER" }, {
      action: "platform.organization_export",
      entityType: "Organization",
      entityId: organizationId,
      after: { format: "json" },
    });
    return data;
  });
}
