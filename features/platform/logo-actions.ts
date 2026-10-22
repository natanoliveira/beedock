"use server";

import { put } from "@vercel/blob";
import { appendAudit } from "@/lib/audit";
import { blobToken } from "@/lib/blob";
import { withScope } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ForbiddenError } from "@/lib/permissions";
import { platformActor } from "./actor";
import { assertMaster } from "./service";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 1_048_576;

export async function uploadLogoAction(organizationId: string, fd: FormData): Promise<{ url?: string; error?: string }> {
  try {
    const actor = await platformActor();
    await assertMaster(actor, "platform.organization_update");
    const token = blobToken();
    if (!token) return { error: "Upload de logo não configurado neste ambiente." };
    const file = fd.get("logo");
    if (!(file instanceof File) || file.size === 0) return { error: "Selecione uma imagem." };
    if (!TYPES.includes(file.type)) return { error: "Use uma imagem PNG, JPG ou WebP." };
    if (file.size > MAX_BYTES) return { error: "A imagem deve ter no máximo 1 MB." };
    let url: string;
    try {
      ({ url } = await put(`org/${organizationId}/logo-${Date.now()}.webp`, file, {
        access: "public",
        contentType: file.type,
        token,
      }));
    } catch (e) {
      logger.error("logo.upload_failed", e, { organizationId });
      return { error: "Não foi possível enviar o logo agora. Tente de novo." };
    }
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
