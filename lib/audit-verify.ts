import { computeHash, type HashedFields, type Json } from "@/lib/audit";

export type ChainRow = Omit<HashedFields, "before" | "after"> & {
  before: unknown;
  after: unknown; seq: bigint | number; prevHash: string | null; hash: string };

export type Broken = { seq: string; action: string; chain: string | null };

/**
 * Confere prevHash e hash de cada linha (em ordem de seq). `state` guarda o último hash por cadeia
 * (organizationId; null = plataforma) e permite verificar em lotes sucessivos.
 */
export function verifyRows(
  rows: ChainRow[],
  state: Map<string | null, string | null> = new Map(),
  key?: string,
): { checked: number; broken: Broken[] } {
  const broken: Broken[] = [];
  for (const row of rows) {
    const chain = row.organizationId;
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
    if (row.prevHash !== (state.get(chain) ?? null) || computeHash(row.prevHash, fields, key) !== row.hash) {
      broken.push({ seq: String(row.seq), action: row.action, chain });
    }
    state.set(chain, row.hash);
  }
  return { checked: rows.length, broken };
}
