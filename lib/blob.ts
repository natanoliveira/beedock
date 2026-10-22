import "server-only";
import { env } from "@/lib/env";

// placeholder do .env.example não tem o formato do token real: upload fica "indisponível" em vez de falhar
const TOKEN_SHAPE = /^vercel_blob_rw_[A-Za-z0-9]+_/;

export const blobToken = (): string | null => {
  const t = env.BLOB_READ_WRITE_TOKEN;
  return t && TOKEN_SHAPE.test(t) ? t : null;
};

export const blobUploadEnabled = () => blobToken() !== null;
