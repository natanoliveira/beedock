"use client";

import { ImagePlus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { cropToWebp } from "./crop";

type Props = {
  /** Ausente na criação: o upload só existe depois que a empresa é salva. Já vinculada ao id da empresa. */
  uploadAction?: (fd: FormData) => Promise<{ url?: string; error?: string }>;
  logoUrl?: string | null;
  /** Só no Admin da empresa: remove a logo atual (reversível por novo upload). */
  removeAction?: () => Promise<{ error?: string }>;
  /** logoUploadEnabled() calculado no servidor. */
  enabled: boolean;
};

export function LogoDropzone({ uploadAction, removeAction, logoUrl, enabled }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(logoUrl ?? null);
  const [busy, setBusy] = useState<"Enviando…" | "Removendo…" | null>(null);
  const [over, setOver] = useState(false);

  const disabledText = !enabled
    ? "Upload de logo indisponível neste ambiente"
    : !uploadAction
      ? "Disponível após salvar"
      : null;

  async function upload(file: File | undefined) {
    if (!file || !uploadAction || busy) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return void toast.error("Use uma imagem PNG, JPG ou WebP.");
    setBusy("Enviando…");
    try {
      const fd = new FormData();
      fd.set("logo", await cropToWebp(file));
      const r = await uploadAction(fd);
      if (r.url) {
        setUrl(r.url);
        toast.success("Logo atualizada.");
      } else toast.error(r.error ?? "Não foi possível enviar a logo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível processar a imagem.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!removeAction || busy) return;
    setBusy("Removendo…");
    try {
      const r = await removeAction();
      if (r.error) toast.error(r.error);
      else {
        setUrl(null);
        toast.success("Logo removida.");
      }
    } catch {
      toast.error("Não foi possível remover a logo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="font-heading text-sm font-bold [font-stretch:100%]">
        Logo
      </label>
      <div
        onDragOver={(e) => {
          if (disabledText) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabledText) void upload(e.dataTransfer.files[0]);
        }}
        className={cn(
          "bg-background relative flex items-center gap-4 rounded-lg border-2 border-dashed p-4 transition-colors",
          over && "border-primary-strong bg-muted",
          disabledText && "opacity-60",
          !disabledText && "focus-within:ring-ring/50 focus-within:ring-3",
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo vem do Vercel Blob, tamanho fixo
          <img src={url} alt="Logo atual da empresa" className="hex h-[58px] w-[50px] shrink-0 object-cover" />
        ) : (
          <span
            aria-hidden
            className="hex bg-muted text-muted-foreground grid h-[58px] w-[50px] shrink-0 place-items-center"
          >
            <ImagePlus className="size-5" />
          </span>
        )}
        <div className="min-w-0 text-sm">
          <p className="font-bold">{busy ?? (url ? "Trocar logo" : "Enviar logo")}</p>
          <p className="text-muted-foreground">
            {disabledText ?? "Arraste uma imagem ou toque para escolher. Recorte quadrado, até 1 MB."}
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={!!disabledText || !!busy}
          onChange={(e) => void upload(e.target.files?.[0])}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      {removeAction && url && (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={!!busy}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 min-h-11 w-fit rounded-lg px-1 text-sm font-bold underline underline-offset-4 outline-none focus-visible:ring-3 disabled:opacity-50"
        >
          Remover logo
        </button>
      )}
    </div>
  );
}
