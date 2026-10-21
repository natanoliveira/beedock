import "server-only";
import { env } from "@/lib/env";

export const logoUploadEnabled = () => !!env.BLOB_READ_WRITE_TOKEN;
