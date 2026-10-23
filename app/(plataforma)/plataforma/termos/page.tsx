import type { Metadata } from "next";
import { LegalPublisher } from "@/components/organisms/LegalPublisher";
import { publishLegalDocumentAction } from "@/features/legal/actions";
import { legalOverview } from "@/features/legal/service";
import { LEGAL_TEMPLATES } from "@/features/legal/templates";
import { platformActor } from "@/features/platform/actor";
import { requireMaster } from "@/lib/session";

export const metadata: Metadata = { title: "Termos e política" };

const DOCS = [
  { type: "TERMS", title: "Termos de Uso" },
  { type: "PRIVACY", title: "Política de Privacidade" },
] as const;

export default async function TermosPage() {
  await requireMaster();
  const overview = await legalOverview(await platformActor());
  return (
    <div className="grid gap-5">
      <h1 className="text-3xl leading-none font-black">Termos e política</h1>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {DOCS.map(({ type, title }) => (
          <LegalPublisher
            key={type}
            type={type}
            title={title}
            current={
              overview[type].current && {
                version: overview[type].current.version,
                publishedAt: overview[type].current.publishedAt,
              }
            }
            acceptedCount={overview[type].acceptedCount}
            activeUsers={overview.activeUsers}
            history={overview[type].history}
            initialContent={overview[type].current?.content ?? LEGAL_TEMPLATES[type]}
            publishAction={publishLegalDocumentAction}
          />
        ))}
      </div>
    </div>
  );
}
