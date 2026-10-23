import type { z } from "zod";
import { organizationSchema } from "@/features/platform/schemas";

/** Dados que o Admin edita da própria empresa: sem slug (Zod descarta slug/status/plan forjados). */
export const companySettingsSchema = organizationSchema.omit({ slug: true });
export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
