"use client";

import { ArrowLeft, MessageCircle, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { MoneyText } from "@/components/atoms/MoneyText";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { ConfirmAction } from "@/components/molecules/ConfirmAction";
import { EmptyState } from "@/components/molecules/EmptyState";
import { KpiCard } from "@/components/molecules/KpiCard";
import { CustomerAnonymize } from "@/components/organisms/CustomerAnonymize";
import { CustomerForm, type FormState } from "@/components/organisms/CustomerForm";
import type { OrderStatus } from "@/generated/prisma/enums";
import { formatIsoDate } from "@/lib/format-date";
import { formatPhone, whatsappUrl } from "@/lib/phone";

export type CustomerDetailData = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  address: string | null;
  note: string | null;
  anonymized: boolean;
  balanceCents: number;
  orders: {
    id: string;
    number: number;
    description: string;
    status: OrderStatus;
    dueDate: string;
    totalCents: number;
    balanceCents: number;
  }[];
};

export type CustomerDetailProps = {
  customer: CustomerDetailData;
  canDelete: boolean;
  canAnonymize: boolean;
  saveAction: (id: string | null, prev: FormState, fd: FormData) => Promise<FormState>;
  deleteAction: (id: string) => Promise<FormState>;
  anonymizeAction: (id: string, prev: FormState, fd: FormData) => Promise<FormState>;
};

function Info({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground font-heading text-xs font-bold tracking-wider uppercase [font-stretch:100%]">{label}</dt>
      <dd className="break-words whitespace-pre-line">{value}</dd>
    </div>
  );
}

export function CustomerDetail({ customer: c, canDelete, canAnonymize, saveAction, deleteAction, anonymizeAction }: CustomerDetailProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <Link href="/clientes" className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium outline-none focus-visible:underline">
          <ArrowLeft aria-hidden className="size-4" />
          Clientes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold break-words md:text-3xl">{c.name}</h1>
            {c.anonymized ? (
              <p className="text-muted-foreground text-sm">Dados pessoais removidos (LGPD). Os pedidos continuam no histórico.</p>
            ) : (
              <p className="text-muted-foreground tabular-nums">{formatPhone(c.phone)}</p>
            )}
          </div>
          {!c.anonymized && (
            <AppButton asChild tone="outline" className="max-md:w-full">
              <a href={whatsappUrl(c.phone)} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden className="size-4" />
                Chamar no WhatsApp<span className="sr-only"> (abre em nova aba)</span>
              </a>
            </AppButton>
          )}
        </div>
      </div>

      <section aria-label="Resumo" className="grid grid-cols-2 gap-2.5 md:max-w-lg md:gap-4">
        <KpiCard label="Saldo devedor" cents={c.balanceCents} tone="receivable" />
        <div className="bg-card rounded-lg border p-3 shadow-sm md:p-4">
          <p className="font-heading text-xs font-bold tracking-wider uppercase [font-stretch:100%]">Pedidos</p>
          <p className="mt-1 text-xl font-extrabold tabular-nums md:text-2xl">{c.orders.length}</p>
        </div>
      </section>

      {!c.anonymized && (c.email || c.document || c.address || c.note) && (
        <dl className="bg-card grid gap-4 rounded-xl border p-4 md:grid-cols-2">
          <Info label="E-mail" value={c.email} />
          <Info label="CPF ou CNPJ" value={c.document} />
          <Info label="Endereço" value={c.address} />
          <Info label="Observação" value={c.note} />
        </dl>
      )}

      <section aria-labelledby="customer-orders" className="grid gap-3">
        <h2 id="customer-orders" className="text-base font-extrabold">Pedidos do cliente</h2>
        {c.orders.length === 0 ? (
          <EmptyState title="Nenhum pedido ainda" description="Os pedidos deste cliente aparecem aqui." />
        ) : (
          <ul className="bg-card divide-y overflow-hidden rounded-xl border">
            {c.orders.map((o) => (
              <li key={o.id}>
                <Link href={`/pedidos/${o.id}`} className="hover:bg-muted/50 focus-visible:bg-muted/50 grid gap-1 px-4 py-3 outline-none md:grid-cols-[4rem_minmax(0,1fr)_auto_7rem_7rem] md:items-center md:gap-4">
                  <span className="font-heading font-extrabold tabular-nums">#{o.number}</span>
                  <span className="min-w-0 truncate">{o.description}</span>
                  <StatusBadge status={o.status} className="w-fit" />
                  <span className="text-muted-foreground text-sm tabular-nums md:text-right">Entrega {formatIsoDate(o.dueDate)}</span>
                  <span className="flex items-baseline gap-2 md:justify-end">
                    <MoneyText cents={o.totalCents} className="font-bold" />
                    {o.status !== "CANCELED" && o.balanceCents > 0 && (
                      <span className="text-receivable text-sm">deve <MoneyText cents={o.balanceCents} /></span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        {!c.anonymized && (
          <AppButton type="button" tone="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden className="size-4" />
            Editar
          </AppButton>
        )}
        {canDelete && (
          <ConfirmAction
            triggerLabel="Excluir"
            title={`Excluir ${c.name}?`}
            description="Só é possível sem pedidos. Fica registrado na auditoria."
            confirmLabel="Excluir"
            successMessage="Cliente excluído."
            danger
            withReason={false}
            onConfirm={async () => {
              const r = await deleteAction(c.id);
              if (r.ok) router.push("/clientes");
              return r;
            }}
          />
        )}
        {canAnonymize && !c.anonymized && (
          <CustomerAnonymize customerId={c.id} customerName={c.name} action={anonymizeAction} />
        )}
      </div>

      <CustomerForm target={editing ? c : null} onClose={() => setEditing(false)} saveAction={saveAction} />
    </div>
  );
}
