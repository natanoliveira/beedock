import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url({ error: "DATABASE_URL ausente ou inválida (conexão pooled do Neon)" }),
  AUTH_SECRET: z.string({ error: "AUTH_SECRET ausente" }).min(32, "AUTH_SECRET precisa ter 32+ caracteres"),
  AUTH_URL: z.url({ error: "AUTH_URL ausente ou inválida" }),
  AUDIT_HMAC_KEY: z
    .string({ error: "AUDIT_HMAC_KEY ausente (openssl rand -base64 32)" })
    .min(32, "AUDIT_HMAC_KEY precisa ter 32+ caracteres"),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  ENABLE_SIGNUP: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Variáveis de ambiente inválidas:\n${lines.join("\n")}\nVeja .env.example.`);
}

export const env = parsed.data;
