"use client";

import { ExternalLink, Paperclip, Pencil, Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import { AppButton } from "@/components/atoms/AppButton";
import { formatCents } from "@/components/atoms/MoneyText/format";
import { ConfirmAction } from "@/components/molecules/ConfirmAction";
import type { FormState } from "@/components/organisms/TransactionForm";
import type { ListRow } from "./TransactionList.types";

type Props = {
  row: ListRow;
  canDelete: boolean;
  onEdit: (row: ListRow) => void;
  onReceipt: (row: ListRow) => void;
  deleteAction: (id: string) => Promise<FormState>;
};

const iconBtn = "size-11 md:size-9";

export function RowActions({ row, canDelete, onEdit, onReceipt, deleteAction }: Props) {
  const income = row.type === "INCOME";
  const label = `${income ? "a entrada" : "a saída"} '${row.description}' de ${formatCents(row.amountCents)}`;
  return (
    <div className="flex items-center justify-end gap-0.5">
      {row.hasReceipt && (
        <AppButton asChild tone="ghost" size="icon" className={iconBtn}>
          {/* abre o arquivo privado (rota exige sessão); sem prefetch */}
          <Link
            href={`/lancamentos/${row.id}/comprovante`}
            prefetch={false}
            target="_blank"
            aria-label={`Ver comprovante: ${row.description}`}
            title="Ver comprovante"
          >
            <Paperclip aria-hidden className="size-4" />
          </Link>
        </AppButton>
      )}
      {income && (
        <AppButton
          type="button"
          tone="ghost"
          size="icon"
          className={iconBtn}
          aria-label={`Recibo: ${row.description}`}
          title="Recibo"
          onClick={() => onReceipt(row)}
        >
          <Receipt aria-hidden className="size-4" />
        </AppButton>
      )}
      {row.order && (
        <AppButton asChild tone="ghost" size="icon" className={iconBtn}>
          <Link
            href={`/pedidos/${row.order.id}`}
            aria-label={`Abrir o pedido #${row.order.number}`}
            title="Alterar pelo pedido"
          >
            <ExternalLink aria-hidden className="size-4" />
          </Link>
        </AppButton>
      )}
      {!row.order && (
        <AppButton
          type="button"
          tone="ghost"
          size="icon"
          className={iconBtn}
          aria-label={`Editar: ${row.description}`}
          title="Editar"
          onClick={() => onEdit(row)}
        >
          <Pencil aria-hidden className="size-4" />
        </AppButton>
      )}
      {canDelete && !row.order && (
        <ConfirmAction
          triggerLabel="Excluir"
          title={`Excluir ${label}?`}
          description="O lançamento sai da lista e dos totais. A exclusão fica registrada na auditoria."
          confirmLabel="Excluir"
          successMessage="Lançamento excluído."
          danger
          withReason={false}
          onConfirm={() => deleteAction(row.id)}
          renderTrigger={(open) => (
            <AppButton
              type="button"
              tone="ghost"
              size="icon"
              className={`${iconBtn} text-expense`}
              aria-label={`Excluir: ${row.description}`}
              title="Excluir"
              onClick={open}
            >
              <Trash2 aria-hidden className="size-4" />
            </AppButton>
          )}
        />
      )}
    </div>
  );
}
