"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from "@/components/atoms/AppDropdownMenu";
import { startNavigationProgress, stopNavigationProgress } from "@/components/atoms/NavigationProgress";
import { cn } from "@/lib/utils";
import type { OrgSwitcherProps } from "./OrgSwitcher.types";

const SEARCH_FROM = 8;

/** Troca de empresa no topo: dropdown com a atual marcada; busca local com mais de 8 opções. */
export function OrgSwitcher({ options, currentId, label, switchAction }: OrgSwitcherProps) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  // no header da empresa só faz sentido com 2+ opções; na plataforma (sem currentId) basta 1
  if (options.length < (currentId ? 2 : 1)) return null;

  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;

  const choose = (id: string) => {
    if (id === currentId) return;
    startTransition(async () => {
      startNavigationProgress("/inicio");
      const r = await switchAction(id);
      if (r?.error) {
        stopNavigationProgress();
        toast.error(r.error);
      }
    });
  };

  return (
    <AppDropdownMenu onOpenChange={() => setQuery("")}>
      <AppDropdownMenuTrigger
        aria-label={label}
        disabled={pending}
        className={cn(
          "font-heading text-ink-foreground/80 flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60",
          !currentId && "border border-white/20",
        )}
      >
        {!currentId && <span className="hidden sm:inline">{label}</span>}
        <ChevronsUpDown className="size-4" aria-hidden />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start" className="w-64">
        {options.length > SEARCH_FROM && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Buscar empresa"
            aria-label="Buscar empresa"
            className="bg-background mb-1 h-11 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        <div className="max-h-72 overflow-y-auto">
          {shown.map((o) => (
            <AppDropdownMenuItem key={o.id} onSelect={() => choose(o.id)} className="min-h-11 gap-2 px-2.5 font-bold">
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.id === currentId && <>
                  <Check className="text-primary-strong size-4" aria-hidden />
                  <span className="sr-only">(atual)</span>
                </>}
            </AppDropdownMenuItem>
          ))}
          {shown.length === 0 && <p className="text-muted-foreground px-2.5 py-2 text-sm">Nenhuma empresa encontrada.</p>}
        </div>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
