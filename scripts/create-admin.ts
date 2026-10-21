import { z } from "zod";
import { hashPassword } from "@/features/auth/service";
import { appendAudit } from "@/lib/audit";
import { ask, askPassword, ownerClient, scriptActor } from "./cli";

const input = z.object({ name: z.string().min(2, "Nome obrigatório."), email: z.email("E-mail inválido.") });

async function main() {
  const db = ownerClient();
  const { name, email } = input.parse({ name: await ask("Nome: "), email: (await ask("E-mail: ")).toLowerCase() });
  const passwordHash = await hashPassword(await askPassword());

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.upsert({
      where: { email },
      create: { name, email, passwordHash, platformRole: "MASTER" },
      update: { name, passwordHash, platformRole: "MASTER", failedLoginCount: 0, lockedUntil: null },
    });
    await appendAudit(tx, scriptActor("create-admin"), {
      action: "platform.master_upsert",
      entityType: "User",
      entityId: created.id,
      after: { name, email, platformRole: "MASTER" },
    });
    return created;
  });

  console.log(`MASTER pronto: ${user.email}`);
  await db.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
