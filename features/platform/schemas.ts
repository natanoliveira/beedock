import { z } from "zod";
import { isValidDocument, onlyDigits } from "@/lib/document";

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

const maxMsg = (max: number) => `Máximo de ${max} caracteres.`;

const optText = (max: number) => optional(z.string().trim().max(max, maxMsg(max)));

const int = (min: number, max: number, def: number, message: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number(message)
      .int(message)
      .min(min, message)
      .max(max, message)
      .default(def),
  );

const digits = (len: number | [number, number], message: string) =>
  z
    .string()
    .transform(onlyDigits)
    .refine(
      (d) => (Array.isArray(len) ? d.length >= len[0] && d.length <= len[1] : d.length === len),
      message,
    );

const optEmail = optional(z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")));

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120, maxMsg(120)),
  legalName: optText(160),
  document: optional(
    z
      .string()
      .refine(isValidDocument, "CPF ou CNPJ inválido.")
      .transform(onlyDigits),
  ),
  slug: z
    .string()
    .min(3, "Mínimo de 3 caracteres.")
    .max(40, "Máximo de 40 caracteres.")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use minúsculas, números e hífens."),
  phone: optional(digits([10, 11], "Telefone inválido.")),
  email: optEmail,
  zipCode: optional(digits(8, "CEP inválido.")),
  street: optText(160),
  number: optText(20),
  complement: optText(80),
  district: optText(80),
  city: optText(80),
  state: optional(z.string().trim().toUpperCase().length(2, "Use a sigla da UF.")),
  pixKey: optText(140),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  settings: z
    .object({
      monthStartDay: int(1, 28, 1, "Escolha um dia entre 1 e 28."),
      timezone: z.preprocess(
        emptyToUndefined,
        z
          .string()
          .trim()
          .min(1, "Informe o fuso horário.")
          .refine((tz) => {
            try {
              new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
              return true;
            } catch {
              return false;
            }
          }, "Fuso horário inválido.")
          .default("America/Fortaleza"),
      ),
      sessionIdleMinutes: int(5, 1440, 60, "Informe de 5 a 1440 minutos."),
      customerRetentionMonths: int(1, 120, 24, "Informe de 1 a 120 meses."),
      dpoName: optText(120),
      dpoEmail: optEmail,
      dpoPhone: optional(digits([10, 11], "Telefone inválido.")),
    })
    .default({
      monthStartDay: 1,
      timezone: "America/Fortaleza",
      sessionIdleMinutes: 60,
      customerRetentionMonths: 24,
    }),
});
export type OrganizationInput = z.infer<typeof organizationSchema>;

export const adminInviteSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120, maxMsg(120)),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")),
  phone: optional(digits([10, 11], "Telefone inválido.")),
});
export type AdminInviteInput = z.infer<typeof adminInviteSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(10, "Mínimo de 10 caracteres."),
    confirm: z.string(),
  })
  .refine((v) => v.confirm === v.password, {
    path: ["confirm"],
    message: "As senhas não conferem.",
  });

export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (key.startsWith("settings.")) {
      const settings = (out.settings ??= {}) as Record<string, unknown>;
      settings[key.slice("settings.".length)] = value;
    } else out[key] = value;
  }
  return out;
}
