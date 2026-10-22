import { seedOrganizationDefaults } from "@/features/organizations/defaults";
import { readMasterSeed, seedMaster } from "@/features/platform/seed-master";
import type { PrismaClient } from "@/generated/prisma/client";
import { ownerClient, scriptActor } from "../scripts/cli";

// Empresas fictícias, sem usuários; cria/promove o MASTER se SEED_MASTER_* estiver definido. Admins via pnpm create-org.
const ORGS = [
  { slug: "prime-studio-demo", name: "Prime Studio - Uniformes (demo)", city: "Teresina", state: "PI" },
  { slug: "estampa-arte-demo", name: "Estampa Arte (demo)", city: "Fortaleza", state: "CE" },
  { slug: "caneca-bacana-demo", name: "Caneca Bacana (demo)", city: "São Luís", state: "MA" },
];

/**
 * `pnpm db:seed -- --prune`: apaga as empresas fora de ORGS (sobras de teste/QA) e os usuários que ficam sem
 * nenhum vínculo (menos MASTERs). Nunca em produção. A auditoria é imutável e fica.
 */
async function prune(db: PrismaClient) {
  if (process.env.NODE_ENV === "production") throw new Error("--prune recusado em produção.");
  const host = new URL(process.env.DIRECT_URL ?? "").hostname;
  if (process.env.PRUNE_CONFIRM !== host) {
    console.error(`Para confirmar, rode: PRUNE_CONFIRM=${host} pnpm db:seed -- --prune`);
    process.exit(1);
  }
  const extra = await db.organization.findMany({ where: { slug: { notIn: ORGS.map((o) => o.slug) } }, select: { id: true, name: true } });
  const ids = extra.map((o) => o.id);
  const org = { organizationId: { in: ids } };
  const users = await db.user.findMany({
    where: { platformRole: "USER", NOT: { memberships: { some: { organizationId: { notIn: ids } } } } },
    select: { id: true },
  });
  const uids = users.map((u) => u.id);
  await db.$transaction([
    db.orderPayment.deleteMany({ where: org }),
    db.transaction.deleteMany({ where: org }),
    db.order.deleteMany({ where: org }),
    db.customer.deleteMany({ where: org }),
    db.productType.deleteMany({ where: org }),
    db.category.deleteMany({ where: org }),
    db.paymentMethod.deleteMany({ where: org }),
    db.invitation.deleteMany({ where: org }),
    db.supportAccessGrant.deleteMany({ where: { OR: [org, { userId: { in: uids } }] } }),
    db.session.deleteMany({ where: { OR: [org, { userId: { in: uids } }] } }),
    db.membership.deleteMany({ where: { OR: [org, { userId: { in: uids } }] } }),
    db.legalAcceptance.deleteMany({ where: { userId: { in: uids } } }),
    db.organizationSettings.deleteMany({ where: org }),
    db.organization.deleteMany({ where: { id: { in: ids } } }),
    db.user.deleteMany({ where: { id: { in: uids } } }),
  ]);
  console.log(`- prune: ${extra.length} empresa(s) e ${uids.length} usuário(s) removidos`);
  for (const o of extra) console.log(`  - ${o.name}`);
}

async function main() {
  const db = ownerClient();
  const master = readMasterSeed(process.env);
  if (!master) console.log("- MASTER: SEED_MASTER_* ausentes, pulando");
  else console.log(`- MASTER: ${await db.$transaction((tx) => seedMaster(tx, master, scriptActor("seed")))}`);
  for (const org of ORGS) {
    const existing = await db.organization.findUnique({ where: { slug: org.slug }, select: { id: true } });
    if (existing) {
      // empresa sem configurações quebra as telas financeiras; recria com os padrões
      if (!(await db.organizationSettings.findUnique({ where: { organizationId: existing.id } }))) {
        await db.organizationSettings.create({ data: { organizationId: existing.id } });
        console.log(`~ ${org.name}: configurações recriadas`);
      }
      continue;
    }
    await db.$transaction(async (tx) => {
      const created = await tx.organization.create({ data: org });
      await tx.$executeRaw`SELECT set_config('app.current_org', ${created.id}, true)`;
      await seedOrganizationDefaults(tx, created.id);
    });
    console.log(`+ ${org.name}`);
  }
  if (process.argv.includes("--prune")) await prune(db);
  await db.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
