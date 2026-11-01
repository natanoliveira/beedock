import type { Metadata } from "next";
import { AdminOnlyNotice } from "@/components/molecules/AdminOnlyNotice";
import { ReportView } from "@/components/organisms/ReportView";
import { monthlyReport } from "@/features/reports/service";
import {
  currentFinancialMonth,
  formatYearMonth,
  monthLabel,
  parseYearMonth,
  shiftMonth,
} from "@/features/transactions/period";
import { getFinancialSettings } from "@/features/transactions/service";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Relatórios" };

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  const ctx = await requireTenant();
  if (!can(ctx.role, "report.view")) return <AdminOnlyNotice />;

  const { mes } = await searchParams;
  const { startDay, timezone } = await getFinancialSettings(ctx);
  const current = currentFinancialMonth(startDay, timezone);
  const ym = parseYearMonth(Array.isArray(mes) ? mes[0] : mes) ?? current;
  const report = await monthlyReport(ctx, ym);
  const label = monthLabel(ym, startDay);
  const isCurrentOrLater = formatYearMonth(ym) >= formatYearMonth(current);

  return (
    <ReportView
      report={report}
      month={{
        title: label.title,
        range: label.range,
        selected: formatYearMonth(ym),
        current: formatYearMonth(current),
        prev: formatYearMonth(shiftMonth(ym, -1)),
        next: isCurrentOrLater ? null : formatYearMonth(shiftMonth(ym, 1)),
      }}
      last6Labels={report.last6.map((m) => monthLabel(m.month, startDay).title.replace(" de ", "/"))}
      canExport={can(ctx.role, "report.export")}
    />
  );
}
