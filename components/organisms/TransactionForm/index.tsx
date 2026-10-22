"use client";

import { FileText, Loader2, Paperclip, Receipt, X } from "lucide-react";
import { Fragment, useActionState, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/atoms/AppDialog";
import { AppLabel } from "@/components/atoms/AppLabel";
import { AppSelect } from "@/components/atoms/AppSelect";
import { FormField } from "@/components/molecules/FormField";
import { centsToMask, MoneyInput } from "@/components/molecules/MoneyInput";
import { ReceiptActions } from "@/components/molecules/ReceiptActions";
import { shrinkImage } from "@/lib/resize-image";
import { cn } from "@/lib/utils";
import type { FormState, FormTarget, TransactionFormProps, TransactionKind } from "./TransactionForm.types";

type Result = FormState & { hadFile?: boolean };
type BodyProps = Omit<TransactionFormProps, "target"> & { target: FormTarget };

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: { value: TransactionKind; label: string; tone: string }[] = [
  {
    value: "INCOME",
    label: "Entrada",
    tone: "has-checked:border-income has-checked:bg-income-soft has-checked:text-income",
  },
  {
    value: "EXPENSE",
    label: "Saída",
    tone: "has-checked:border-expense has-checked:bg-expense-soft has-checked:text-expense",
  },
];

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <AppLabel htmlFor={htmlFor}>{label}</AppLabel>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function FormBody({ target, onClose, categories, paymentMethods, today, uploadEnabled, saveAction }: BodyProps) {
  const row = target.mode === "edit" ? target.row : null;
  const [type, setType] = useState<TransactionKind>(row?.type ?? (target.mode === "create" ? target.type : "INCOME"));
  const [categoryId, setCategoryId] = useState(row?.category.id ?? "");
  const [date, setDate] = useState(row?.occurredOn ?? today);
  const [resetKey, setResetKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [removeDoc, setRemoveDoc] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const intent = useRef<"save" | "again">("save");

  const [state, formAction, pending] = useActionState(async (prev: Result, fd: FormData): Promise<Result> => {
    const sent = fd.get("receipt");
    const hadFile = sent instanceof File && sent.size > 0;
    setFile(null);
    setPreview(null); // o navegador descarta o arquivo depois do envio, com sucesso ou erro
    const r = await saveAction(row?.id ?? null, prev, fd);
    if (r.ok) {
      toast.success(row ? "Lançamento atualizado." : "Lançamento salvo.");
      if (intent.current === "again") {
        setResetKey((k) => k + 1);
        setTimeout(() => formRef.current?.querySelector<HTMLElement>("#tx-amount")?.focus(), 0);
      } else onClose();
    } else if (r.error) toast.error(r.error);
    return { ...r, hadFile };
  }, {});

  useEffect(() => {
    if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const val = (k: string, fallback = "") => String(state.values?.[k] ?? fallback);
  const err = (k: string) => state.fieldErrors?.[k];
  const failed = Boolean(state.fieldErrors || state.error);
  const receiptHint = Boolean(state.hadFile && failed && !file);
  // categoria/forma de pagamento desativada do lançamento em edição continua selecionável
  const allCategories =
    row && !categories.some((c) => c.id === row.category.id)
      ? [...categories, { ...row.category, type: row.type }]
      : categories;
  const typed = allCategories.filter((c) => c.type === type && (c.active || c.id === row?.category.id));
  const methods = (
    row?.paymentMethod && !paymentMethods.some((m) => m.id === row.paymentMethod!.id)
      ? [...paymentMethods, row.paymentMethod]
      : paymentMethods
  ).filter((m) => m.active || m.id === row?.paymentMethod?.id);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const chosen = input.files?.[0];
    setFileError(null);
    if (!chosen) {
      setPreview(null);
      return setFile(null);
    }
    const small = await shrinkImage(chosen);
    if (small.size > MAX_BYTES) {
      input.value = "";
      setFile(null);
      return setFileError("O arquivo passa de 3 MB. Escolha um menor.");
    }
    if (small !== chosen) {
      const dt = new DataTransfer();
      dt.items.add(small);
      input.files = dt.files;
    }
    setFile(small);
    setPreview(small.type.startsWith("image/") ? URL.createObjectURL(small) : null);
  };

  const clearFile = () => {
    if (fileRef.current) fileRef.current.value = "";
    setFile(null);
    setPreview(null);
    setFileError(null);
  };

  return (
    <form ref={formRef} action={formAction} noValidate className="grid gap-4">
      <fieldset className="grid gap-1.5">
        <legend className="font-heading mb-1.5 text-sm font-bold [font-stretch:100%]">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={cn(
                "font-heading focus-within:ring-ring/50 flex h-12 cursor-pointer items-center justify-center rounded-lg border-2 text-base font-bold [font-stretch:100%] transition-colors focus-within:ring-3",
                t.tone,
              )}
            >
              <input
                type="radio"
                name="type"
                value={t.value}
                checked={type === t.value}
                onChange={() => {
                  setType(t.value);
                  setCategoryId("");
                }}
                className="sr-only"
              />
              {t.label}
            </label>
          ))}
        </div>
        {err("type") && (
          <p role="alert" className="text-destructive text-sm">
            {err("type")}
          </p>
        )}
      </fieldset>

      <Fragment key={resetKey}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Valor (R$)" htmlFor="tx-amount" error={err("amount")}>
            <MoneyInput
              id="tx-amount"
              name="amount"
              defaultValue={val("amount", row ? centsToMask(row.amountCents) : "")}
              aria-invalid={err("amount") ? true : undefined}
              aria-describedby={err("amount") ? "tx-amount-error" : undefined}
              autoFocus={!row}
            />
          </Field>
          <FormField
            label="Data"
            id="tx-date"
            name="occurredOn"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            error={err("occurredOn")}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Categoria" htmlFor="tx-category" error={err("categoryId")}>
            <AppSelect
              id="tx-category"
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-invalid={err("categoryId") ? true : undefined}
              aria-describedby={err("categoryId") ? "tx-category-error" : undefined}
            >
              <option value="">Escolha…</option>
              {typed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (desativada)"}
                </option>
              ))}
            </AppSelect>
          </Field>
          <Field label="Forma de pagamento (opcional)" htmlFor="tx-method" error={err("paymentMethodId")}>
            <AppSelect
              id="tx-method"
              name="paymentMethodId"
              defaultValue={val("paymentMethodId", row?.paymentMethod?.id ?? "")}
              aria-invalid={err("paymentMethodId") ? true : undefined}
              aria-describedby={err("paymentMethodId") ? "tx-method-error" : undefined}
            >
              <option value="">Não informada</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.active ? "" : " (desativada)"}
                </option>
              ))}
            </AppSelect>
          </Field>
        </div>

        <FormField
          label="Descrição"
          id="tx-description"
          name="description"
          defaultValue={val("description", row?.description ?? "")}
          error={err("description")}
          maxLength={120}
          autoComplete="off"
        />

        {type === "INCOME" && (
          <fieldset className="bg-muted/50 grid gap-4 rounded-lg border p-3 md:grid-cols-2 md:items-start">
            <legend className="font-heading px-1 text-sm font-bold [font-stretch:100%]">
              Recebido de (para o recibo)
            </legend>
            <FormField
              label="Nome (opcional)"
              id="tx-payer-name"
              name="payerName"
              defaultValue={val("payerName", row?.payerName ?? "")}
              error={err("payerName")}
              maxLength={120}
              autoComplete="off"
            />
            <FormField
              label="CPF ou CNPJ (opcional)"
              id="tx-payer-doc"
              name="payerDocument"
              defaultValue={val("payerDocument")}
              error={err("payerDocument")}
              hint={
                row?.payerDocumentMasked ? `Atual: ${row.payerDocumentMasked}. Deixe em branco para manter.` : undefined
              }
              placeholder={row?.payerDocumentMasked ?? undefined}
              inputMode="numeric"
              autoComplete="off"
            />
            {row && !removeDoc && <input type="hidden" name="keepPayerDocument" value="1" />}
            {row?.payerDocumentMasked && (
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={removeDoc}
                  onChange={(e) => setRemoveDoc(e.target.checked)}
                  className="size-4"
                />
                Remover documento
              </label>
            )}
          </fieldset>
        )}

        <div className="grid gap-2">
          <AppLabel htmlFor="tx-receipt">Comprovante (opcional)</AppLabel>
          {!uploadEnabled ? (
            <p className="text-muted-foreground text-sm">Anexo indisponível neste ambiente.</p>
          ) : (
            <>
              <input
                ref={fileRef}
                id="tx-receipt"
                name="receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={pick}
                aria-describedby={receiptHint ? "tx-receipt-hint" : fileError ? "tx-receipt-error" : undefined}
                className="sr-only"
              />
              {file ? (
                <div className="bg-card flex items-center gap-3 rounded-lg border p-2">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="" className="size-12 rounded-md object-cover" />
                  ) : (
                    <FileText aria-hidden className="text-muted-foreground size-12 p-2" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
                  <AppButton
                    type="button"
                    tone="ghost"
                    size="icon"
                    aria-label="Remover o arquivo escolhido"
                    onClick={clearFile}
                  >
                    <X aria-hidden />
                  </AppButton>
                </div>
              ) : (
                <label
                  htmlFor="tx-receipt"
                  className="font-heading border-border hover:bg-muted focus-within:ring-ring/50 inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-base font-bold [font-stretch:100%]"
                >
                  <Paperclip aria-hidden className="size-4" />
                  Anexar foto ou PDF
                </label>
              )}
              {fileError && (
                <p id="tx-receipt-error" role="alert" className="text-destructive text-sm">
                  {fileError}
                </p>
              )}
              {receiptHint && (
                <p id="tx-receipt-hint" role="status" className="text-warning text-sm">
                  Selecione o comprovante de novo.
                </p>
              )}
              {err("receipt") && (
                <p role="alert" className="text-destructive text-sm">
                  {err("receipt")}
                </p>
              )}
              {row?.hasReceipt && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <a
                    href={`/lancamentos/${row.id}/comprovante`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground font-bold underline underline-offset-2"
                  >
                    Ver comprovante atual
                  </a>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="removeReceipt"
                      defaultChecked={Boolean(state.values?.removeReceipt)}
                      className="size-4"
                    />
                    Remover o comprovante atual
                  </label>
                </div>
              )}
            </>
          )}
        </div>
      </Fragment>

      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg p-3 text-sm font-medium">
          {state.error}
        </p>
      )}

      {row && type === "INCOME" && (
        <div className="grid gap-3">
          <AppButton type="button" tone="outline" onClick={() => setShowReceipt((v) => !v)} aria-expanded={showReceipt}>
            <Receipt aria-hidden className="size-4" />
            Recibo
          </AppButton>
          {showReceipt && (
            <div className="bg-muted/50 grid gap-2 rounded-lg border p-3">
              <p className="text-muted-foreground text-sm">Gera o recibo da última versão salva deste lançamento.</p>
              <ReceiptActions transactionId={row.id} />
            </div>
          )}
        </div>
      )}

      <div className="bg-popover sticky bottom-0 -mx-4 flex flex-col gap-2 border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] md:static md:mx-0 md:flex-row md:justify-end md:border-0 md:p-0">
        {/* "Salvar" vem primeiro no DOM: é o botão do Enter. A ordem visual é ajustada por CSS. */}
        <AppButton
          type="submit"
          disabled={pending}
          onClick={() => (intent.current = "save")}
          className="order-1 md:order-3"
        >
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {pending ? "Salvando…" : "Salvar"}
        </AppButton>
        {!row && (
          <AppButton
            type="submit"
            tone="outline"
            disabled={pending}
            onClick={() => (intent.current = "again")}
            className="order-2"
          >
            Salvar e lançar outro
          </AppButton>
        )}
        <AppButton
          type="button"
          tone="ghost"
          onClick={onClose}
          disabled={pending}
          className="order-3 max-md:hidden md:order-1"
        >
          Cancelar
        </AppButton>
      </div>
    </form>
  );
}

