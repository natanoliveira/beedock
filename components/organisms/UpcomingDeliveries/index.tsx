import Link from "next/link";
import { MoneyText } from "@/components/atoms/MoneyText";
import { StatusBadge } from "@/components/atoms/StatusBadge";
import { EmptyState } from "@/components/molecules/EmptyState";
import type { OrderStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type DeliveryItem = {
  id: string;
  number: number;
  customerName: string;
  description: string;
  /** "hoje", "amanhã" ou dd/mm — calculado no servidor. */
  dueLabel: string;
  overdue: boolean;
  status: OrderStatus;
  balanceCents: number;
};

export function OverdueBadge() {
  return (
    <span className="bg-expense-soft text-expense font-heading rounded-full px-2 py-0.5 text-xs font-bold [font-stretch:100%]">
      Atrasado
    </span>
  );
}

export function UpcomingDeliveries({ items }: { items: DeliveryItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhum pedido por aqui" description="Quando chegar uma encomenda, ela aparece nesta doca." />;
  }
  return (
    <ul className="bg-card divide-y overflow-hidden rounded-xl border">
      {items.map((o) => (
        <li key={o.id}>
          <Link
            href={`/pedidos/${o.id}`}
            className="hover:bg-muted/50 focus-visible:bg-muted/50 grid gap-1 px-4 py-3 outline-none md:grid-cols-[3.5rem_minmax(0,1fr)_8rem_auto_7rem] md:items-center md:gap-4"
          >
            <span className="font-heading font-extrabold tabular-nums">#{o.number}</span>
            <span className="min-w-0">
              <span className="block truncate font-bold">{o.customerName}</span>
              <span className="text-muted-foreground block truncate text-sm">{o.description}</span>
            </span>
            <span className={cn("flex items-center gap-2 text-sm font-medium tabular-nums", o.overdue && "text-expense")}>
              {o.dueLabel}
              {o.overdue && <OverdueBadge />}
            </span>
            <StatusBadge status={o.status} className="w-fit" />
            <span className="md:text-right">
              {o.balanceCents > 0 ? (
                <span className="text-receivable text-sm">
                  deve <MoneyText cents={o.balanceCents} className="font-bold" />
                </span>
              ) : (
                <span className="text-income text-sm font-medium">Quitado</span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
