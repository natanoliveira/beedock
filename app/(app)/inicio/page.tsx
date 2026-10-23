import type { Metadata } from "next";
import { KpiCard } from "@/components/molecules/KpiCard";
import Link from "next/link";
import { QuickActions } from "@/components/organisms/QuickActions";
import { UpcomingDeliveries } from "@/components/organisms/UpcomingDeliveries";
import { saveOrderAction } from "@/features/orders/actions";
import { amountToReceive, orderFormOptions, upcomingDeliveries } from "@/features/orders/queries";
import { toViewRow } from "@/features/orders/view";
import { saveTransactionAction } from "@/features/transactions/actions";
import { monthLabel, todayIn } from "@/features/transactions/period";
import { formOptions, monthSummary } from "@/features/transactions/service";
import { receiptUploadEnabled } from "@/features/transactions/storage";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Início" };

export default async function InicioPage() {
  const ctx = await requireTenant();
  const [summary, options, orderOptions, receivable, upcoming] = await Promise.all([
    monthSummary(ctx),
    formOptions(ctx),
    orderFormOptions(ctx),
    amountToReceive(ctx),
    upcomingDeliveries(ctx),
  ]);
  const { settings } = summary;
  const label = monthLabel(summary.month, settings.startDay);
  const today = todayIn(settings.timezone);

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
        <Link
          href="/pedidos?status=a-receber"
          aria-label="A receber hoje: ver pedidos com saldo"
          className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-3"
        >
          <KpiCard label="A receber (hoje)" cents={receivable} tone="receivable" />
        </Link>
      </section>

      <QuickActions
        form={{
          categories: options.categories,
          paymentMethods: options.paymentMethods,
          today,
          uploadEnabled: receiptUploadEnabled(),
          saveAction: saveTransactionAction,
        }}
        order={{ options: orderOptions, today, saveAction: saveOrderAction }}
      />

      <section className="grid gap-3">
        <h2 className="text-base font-extrabold">Próximas entregas</h2>
        <UpcomingDeliveries items={upcoming.map((o) => toViewRow(o, today))} />
      </section>
    </div>
  );
}
