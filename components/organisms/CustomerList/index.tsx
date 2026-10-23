"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { MoneyText } from "@/components/atoms/MoneyText";
import { EmptyState } from "@/components/molecules/EmptyState";
import { SearchBox } from "@/components/molecules/SearchBox";
import { CustomerAnonymize } from "@/components/organisms/CustomerAnonymize";
import { CustomerForm, type FormState } from "@/components/organisms/CustomerForm";
import { formatIsoDate } from "@/lib/format-date";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

export type CustomerListRow = {
  id: string;
  name: string;
  phone: string;
  ordersOpen: number;
  balanceCents: number;
  lastOrderOn: string | null;
  anonymized: boolean;
};

export type CustomerListProps = {
  rows: CustomerListRow[];
  page: number;
  pageCount: number;
  q: string;
  /** Aba "Para revisar" (retenção): só Admin; sem busca nem paginação. */
  review: boolean;
  canReview: boolean;
  saveAction: (id: string | null, prev: FormState, fd: FormData) => Promise<FormState>;
  anonymizeAction: (id: string, prev: FormState, fd: FormData) => Promise<FormState>;
};

const TAB =
  "font-heading inline-flex h-11 items-center rounded-full border-2 px-4 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [font-stretch:100%]";

function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(TAB, active ? "border-ink bg-ink text-primary" : "border-border hover:bg-muted")}
    >
      {children}
    </Link>
  );
}

function PageLink({ to, label, children }: { to: string | null; label: string; children: React.ReactNode }) {
  const cls = "border-border inline-flex size-11 items-center justify-center rounded-lg border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  return to ? (
    <Link href={to} aria-label={label} className={cn(cls, "hover:bg-muted")}>{children}</Link>
  ) : (
    <span aria-hidden className={cn(cls, "opacity-40")}>{children}</span>
  );
}

const Name = ({ r }: { r: CustomerListRow }) => (
  <span className="min-w-0">
    <span className={cn("font-heading block truncate font-extrabold", r.anonymized && "text-muted-foreground italic")}>{r.name}</span>
    {!r.anonymized && <span className="text-muted-foreground block text-sm tabular-nums">{formatPhone(r.phone)}</span>}
  </span>
);

const Balance = ({ cents }: { cents: number }) =>
  cents > 0 ? <MoneyText cents={cents} tone="neutral" className="text-receivable font-bold" /> : <span className="text-muted-foreground">—</span>;

export function CustomerList({ rows, page, pageCount, q, review, canReview, saveAction, anonymizeAction }: CustomerListProps) {
  const [form, setForm] = useState<"create" | null>(null);
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (n > 1) p.set("pagina", String(n));
    return `/clientes${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold md:text-3xl">Clientes</h1>
        <AppButton type="button" onClick={() => setForm("create")} className="max-md:w-full">
          <Plus aria-hidden className="size-4" />
          Cliente
        </AppButton>
      </div>

      {canReview && (
        <nav aria-label="Visão da lista" className="flex gap-2">
          <Tab href="/clientes" active={!review}>Todos</Tab>
          <Tab href="/clientes?aba=revisar" active={review}>Para revisar</Tab>
        </nav>
      )}

      {review ? (
        <p className="bg-warning-soft text-warning rounded-lg p-3 text-sm font-medium">
          Sem movimentação dentro do prazo de retenção da empresa. Nada é anonimizado sozinho: revise e decida.
        </p>
      ) : (
        <div className="md:max-w-md">
          <SearchBox id="customer-q" label="Buscar por nome ou WhatsApp" value={q} basePath="/clientes" />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={review ? "Nada para revisar" : q ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          description={review ? "Todos os clientes têm movimentação recente." : q ? "Confira o nome ou o número digitado." : "Cadastre o primeiro para usar nos pedidos."}
        />
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="bg-card grid gap-2 rounded-xl border p-4">
                <Link href={`/clientes/${r.id}`} className="focus-visible:ring-ring/50 grid gap-2 rounded outline-none focus-visible:ring-3">
                  <Name r={r} />
                  <span className="text-muted-foreground flex flex-wrap gap-x-4 text-sm">
                    <span>Em andamento: {r.ordersOpen}</span>
                    <span className="flex gap-1">Deve: <Balance cents={r.balanceCents} /></span>
                    <span>Último pedido: {r.lastOrderOn ? formatIsoDate(r.lastOrderOn) : "—"}</span>
                  </span>
                </Link>
                {review && <CustomerAnonymize customerId={r.id} customerName={r.name} action={anonymizeAction} triggerClassName="w-full" />}
              </li>
            ))}
          </ul>

          <div className="bg-card hidden overflow-hidden rounded-xl border md:block">
            <table className="w-full text-left">
              <caption className="sr-only">{review ? "Clientes para revisar" : "Clientes"}</caption>
              <thead className="bg-muted text-muted-foreground font-heading text-sm [font-stretch:100%]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">Cliente</th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">Em andamento</th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">Saldo devedor</th>
                  <th scope="col" className="px-4 py-3 font-bold">Último pedido</th>
                  {review && <th scope="col" className="px-4 py-3"><span className="sr-only">Ação</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/50 focus-within:bg-muted/50 relative">
                    <td className="max-w-0 px-4 py-3 align-middle">
                      <Link href={`/clientes/${r.id}`} className={cn("focus-visible:ring-ring/50 block rounded outline-none focus-visible:ring-3", !review && "after:absolute after:inset-0")}>
                        <Name r={r} />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right align-middle tabular-nums">{r.ordersOpen}</td>
                    <td className="px-4 py-3 text-right align-middle"><Balance cents={r.balanceCents} /></td>
                    <td className="px-4 py-3 align-middle text-sm tabular-nums">{r.lastOrderOn ? formatIsoDate(r.lastOrderOn) : "—"}</td>
                    {review && (
                      <td className="relative px-4 py-3 text-right align-middle">
                        <CustomerAnonymize customerId={r.id} customerName={r.name} action={anonymizeAction} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!review && pageCount > 1 && (
            <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm tabular-nums">Página {page} de {pageCount}</p>
              <div className="flex gap-2">
                <PageLink to={page > 1 ? pageHref(page - 1) : null} label="Página anterior"><ChevronLeft aria-hidden /></PageLink>
                <PageLink to={page < pageCount ? pageHref(page + 1) : null} label="Próxima página"><ChevronRight aria-hidden /></PageLink>
              </div>
            </nav>
          )}
        </>
      )}

      <CustomerForm target={form} onClose={() => setForm(null)} saveAction={saveAction} />
    </div>
  );
}
