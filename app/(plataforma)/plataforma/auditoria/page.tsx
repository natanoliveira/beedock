import type { Metadata } from "next";
import { AuditFilters } from "@/components/organisms/AuditFilters";
import { AuditTimeline } from "@/components/organisms/AuditTimeline";
import { verifyPlatformChainsAction } from "@/features/audit/actions";
import { ACTION_GROUPS } from "@/features/audit/describe";
import { filtersToQuery, parseAuditFilters } from "@/features/audit/filters";
import { listAuditEventsPlatform } from "@/features/audit/queries";
import { platformActor } from "@/features/platform/actor";
import { listOrganizations } from "@/features/platform/service";
import { requireMaster } from "@/lib/session";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMaster();
  const raw = await searchParams;
  const { filters, cursor } = parseAuditFilters(raw);
  const actor = await platformActor();
  const [{ rows, next }, organizations] = await Promise.all([listAuditEventsPlatform(actor, filters, cursor), listOrganizations(actor)]);
  const names = new Map(organizations.map((o) => [o.id, o.name]));
  const query = (extra?: Record<string, string>) => filtersToQuery(raw, extra);

  return (
    <div className="grid gap-5">
      <h1 className="text-3xl leading-none font-black">Auditoria</h1>
      <AuditFilters
        values={{ de: filters.from, ate: filters.to, pessoa: filters.userId, grupo: filters.group, resultado: filters.result, empresa: filters.organizationId }}
        people={[]}
        groups={Object.entries(ACTION_GROUPS).map(([value, g]) => ({ value, label: g.label }))}
        companies={organizations.map((o) => ({ id: o.id, name: o.name }))}
        csvHref={`/plataforma/auditoria/auditoria.csv?${query()}`}
      />
      <AuditTimeline
        showCompany
        rows={rows.map((r) => ({ ...r, organizationName: r.organizationId ? (names.get(r.organizationId) ?? null) : null }))}
        nextHref={next ? `/plataforma/auditoria?${query({ cursor: next })}` : null}
        timezone="America/Fortaleza"
        verifyAction={verifyPlatformChainsAction.bind(null, filters.organizationId ?? "all")}
      />
    </div>
  );
}
