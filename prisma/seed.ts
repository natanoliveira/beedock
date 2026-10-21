import { seedOrganizationDefaults } from "@/features/organizations/defaults";
import { ownerClient } from "../scripts/cli";

// Só dados fictícios e nenhum usuário/senha: acesso via pnpm create-admin / create-org.
const ORGS = [
  { slug: "prime-studio-demo", name: "Prime Studio - Uniformes (demo)", city: "Teresina", state: "PI" },
  { slug: "estampa-arte-demo", name: "Estampa Arte (demo)", city: "Fortaleza", state: "CE" },
  { slug: "caneca-bacana-demo", name: "Caneca Bacana (demo)", city: "São Luís", state: "MA" },
];

async function main() {
  const db = ownerClient();
  for (const org of ORGS) {
    if (await db.organization.findUnique({ where: { slug: org.slug } })) continue;
    await db.$transaction(async (tx) => {
      const created = await tx.organization.create({ data: org });
      await tx.$executeRaw`SELECT set_config('app.current_org', ${created.id}, true)`;
      await seedOrganizationDefaults(tx, created.id);
    });
    console.log(`+ ${org.name}`);
  }
  await db.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
