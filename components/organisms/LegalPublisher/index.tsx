"use client";

import { startTransition, useActionState, useState } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { ResponsiveModal } from "@/components/organisms/TeamManager/ResponsiveModal";
import { formatDate } from "@/lib/format-date";
import type { LegalPublisherProps } from "./LegalPublisher.types";

function PublishForm({
  type,
  initialContent,
  publishAction,
  onClose,
}: Pick<LegalPublisherProps, "type" | "initialContent" | "publishAction"> & { onClose: () => void }) {
  const [content, setContent] = useState(initialContent);
  const [confirmed, setConfirmed] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: Parameters<typeof publishAction>[0], fd: FormData) => {
      const r = await publishAction(prev, fd);
      if (r.ok) {
        toast.success(`Versão ${String(r.values?.version ?? "")} publicada.`);
        onClose();
      }
      return r;
    },
    {},
  );
  const error = state.fieldErrors?.content;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd)); // sem action=: o React 19 não reseta o form (preserva texto e checkbox)
      }}
      noValidate
      className="grid gap-4"
    >
      <input type="hidden" name="type" value={type} />
      <div className="grid gap-1.5">
        <label htmlFor={`legal-${type}`} className="text-sm font-bold">
          Texto *
        </label>
        <textarea
          id={`legal-${type}`}
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `legal-${type}-err` : undefined}
          className="bg-background focus-visible:ring-ring/50 max-h-[50dvh] min-h-48 w-full rounded-lg border-2 px-3.5 py-3 font-mono text-sm leading-relaxed outline-none focus-visible:ring-3"
        />
        <div className="flex justify-between gap-3 text-xs">
          <span id={`legal-${type}-err`} role={error ? "alert" : undefined} className="text-expense font-bold">
            {error}
          </span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {content.length.toLocaleString("pt-BR")} / 100.000
          </span>
        </div>
      </div>
      <label className="bg-warning-soft flex min-h-11 items-start gap-3 rounded-lg px-3 py-2.5 text-sm font-bold">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 size-5 shrink-0"
        />
        Todos os usuários de empresas precisarão aceitar de novo no próximo acesso.
      </label>
      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg px-3 py-2.5 text-sm font-bold">
          {state.error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <AppButton type="button" tone="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </AppButton>
        <AppButton type="submit" disabled={pending || !confirmed}>
          {pending ? "Publicando…" : "Publicar"}
        </AppButton>
      </div>
    </form>
  );
}

/** Seção de um documento legal: versão vigente, adesão, histórico e publicação (MASTER). */
export function LegalPublisher({ title, current, acceptedCount, activeUsers, history, ...form }: LegalPublisherProps) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby={`sec-${form.type}`} className="bg-card grid gap-4 rounded-xl border-2 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id={`sec-${form.type}`} className="text-xl leading-tight font-black">
            {title}
          </h2>
          <p className="text-muted-foreground text-sm font-bold">
            {current
              ? `Versão ${current.version} · desde ${formatDate(current.publishedAt)}`
              : "Nada publicado: o aceite está desligado."}
          </p>
          {current && (
            <p className="text-sm tabular-nums">
              {acceptedCount} de {activeUsers} usuários aceitaram
            </p>
          )}
        </div>
        <AppButton type="button" onClick={() => setOpen(true)}>
          Publicar nova versão
        </AppButton>
      </div>
      <div className="grid gap-1.5">
        <h3 className="text-muted-foreground text-xs font-black tracking-wide uppercase">Histórico</h3>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma versão publicada ainda.</p>
        ) : (
          <ul className="divide-y text-sm">
            {history.map((h) => (
              <li key={h.version} className="flex justify-between py-2">
                <span className="font-bold">Versão {h.version}</span>
                <span className="text-muted-foreground tabular-nums">{formatDate(h.publishedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={`Publicar ${title}`}
        description="Edite o texto e publique uma nova versão. Versões antigas ficam no histórico."
      >
        <PublishForm {...form} onClose={() => setOpen(false)} />
      </ResponsiveModal>
    </section>
  );
}
