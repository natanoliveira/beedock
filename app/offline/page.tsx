import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sem conexão", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl font-bold">Sem conexão</h1>
      <p className="text-muted-foreground">O BeeDock precisa de internet para mostrar e salvar seus dados. Verifique a conexão e tente de novo.</p>
      <a href="/inicio" className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">
        Tentar de novo
      </a>
    </main>
  );
}
