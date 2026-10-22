"use client";

import Link from "next/link";
import { useState } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { TransactionForm, type FormTarget, type TransactionFormProps } from "@/components/organisms/TransactionForm";

export function QuickActions({ form }: { form: Omit<TransactionFormProps, "target" | "onClose"> }) {
  const [target, setTarget] = useState<FormTarget | null>(null);
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
        <AppButton asChild>
          <Link href="/pedidos">+ Pedido</Link>
        </AppButton>
      </section>
      <TransactionForm target={target} onClose={() => setTarget(null)} {...form} />
    </>
  );
}
