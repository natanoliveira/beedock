import { computeHash, type HashedFields, type Json } from "@/lib/audit";
import { ownerClient } from "./cli";

async function main() {
  const db = ownerClient();
  const rows = await db.auditLog.findMany({ orderBy: { seq: "asc" } });
  const lastHash = new Map<string | null, string | null>();
  let broken = 0;

  for (const row of rows) {
    const chain = row.organizationId;
    const expectedPrev = lastHash.get(chain) ?? null;
    const fields: HashedFields = {
      occurredAt: row.occurredAt,
      organizationId: row.organizationId,
      userId: row.userId,
      userName: row.userName,
      userRole: row.userRole,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      before: (row.before ?? null) as Json,
      after: (row.after ?? null) as Json,
      ip: row.ip,
      userAgent: row.userAgent,
      device: row.device,
      result: row.result,
      requestId: row.requestId,
      reason: row.reason,
    };
    if (row.prevHash !== expectedPrev || computeHash(row.prevHash, fields) !== row.hash) {
      broken++;
      console.error(`✗ seq ${row.seq} (${chain ?? "plataforma"}) ${row.action}: cadeia quebrada`);
    }
    lastHash.set(chain, row.hash);
  }

  console.log(`${rows.length} eventos em ${lastHash.size} cadeias verificados; ${broken} com problema.`);
  await db.$disconnect();
  if (broken) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
