import type { Metadata } from "next";
import Link from "next/link";
import { AppButton } from "@/components/atoms/AppButton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { KpiCard } from "@/components/molecules/KpiCard";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/lib/session";

export const metadata: Metadata = { title: "Início" };

const monthLabel = () => {
  const text = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Fortaleza",
  }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// ponytail: valores zerados até a Fase 5 (Visão) ligar os totais reais
export default async function InicioPage() {
  const { role } = await requireTenant();

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-extrabold md:text-3xl">{monthLabel()}</h1>

      <section aria-label="Resumo do mês" className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        <KpiCard label="Entrou" cents={0} tone="income" />
        <KpiCard label="Saiu" cents={0} tone="expense" />
        {can(role, "profit.view") && <KpiCard label="Sobrou" cents={0} tone="profit" />}
        <KpiCard label="A receber" cents={0} tone="receivable" />
      </section>

      <section aria-label="Atalhos" className="grid grid-cols-3 gap-2 md:max-w-xl">
        <AppButton asChild tone="outline" className="text-income">
          <Link href="/lancamentos">+ Entrada</Link>
        </AppButton>
        <AppButton asChild tone="outline" className="text-expense">
          <Link href="/lancamentos">+ Saída</Link>
        </AppButton>
        <AppButton asChild>
          <Link href="/pedidos">+ Pedido</Link>
        </AppButton>
      </section>

      <section className="grid gap-3">
        <h2 className="text-base font-extrabold">Próximas entregas</h2>
        <EmptyState title="Nenhum pedido por aqui" description="Quando chegar uma encomenda, ela aparece nesta doca." />
      </section>
    </div>
  );
}
