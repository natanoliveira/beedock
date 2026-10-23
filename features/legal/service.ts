import type { LegalDocumentType } from "@/generated/prisma/enums";
import { type Actor, appendPlatformAudit } from "@/lib/audit";
import { db, withScope, type Tx } from "@/lib/db";
import { FieldError } from "@/features/platform/errors";
import { assertMaster, isUnique, type PlatformActor } from "@/features/platform/service";
import { type LegalDocRef, pendingDocuments } from "./rules";
import type { PublishLegalInput } from "./schemas";

type Client = Tx | typeof db;
export type LegalDoc = LegalDocRef & { content: string; publishedAt: Date };

const TYPES: LegalDocumentType[] = ["TERMS", "PRIVACY"];

/** Maior versão de cada tipo (0 a 2 itens). */
export async function currentLegalDocuments(client: Client): Promise<LegalDoc[]> {
  return client.legalDocument.findMany({
    distinct: ["type"],
    orderBy: [{ type: "asc" }, { version: "desc" }],
  });
}

export async function pendingLegalDocumentsFor(
  client: Client,
  userId: string,
): Promise<(LegalDoc & { updated: boolean })[]> {
  const [current, accepted] = await Promise.all([
    currentLegalDocuments(client),
    client.legalAcceptance.findMany({
      where: { userId },
      select: { documentId: true, document: { select: { type: true } } },
    }),
  ]);
  const acceptedTypes = new Set(accepted.map((a) => a.document.type));
  return pendingDocuments(current, new Set(accepted.map((a) => a.documentId))).map((d) => ({
    ...d,
    updated: acceptedTypes.has(d.type),
  }));
}

/** Hot path de toda requisição logada: uma consulta, só ids (mesmo predicado de pendingLegalDocumentsFor). */
export async function hasPendingLegalDocuments(userId: string, client: Client = db): Promise<boolean> {
  const [{ pending }] = await client.$queryRaw<{ pending: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM (SELECT DISTINCT ON ("type") "id" FROM "LegalDocument" ORDER BY "type", "version" DESC) cur
      WHERE NOT EXISTS (
        SELECT 1 FROM "LegalAcceptance" a WHERE a."documentId" = cur."id" AND a."userId" = ${userId}
      )
    ) AS pending`;
  return pending;
}

export async function acceptLegalDocumentsTx(
  tx: Tx,
  actor: Actor & { userId: string },
  documentIds: string[],
): Promise<void> {
  const current = await currentLegalDocuments(tx);
  const chosen = documentIds.map((id) => current.find((d) => d.id === id));
  if (chosen.some((d) => !d)) throw new FieldError("documents", "Os termos foram atualizados. Leia a nova versão.");
  const docs = chosen as LegalDoc[];
  const { count } = await tx.legalAcceptance.createMany({
    data: docs.map((d) => ({
      userId: actor.userId,
      documentId: d.id,
      ip: actor.meta.ip,
      userAgent: actor.meta.userAgent,
    })),
    skipDuplicates: true,
  });
  if (count > 0) {
    await appendPlatformAudit(tx, actor, {
      action: "auth.terms_accept",
      entityType: "User",
      entityId: actor.userId,
      after: { documents: docs.map((d) => ({ type: d.type, version: d.version })) },
    });
  }
}

export function acceptLegalDocuments(actor: Actor & { userId: string }, documentIds: string[]): Promise<void> {
  return withScope({ platform: true }, (tx) => acceptLegalDocumentsTx(tx, actor, [...new Set(documentIds)]));
}

export async function publishLegalDocumentTx(
  tx: Tx,
  actor: PlatformActor,
  input: PublishLegalInput,
): Promise<{ id: string; version: number }> {
  await assertMaster(actor, "platform.legal_publish");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"legal:" + input.type}))`;
  const last = await tx.legalDocument.aggregate({ where: { type: input.type }, _max: { version: true } });
  const version = (last._max.version ?? 0) + 1;
  const doc = await tx.legalDocument.create({ data: { type: input.type, version, content: input.content } });
  await appendPlatformAudit(tx, actor, {
    action: "platform.legal_publish",
    entityType: "LegalDocument",
    entityId: doc.id,
    after: { type: input.type, version, length: input.content.length },
  });
  return { id: doc.id, version };
}

export async function publishLegalDocument(actor: PlatformActor, input: PublishLegalInput) {
  try {
    return await withScope({ platform: true }, (tx) => publishLegalDocumentTx(tx, actor, input));
  } catch (e) {
    if (isUnique(e)) throw new FieldError("content", "Outra publicação aconteceu agora. Recarregue.");
    throw e;
  }
}

export type LegalOverview = Record<
  LegalDocumentType,
  { current: LegalDoc | null; acceptedCount: number; history: { version: number; publishedAt: Date }[] }
> & { activeUsers: number };

export async function legalOverview(actor: PlatformActor): Promise<LegalOverview> {
  await assertMaster(actor, "platform.legal_view");
  return withScope({ platform: true }, async (tx) => {
    const active = {
      anonymizedAt: null,
      platformRole: "USER",
      memberships: { some: { active: true, organization: { status: "ACTIVE" } } },
    } as const;
    const [docs, activeUsers] = await Promise.all([
      tx.legalDocument.findMany({ orderBy: { version: "desc" } }),
      tx.user.count({ where: active }),
    ]);
    const out = { activeUsers } as LegalOverview;
    for (const type of TYPES) {
      const ofType = docs.filter((d) => d.type === type);
      const cur = ofType[0] ?? null;
      out[type] = {
        current: cur,
        // só quem está no denominador, para a razão não passar de 100%
        acceptedCount: cur ? await tx.legalAcceptance.count({ where: { documentId: cur.id, user: active } }) : 0,
        history: ofType.map((d) => ({ version: d.version, publishedAt: d.publishedAt })),
      };
    }
    return out;
  });
}
