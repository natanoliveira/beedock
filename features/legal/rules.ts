import type { LegalDocumentType } from "@/generated/prisma/enums";

export type LegalDocRef = { id: string; type: LegalDocumentType; version: number };

/** Documentos vigentes que o usuário ainda não aceitou. */
export function pendingDocuments<T extends LegalDocRef>(current: T[], acceptedIds: ReadonlySet<string>): T[] {
  return current.filter((d) => !acceptedIds.has(d.id));
}
