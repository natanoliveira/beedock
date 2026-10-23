"use client";

import { ArrowLeft, FileText, MessageCircle, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { MoneyText } from "@/components/atoms/MoneyText";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { ConfirmAction } from "@/components/molecules/ConfirmAction";
import { EmptyState } from "@/components/molecules/EmptyState";
import { KpiCard } from "@/components/molecules/KpiCard";
import { ReceiptActions } from "@/components/molecules/ReceiptActions";
import { CancelOrderDialog } from "@/components/organisms/CancelOrderDialog";
import { OrderForm, type FormState, type OrderFormOptions } from "@/components/organisms/OrderForm";
import { PaymentForm, type PaymentTarget } from "@/components/organisms/PaymentForm";
import { OverdueBadge } from "@/components/organisms/UpcomingDeliveries";
import type { OrderStatus } from "@/generated/prisma/enums";
import { formatIsoDate } from "@/lib/format-date";
import { formatPhone, whatsappUrl } from "@/lib/phone";
import { cn } from "@/lib/utils";

export type OrderDetailData = {
  id: string;
  number: number;
  status: OrderStatus;
  description: string;
  productTypeId: string;
  productTypeName: string;
  dueDate: string;
  dueLabel: string;
  overdue: boolean;
  deliveredOn: string | null;
  canceledAt: string | null;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  customer: { id: string; name: string; phone: string; anonymized: boolean };
  payments: { id: string; paidAt: string; amountCents: number; methodId: string; methodName: string; transactionId: string }[];
  refund: { amountCents: number; occurredOn: string } | null;
};

export type OrderDetailProps = {
  order: OrderDetailData;
  options: OrderFormOptions;
  today: string;
  canDelete: boolean;
  saveOrderAction: (id: string | null, prev: FormState, fd: FormData) => Promise<FormState>;
  changeStatusAction: (id: string, to: string) => Promise<FormState>;
  deleteOrderAction: (id: string) => Promise<FormState>;
  savePaymentAction: (orderId: string, paymentId: string | null, prev: FormState, fd: FormData) => Promise<FormState>;
  deletePaymentAction: (orderId: string, paymentId: string) => Promise<FormState>;
  cancelOrderAction: (id: string, prev: FormState, fd: FormData) => Promise<FormState>;
};

const NEXT_STEPS: Record<OrderStatus, { to: OrderStatus; label: string; primary?: boolean }[]> = {
  OPEN: [
    { to: "READY", label: "Marcar como pronto", primary: true },
    { to: "DELIVERED", label: "Marcar como entregue" },
  ],
  READY: [
    { to: "DELIVERED", label: "Marcar como entregue", primary: true },
    { to: "OPEN", label: "Voltar para aberto" },
  ],
  DELIVERED: [{ to: "READY", label: "Voltar para pronto" }],
  CANCELED: [],
};

const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100).replace(/ /g, " ");

