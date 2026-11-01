import { exportMemberData } from "@/features/exports/service";
import { jsonDownload } from "@/features/exports/respond";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireTenant();
  const { userId } = await params;
  return jsonDownload(() => exportMemberData(ctx, userId), () => `membro-${userId}.json`);
}
