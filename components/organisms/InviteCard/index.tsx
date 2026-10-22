"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { FormField } from "@/components/molecules/FormField";
import { formatDateTime } from "@/lib/format-date";

type ResendState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  inviteUrl?: string;
  values?: Record<string, unknown>;
};

type Props = {
  /** Server actions já vinculadas à empresa. */
  resendAction: (prev: ResendState, fd: FormData) => Promise<ResendState>;
  consumeFlash: () => Promise<void>;
  /** Link recém-gerado (cookie flash lido no servidor); mostrado uma vez. */
  flashUrl: string | null;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  admin: { name: string; email: string } | null;
  pendingInvite: { expiresAt: Date; name: string; email: string; phone: string | null } | null;
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <section aria-labelledby="invite-title" className="bg-card grid gap-4 rounded-xl border p-4 md:p-5">
    <h2 id="invite-title" className="text-lg leading-tight font-extrabold">
      Acesso do Admin
    </h2>
    {children}
  </section>
);

export function InviteCard({ resendAction, consumeFlash, flashUrl, status, admin, pendingInvite }: Props) {
  // useState preserva o link mesmo se a página re-renderizar sem o cookie (consumido abaixo).
  const [link, setLink] = useState(flashUrl);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [linkPhone, setLinkPhone] = useState(pendingInvite?.phone ?? null);
  const [state, formAction, pending] = useActionState(async (prev: ResendState, fd: FormData) => {
    const r = await resendAction(prev, fd);
    if (r.ok && r.inviteUrl) {
      setLink(r.inviteUrl);
      setLinkPhone(String(fd.get("phone") ?? ""));
      setEditing(false);
      toast.success("Novo convite gerado. O anterior foi revogado.");
    }
    return r;
  }, {});

  useEffect(() => {
    if (flashUrl) void consumeFlash();
  }, [flashUrl, consumeFlash]);

  if (admin) {
    return (
      <Shell>
        <p>
          <span className="font-heading font-bold">Admin ativo:</span> {admin.name} · {admin.email}
        </p>
      </Shell>
    );
  }

  const digits = (linkPhone ?? "").replace(/\D/g, "");
  const whatsapp =
    link && digits
      ? `https://wa.me/55${digits}?text=${encodeURIComponent(`Olá! Seu acesso ao BeeDock está pronto. Crie sua senha pelo link (vale por 48 horas): ${link}`)}`
      : null;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  const v = (k: "name" | "email" | "phone") => String(state.values?.[k] ?? pendingInvite?.[k] ?? "");

  return (
    <Shell>
      {link ? (
        <div className="bg-warning-soft grid gap-3 rounded-lg p-3">
          <p className="text-warning text-sm font-bold">
            Copie agora: este link aparece só desta vez. Vale por 48 horas.
          </p>
          <input
            readOnly
            aria-label="Link de convite"
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="bg-background h-12 w-full rounded-lg border-2 px-3 font-mono text-sm"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <AppButton type="button" tone="ink" onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copiado" : "Copiar link"}
            </AppButton>
            {whatsapp && (
              <AppButton asChild tone="outline">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden />
                  Enviar pelo WhatsApp
                </a>
              </AppButton>
            )}
          </div>
        </div>
      ) : pendingInvite ? (
        <p>
          <span className="font-heading font-bold">Convite pendente</span> para {pendingInvite.name} ·{" "}
          {pendingInvite.email}.
          <span className="text-muted-foreground"> Expira em {formatDateTime(pendingInvite.expiresAt)}.</span>
        </p>
      ) : (
        <p className="text-muted-foreground">Nenhum convite ativo. Gere um novo para entregar o acesso ao Admin.</p>
      )}

      {status === "SUSPENDED" && (
        <p role="status" className="bg-warning-soft text-warning rounded-lg px-3 py-2.5 text-sm font-bold">
          Empresa suspensa: o convite só funciona depois de reativar.
        </p>
      )}

      {editing ? (
        <form action={formAction} noValidate className="grid gap-4 border-t pt-4">
          <p className="text-muted-foreground text-sm">
            Gerar um novo convite revoga o anterior. Corrija os dados se precisar.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Nome *"
              name="name"
              id="invite-name"
              defaultValue={v("name")}
              error={state.fieldErrors?.name}
              autoComplete="off"
              required
            />
            <FormField
              label="E-mail *"
              name="email"
              id="invite-email"
              type="email"
              inputMode="email"
              defaultValue={v("email")}
              error={state.fieldErrors?.email}
              autoComplete="off"
              required
            />
            <FormField
              label="Telefone (WhatsApp)"
              name="phone"
              id="invite-phone"
              type="tel"
              inputMode="tel"
              defaultValue={v("phone")}
              error={state.fieldErrors?.phone}
              autoComplete="off"
            />
          </div>
          {state.error && (
            <p role="alert" className="bg-expense-soft text-expense rounded-lg px-3 py-2.5 text-sm font-bold">
              {state.error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 md:flex-row">
            <AppButton type="button" tone="outline" onClick={() => setEditing(false)} disabled={pending}>
              Cancelar
            </AppButton>
            <AppButton type="submit" disabled={pending}>
              {pending ? "Gerando…" : "Gerar novo convite"}
            </AppButton>
          </div>
        </form>
      ) : (
        <div>
          <AppButton type="button" tone="outline" onClick={() => setEditing(true)}>
            {pendingInvite || link ? "Reenviar convite" : "Gerar convite"}
          </AppButton>
        </div>
      )}
    </Shell>
  );
}
