import { verifyRows } from "@/lib/audit-verify";
import { ownerClient } from "./cli";

async function main() {
  const db = ownerClient();
  const rows = await db.auditLog.findMany({ orderBy: { seq: "asc" } });
  const state = new Map<string | null, string | null>();
  const { broken } = verifyRows(rows, state);
  for (const b of broken) console.error(`✗ seq ${b.seq} (${b.chain ?? "plataforma"}) ${b.action}: cadeia quebrada`);

  console.log(`${rows.length} eventos em ${state.size} cadeias verificados; ${broken.length} com problema.`);
  await db.$disconnect();
  if (broken.length) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
