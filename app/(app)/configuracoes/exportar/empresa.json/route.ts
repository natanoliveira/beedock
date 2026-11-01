import { exportOrganizationData } from "@/features/exports/service";
import { jsonDownload, orgSlug } from "@/features/exports/respond";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireTenant();
  return jsonDownload(() => exportOrganizationData(ctx), (d) => `empresa-${orgSlug(d)}.json`);
}
