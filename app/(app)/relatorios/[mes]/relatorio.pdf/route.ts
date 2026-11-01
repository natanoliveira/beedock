import { exportReportPdf } from "@/features/reports/export";
import { parseYearMonth } from "@/features/transactions/period";
import { ForbiddenError } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ mes: string }> }) {
  const ctx = await requireTenant();
  const month = parseYearMonth((await params).mes);
  const headers = { "Cache-Control": "private, no-store" };
  if (!month) return new Response("Mês inválido.", { status: 404, headers });
  try {
    const body = await exportReportPdf(ctx, month);
    if (!body) return new Response("Empresa não encontrada.", { status: 404, headers });
    return new Response(Buffer.from(body), {
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="relatorio-${(await params).mes}.pdf"` },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Sem permissão.", { status: 403, headers });
    throw e;
  }
}
