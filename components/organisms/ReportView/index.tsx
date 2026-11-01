import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { MoneyText } from "@/components/atoms/MoneyText";
import { BarList } from "@/components/molecules/BarList";
import { KpiCard } from "@/components/molecules/KpiCard";
import { cn } from "@/lib/utils";
import type { ReportViewProps } from "./ReportView.types";

const navBtn = "hover:bg-muted inline-flex size-10 items-center justify-center rounded-md";
const linkBtn = "hover:bg-muted inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold";

export function ReportView({ report: r, month, last6Labels, canExport }: ReportViewProps) {
  const peak = Math.max(1, ...r.last6.flatMap((m) => [m.incomeCents, m.expenseCents]));
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold md:text-3xl">Relatórios</h1>
        {canExport && (
          <div className="flex gap-2">
            <a className={linkBtn} href={`/relatorios/${month.selected}/relatorio.pdf`}>
              <Download className="size-4" aria-hidden /> PDF
            </a>
            <a className={linkBtn} href={`/relatorios/${month.selected}/lancamentos.csv`}>
              <Download className="size-4" aria-hidden /> CSV
            </a>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-card flex items-center rounded-lg border">
          <Link className={navBtn} href={`/relatorios?mes=${month.prev}`} aria-label="Mês anterior">
            <ChevronLeft aria-hidden />
          </Link>
          <div className="min-w-44 px-2 text-center" aria-live="polite">
            <p className="font-heading font-extrabold [font-stretch:100%]">{month.title}</p>
            {month.range && <p className="text-muted-foreground text-xs">{month.range}</p>}
          </div>
          {month.next ? (
            <Link className={navBtn} href={`/relatorios?mes=${month.next}`} aria-label="Próximo mês">
              <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span className={cn(navBtn, "opacity-40")} aria-hidden>
              <ChevronRight />
            </span>
          )}
        </div>
        {month.selected !== month.current && (
          <Link className="hover:bg-muted rounded-md px-3 py-2 text-sm font-bold" href="/relatorios">
            Mês atual
          </Link>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumo do mês">
        <KpiCard label="Entradas" cents={r.incomeCents} tone="income" />
        <KpiCard label="Saídas" cents={r.expenseCents} tone="expense" />
        <KpiCard label="Lucro" cents={r.profitCents} tone="profit" />
        <KpiCard label="A receber hoje" cents={r.toReceiveCents} tone="receivable" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-card grid content-start gap-4 rounded-lg border p-4" aria-labelledby="rep-in">
          <h2 id="rep-in" className="font-heading font-extrabold [font-stretch:100%]">Entradas por categoria</h2>
          <BarList items={r.incomeByCategory} tone="income" emptyLabel="Nenhuma entrada no período." />
        </section>
        <section className="bg-card grid content-start gap-4 rounded-lg border p-4" aria-labelledby="rep-out">
          <h2 id="rep-out" className="font-heading font-extrabold [font-stretch:100%]">Saídas por categoria</h2>
          <BarList items={r.expenseByCategory} tone="expense" emptyLabel="Nenhuma saída no período." />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-card grid content-start gap-3 rounded-lg border p-4" aria-labelledby="rep-6">
          <h2 id="rep-6" className="font-heading font-extrabold [font-stretch:100%]">Últimos 6 meses</h2>
          <ul className="grid gap-3">
            {r.last6.map((m, i) => (
              <li key={last6Labels[i]} className="grid gap-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold">{last6Labels[i]}</span>
                  <MoneyText cents={m.profitCents} tone={m.profitCents < 0 ? "expense" : "income"} />
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
                  <div className="bg-income h-full rounded-full" style={{ width: `${(m.incomeCents / peak) * 100}%` }} />
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
                  <div className="bg-expense h-full rounded-full" style={{ width: `${(m.expenseCents / peak) * 100}%` }} />
                </div>
                <p className="text-muted-foreground text-xs">
                  Entradas {fmt(m.incomeCents)} · Saídas {fmt(m.expenseCents)}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className="bg-card grid content-start gap-3 rounded-lg border p-4" aria-labelledby="rep-ord">
          <h2 id="rep-ord" className="font-heading font-extrabold [font-stretch:100%]">Pedidos do período</h2>
          <dl className="grid gap-2 text-sm">
            <Line label="Criados" value={`${r.orders.created.count} · ${fmt(r.orders.created.totalCents)}`} />
            <Line label="Entregues" value={`${r.orders.delivered.count} · ${fmt(r.orders.delivered.totalCents)}`} />
            <Line
              label="Cancelados"
              value={`${r.orders.canceled.count} · estornado ${fmt(r.orders.canceled.refundedCents)}`}
            />
          </dl>
          <p className="text-muted-foreground text-xs">“A receber hoje” é a posição de hoje, não do mês selecionado.</p>
        </section>
      </div>
    </div>
  );
}

const fmt = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
}
