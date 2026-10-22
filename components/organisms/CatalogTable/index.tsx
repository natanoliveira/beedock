"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ConfirmAction } from "@/components/molecules/ConfirmAction";
import { cn } from "@/lib/utils";
import { CatalogFormDialog, type DialogTarget } from "./CatalogFormDialog";
import type { CatalogItem, CatalogTableProps } from "./CatalogTable.types";

const TYPE_PILL = {
  INCOME: { label: "Entrada", className: "bg-income-soft text-income" },
  EXPENSE: { label: "Saída", className: "bg-expense-soft text-expense" },
} as const;

function usageText(n: number) {
  return n === 0 ? "Sem uso" : n === 1 ? "1 lançamento" : `${n} lançamentos`;
}

function ToggleActive({
  item,
  setActiveAction,
}: {
  item: CatalogItem;
  setActiveAction: CatalogTableProps["setActiveAction"];
}) {
  const [pending, start] = useTransition();
  if (item.active) {
    return (
      <ConfirmAction
        triggerLabel="Desativar"
        title={`Desativar '${item.name}'?`}
        description="Ela some dos novos lançamentos, mas continua nos antigos."
        confirmLabel="Desativar"
        successMessage="Desativada."
        withReason={false}
        danger
        onConfirm={() => setActiveAction(item.id, false)}
        renderTrigger={(open) => (
          <AppButton type="button" tone="outline" className="h-11 px-3" onClick={open}>
            Desativar
          </AppButton>
        )}
      />
    );
  }
  return (
    <AppButton
      type="button"
      tone="outline"
      className="h-11 px-3"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setActiveAction(item.id, true);
          if (r.ok) toast.success("Ativada.");
          else toast.error(r.error ?? "Não foi possível ativar.");
        })
      }
    >
      {pending ? "Aguarde…" : "Ativar"}
    </AppButton>
  );
}

export function CatalogTable({ kind, items, saveAction, setActiveAction }: CatalogTableProps) {
  const [target, setTarget] = useState<DialogTarget | null>(null);
  const noun = kind === "category" ? "categoria" : "forma de pagamento";

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <AppButton type="button" onClick={() => setTarget({ mode: "create" })} className="max-md:w-full">
          <Plus aria-hidden className="size-4" />
          {kind === "category" ? "Nova categoria" : "Nova forma"}
        </AppButton>
      </div>

      {items.length === 0 ? (
        <EmptyState title={`Nenhuma ${noun} ainda`} description="Crie a primeira para usar nos lançamentos." />
      ) : (
        <ul className="bg-card divide-y overflow-hidden rounded-lg border">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", !item.active && "bg-muted/40")}
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className={cn("truncate font-bold", !item.active && "text-muted-foreground")}>{item.name}</p>
                <p className="text-muted-foreground text-sm">{usageText(item.usage)}</p>
              </div>
              <div className="flex items-center gap-2">
                {item.type && (
                  <span
                    className={cn(
                      "font-heading rounded-full px-2.5 py-1 text-[13px] font-bold [font-stretch:100%]",
                      TYPE_PILL[item.type].className,
                    )}
                  >
                    {TYPE_PILL[item.type].label}
                  </span>
                )}
                <span
                  className={cn(
                    "font-heading rounded-full px-2.5 py-1 text-[13px] font-bold [font-stretch:100%]",
                    item.active ? "bg-income-soft text-income" : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.active ? "Ativa" : "Desativada"}
                </span>
              </div>
              <div className="flex gap-2">
                <AppButton
                  type="button"
                  tone="ghost"
                  className="h-11 px-3"
                  onClick={() => setTarget({ mode: "rename", id: item.id, name: item.name })}
                  aria-label={`Renomear ${item.name}`}
                >
                  Renomear
                </AppButton>
                <ToggleActive item={item} setActiveAction={setActiveAction} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <CatalogFormDialog
        target={target}
        onClose={() => setTarget(null)}
        noun={noun}
        withType={kind === "category"}
        saveAction={saveAction}
      />
    </div>
  );
}

export { CatalogTableSkeleton } from "./CatalogTableSkeleton";
export type { CatalogItem, CatalogFormState, CatalogTableProps } from "./CatalogTable.types";