/** Dialog no desktop; tela cheia abaixo de md. O corpo remonta a cada abertura (estado limpo). */
export function TransactionForm({ target, onClose, ...rest }: TransactionFormProps) {
  const [seen, setSeen] = useState<{ target: FormTarget | null; last: FormTarget | null; session: number }>({
    target,
    last: target,
    session: 0,
  });
  if (target !== seen.target) {
    setSeen({ target, last: target ?? seen.last, session: target ? seen.session + 1 : seen.session });
  }
  const shown = target ?? seen.last;
  const title = !shown
    ? ""
    : shown.mode === "edit"
      ? "Editar lançamento"
      : shown.type === "INCOME"
        ? "Nova entrada"
        : "Nova saída";
  return (
    <AppDialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <AppDialogContent className="top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none p-4 sm:max-w-none md:top-1/2 md:left-1/2 md:h-auto md:max-h-[92dvh] md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:p-6">
        <AppDialogHeader>
          <AppDialogTitle className="text-xl font-extrabold">{title}</AppDialogTitle>
          <AppDialogDescription>Enter salva, Esc fecha. Valor, data e categoria são obrigatórios.</AppDialogDescription>
        </AppDialogHeader>
        {shown && <FormBody key={seen.session} target={shown} onClose={onClose} {...rest} />}
      </AppDialogContent>
    </AppDialog>
  );
}

export type {
  FormCategory,
  FormPaymentMethod,
  FormState,
  FormTarget,
  FormTransaction,
  TransactionFormProps,
  TransactionKind,
} from "./TransactionForm.types";
