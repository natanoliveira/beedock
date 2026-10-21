import { hashPassword } from "@/features/auth/service";
import { type Actor, appendAudit } from "@/lib/audit";
import type { Tx } from "@/lib/db";

export type MasterSeed = { name: string; email: string; password: string };

export function readMasterSeed(env: Record<string, string | undefined>): MasterSeed | null {
  const name = env.SEED_MASTER_NAME?.trim() ?? "";
  const email = env.SEED_MASTER_EMAIL?.trim().toLowerCase() ?? "";
  const password = env.SEED_MASTER_PASSWORD ?? "";
  const filled = [name, email, password].filter(Boolean).length;
  if (filled === 0) return null;
  if (filled < 3) throw new Error("Defina SEED_MASTER_NAME, SEED_MASTER_EMAIL e SEED_MASTER_PASSWORD juntos (ou nenhum).");
  if (password.length < 10) {
    if (env.NODE_ENV === "production") throw new Error("SEED_MASTER_PASSWORD precisa ter 10+ caracteres");
    console.warn("SEED_MASTER_PASSWORD tem menos de 10 caracteres (aceito só fora de produção).");
  }
  return { name, email, password };
}

export async function seedMaster(tx: Tx, input: MasterSeed, actor: Actor): Promise<"created" | "promoted" | "unchanged"> {
  const { name, email, password } = input;
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing?.platformRole === "MASTER") return "unchanged";

  const user = existing
    ? await tx.user.update({ where: { id: existing.id }, data: { platformRole: "MASTER" } })
    : await tx.user.create({ data: { name, email, passwordHash: await hashPassword(password), platformRole: "MASTER" } });
  await appendAudit(tx, actor, {
    action: "platform.master_seed",
    entityType: "User",
    entityId: user.id,
    ...(existing ? { before: { platformRole: existing.platformRole } } : {}),
    after: { name: user.name, email, platformRole: "MASTER" },
  });
  return existing ? "promoted" : "created";
}
