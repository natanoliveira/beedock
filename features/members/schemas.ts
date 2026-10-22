import { z } from "zod";
import { adminInviteSchema } from "@/features/platform/schemas";

export const roleSchema = z.enum(["ADMIN", "FUNCIONARIO"], "Escolha o papel.");

export const linkUserSchema = z.object({
  organizationId: z.string().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")),
  role: roleSchema,
});

export type LinkUserInput = z.infer<typeof linkUserSchema>;

export const memberInviteSchema = adminInviteSchema.extend({ role: roleSchema });
export type MemberInviteInput = z.infer<typeof memberInviteSchema>;
