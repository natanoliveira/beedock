"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AppButton } from "@/components/atoms/AppButton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppSheet, AppSheetContent, AppSheetDescription, AppSheetHeader, AppSheetTitle } from "@/components/atoms/AppSheet";
import { cn } from "@/lib/utils";
import type { AuditTimelineProps, TimelineRow, VerifyResult } from "./AuditTimeline.types";

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));

function Detail({ row, timezone }: { row: TimelineRow; timezone: string }) {
  const before = asRecord(row.before);
  const after = asRecord(row.after);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: timezone }).format(row.occurredAt);
  const meta: [string, string | null][] = [
    ["Quando", when], ["Ação", row.action], ["Resultado", row.result], ["Motivo", row.reason], ["IP", row.ip],
    ["Dispositivo", row.device], ["Navegador", row.userAgent], ["Requisição", row.requestId], ["Sequência", row.seq],
    ["Hash", row.hash.slice(0, 16)],
  ];
  return (
    <div className="grid gap-4 overflow-y-auto px-4 pb-6 text-sm">
      <dl className="grid gap-1">
        {meta.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b py-1">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 text-right break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {keys.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr className="text-muted-foreground text-xs"><th className="py-1">Campo</th><th>Antes</th><th>Depois</th></tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-t align-top">
                <td className="py-1 pr-2 font-bold">{k}</td>
                <td className="pr-2 break-all">{show(before[k])}</td>
                <td className="break-all">{show(after[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Verify({ action }: { action: () => Promise<VerifyResult> }) {
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AppButton type="button" tone="ghost" disabled={pending} onClick={() => start(async () => setRes(await action()))}>
        {pending ? "Verificando…" : "Verificar integridade"}
      </AppButton>
      {res && (
        <p role="status" className={cn("text-sm font-bold", res.ok && res.brokenCount === 0 ? "text-income" : "text-expense")}>
          {!res.ok
            ? res.error
            : res.brokenCount === 0
              ? `Cadeia íntegra (${res.checked} eventos)`
              : `${res.brokenCount} eventos com problema (seq ${res.broken.slice(0, 5).map((b) => b.seq).join(", ")})`}
        </p>
      )}
    </div>
  );
}

export function AuditTimeline({ rows, nextHref, timezone, verifyAction, showCompany }: AuditTimelineProps) {
  const [open, setOpen] = useState<TimelineRow | null>(null);
  const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: timezone });
  return (
    <div className="grid gap-4">
      {verifyAction && <Verify action={verifyAction} />}
      {rows.length === 0 ? (
        <EmptyState title="Nenhum evento com esses filtros" description="Ajuste o período ou os filtros." />
      ) : (
        <ul className="bg-card divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpen(r)}
                className="hover:bg-muted grid w-full gap-1 px-4 py-3 text-left"
              >
                <span className={cn("text-sm", r.tone === "alert" && "text-expense font-bold")}>{r.text}</span>
                <span className="text-muted-foreground text-xs">
                  {when.format(r.occurredAt)}
                  {showCompany && ` · ${r.organizationName ?? "Plataforma"}`}
                  {r.device && ` · ${r.device}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {nextHref && (
        <Link className="hover:bg-muted justify-self-center rounded-lg border px-4 py-2 text-sm font-bold" href={nextHref}>
          Próximos eventos
        </Link>
      )}
      <AppSheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <AppSheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <AppSheetHeader>
            <AppSheetTitle>Detalhe do evento</AppSheetTitle>
            <AppSheetDescription>{open?.text}</AppSheetDescription>
          </AppSheetHeader>
          {open && <Detail row={open} timezone={timezone} />}
        </AppSheetContent>
      </AppSheet>
    </div>
  );
}
