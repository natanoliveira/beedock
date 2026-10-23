"use client";

import { Download, Loader2, Printer, Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { appButtonVariants } from "@/components/atoms/AppButton/variants";
import { cn } from "@/lib/utils";

type Props = { transactionId?: string; /** Rota do PDF; o padrão é o recibo do lançamento. */ url?: string; filename?: string };

const SHARE_TIP = "PDF baixado. Anexe o arquivo no WhatsApp ou e-mail do cliente.";

/** Cada clique gera o PDF (e um evento de auditoria); por isso nada aqui faz prefetch. */
export function ReceiptActions({ transactionId, url: urlProp, filename = "recibo.pdf" }: Props) {
  const url = urlProp ?? `/lancamentos/${transactionId}/recibo.pdf`;
  const [sharing, setSharing] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const cached = useRef<File | null>(null);

  const print = () => window.open(url, "_blank", "noopener");

  const download = (file: File) => {
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setTip(SHARE_TIP);
  };

  const share = async () => {
    setSharing(true);
    setTip(null);
    try {
      if (!cached.current) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        cached.current = new File([await res.blob()], filename, { type: "application/pdf" });
      }
      const file = cached.current;
      if (!navigator.canShare?.({ files: [file] })) return download(file);
      try {
        await navigator.share({ files: [file], title: "Recibo de pagamento" });
      } catch (e) {
        // o fetch demorou e o navegador perdeu o gesto do usuário: baixa e orienta
        if (e instanceof DOMException && e.name === "NotAllowedError") download(file);
        else throw e;
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        toast.error("Não foi possível gerar o recibo. Tente de novo.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <AppButton type="button" tone="outline" onClick={print}>
          <Printer aria-hidden className="size-4" />
          Imprimir
        </AppButton>
        <a
          href={url}
          download="recibo.pdf"
          className={cn(appButtonVariants({ tone: "outline" }), "inline-flex items-center justify-center gap-2")}
        >
          <Download aria-hidden className="size-4" />
          Baixar PDF
        </a>
        <AppButton type="button" tone="outline" onClick={share} disabled={sharing}>
          {sharing ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Share2 aria-hidden className="size-4" />
          )}
          Compartilhar
        </AppButton>
      </div>
      <p role="status" className="text-muted-foreground text-sm">
        {tip}
      </p>
    </div>
  );
}
