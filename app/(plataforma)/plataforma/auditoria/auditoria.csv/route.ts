import { exportAuditCsvPlatform } from "@/features/audit/export";
import { parseAuditFilters } from "@/features/audit/filters";
import { platformActor } from "@/features/platform/actor";
import { RuleError } from "@/features/platform/errors";
import { ForbiddenError } from "@/lib/permissions";
import { requireMaster } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireMaster();
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { filters } = parseAuditFilters(new URL(req.url).searchParams);
    const body = await exportAuditCsvPlatform(await platformActor(), filters);
    return new Response(body, {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="auditoria-plataforma.csv"' },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Sem permissão.", { status: 403, headers });
    if (e instanceof RuleError) return new Response(e.message, { status: 422, headers });
    throw e;
  }
}
