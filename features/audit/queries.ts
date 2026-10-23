import type { Prisma } from "@/generated/prisma/client";
import { type TenantContext, authorize } from "@/lib/audit";
import { verifyRows, type Broken } from "@/lib/audit-verify";
import { withScope, type Tx } from "@/lib/db";
import { FieldError, RuleError } from "@/features/platform/errors";
import { assertMaster, type PlatformActor } from "@/features/platform/service";
import { getFinancialSettings } from "@/features/transactions/service";
import { ACTION_GROUPS, type ActionGroup, describeEvent, groupWhere } from "./describe";

export type AuditFilters = {
  from?: string;
  to?: string;
  userId?: string | "master" | "system";
  group?: ActionGroup;
  result?: "SUCCESS" | "DENIED";
  entityType?: string;
  entityId?: string;
  /** Só na visão da plataforma: "platform" = cadeia sem empresa. */
  organizationId?: string | "platform";
};

export type AuditCursor = string;

export type AuditEventRow = {
  id: string;
  seq: string;
  occurredAt: Date;
  organizationId: string | null;
  userName: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  result: string;
  reason: string | null;
  ip: string | null;
  device: string | null;
  userAgent: string | null;
  requestId: string | null;
  before: unknown;
  after: unknown;
  hash: string;
  text: string;
  tone: "normal" | "alert";
};

export const PAGE_SIZE = 50;
export const EXPORT_MAX = 50_000;
export const HISTORY_MAX = 200;
const VERIFY_BATCH = 1_000;
const DEFAULT_TZ = "America/Fortaleza";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Meia-noite do dia `iso` no fuso `tz`, como instante UTC. */
function zonedMidnight(iso: string, tz: string): Date {
  const utc = Date.parse(`${iso}T00:00:00Z`);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utc));
  const get = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(utc - (asUtc - utc));
}

function day(field: "from" | "to", v: string, tz: string): Date {
  if (!ISO_DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new FieldError(field, "Data inválida.");
  return zonedMidnight(v, tz);
}

function buildWhere(f: AuditFilters, tz: string, cursor?: AuditCursor): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.from) and.push({ occurredAt: { gte: day("from", f.from, tz) } });
  if (f.to) {
    const end = day("to", f.to, tz);
    and.push({ occurredAt: { lt: new Date(end.getTime() + 24 * 60 * 60 * 1000) } });
  }
  if (f.userId === "master") and.push({ userRole: "MASTER" });
  else if (f.userId === "system") and.push({ userId: null });
  else if (f.userId) and.push({ userId: f.userId });
  if (f.group) {
    if (!(f.group in ACTION_GROUPS)) throw new FieldError("group", "Grupo inválido.");
    and.push(groupWhere(f.group));
  }
  if (f.result) and.push({ result: f.result });
  if (f.entityType) and.push({ entityType: f.entityType });
  if (f.entityId) and.push({ entityId: f.entityId });
  if (f.organizationId) and.push({ organizationId: f.organizationId === "platform" ? null : f.organizationId });
  if (cursor !== undefined) {
    if (!/^\d+$/.test(cursor)) throw new FieldError("cursor", "Página inválida.");
    and.push({ seq: { lt: BigInt(cursor) } });
  }
  return { AND: and };
}

type DbRow = Awaited<ReturnType<Tx["auditLog"]["findMany"]>>[number];

export function toAuditRow(r: DbRow): AuditEventRow {
  const { text, tone } = describeEvent(r);
  return {
    id: r.id,
    seq: String(r.seq),
    occurredAt: r.occurredAt,
    organizationId: r.organizationId,
    userName: r.userName,
    userRole: r.userRole,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    result: r.result,
    reason: r.reason,
    ip: r.ip,
    device: r.device,
    userAgent: r.userAgent,
    requestId: r.requestId,
    before: r.before,
    after: r.after,
    hash: r.hash,
    text,
    tone,
  };
}

async function page(
  scope: Parameters<typeof withScope>[0],
  f: AuditFilters,
  tz: string,
  cursor?: AuditCursor,
): Promise<{ rows: AuditEventRow[]; next: AuditCursor | null }> {
  const where = buildWhere(f, tz, cursor);
  const found = await withScope(scope, (tx) => tx.auditLog.findMany({ where, orderBy: { seq: "desc" }, take: PAGE_SIZE + 1 }));
  const rows = found.slice(0, PAGE_SIZE).map(toAuditRow);
  return { rows, next: found.length > PAGE_SIZE ? rows[rows.length - 1].seq : null };
}

/** Linha do tempo da empresa. Paginação por `seq` (monotônico dentro da cadeia). */
export async function listAuditEvents(ctx: TenantContext, f: AuditFilters, cursor?: AuditCursor) {
  await authorize(ctx, "audit.view");
  const { timezone } = await getFinancialSettings(ctx);
  return page({ organizationId: ctx.organizationId }, { ...f, organizationId: undefined }, timezone, cursor);
}

