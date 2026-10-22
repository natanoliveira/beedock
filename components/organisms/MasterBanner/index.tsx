"use client";

import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { startNavigationProgress, stopNavigationProgress } from "@/components/atoms/NavigationProgress";
import type { MasterBannerProps } from "./MasterBanner.types";

function LeaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-heading inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-current disabled:opacity-60 motion-reduce:transition-none"
    >
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ArrowLeft aria-hidden className="size-4" />}
      Voltar à plataforma
    </button>
  );
}

/** Faixa abaixo do topo para o MASTER: mostra em qual empresa está e como voltar. */
export function MasterBanner({ organizationName, actingAsMaster, leaveAction }: MasterBannerProps) {
  return (
    <div role="status" className="bg-warning-soft text-warning border-b border-current/20">
      <div className="mx-auto flex min-h-11 max-w-[1240px] items-center gap-3 px-4 md:px-8">
        <ShieldCheck aria-hidden className="size-4 shrink-0" />
        <p className="min-w-0 flex-1 py-1 text-sm leading-tight font-bold">
          {actingAsMaster ? `Você está como MASTER em ${organizationName}` : organizationName}
        </p>
        <form
          action={async () => {
            startNavigationProgress("/plataforma");
            // sucesso redireciona (lança); só chega aqui se a action devolveu erro
            const r = (await leaveAction()) as { error?: string } | undefined;
            stopNavigationProgress();
            toast.error(r?.error ?? "Não foi possível voltar à plataforma.");
          }}
        >
          <LeaveButton />
        </form>
      </div>
    </div>
  );
}
