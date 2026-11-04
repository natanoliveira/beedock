"use client";

import { Share, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppButton } from "@/components/atoms/AppButton";
import { HexMark } from "@/components/atoms/HexMark";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "beedock:install-dismissed";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS se apresenta como Mac, mas tem tela de toque
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const wasDismissed = () => Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_MS;

/** Convite para instalar no celular: botão nativo no Android, passo a passo no iOS. Some se já instalado ou dispensado (30 dias). */
export function InstallBanner() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);
  const eligible = useSyncExternalStore(
    () => () => {},
    () => !isStandalone() && !wasDismissed(),
    () => false,
  );
  const ios = useSyncExternalStore(
    () => () => {},
    isIos,
    () => false,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => setClosed(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode = closed || !eligible ? null : ios ? "ios" : event ? "android" : null;
  if (!mode) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setClosed(true);
  };

  const install = async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setClosed(true);
  };

  return (
    <section
      aria-label="Instalar o BeeDock"
      className="bg-ink text-ink-foreground animate-in slide-in-from-bottom-6 fade-in motion-reduce:animate-none fixed inset-x-3 bottom-3 z-40 overflow-hidden rounded-xl shadow-2xl duration-300 md:hidden"
    >
      <div aria-hidden className="tape h-1" />
      <div className="flex items-center gap-3 p-3">
        <HexMark size="md">B</HexMark>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-sm font-bold [font-stretch:100%]">BeeDock na tela inicial</p>
          {mode === "ios" ? (
            <p className="text-ink-foreground/70 text-xs leading-snug">
              Toque em <Share aria-label="Compartilhar" className="text-primary inline size-3.5 align-text-bottom" /> e escolha{" "}
              <strong>Adicionar à Tela de Início</strong>.
            </p>
          ) : (
            <p className="text-ink-foreground/70 text-xs leading-snug">Abre direto, sem barra do navegador.</p>
          )}
        </div>
        {mode === "android" && (
          <AppButton type="button" onClick={install} className="h-10 px-4 text-sm">
            Instalar
          </AppButton>
        )}
        <AppButton
          type="button"
          tone="ghost"
          size="icon"
          onClick={dismiss}
          aria-label="Agora não"
          className="text-ink-foreground hover:bg-white/10 hover:text-ink-foreground dark:hover:bg-white/10 size-9 shrink-0"
        >
          <X className="size-4" />
        </AppButton>
      </div>
    </section>
  );
}
