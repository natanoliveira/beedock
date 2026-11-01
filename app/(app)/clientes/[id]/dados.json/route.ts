import { exportCustomerData } from "@/features/exports/service";
import { jsonDownload } from "@/features/exports/respond";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant();
  const { id } = await params;
  return jsonDownload(() => exportCustomerData(ctx, id), () => `cliente-${id}.json`);
}
