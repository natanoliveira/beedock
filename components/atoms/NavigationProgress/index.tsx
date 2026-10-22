"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

const START_EVENT = "beedock:navigation-start";
const STOP_EVENT = "beedock:navigation-stop";
const SAFETY_MS = 15000;

// destino igual à URL atual não gera navegação: a barra ficaria presa até o SAFETY_MS
const isSameUrl = (href: string) => {
  const url = new URL(href, window.location.href);
  return url.pathname === window.location.pathname && url.search === window.location.search;
};

/** Inicia a barra manualmente (ex.: router.push de filtros), com o destino da navegação. */
export const startNavigationProgress = (href: string) => {
  if (typeof window !== "undefined" && !isSameUrl(href)) window.dispatchEvent(new Event(START_EVENT));
};

/** Cancela a barra quando a navegação não vai acontecer (ex.: action recusada). */
export const stopNavigationProgress = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STOP_EVENT));
};

type Phase = "idle" | "loading" | "done";

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = `${pathname}?${search}`;
  // localização em que a navegação começou; enquanto igual à atual, ainda carregando
  const [from, setFrom] = useState<string | null>(null);
  const hereRef = useRef(here);
  useEffect(() => {
    hereRef.current = here;
  }, [here]);
  const safety = useRef<ReturnType<typeof setTimeout>>(undefined);

  const phase: Phase = from === null ? "idle" : from === here ? "loading" : "done";

  const start = useCallback(() => {
    clearTimeout(safety.current);
    setFrom(hereRef.current);
    safety.current = setTimeout(() => setFrom(null), SAFETY_MS);
  }, []);

  useEffect(() => {
    if (phase !== "done") return;
    clearTimeout(safety.current);
    const t = setTimeout(() => setFrom(null), 500);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (new URL(a.href, window.location.href).origin !== window.location.origin || isSameUrl(a.href)) return;
      start();
    };
    // captura: o React usa o document como raiz e o <Link> chama preventDefault antes de um listener em bubble
    document.addEventListener("click", onClick, true);
    const stop = () => {
      clearTimeout(safety.current);
      setFrom(null);
    };
    window.addEventListener(START_EVENT, start);
    window.addEventListener(STOP_EVENT, stop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener(STOP_EVENT, stop);
      clearTimeout(safety.current);
    };
  }, [start]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] origin-left"
      style={{
        // a faixa zebrada (Mel + Própolis) fica no topo dos headers: barra clara com halo Mel para aparecer sobre ela
        background: "#fbf6ea",
        boxShadow: "0 1px 0 rgba(30, 22, 12, 0.55), 0 0 10px 1px rgba(245, 164, 0, 0.9)",
        opacity: phase === "idle" ? 0 : phase === "done" ? 0 : 1,
        transform: `scaleX(${phase === "idle" ? 0 : phase === "loading" ? 0.8 : 1})`,
        transition:
          phase === "loading"
            ? "transform 8s cubic-bezier(0.1, 0.6, 0.2, 1)"
            : phase === "done"
              ? "transform 200ms ease-out, opacity 300ms ease 200ms"
              : "none",
      }}
      data-phase={phase}
    >
      <style>{`@media (prefers-reduced-motion: reduce){[data-phase]{transition:none!important}}`}</style>
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
