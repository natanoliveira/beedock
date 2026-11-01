import type { TimelineRow } from "@/components/organisms/AuditTimeline/AuditTimeline.types";

export type RecordHistoryProps = { rows: TimelineRow[]; auditHref: string; timezone: string };
