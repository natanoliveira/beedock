import { exportOrganizationDataAsMaster } from "@/features/exports/service";
import { jsonDownload, orgSlug } from "@/features/exports/respond";
import { platformActor } from "@/features/platform/actor";
import { requireMaster } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireMaster();
  const { id } = await params;
  return jsonDownload(async () => exportOrganizationDataAsMaster(await platformActor(), id), (d) => `empresa-${orgSlug(d)}.json`);
}
