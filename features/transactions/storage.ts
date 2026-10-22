import "server-only";
import { del, get, put } from "@vercel/blob";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { FieldError } from "@/features/platform/errors";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_BYTES = 3 * 1024 * 1024;
const SAFE_ID = /^[\w-]+$/;
const receiptPrefix = (organizationId: string) => `org/${organizationId}/receipts/`;
const ownsPath = (organizationId: string, pathname: string) =>
  pathname.startsWith(receiptPrefix(organizationId)) && !pathname.includes("..");

function matchesMagic(type: string, b: Uint8Array): boolean {
  const at = (off: number, sig: number[]) => sig.every((v, i) => b[off + i] === v);
  switch (type) {
    case "application/pdf":
      return at(0, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "image/png":
      return at(0, [0x89, 0x50, 0x4e, 0x47]);
    case "image/jpeg":
      return at(0, [0xff, 0xd8, 0xff]);
    case "image/webp":
      return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]);
    default:
      return false;
  }
}

const TOKEN_SHAPE = /^vercel_blob_rw_[A-Za-z0-9]+_/;
const blobToken = (): string | null => {
  const t = env.BLOB_READ_WRITE_TOKEN;
  return t && TOKEN_SHAPE.test(t) ? t : null;
};

export function receiptUploadEnabled(): boolean {
  return blobToken() !== null;
}

export async function uploadReceipt(organizationId: string, transactionId: string, file: File): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new FieldError("receipt", "Use PNG, JPG, WebP ou PDF.");
  if (file.size === 0) throw new FieldError("receipt", "Arquivo vazio.");
  if (file.size > MAX_BYTES) throw new FieldError("receipt", "O comprovante deve ter no máximo 3 MB.");
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!matchesMagic(file.type, head)) throw new FieldError("receipt", "Arquivo inválido ou corrompido.");
  if (!SAFE_ID.test(organizationId) || !SAFE_ID.test(transactionId)) {
    throw new FieldError("receipt", "Arquivo inválido ou corrompido.");
  }
  const token = blobToken();
  if (!token) throw new FieldError("receipt", "Upload de comprovante não configurado neste ambiente.");
  try {
    const { pathname } = await put(`org/${organizationId}/receipts/${transactionId}-${Date.now()}.${ext}`, file, {
      access: "private",
      contentType: file.type,
      token,
    });
    return pathname;
  } catch (e) {
    logger.error("receipt.upload_failed", e, { organizationId });
    throw new FieldError("receipt", "Não foi possível enviar o comprovante agora. Tente de novo ou salve sem anexo.");
  }
}

export async function deleteReceipt(organizationId: string, pathname: string): Promise<void> {
  if (!ownsPath(organizationId, pathname)) {
    logger.warn("receipt.delete_rejected", { organizationId });
    return;
  }
  const token = blobToken();
  if (!token) return;
  try {
    await del(pathname, { token });
  } catch (e) {
    if (e instanceof Error && e.name === "BlobNotFoundError") return;
    logger.error("receipt.delete_failed", e, { pathname });
  }
}

export async function readReceipt(
  organizationId: string,
  pathname: string,
): Promise<{ stream: ReadableStream; contentType: string } | null> {
  if (!ownsPath(organizationId, pathname)) return null;
  const token = blobToken();
  if (!token) return null;
  const res = await get(pathname, { access: "private", token });
  if (!res || res.statusCode !== 200) return null;
  return { stream: res.stream, contentType: res.blob.contentType };
}
