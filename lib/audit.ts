import { createHmac } from "node:crypto";
import type { AuditResult, MemberRole } from "@/generated/prisma/enums";
import { withScope, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { maskPii } from "@/lib/logger";
import { can, ForbiddenError, type Action } from "@/lib/permissions";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export type RequestMeta = { ip: string | null; userAgent: string | null; requestId: string | null };

export type Actor = {
  userId: string | null;
  userName: string | null;
  role: string | null;
  organizationId: string | null;
  meta: RequestMeta;
};

export type TenantContext = Actor & { userId: string; userName: string; organizationId: string; role: MemberRole };

export type AuditEvent = {
  action: string;
  entityType?: string;
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  result?: AuditResult;
  reason?: string;
};

const SECRET_KEYS = /password|senha|token|hash|secret/i;
const PII_KEYS = /phone|whatsapp|email|document|cpf|cnpj|address|zipCode|street/i;

function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  // jsonb/text recusam NUL e surrogates soltos: limpar para a auditoria nunca derrubar a operação
  if (typeof value === "string") return value.replaceAll("\u0000", "").toWellFormed();
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function clean(key: string, value: unknown): Json | undefined {
  if (SECRET_KEYS.test(key)) return undefined;
  if (Array.isArray(value)) return value.map((v) => clean(key, v) ?? null);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return sanitize(value as Record<string, unknown>);
  }
  const json = toJson(value);
  return PII_KEYS.test(key) && typeof json === "string" ? maskPii(json) : json;
}

/** Remove segredos e mascara dados pessoais antes de gravar em before/after. */
export function sanitize(obj: Record<string, unknown>): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(obj)) {
    const json = clean(key, value);
    if (json !== undefined) out[key] = json;
  }
  return out;
}

/** Só os campos alterados, já sanitizados. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => JSON.stringify(toJson(before[k])) !== JSON.stringify(toJson(after[k])),
  );
  const pick = (o: Record<string, unknown>) => Object.fromEntries(changed.map((k) => [k, o[k]]));
  return { before: pick(before), after: pick(after) };
}

// jsonb reordena chaves: o hash usa JSON com chaves ordenadas para ser verificável depois.
export function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export type HashedFields = {
  occurredAt: Date;
  organizationId: string | null;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: Json;
  after: Json;
  ip: string | null;
  userAgent: string | null;
  device: string | null;
  result: AuditResult;
  requestId: string | null;
  reason: string | null;
};

/** HMAC-SHA256 com chave fora do banco: quem só tem acesso ao Postgres não consegue recalcular a cadeia. */
export function computeHash(prevHash: string | null, row: HashedFields, key: string = env.AUDIT_HMAC_KEY): string {
  const payload = canonical({ ...row, occurredAt: row.occurredAt.toISOString(), prevHash });
  return createHmac("sha256", key).update(payload).digest("hex");
}

type AuditTx = Pick<Tx, "$executeRaw" | "auditLog">;

export async function appendAudit(tx: AuditTx, actor: Actor, event: AuditEvent) {
  const lockKey = actor.organizationId ?? "platform";
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const prev = await tx.auditLog.findFirst({
    where: { organizationId: actor.organizationId },
    orderBy: { seq: "desc" },
    select: { hash: true },
  });

  const ua = actor.meta.userAgent;
  const row: HashedFields = {
    occurredAt: new Date(),
    organizationId: actor.organizationId,
    userId: actor.userId,
    userName: actor.userName,
    userRole: actor.role,
    action: event.action,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    before: event.before ? sanitize(event.before) : null,
    after: event.after ? sanitize(event.after) : null,
    ip: actor.meta.ip,
    userAgent: ua,
    device: ua ? (/Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop") : null,
    result: event.result ?? "SUCCESS",
    requestId: actor.meta.requestId,
    reason: event.reason ?? null,
  };
  const prevHash = prev?.hash ?? null;

  await tx.auditLog.create({
    data: {
      ...row,
      before: row.before ?? undefined,
      after: row.after ?? undefined,
      prevHash,
      hash: computeHash(prevHash, row),
    },
  });
}

/**
 * Executa a escrita e grava o evento na MESMA transação. Se a auditoria
 * falhar, nada é gravado.
 */
export function withAudit<T>(
  ctx: TenantContext,
  event: AuditEvent | ((result: T) => AuditEvent),
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const result = await fn(tx);
    await appendAudit(tx, ctx, typeof event === "function" ? event(result) : event);
    return result;
  });
}

/** Escopo da cadeia do ator: a da empresa ou a da plataforma. */
export const actorScope = (actor: Actor) =>
  actor.organizationId ? { organizationId: actor.organizationId } : ({ platform: true } as const);

/** Evento isolado (login, negação de acesso, ações da plataforma). */
export function recordAudit(actor: Actor, event: AuditEvent): Promise<void> {
  return withScope(actorScope(actor), (tx) => appendAudit(tx, actor, event));
}

/** Checa a matriz de permissões no service; negação é auditada. */
export async function authorize(ctx: TenantContext, action: Action): Promise<void> {
  if (can(ctx.role, action)) return;
  await recordAudit(ctx, { action, result: "DENIED" });
  throw new ForbiddenError();
}
