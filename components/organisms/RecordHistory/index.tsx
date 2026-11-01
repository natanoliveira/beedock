import Link from "next/link";
import { AuditTimeline } from "@/components/organisms/AuditTimeline";
import type { RecordHistoryProps } from "./RecordHistory.types";

export function RecordHistory({ rows, auditHref, timezone }: RecordHistoryProps) {
  return (
    <section className="grid gap-3" aria-labelledby="record-history">
      <div className="flex items-center justify-between gap-3">
        <h2 id="record-history" className="font-heading font-extrabold [font-stretch:100%]">Histórico</h2>
        <Link className="text-sm font-bold underline" href={auditHref}>Ver tudo na auditoria</Link>
      </div>
      <AuditTimeline rows={[...rows].reverse()} nextHref={null} timezone={timezone} />
    </section>
  );
}
