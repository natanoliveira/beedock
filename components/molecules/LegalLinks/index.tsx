import { cn } from "@/lib/utils";

/** Links legais do rodapé (Termos de Uso · Privacidade). */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Documentos legais"
      className={cn("text-muted-foreground flex items-center justify-center gap-2 text-[13px]", className)}
    >
      <a href="/termos" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
        Termos de Uso
      </a>
      <span aria-hidden>·</span>
      <a href="/privacidade" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
        Privacidade
      </a>
    </nav>
  );
}
