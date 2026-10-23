import Link from "next/link";
import { connection } from "next/server";
import { HexMark } from "@/components/atoms/HexMark";
import { LegalDocumentView } from "@/components/organisms/LegalDocumentView";
import { db } from "@/lib/db";
import type { LegalDocumentType } from "@/generated/prisma/enums";
import { currentLegalDocuments } from "@/features/legal/service";

/** Página pública de um documento legal vigente (dinâmica: lê o banco a cada acesso). */
export async function PublicLegalPage({ type, title }: { type: LegalDocumentType; title: string }) {
  await connection();
  const doc = (await currentLegalDocuments(db)).find((d) => d.type === type);
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-prose content-start gap-6 px-4 py-8 md:py-12">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <HexMark tone="primary" className="h-[41px] w-9 text-sm font-black">
            BD
          </HexMark>
          <span className="font-heading text-xl font-black [font-stretch:125%]">
            Bee<span className="text-primary">Dock</span>
          </span>
        </span>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center text-sm font-bold underline-offset-4 hover:underline"
        >
          Voltar
        </Link>
      </div>
      {doc ? (
        <LegalDocumentView
          heading="h1"
          title={title}
          version={doc.version}
          publishedAt={doc.publishedAt}
          content={doc.content}
        />
      ) : (
        <section className="grid gap-2">
          <h1 className="text-lg font-black">{title}</h1>
          <p className="text-muted-foreground">Documento ainda não publicado.</p>
        </section>
      )}
    </main>
  );
}
