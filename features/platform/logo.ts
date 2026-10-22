import "server-only";
import { env } from "@/lib/env";

const TOKEN_SHAPE = /^vercel_blob_rw_[A-Za-z0-9]+_/;

export const blobLogoToken = (): string | null => {
  const t = env.BLOB_READ_WRITE_TOKEN;
  return t && TOKEN_SHAPE.test(t) ? t : null;
};

export const logoUploadEnabled = () => blobLogoToken() !== null;
