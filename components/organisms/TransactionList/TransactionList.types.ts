import type {
  FormCategory,
  FormState,
  TransactionFormProps,
  TransactionKind,
} from "@/components/organisms/TransactionForm";

export type ListRow = {
  id: string;
  type: TransactionKind;
  amountCents: number;
  occurredOn: string;
  description: string;
  category: { id: string; name: string; active: boolean };
  paymentMethod: { id: string; name: string; active: boolean } | null;
  payerName: string | null;
  payerDocumentMasked: string | null;
  hasReceipt: boolean;
  order: { id: string; number: number } | null;
};

export type TransactionListProps = {
  rows: ListRow[];
  page: number;
  pageCount: number;
  totals: { incomeCents: number; expenseCents: number; profitCents?: number };
  month: {
    year: number;
    title: string;
    range: string | null;
    /** YYYY-MM do mês exibido, do mês atual, do anterior e do seguinte (null = já é o atual). */
    selected: string;
    current: string;
    prev: string;
    next: string | null;
  };
  filters: { tipo?: "entrada" | "saida"; categoria?: string };
  filterCategories: FormCategory[];
  canDelete: boolean;
  form: Omit<TransactionFormProps, "target" | "onClose">;
  deleteAction: (id: string) => Promise<FormState>;
};
