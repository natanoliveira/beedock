"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FORMATS = [
  { key: "relatorio.pdf", label: "PDF" },
  { key: "lancamentos.csv", label: "CSV" },
] as const;

/** Baixa via fetch para manter spinner e bloqueio (nos dois botões) até o arquivo chegar. */
export function ReportExportButtons({ month }: { month: string }) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (file: string) => {
    setBusy(file);
    try {
      const res = await fetch(`/relatorios/${month}/${file}`);
      if (!res.ok) throw new Error(String(res.status));
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? file;
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      toast.error("Não foi possível gerar o arquivo. Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex gap-2">
      {FORMATS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          disabled={busy !== null}
          aria-busy={busy === key}
          onClick={() => run(key)}
          className={cn(
            "hover:bg-muted inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold",
            "disabled:pointer-events-none disabled:opacity-60",
          )}
        >
          {busy === key ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          {label}
        </button>
      ))}
    </div>
  );
}
