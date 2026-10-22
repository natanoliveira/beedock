import type { Metadata } from "next";
import { EmptyState } from "@/components/molecules/EmptyState";
import { KpiCard } from "@/components/molecules/KpiCard";
import { QuickActions } from "@/components/organisms/QuickActions";
import { saveTransactionAction } from "@/features/transactions/actions";
import { monthLabel, todayIn } from "@/features/transactions/period";
import { formOptions, getFinancialSettings, monthSummary } from "@/features/transactions/service";
import { receiptUploadEnabled } from "@/features/transactions/storage";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Início" };

export default async function InicioPage() {
  const ctx = await requireTenant();
  const [summary, settings, options] = await Promise.all([
    monthSummary(ctx),
    getFinancialSettings(ctx),
    formOptions(ctx),
  ]);
  const label = monthLabel(summary.month, settings.startDay);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-extrabold md:text-3xl">{label.title}</h1>
        {label.range && <p className="text-muted-foreground">{label.range}</p>}
      </div>

      <section aria-label="Resumo do mês" className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        <KpiCard label="Entrou" cents={summary.incomeCents} tone="income" />
        <KpiCard label="Saiu" cents={summary.expenseCents} tone="expense" />
        {summary.profitCents !== undefined && <KpiCard label="Sobrou" cents={summary.profitCents} tone="profit" />}
      </section>

      <QuickActions
        form={{
          categories: options.categories,
          paymentMethods: options.paymentMethods,
          today: todayIn(settings.timezone),
          uploadEnabled: receiptUploadEnabled(),
          saveAction: saveTransactionAction,
        }}
      />

      <section className="grid gap-3">
        <h2 className="text-base font-extrabold">Próximas entregas</h2>
        <EmptyState title="Nenhum pedido por aqui" description="Quando chegar uma encomenda, ela aparece nesta doca." />
      </section>
    </div>
  );
}