export async function listAuditEventsPlatform(actor: PlatformActor, f: AuditFilters, cursor?: AuditCursor) {
  await assertMaster(actor, "audit.view");
  return page({ platform: true }, f, DEFAULT_TZ, cursor);
}

async function exportAll(scope: Parameters<typeof withScope>[0], f: AuditFilters, tz: string, max: number) {
  const where = buildWhere(f, tz);
  return withScope(scope, async (tx) => {
    if ((await tx.auditLog.count({ where })) > max) {
      throw new RuleError(`Há mais de ${max.toLocaleString("pt-BR")} eventos neste filtro. Reduza o período.`);
    }
    return (await tx.auditLog.findMany({ where, orderBy: { seq: "desc" } })).map(toAuditRow);
  });
}

export async function exportAuditEvents(ctx: TenantContext, f: AuditFilters, max = EXPORT_MAX): Promise<AuditEventRow[]> {
  await authorize(ctx, "audit.view");
  const { timezone } = await getFinancialSettings(ctx);
  return exportAll({ organizationId: ctx.organizationId }, { ...f, organizationId: undefined }, timezone, max);
}

export async function exportAuditEventsPlatform(actor: PlatformActor, f: AuditFilters, max = EXPORT_MAX): Promise<AuditEventRow[]> {
  await assertMaster(actor, "audit.view");
  return exportAll({ platform: true }, f, DEFAULT_TZ, max);
}

export type HistoryRef = { type: "Transaction" | "Order" | "Customer"; id: string };

/**
 * Eventos de um registro, do mais antigo ao mais recente (até HISTORY_MAX, os mais recentes).
 * Pedido inclui recebimentos e lançamentos ligados (inclusive excluídos); cliente inclui criação e cancelamento dos pedidos.
 */
export async function recordHistory(ctx: TenantContext, ref: HistoryRef): Promise<AuditEventRow[]> {
  await authorize(ctx, "audit.view");
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const or: Prisma.AuditLogWhereInput[] = [{ entityType: ref.type, entityId: ref.id }];
    if (ref.type === "Order") {
      const [payments, txs] = await Promise.all([
        tx.orderPayment.findMany({ where: { orderId: ref.id }, select: { id: true } }),
        tx.transaction.findMany({ where: { orderId: ref.id }, select: { id: true } }),
      ]);
      or.push(
        { entityType: "OrderPayment", entityId: { in: payments.map((p) => p.id) } },
        { entityType: "Transaction", entityId: { in: txs.map((t) => t.id) } },
      );
    } else if (ref.type === "Customer") {
      const orders = await tx.order.findMany({ where: { customerId: ref.id }, select: { id: true } });
      or.push({
        entityType: "Order",
        entityId: { in: orders.map((o) => o.id) },
        action: { in: ["order.create", "order.cancel"] },
      });
    }
    const found = await tx.auditLog.findMany({ where: { OR: or }, orderBy: { seq: "desc" }, take: HISTORY_MAX });
    return found.reverse().map(toAuditRow);
  });
}

export type ChainCheck = { checked: number; brokenCount: number; broken: Broken[] };

const BROKEN_SHOWN = 20;

async function verifyScope(
  scope: Parameters<typeof withScope>[0],
  where: Prisma.AuditLogWhereInput,
  batch: number,
): Promise<ChainCheck> {
  return withScope(scope, async (tx) => {
    const state = new Map<string | null, string | null>();
    const broken: Broken[] = [];
    let checked = 0;
    let after: bigint | undefined;
    for (;;) {
      const rows = await tx.auditLog.findMany({
        where: { AND: [where, ...(after === undefined ? [] : [{ seq: { gt: after } }])] },
        orderBy: { seq: "asc" },
        take: batch,
      });
      if (!rows.length) break;
      const r = verifyRows(rows, state);
      checked += r.checked;
      broken.push(...r.broken);
      after = rows[rows.length - 1].seq;
      if (rows.length < batch) break;
    }
    return { checked, brokenCount: broken.length, broken: broken.slice(0, BROKEN_SHOWN) };
  });
}

/** Lê a cadeia INTEIRA da empresa (todos os lotes) e confere os hashes. Leitura: não audita. */
export async function verifyOrgChain(ctx: TenantContext, batch = VERIFY_BATCH): Promise<ChainCheck> {
  await authorize(ctx, "audit.view");
  return verifyScope({ organizationId: ctx.organizationId }, {}, batch);
}

/** `target`: "all" (todas as cadeias), "platform" (sem empresa) ou o id de uma empresa. */
export async function verifyPlatformChains(
  actor: PlatformActor,
  target: "all" | "platform" | string,
  batch = VERIFY_BATCH,
): Promise<ChainCheck> {
  await assertMaster(actor, "audit.view");
  const where = target === "all" ? {} : { organizationId: target === "platform" ? null : target };
  return verifyScope({ platform: true }, where, batch);
}
