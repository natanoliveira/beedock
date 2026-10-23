"use client";

import { startNavigationProgress } from "@/components/atoms/NavigationProgress";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/atoms/AppDialog";
import { AppSelect } from "@/components/atoms/AppSelect";
import { MoneyText } from "@/components/atoms/MoneyText";
import { EmptyState } from "@/components/molecules/EmptyState";
import { KpiCard } from "@/components/molecules/KpiCard";
import { ReceiptActions } from "@/components/molecules/ReceiptActions";
import { TransactionForm, type FormTarget } from "@/components/organisms/TransactionForm";
import { cn } from "@/lib/utils";
import { OrderTag } from "./OrderTag";
import { RowActions } from "./RowActions";
import type { ListRow, TransactionListProps } from "./TransactionList.types";
import { TransactionListSkeleton } from "./TransactionListSkeleton";

const TYPE_FILTERS = [
  { value: undefined, label: "Todos" },
  { value: "entrada", label: "Entradas" },
  { value: "saida", label: "Saídas" },
] as const;

export function TransactionList({
  rows,
  page,
  pageCount,
  totals,
  month,
  filters,
  filterCategories,
  canDelete,
  form,
  deleteAction,
}: TransactionListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<FormTarget | null>(null);
  const [receiptRow, setReceiptRow] = useState<ListRow | null>(null);

  const hasProfit = totals.profitCents !== undefined;
  const filtered = Boolean(filters.tipo || filters.categoria);

  // Troca de mês/filtro/página escreve na URL; o skeleton aparece enquanto o servidor responde.
  const go = (patch: { mes?: string; tipo?: string | null; categoria?: string | null; pagina?: number }) => {
    const next = new URLSearchParams();
    const mes = patch.mes ?? month.selected;
    if (mes !== month.current) next.set("mes", mes);
    const tipo = patch.tipo === undefined ? filters.tipo : patch.tipo;
    if (tipo) next.set("tipo", tipo);
    const categoria = patch.categoria === undefined ? filters.categoria : patch.categoria;
    if (categoria) next.set("categoria", categoria);
    const pagina = patch.pagina ?? (patch.mes || patch.tipo !== undefined || patch.categoria !== undefined ? 1 : page);
    if (pagina > 1) next.set("pagina", String(pagina));
    const qs = next.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    startNavigationProgress(href);
    start(() => router.push(href));
  };

  const categoryOptions = filterCategories.filter(
    (c) => !filters.tipo || c.type === (filters.tipo === "entrada" ? "INCOME" : "EXPENSE"),
  );
  const dateLabel = (iso: string) =>
    `${iso.slice(8, 10)}/${iso.slice(5, 7)}${Number(iso.slice(0, 4)) === month.year ? "" : `/${iso.slice(0, 4)}`}`;
  const actions = (r: ListRow) => (
    <RowActions
      row={r}
      canDelete={canDelete}
      deleteAction={deleteAction}
      onReceipt={setReceiptRow}
      onEdit={(row) => setTarget({ mode: "edit", row })}
    />
  );
  const tone = (r: ListRow) => (r.type === "INCOME" ? "income" : "expense");
  const signed = (r: ListRow) => (r.type === "INCOME" ? r.amountCents : -r.amountCents);
  const catLabel = (r: ListRow) => (r.category.active ? r.category.name : `${r.category.name} (desativada)`);

  const create = (type: "INCOME" | "EXPENSE") => (
    <AppButton
      type="button"
      tone="outline"
      className={type === "INCOME" ? "text-income" : "text-expense"}
      onClick={() => setTarget({ mode: "create", type })}
    >
      <Plus aria-hidden className="size-4" />
      {type === "INCOME" ? "Entrada" : "Saída"}
    </AppButton>
  );

  return (
    <div className="grid gap-4 md:gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold md:text-3xl">Lançamentos</h1>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          {create("INCOME")}
          {create("EXPENSE")}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-card flex items-center rounded-lg border">
          <AppButton
            type="button"
            tone="ghost"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => go({ mes: month.prev })}
          >
            <ChevronLeft aria-hidden />
          </AppButton>
          <div className="min-w-44 px-2 text-center" aria-live="polite">
            <p className="font-heading font-extrabold [font-stretch:100%]">{month.title}</p>
            {month.range && <p className="text-muted-foreground text-xs">{month.range}</p>}
          </div>
          <AppButton
            type="button"
            tone="ghost"
            size="icon"
            aria-label="Próximo mês"
            disabled={!month.next}
            onClick={() => month.next && go({ mes: month.next })}
          >
            <ChevronRight aria-hidden />
          </AppButton>
        </div>
        {month.selected !== month.current && (
          <AppButton type="button" tone="ghost" onClick={() => go({ mes: month.current })}>
            Mês atual
          </AppButton>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
        <div role="group" aria-label="Tipo" className="bg-muted flex rounded-lg p-1">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={filters.tipo === t.value}
              onClick={() => go({ tipo: t.value ?? null, categoria: null })}
              className={cn(
                "font-heading focus-visible:ring-ring/50 h-10 rounded-md px-3.5 text-sm font-bold [font-stretch:100%] outline-none focus-visible:ring-3",
                filters.tipo === t.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <AppSelect
          aria-label="Categoria"
          className="h-10 w-auto max-w-full min-w-44 border"
          value={filters.categoria ?? ""}
          onChange={(e) => go({ categoria: e.target.value || null })}
        >
          <option value="">Todas as categorias</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active ? "" : " (desativada)"}
            </option>
          ))}
        </AppSelect>
        {filtered && (
          <AppButton type="button" tone="ghost" onClick={() => go({ tipo: null, categoria: null })}>
            Limpar filtros
          </AppButton>
        )}
      </div>

      {pending ? (
        <TransactionListSkeleton withProfit={hasProfit} />
      ) : (
        <>
          <section
            aria-label="Totais do filtro"
            className={cn("grid grid-cols-2 gap-2.5 md:gap-4", hasProfit && "md:grid-cols-3")}
          >
            <KpiCard label="Entrou" cents={totals.incomeCents} tone="income" />
            <KpiCard label="Saiu" cents={totals.expenseCents} tone="expense" />
            {hasProfit && (
              <div className="col-span-2 md:col-span-1">
                <KpiCard label="Sobrou" cents={totals.profitCents!} tone="profit" />
              </div>
            )}
          </section>

          {rows.length === 0 ? (
            <EmptyState
              title={filtered ? "Nenhum lançamento com esses filtros" : `Nada lançado em ${month.title}`}
              description={
                filtered
                  ? "Tente outro tipo ou categoria."
                  : "Registre o primeiro dinheiro que entrou ou saiu neste mês."
              }
              action={
                filtered ? (
                  <AppButton type="button" tone="outline" onClick={() => go({ tipo: null, categoria: null })}>
                    Limpar filtros
                  </AppButton>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    {create("INCOME")}
                    {create("EXPENSE")}
                  </div>
                )
              }
            />
          ) : (
            <>
              <div className="bg-card hidden overflow-hidden rounded-lg border md:block">
                <table className="w-full text-sm">
                  <caption className="sr-only">Lançamentos de {month.title}</caption>
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs tracking-wider uppercase">
                      <th scope="col" className="font-heading px-4 py-3 font-bold">
                        Data
                      </th>
                      <th scope="col" className="font-heading px-4 py-3 font-bold">
                        Descrição
                      </th>
                      <th scope="col" className="font-heading px-4 py-3 font-bold">
                        Categoria
                      </th>
                      <th scope="col" className="font-heading px-4 py-3 font-bold">
                        Pagamento
                      </th>
                      <th scope="col" className="font-heading px-4 py-3 text-right font-bold">
                        Valor
                      </th>
                      <th scope="col" className="px-4 py-3">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="text-muted-foreground w-20 px-4 py-2.5 tabular-nums">
                          <time dateTime={r.occurredOn}>{dateLabel(r.occurredOn)}</time>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{r.description}</span>
                          {r.order && <span className="ml-2"><OrderTag order={r.order} /></span>}
                          {r.payerName && <span className="text-muted-foreground block text-xs">de {r.payerName}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="bg-muted text-muted-foreground inline-block rounded-full px-2 py-0.5 text-xs font-bold">
                            {catLabel(r)}
                          </span>
                        </td>
                        <td className="text-muted-foreground px-4 py-2.5">{r.paymentMethod?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <MoneyText cents={signed(r)} tone={tone(r)} signed className="text-sm" />
                        </td>
                        <td className="px-2 py-1">{actions(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="grid gap-2.5 md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="bg-card grid gap-1.5 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium break-words">{r.description}</p>
                      <MoneyText cents={signed(r)} tone={tone(r)} signed className="shrink-0 text-base" />
                    </div>
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <time dateTime={r.occurredOn}>{dateLabel(r.occurredOn)}</time>
                      <span className="bg-muted rounded-full px-2 py-0.5 font-bold">{catLabel(r)}</span>
                      {r.paymentMethod && <span>{r.paymentMethod.name}</span>}
                    </p>
                    {r.order && <p><OrderTag order={r.order} /></p>}
                    {r.payerName && <p className="text-muted-foreground text-xs">de {r.payerName}</p>}
                    <div className="-mb-1 border-t pt-1">{actions(r)}</div>
                  </li>
                ))}
              </ul>

              {pageCount > 1 && (
                <nav aria-label="Paginação" className="flex items-center justify-between gap-2">
                  <AppButton type="button" tone="outline" disabled={page <= 1} onClick={() => go({ pagina: page - 1 })}>
                    <ChevronLeft aria-hidden className="size-4" />
                    Anterior
                  </AppButton>
                  <p className="text-muted-foreground text-sm">
                    Página {page} de {pageCount}
                  </p>
                  <AppButton
                    type="button"
                    tone="outline"
                    disabled={page >= pageCount}
                    onClick={() => go({ pagina: page + 1 })}
                  >
                    Próxima
                    <ChevronRight aria-hidden className="size-4" />
                  </AppButton>
                </nav>
              )}
            </>
          )}
        </>
      )}

      <TransactionForm {...form} target={target} onClose={() => setTarget(null)} />

      <AppDialog open={receiptRow !== null} onOpenChange={(o) => !o && setReceiptRow(null)}>
        <AppDialogContent className="sm:max-w-lg">
          <AppDialogHeader>
            <AppDialogTitle>Recibo de pagamento</AppDialogTitle>
            <AppDialogDescription>
              {receiptRow
                ? `${receiptRow.description}${receiptRow.payerName ? `, de ${receiptRow.payerName}` : ""}`
                : ""}
            </AppDialogDescription>
          </AppDialogHeader>
          {receiptRow && <ReceiptActions transactionId={receiptRow.id} />}
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}

export { TransactionListSkeleton } from "./TransactionListSkeleton";
export type { ListRow, TransactionListProps } from "./TransactionList.types";
