import { createHash } from "node:crypto";

export const anonymizedName = (id: string): string =>
  `Cliente removido #${createHash("sha256").update(id).digest("hex").slice(0, 4)}`;
