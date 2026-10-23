import { authorize, withAudit, type TenantContext } from "@/lib/audit";
import { withScope } from "@/lib/db";
import { toIso } from "./payments";
import type { OrderReceiptData } from "./receipt-pdf";

export { buildOrderReceiptPdf, orderReceiptLines, type OrderReceiptData } from "./receipt-pdf";

/** Pedido da empresa e não excluído; audita a emissão (dado pessoal do cliente). */
export async function loadOrderReceiptData(ctx: TenantContext, id: string): Promise<OrderReceiptData | null> {
  await authorize(ctx, "order.view");
  const data = await withScope({ organizationId: ctx.organizationId }, async (tx): Promise<OrderReceiptData | null> => {
    const o = await tx.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { select: { name: true, phone: true, anonymizedAt: true } },
        productType: { select: { name: true } },
        payments: {
          where: { deletedAt: null },
          include: { paymentMethod: { select: { name: true } } },
          orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
        },
        transactions: { where: { type: "EXPENSE", deletedAt: null }, take: 1, orderBy: { createdAt: "desc" } },
      },
    });
    if (!o) return null;
    const org = await tx.organization.findUnique({ where: { id: ctx.organizationId } });
    if (!org) return null;
    const settings = await tx.organizationSettings.findUnique({ where: { organizationId: ctx.organizationId } });
    const paid = o.payments.reduce((s, p) => s + p.amountCents, 0);
    const refund = o.transactions[0];
    return {
      org: {
        name: org.name,
        legalName: org.legalName,
        document: org.document,
        phone: org.phone,
        email: org.email,
        zipCode: org.zipCode,
        street: org.street,
        number: org.number,
        complement: org.complement,
        district: org.district,
        city: org.city,
        state: org.state,
        logoUrl: org.logoUrl,
        timezone: settings?.timezone ?? "America/Fortaleza",
      },
      order: {
        number: o.number,
        description: o.description,
        productType: o.productType.name,
        dueDate: toIso(o.dueDate),
        status: o.status,
        totalCents: o.totalCents,
        paidCents: paid,
        balanceCents: o.totalCents - paid,
      },
      customer: { name: o.customer.name, phone: o.customer.anonymizedAt ? null : o.customer.phone },
      payments: o.payments.map((p) => ({ paidAt: toIso(p.paidAt), method: p.paymentMethod.name, amountCents: p.amountCents })),
      refund: refund ? { amountCents: refund.amountCents, occurredOn: toIso(refund.occurredOn) } : null,
      issuedAt: new Date(),
    };
  });
  if (!data) return null;
  // Auditoria antes do build do PDF de propósito: registrar a mais é o lado seguro.
  await withAudit(
    ctx,
    { action: "order.receipt_issue", entityType: "Order", entityId: id, after: { number: data.order.number } },
    async () => undefined,
  );
  return data;
}
