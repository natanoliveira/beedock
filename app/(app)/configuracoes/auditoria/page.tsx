import type { Metadata } from "next";
import { AdminOnlyNotice } from "@/components/molecules/AdminOnlyNotice";
import { AuditFilters } from "@/components/organisms/AuditFilters";
import { AuditTimeline } from "@/components/organisms/AuditTimeline";
import { verifyChainAction } from "@/features/audit/actions";
import { ACTION_GROUPS } from "@/features/audit/describe";
import { auditPeople } from "@/features/audit/export";
import { filtersToQuery, parseAuditFilters } from "@/features/audit/filters";
import { listAuditEvents } from "@/features/audit/queries";
import { getFinancialSettings } from "@/features/transactions/service";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Auditoria" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireTenant();
  if (!can(ctx.role, "audit.view")) return <AdminOnlyNotice />;

  const raw = await searchParams;
  const { filters, cursor } = parseAuditFilters(raw);
  const [{ rows, next }, people, { timezone }] = await Promise.all([
    listAuditEvents(ctx, filters, cursor),
    auditPeople(ctx),
    getFinancialSettings(ctx),
  ]);
  const query = (extra?: Record<string, string>) => filtersToQuery(raw, extra);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-extrabold md:text-3xl">Auditoria</h1>
      <AuditFilters
        values={{ de: filters.from, ate: filters.to, pessoa: filters.userId, grupo: filters.group, resultado: filters.result }}
        people={people}
        groups={Object.entries(ACTION_GROUPS).map(([value, g]) => ({ value, label: g.label }))}
        hidden={{ entityType: filters.entityType, entityId: filters.entityId }}
        csvHref={`/configuracoes/auditoria/auditoria.csv?${query()}`}
      />
      <AuditTimeline
        rows={rows}
        nextHref={next ? `/configuracoes/auditoria?${query({ cursor: next })}` : null}
        timezone={timezone}
        verifyAction={verifyChainAction}
      />
    </div>
  );
}
