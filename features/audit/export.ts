import { authorize, recordAudit, withAudit, type TenantContext } from "@/lib/audit";
import { assertMaster, type PlatformActor } from "@/features/platform/service";
import { toCsv } from "@/lib/csv";
import { withScope } from "@/lib/db";
import { getFinancialSettings } from "@/features/transactions/service";
import { exportAuditEvents, exportAuditEventsPlatform, type AuditEventRow, type AuditFilters } from "./queries";

export function auditCsv(rows: AuditEventRow[], timezone: string): string {
  const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: timezone });
  return toCsv(
    ["Data/hora", "Pessoa", "Papel", "Ação", "O que aconteceu", "Registro", "Resultado", "Motivo", "IP"],
    rows.map((r) => [
      when.format(r.occurredAt),
      r.userName ?? "Sistema",
      r.userRole,
      r.action,
      r.text,
      r.entityType ? `${r.entityType} ${r.entityId ?? ""}`.trim() : null,
      r.result,
      r.reason,
      r.ip,
    ]),
  );
}

/** Audita `audit.export` antes de devolver o corpo. */
export async function exportAuditCsv(ctx: TenantContext, f: AuditFilters): Promise<string> {
  await authorize(ctx, "audit.view");
  const { timezone } = await getFinancialSettings(ctx);
  const rows = await exportAuditEvents(ctx, f);
  const body = auditCsv(rows, timezone);
  return withAudit(ctx, { action: "audit.export", after: { filters: { ...f }, rows: rows.length } }, async () => body);
}

/** Pessoas da empresa que já aparecem como opção de filtro. */
export async function auditPeople(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  await authorize(ctx, "audit.view");
  const ms = await withScope({ organizationId: ctx.organizationId }, (tx) =>
    tx.membership.findMany({ include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }),
  );
  return ms.map((m) => m.user);
}

/** Cadeia da plataforma: audita `platform.audit_export` antes de devolver o corpo. */
export async function exportAuditCsvPlatform(actor: PlatformActor, f: AuditFilters): Promise<string> {
  await assertMaster(actor, "audit.view");
  const rows = await exportAuditEventsPlatform(actor, f);
  const body = auditCsv(rows, "America/Fortaleza");
  await recordAudit(actor, { action: "platform.audit_export", after: { filters: { ...f }, rows: rows.length } });
  return body;
}
