"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppInput } from "@/components/atoms/AppInput";
import { AppLabel } from "@/components/atoms/AppLabel";
import { startNavigationProgress } from "@/components/atoms/NavigationProgress";

type Props = {
  id: string;
  label: string;
  /** Valor atual vindo da URL (fonte da verdade). */
  value: string;
  basePath: string;
  /** Parâmetros que ficam na URL ao buscar (ex.: status, tipo); a página volta à 1. */
  keep?: Record<string, string | undefined>;
  placeholder?: string;
};

/** Busca com debounce de 300ms que escreve `q` na URL. */
export function SearchBox({ id, label, value, basePath, keep, placeholder }: Props) {
  const router = useRouter();
  const [text, setText] = useState(value);
  const current = useRef(value);

  // q mudou por fora (voltar do navegador, link): ressincroniza o campo
  useEffect(() => {
    if (value !== current.current) {
      current.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    const q = text.trim();
    if (q === current.current) return;
    const t = setTimeout(() => {
      current.current = q;
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(keep ?? {})) if (v) p.set(k, v);
      if (q) p.set("q", q);
      const href = `${basePath}${p.size ? `?${p}` : ""}`;
      startNavigationProgress(href);
      router.replace(href);
    }, 300);
    return () => clearTimeout(t);
  }, [text, keep, basePath, router]);

  return (
    <div className="grid gap-1.5">
      <AppLabel htmlFor={id}>{label}</AppLabel>
      <div className="relative">
        <Search aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2" />
        <AppInput
          id={id}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={100}
          autoComplete="off"
          placeholder={placeholder}
          className="pl-10"
        />
      </div>
    </div>
  );
}
