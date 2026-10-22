export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, unknown>;
};

export type TransactionKind = "INCOME" | "EXPENSE";

export type FormCategory = { id: string; name: string; type: TransactionKind; active: boolean };
export type FormPaymentMethod = { id: string; name: string; active: boolean };

export type FormTransaction = {
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
};

export type FormTarget = { mode: "create"; type: TransactionKind } | { mode: "edit"; row: FormTransaction };

export type TransactionFormProps = {
  target: FormTarget | null;
  onClose: () => void;
  categories: FormCategory[];
  paymentMethods: FormPaymentMethod[];
  /** Data de hoje no fuso da empresa (YYYY-MM-DD): padrão e limite do campo. */
  today: string;
  uploadEnabled: boolean;
  /** saveTransactionAction: o id (ou null) é vinculado aqui. */
  saveAction: (id: string | null, prev: FormState, fd: FormData) => Promise<FormState>;
};
