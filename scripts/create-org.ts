import { z } from "zod";
import { hashPassword } from "@/features/auth/service";
import { seedOrganizationDefaults } from "@/features/organizations/defaults";
import { appendAudit } from "@/lib/audit";
import { ask, askPassword, ownerClient, scriptActor } from "./cli";

// ponytail: Admin criado com senha pelo terminal até o convite por link (Fase 2) existir
const input = z.object({
  name: z.string().min(2, "Nome da empresa obrigatório."),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/, "Slug: 3–40 letras minúsculas, números ou hífen."),
  adminName: z.string().min(2, "Nome do Admin obrigatório."),
  adminEmail: z.email("E-mail do Admin inválido."),
});

async function main() {
  const db = ownerClient();
  const data = input.parse({
    name: await ask("Nome fantasia: "),
    slug: await ask("Slug (ex.: prime-studio): "),
    adminName: await ask("Nome do Admin: "),
    adminEmail: (await ask("E-mail do Admin: ")).toLowerCase(),
  });
  if (await db.user.findUnique({ where: { email: data.adminEmail } })) {
    throw new Error("Já existe um usuário com esse e-mail. Vincular usuário existente chega com os convites (Fase 2).");
  }
  const passwordHash = await hashPassword(await askPassword());

  const org = await db.$transaction(async (tx) => {
    const created = await tx.organization.create({ data: { name: data.name, slug: data.slug } });
    await tx.$executeRaw`SELECT set_config('app.current_org', ${created.id}, true)`;
    await seedOrganizationDefaults(tx, created.id);
    const admin = await tx.user.create({ data: { name: data.adminName, email: data.adminEmail, passwordHash } });
    await tx.membership.create({ data: { userId: admin.id, organizationId: created.id, role: "ADMIN" } });

    const actor = { ...scriptActor("create-org"), organizationId: created.id };
    await appendAudit(tx, actor, {
      action: "platform.organization_create",
      entityType: "Organization",
      entityId: created.id,
      after: { name: data.name, slug: data.slug },
    });
    await appendAudit(tx, actor, {
      action: "member.create",
      entityType: "User",
      entityId: admin.id,
      after: { name: data.adminName, email: data.adminEmail, role: "ADMIN" },
    });
    return created;
  });

  console.log(`Empresa criada: ${org.name} (${org.slug})`);
  await db.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
