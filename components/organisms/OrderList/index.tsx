"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { AppLabel } from "@/components/atoms/AppLabel";
import { AppSelect } from "@/components/atoms/AppSelect";
import { MoneyText } from "@/components/atoms/MoneyText";
import { startNavigationProgress } from "@/components/atoms/NavigationProgress";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { EmptyState } from "@/components/molecules/EmptyState";
import { SearchBox } from "@/components/molecules/SearchBox";
import { OrderForm, type FormState, type OrderFormOptions } from "@/components/organisms/OrderForm";
import { OverdueBadge, type DeliveryItem } from "@/components/organisms/UpcomingDeliveries";
import { cn } from "@/lib/utils";

export type OrderListRow = DeliveryItem & {
  productTypeName: string;
  totalCents: number;
  paidCents: number;
};

export type OrderListProps = {
  rows: OrderListRow[];
  page: number;
  pageCount: number;
  filters: { status: string; q: string; productTypeId: string };
  productTypes: { id: string; name: string }[];
  options: OrderFormOptions;
  today: string;
  saveAction: (id: string | null, prev: FormState, fd: FormData) => Promise<FormState>;
};

const STATUS_TABS = [
  { value: "em-andamento", label: "Em andamento" },
  { value: "a-receber", label: "A receber" },
  { value: "entregues", label: "Entregues" },
  { value: "cancelados", label: "Cancelados" },
  { value: "todos", label: "Todos" },
] as const;

function query(f: { status?: string; q?: string; tipo?: string; pagina?: number }) {
  const p = new URLSearchParams();
  if (f.status && f.status !== "em-andamento") p.set("status", f.status);
  if (f.q) p.set("q", f.q);
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.pagina && f.pagina > 1) p.set("pagina", String(f.pagina));
  return `/pedidos${p.size ? `?${p}` : ""}`;
}

function PageLink({ to, label, children }: { to: string | null; label: string; children: React.ReactNode }) {
  const cls = "border-border inline-flex size-11 items-center justify-center rounded-lg border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  return to ? (
    <Link href={to} aria-label={label} className={cn(cls, "hover:bg-muted")}>{children}</Link>
  ) : (
    <span aria-hidden className={cn(cls, "opacity-40")}>{children}</span>
  );
}

const Due = ({ o }: { o: OrderListRow }) => (
  <span className={cn("flex flex-wrap items-center gap-2 text-sm font-medium tabular-nums", o.overdue && "text-expense")}>
    {o.dueLabel}
    {o.overdue && <OverdueBadge />}
  </span>
);

const Owing = ({ o }: { o: OrderListRow }) =>
  o.status === "CANCELED" ? (
    <span className="text-muted-foreground">—</span>
  ) : o.balanceCents > 0 ? (
    <MoneyText cents={o.balanceCents} className="text-receivable font-bold" />
  ) : (
    <span className="text-income text-sm font-medium">Quitado</span>
  );

export function OrderList({ rows, page, pageCount, filters, productTypes, options, today, saveAction }: OrderListProps) {
  const router = useRouter();
  const [form, setForm] = useState<"create" | null>(null);
  const keep = { status: filters.status, tipo: filters.productTypeId };
  const here = (pagina: number) => query({ ...filters, tipo: filters.productTypeId, pagina });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold md:text-3xl">Pedidos</h1>
        <AppButton type="button" onClick={() => setForm("create")} className="max-md:w-full">
          <Plus aria-hidden className="size-4" />
          Pedido
        </AppButton>
      </div>

      <nav aria-label="Filtrar por situação" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.value}
            href={query({ status: t.value, q: filters.q, tipo: filters.productTypeId })}
            aria-current={filters.status === t.value ? "page" : undefined}
            className={cn(
              "font-heading inline-flex h-11 shrink-0 items-center rounded-full border-2 px-4 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [font-stretch:100%]",
              filters.status === t.value ? "border-ink bg-ink text-primary" : "border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem] md:max-w-3xl">
        <SearchBox id="order-q" label="Buscar por nº, cliente ou descrição" value={filters.q} basePath="/pedidos" keep={keep} />
        <div className="grid gap-1.5">
          <AppLabel htmlFor="order-type-filter">Tipo de produto</AppLabel>
          <AppSelect
            id="order-type-filter"
            value={filters.productTypeId}
            onChange={(e) => {
              const href = query({ status: filters.status, q: filters.q, tipo: e.target.value });
              startNavigationProgress(href);
              router.replace(href);
            }}
          >
            <option value="">Todos</option>
            {productTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </AppSelect>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={filters.q || filters.productTypeId ? "Nenhum pedido encontrado" : "Nenhum pedido aqui"}
          description={filters.q || filters.productTypeId ? "Ajuste a busca ou o filtro." : "Os pedidos desta situação aparecem nesta doca."}
        />
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {rows.map((o) => (
              <li key={o.id}>
                <Link href={`/pedidos/${o.id}`} className="bg-card focus-visible:ring-ring/50 grid gap-2 rounded-xl border p-4 outline-none focus-visible:ring-3 active:scale-[.99]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-heading font-extrabold tabular-nums">#{o.number} · {o.customerName}</span>
                    <StatusBadge status={o.status} />
                  </span>
                  <span className="text-muted-foreground text-sm">{o.description} · {o.productTypeName}</span>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <Due o={o} />
                    <span className="flex items-baseline gap-2 text-sm">
                      <MoneyText cents={o.totalCents} className="font-bold" />
                      <span className="text-muted-foreground">·</span>
                      <Owing o={o} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="bg-card hidden overflow-hidden rounded-xl border md:block">
            <table className="w-full text-left">
              <caption className="sr-only">Pedidos</caption>
              <thead className="bg-muted text-muted-foreground font-heading text-sm [font-stretch:100%]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">Nº</th>
                  <th scope="col" className="px-4 py-3 font-bold">Cliente e pedido</th>
                  <th scope="col" className="px-4 py-3 font-bold">Entrega</th>
                  <th scope="col" className="px-4 py-3 font-bold">Situação</th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">Total</th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">Recebido</th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/50 focus-within:bg-muted/50 relative">
                    <td className="px-4 py-3 align-middle font-heading font-extrabold tabular-nums">
                      <Link href={`/pedidos/${o.id}`} className="focus-visible:ring-ring/50 rounded outline-none after:absolute after:inset-0 focus-visible:ring-3">
                        #{o.number}
                      </Link>
                    </td>
                    <td className="max-w-0 px-4 py-3 align-middle">
                      <span className="block truncate font-bold">{o.customerName}</span>
                      <span className="text-muted-foreground block truncate text-sm">{o.description} · {o.productTypeName}</span>
                    </td>
                    <td className="px-4 py-3 align-middle"><Due o={o} /></td>
                    <td className="px-4 py-3 align-middle"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-right align-middle"><MoneyText cents={o.totalCents} /></td>
                    <td className="px-4 py-3 text-right align-middle"><MoneyText cents={o.paidCents} className="text-muted-foreground" /></td>
                    <td className="px-4 py-3 text-right align-middle"><Owing o={o} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm tabular-nums">Página {page} de {pageCount}</p>
              <div className="flex gap-2">
                <PageLink to={page > 1 ? here(page - 1) : null} label="Página anterior"><ChevronLeft aria-hidden /></PageLink>
                <PageLink to={page < pageCount ? here(page + 1) : null} label="Próxima página"><ChevronRight aria-hidden /></PageLink>
              </div>
            </nav>
          )}
        </>
      )}

      <OrderForm target={form} onClose={() => setForm(null)} saveAction={saveAction} options={options} today={today} />
    </div>
  );
}