export function OrderDetail({
  order: o,
  options,
  today,
  canDelete,
  saveOrderAction,
  changeStatusAction,
  deleteOrderAction,
  savePaymentAction,
  deletePaymentAction,
  cancelOrderAction,
}: OrderDetailProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [payment, setPayment] = useState<PaymentTarget | null>(null);
  const [pending, start] = useTransition();
  const canceled = o.status === "CANCELED";
  const canCancel = o.status === "OPEN" || o.status === "READY";

  const move = (to: OrderStatus) =>
    start(async () => {
      const r = await changeStatusAction(o.id, to);
      if (r.ok) toast.success("Situação atualizada.");
      else toast.error(r.error ?? Object.values(r.fieldErrors ?? {})[0] ?? "Não foi possível atualizar.");
    });

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <Link href="/pedidos" className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium outline-none focus-visible:underline">
          <ArrowLeft aria-hidden className="size-4" />
          Pedidos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-extrabold md:text-3xl">Pedido #{o.number}</h1>
              <StatusBadge status={o.status} />
              {o.overdue && <OverdueBadge />}
            </div>
            <p className="mt-1 break-words">{o.description}</p>
            <p className="text-muted-foreground text-sm">{o.productTypeName}</p>
          </div>
        </div>
        <dl className="bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-2 md:grid-cols-3">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground font-heading text-xs font-bold tracking-wider uppercase [font-stretch:100%]">Cliente</dt>
            <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {o.customer.anonymized ? (
                <span className="text-muted-foreground italic">{o.customer.name}</span>
              ) : (
                <>
                  <Link href={`/clientes/${o.customer.id}`} className="font-bold underline-offset-2 hover:underline">{o.customer.name}</Link>
                  <a
                    href={whatsappUrl(o.customer.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1 text-sm tabular-nums"
                  >
                    <MessageCircle aria-hidden className="size-4" />
                    {formatPhone(o.customer.phone)}
                    <span className="sr-only"> (WhatsApp, abre em nova aba)</span>
                  </a>
                </>
              )}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground font-heading text-xs font-bold tracking-wider uppercase [font-stretch:100%]">Entrega</dt>
            <dd className={cn("tabular-nums", o.overdue && "text-expense")}>
              {formatIsoDate(o.dueDate)} <span className="text-muted-foreground">({o.dueLabel})</span>
            </dd>
          </div>
          {o.deliveredOn && (
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground font-heading text-xs font-bold tracking-wider uppercase [font-stretch:100%]">Entregue em</dt>
              <dd className="tabular-nums">{formatIsoDate(o.deliveredOn)}</dd>
            </div>
          )}
          {o.canceledAt && (
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground font-heading text-xs font-bold tracking-wider uppercase [font-stretch:100%]">Cancelado em</dt>
              <dd className="tabular-nums">{formatIsoDate(o.canceledAt)}</dd>
            </div>
          )}
        </dl>
      </div>

      <section aria-label="Valores" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4">
        <div className="bg-card rounded-lg border p-3 shadow-sm md:p-4">
          <p className="font-heading text-xs font-bold tracking-wider uppercase [font-stretch:100%]">Total</p>
          <MoneyText cents={o.totalCents} className="mt-1 block text-xl md:text-2xl" />
        </div>
        <KpiCard label="Recebido" cents={o.paidCents} tone="income" />
        <div className="col-span-2 md:col-span-1">
          <KpiCard label={canceled ? "Saldo (cancelado)" : o.balanceCents === 0 ? "Quitado" : "Saldo"} cents={canceled ? 0 : o.balanceCents} tone="receivable" />
        </div>
      </section>

      {!canceled && (
        <div className="flex flex-wrap gap-2">
          {NEXT_STEPS[o.status].map((s) => (
            <AppButton key={s.to} type="button" tone={s.primary ? "primary" : "outline"} disabled={pending} onClick={() => move(s.to)}>
              {s.label}
            </AppButton>
          ))}
        </div>
      )}

      <section aria-labelledby="order-payments" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="order-payments" className="text-base font-extrabold">Recebimentos</h2>
          {!canceled && o.balanceCents > 0 && (
            <div className="flex flex-wrap gap-2">
              <AppButton type="button" tone="outline" onClick={() => setPayment({ mode: "create", amountCents: o.balanceCents })}>
                Receber saldo
              </AppButton>
              <AppButton type="button" onClick={() => setPayment({ mode: "create" })}>
                <Plus aria-hidden className="size-4" />
                Registrar recebimento
              </AppButton>
            </div>
          )}
        </div>

        {o.payments.length === 0 ? (
          <EmptyState title="Nenhum recebimento ainda" description="Sinal e pagamentos aparecem aqui e em Lançamentos." />
        ) : (
          <ul className="bg-card divide-y overflow-hidden rounded-xl border">
            {o.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="text-muted-foreground w-24 text-sm tabular-nums">{formatIsoDate(p.paidAt)}</span>
                <span className="min-w-0 flex-1 basis-24">{p.methodName}</span>
                <MoneyText cents={p.amountCents} tone="income" className="font-bold" />
                <div className="flex items-center gap-1">
                  <AppButton asChild tone="ghost" size="icon" className="size-11 md:size-9">
                    <Link href={`/lancamentos/${p.transactionId}/recibo.pdf`} prefetch={false} target="_blank" aria-label={`Recibo do recebimento de ${brl(p.amountCents)}`} title="Recibo">
                      <FileText aria-hidden className="size-4" />
                    </Link>
                  </AppButton>
                  {!canceled && (
                    <AppButton
                      type="button"
                      tone="ghost"
                      size="icon"
                      className="size-11 md:size-9"
                      aria-label={`Editar o recebimento de ${brl(p.amountCents)}`}
                      title="Editar"
                      onClick={() => setPayment({ mode: "edit", id: p.id, amountCents: p.amountCents, paymentMethodId: p.methodId, paidAt: p.paidAt })}
                    >
                      <Pencil aria-hidden className="size-4" />
                    </AppButton>
                  )}
                  {!canceled && canDelete && (
                    <ConfirmAction
                      triggerLabel="Excluir"
                      title={`Excluir o recebimento de ${brl(p.amountCents)}?`}
                      description="O lançamento ligado também é excluído. Fica registrado na auditoria."
                      confirmLabel="Excluir"
                      successMessage="Recebimento excluído."
                      danger
                      withReason={false}
                      onConfirm={() => deletePaymentAction(o.id, p.id)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {o.refund && (
          <p className="bg-expense-soft text-expense rounded-lg p-3 text-sm font-medium">
            Estorno de {brl(o.refund.amountCents)} em {formatIsoDate(o.refund.occurredOn)} (saída em Lançamentos).
          </p>
        )}
      </section>

      <section aria-labelledby="order-receipt" className="bg-muted/50 grid gap-2 rounded-xl border p-4">
        <h2 id="order-receipt" className="text-base font-extrabold">Recibo do pedido</h2>
        <p className="text-muted-foreground text-sm">Resumo com os recebimentos e o saldo, na versão de agora.</p>
        <ReceiptActions url={`/pedidos/${o.id}/recibo.pdf`} filename={`pedido-${o.number}.pdf`} />
      </section>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        {!canceled && (
          <AppButton type="button" tone="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden className="size-4" />
            Editar
          </AppButton>
        )}
        {canCancel && (
          <CancelOrderDialog
            orderNumber={o.number}
            paidCents={o.paidCents}
            paidLabel={brl(o.paidCents)}
            paymentMethods={options.paymentMethods}
            today={today}
            action={(prev, fd) => cancelOrderAction(o.id, prev, fd)}
          />
        )}
        {canDelete && (
          <ConfirmAction
            triggerLabel="Excluir pedido"
            title={`Excluir o pedido #${o.number}?`}
            description="Só vale para pedido lançado por engano, sem recebimentos nem estorno."
            confirmLabel="Excluir"
            successMessage="Pedido excluído."
            danger
            withReason={false}
            onConfirm={async () => {
              const r = await deleteOrderAction(o.id);
              if (r.ok) router.push("/pedidos");
              return r;
            }}
          />
        )}
      </div>

      <OrderForm
        target={editing ? { id: o.id, customerId: o.customer.id, productTypeId: o.productTypeId, description: o.description, totalCents: o.totalCents, dueDate: o.dueDate } : null}
        onClose={() => setEditing(false)}
        saveAction={saveOrderAction}
        options={options}
        today={today}
      />
      <PaymentForm
        target={payment}
        onClose={() => setPayment(null)}
        saveAction={(paymentId, prev, fd) => savePaymentAction(o.id, paymentId, prev, fd)}
        paymentMethods={
          payment?.mode === "edit"
            ? options.paymentMethods.filter((m) => m.active || m.id === payment.paymentMethodId)
            : options.paymentMethods.filter((m) => m.active)
        }
        today={today}
        balanceLabel={brl(o.balanceCents)}
      />
    </div>
  );
}
