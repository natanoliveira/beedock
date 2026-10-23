import Link from "next/link";
import type { ListRow } from "./TransactionList.types";

/** Selo "Pedido #N": lançamento gerado por pedido; edição e exclusão só pelo pedido. */
export function OrderTag({ order }: { order: NonNullable<ListRow["order"]> }) {
  return (
    <Link
      href={`/pedidos/${order.id}`}
      className="bg-receivable-soft text-receivable font-heading focus-visible:ring-ring/50 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold outline-none hover:underline focus-visible:ring-3 [font-stretch:100%]"
    >
      Pedido #{order.number}
    </Link>
  );
}
