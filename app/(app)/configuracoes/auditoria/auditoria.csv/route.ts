import { exportAuditCsv } from "@/features/audit/export";
import { parseAuditFilters } from "@/features/audit/filters";
import { RuleError } from "@/features/platform/errors";
import { ForbiddenError } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requireTenant();
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { filters } = parseAuditFilters(new URL(req.url).searchParams);
    const body = await exportAuditCsv(ctx, filters);
    return new Response(body, {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="auditoria.csv"' },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Sem permissão.", { status: 403, headers });
    if (e instanceof RuleError) return new Response(e.message, { status: 422, headers });
    throw e;
  }
}
