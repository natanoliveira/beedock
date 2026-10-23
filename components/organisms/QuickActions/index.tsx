"use client";

import { useState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { OrderForm, type OrderFormProps } from "@/components/organisms/OrderForm";
import { TransactionForm, type FormTarget, type TransactionFormProps } from "@/components/organisms/TransactionForm";

export function QuickActions({
  form,
  order,
}: {
  form: Omit<TransactionFormProps, "target" | "onClose">;
  order: Omit<OrderFormProps, "target" | "onClose">;
}) {
  const [target, setTarget] = useState<FormTarget | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  return (
    <>
      <section aria-label="Atalhos" className="grid grid-cols-3 gap-2 md:max-w-xl">
        <AppButton
          type="button"
          tone="outline"
          className="text-income"
          onClick={() => setTarget({ mode: "create", type: "INCOME" })}
        >
          + Entrada
        </AppButton>
        <AppButton
          type="button"
          tone="outline"
          className="text-expense"
          onClick={() => setTarget({ mode: "create", type: "EXPENSE" })}
        >
          + Saída
        </AppButton>
        <AppButton type="button" onClick={() => setOrderOpen(true)}>
          + Pedido
        </AppButton>
      </section>
      <TransactionForm target={target} onClose={() => setTarget(null)} {...form} />
      <OrderForm target={orderOpen ? "create" : null} onClose={() => setOrderOpen(false)} {...order} />
    </>
  );
}
