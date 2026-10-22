"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import type { InviteLinkProps } from "./InviteLink.types";

/** Link de convite mostrado uma vez: copiar e enviar pelo WhatsApp. */
export function InviteLink({ url, phone }: InviteLinkProps) {
  const [copied, setCopied] = useState(false);
  const digits = (phone ?? "").replace(/\D/g, "");
  const whatsapp = digits
    ? `https://wa.me/55${digits}?text=${encodeURIComponent(`Olá! Seu acesso ao BeeDock está pronto. Crie sua senha pelo link (vale por 48 horas): ${url}`)}`
    : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  return (
    <div className="bg-warning-soft grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-lg p-3">
      <p className="text-warning text-sm font-bold">Copie agora: este link aparece só desta vez. Vale por 48 horas.</p>
      <input
        readOnly
        aria-label="Link de convite"
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="bg-background h-12 w-full rounded-lg border-2 px-3 font-mono text-sm"
      />
      <div className="flex flex-wrap gap-2">
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
  );
}
