import { authorize, withAudit, type TenantContext } from "@/lib/audit";
import { withScope } from "@/lib/db";
import type { ReceiptOrg } from "@/features/transactions/pdf-kit";
import { formatYearMonth, type YearMonth } from "@/features/transactions/period";
import { getFinancialSettings } from "@/features/transactions/service";
import { transactionsCsv } from "./csv";
import { buildReportPdf } from "./pdf";
import { monthlyReport } from "./service";

async function loadOrg(ctx: TenantContext): Promise<ReceiptOrg | null> {
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const o = await tx.organization.findUnique({ where: { id: ctx.organizationId } });
    if (!o) return null;
    const s = await tx.organizationSettings.findUnique({ where: { organizationId: ctx.organizationId } });
    return {
      name: o.name, legalName: o.legalName, document: o.document, phone: o.phone, email: o.email,
      zipCode: o.zipCode, street: o.street, number: o.number, complement: o.complement,
      district: o.district, city: o.city, state: o.state, logoUrl: o.logoUrl,
      timezone: s?.timezone ?? "America/Fortaleza",
    };
  });
}

/** Audita antes de devolver o corpo: falha na auditoria = nada entregue. */
const audited = <T>(ctx: TenantContext, month: YearMonth, format: "pdf" | "csv", body: T) =>
  withAudit(ctx, { action: "report.export", after: { month: formatYearMonth(month), format } }, async () => body);

export async function exportReportPdf(ctx: TenantContext, month: YearMonth): Promise<Uint8Array | null> {
  await authorize(ctx, "report.export");
  const [org, report, { startDay }] = await Promise.all([loadOrg(ctx), monthlyReport(ctx, month), getFinancialSettings(ctx)]);
  if (!org) return null;
  const pdf = await buildReportPdf(org, report, startDay, ctx.userName, new Date());
  return audited(ctx, month, "pdf", pdf);
}

export async function exportTransactionsCsv(ctx: TenantContext, month: YearMonth): Promise<string> {
  return audited(ctx, month, "csv", await transactionsCsv(ctx, month));
}
