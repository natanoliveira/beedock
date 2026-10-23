import "server-only";
import { del, put } from "@vercel/blob";
import { blobToken } from "@/lib/blob";
import { logger } from "@/lib/logger";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 1_048_576;

/** Valida e envia o logo (campo `logo`); compartilhado entre MASTER e Admin. */
export async function storeLogo(organizationId: string, fd: FormData): Promise<{ url: string } | { error: string }> {
  const token = blobToken();
  if (!token) return { error: "Upload de logo não configurado neste ambiente." };
  const file = fd.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione uma imagem." };
  if (!TYPES.includes(file.type)) return { error: "Use uma imagem PNG, JPG ou WebP." };
  if (file.size > MAX_BYTES) return { error: "A imagem deve ter no máximo 1 MB." };
  try {
    const { url } = await put(`org/${organizationId}/logo-${Date.now()}.webp`, file, {
      access: "public",
      contentType: file.type,
      token,
    });
    return { url };
  } catch (e) {
    logger.error("logo.upload_failed", e, { organizationId });
    return { error: "Não foi possível enviar o logo agora. Tente de novo." };
  }
}

/** Remove o blob depois do commit, só se for da própria empresa; falha só é logada (sobra de blob não quebra nada). */
export async function deleteLogoBlob(url: string, organizationId: string): Promise<void> {
  const token = blobToken();
  if (!token) return;
  const file = url.split("/").pop();
  try {
    if (!new URL(url).pathname.startsWith(`/org/${organizationId}/`)) {
      logger.error("logo.delete_skipped", new Error("url fora do prefixo da empresa"), { file });
      return;
    }
    await del(url, { token });
  } catch (e) {
    logger.error("logo.delete_failed", e, { file });
  }
}
