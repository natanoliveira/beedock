import "server-only";
import { BlobNotFoundError } from "@vercel/blob";
import { appendAudit, authorize, withAudit, type TenantContext } from "@/lib/audit";
import { withScope } from "@/lib/db";
import { logger } from "@/lib/logger";
import { readReceipt } from "./storage";
import { receiptNumber, type ReceiptData } from "./receipt-pdf";

export { buildReceiptPdf, receiptLines, receiptNumber, type ReceiptData } from "./receipt-pdf";

export class ReceiptUnavailableError extends Error {
  constructor() {
    super("receipt_unavailable");
  }
}

const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** Só entrada da empresa e não excluída; audita a emissão (dado pessoal do pagador). */
export async function loadReceiptData(ctx: TenantContext, id: string): Promise<ReceiptData | null> {
  await authorize(ctx, "transaction.view");
  const data = await withScope({ organizationId: ctx.organizationId }, async (tx): Promise<ReceiptData | null> => {
    const t = await tx.transaction.findFirst({
      where: { id, type: "INCOME", deletedAt: null },
      include: { paymentMethod: { select: { name: true } } },
    });
    if (!t) return null;
    const o = await tx.organization.findUnique({ where: { id: ctx.organizationId } });
    if (!o) return null;
    const settings = await tx.organizationSettings.findUnique({ where: { organizationId: ctx.organizationId } });
    const timezone = settings?.timezone ?? "America/Fortaleza";
    return {
      org: {
        name: o.name,
        legalName: o.legalName,
        document: o.document,
        phone: o.phone,
        email: o.email,
        zipCode: o.zipCode,
        street: o.street,
        number: o.number,
        complement: o.complement,
        district: o.district,
        city: o.city,
        state: o.state,
        logoUrl: o.logoUrl,
        timezone,
      },
      tx: {
        id: t.id,
        occurredOn: toIso(t.occurredOn),
        amountCents: t.amountCents,
        description: t.description,
        payerName: t.payerName,
        payerDocument: t.payerDocument,
        paymentMethod: t.paymentMethod?.name ?? null,
      },
      issuedAt: new Date(),
    };
  });
  if (!data) return null;
  // Auditoria antes do build do PDF de propósito: registrar a mais é o lado seguro.
  await withAudit(
    ctx,
    { action: "transaction.receipt_issue", entityType: "Transaction", entityId: id, after: { receiptNumber: receiptNumber(data.tx) } },
    async () => undefined,
  );
  return data;
}

export async function loadReceiptFile(
  ctx: TenantContext,
  id: string,
): Promise<{ stream: ReadableStream; contentType: string; filename: string } | null> {
  await authorize(ctx, "transaction.view");
  const t = await withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const row = await tx.transaction.findFirst({
      where: { id, deletedAt: null, receiptUrl: { not: null } },
      select: { receiptUrl: true },
    });
    // como no recibo: audita antes de ler o arquivo, registrar a mais é o lado seguro
    if (row) await appendAudit(tx, ctx, { action: "transaction.receipt_view", entityType: "Transaction", entityId: id });
    return row;
  });
  if (!t?.receiptUrl) return null;
  try {
    const file = await readReceipt(ctx.organizationId, t.receiptUrl);
    if (!file) return null;
    const base = t.receiptUrl.split("/").pop()!.replace(/[^\w.-]/g, "_");
    return { ...file, filename: `comprovante-${base}` };
  } catch (e) {
    if (e instanceof BlobNotFoundError || (e instanceof Error && e.name === "BlobNotFoundError")) return null;
    logger.error("receipt.read_failed", e, { transactionId: id });
    throw new ReceiptUnavailableError();
  }
}
