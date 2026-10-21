import { seedOrganizationDefaults } from "@/features/organizations/defaults";
import { readMasterSeed, seedMaster } from "@/features/platform/seed-master";
import { ownerClient, scriptActor } from "../scripts/cli";

// Empresas fictícias, sem usuários; cria/promove o MASTER se SEED_MASTER_* estiver definido. Admins via pnpm create-org.
const ORGS = [
  { slug: "prime-studio-demo", name: "Prime Studio - Uniformes (demo)", city: "Teresina", state: "PI" },
  { slug: "estampa-arte-demo", name: "Estampa Arte (demo)", city: "Fortaleza", state: "CE" },
  { slug: "caneca-bacana-demo", name: "Caneca Bacana (demo)", city: "São Luís", state: "MA" },
];

async function main() {
  const db = ownerClient();
  const master = readMasterSeed(process.env);
  if (!master) console.log("- MASTER: SEED_MASTER_* ausentes, pulando");
  else console.log(`- MASTER: ${await db.$transaction((tx) => seedMaster(tx, master, scriptActor("seed")))}`);
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
