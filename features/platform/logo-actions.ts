"use server";

import { appendAudit } from "@/lib/audit";
import { withScope } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { storeLogo } from "@/features/organizations/logo";
import { platformActor } from "./actor";
import { assertMaster } from "./service";

export async function uploadLogoAction(organizationId: string, fd: FormData): Promise<{ url?: string; error?: string }> {
  try {
    const actor = await platformActor();
    await assertMaster(actor, "platform.organization_update");
    const stored = await storeLogo(organizationId, fd);
    if ("error" in stored) return stored;
    const { url } = stored;
    await withScope({ organizationId }, async (tx) => {
      const current = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { logoUrl: true } });
      await tx.organization.update({ where: { id: organizationId }, data: { logoUrl: url } });
      await appendAudit(tx, { ...actor, organizationId }, {
        action: "platform.organization_update",
        entityType: "Organization",
        entityId: organizationId,
        before: { logoUrl: current.logoUrl },
        after: { logoUrl: url },
      });
    });
    return { url };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
