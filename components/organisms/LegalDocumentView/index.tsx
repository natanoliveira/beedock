import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { LegalDocumentViewProps } from "./LegalDocumentView.types";

export function LegalDocumentView({
  title,
  version,
  publishedAt,
  content,
  updated,
  scroll,
  heading: H = "h2",
}: LegalDocumentViewProps) {
  return (
    <article className="grid gap-2">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <H className="text-lg font-black">{title}</H>
        {updated && <span className="bg-primary/20 rounded-full px-2 py-0.5 text-xs font-extrabold">Atualizado</span>}
        <p className="text-muted-foreground w-full text-[13px]">
          Versão {version} · publicada em {formatDate(publishedAt)}
        </p>
      </header>
      <div
        {...(scroll ? { tabIndex: 0, role: "region", "aria-label": title } : {})}
        className={cn(
          "text-sm leading-relaxed whitespace-pre-line",
          scroll &&
            "bg-muted/40 focus-visible:ring-ring max-h-[50vh] overflow-y-auto rounded-lg border p-3 focus-visible:ring-2 focus-visible:outline-none",
        )}
      >
        {content}
      </div>
    </article>
  );
}
