export type TimelineRow = {
  id: string;
  seq: string;
  occurredAt: Date;
  userName: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  result: string;
  reason: string | null;
  ip: string | null;
  device: string | null;
  userAgent: string | null;
  requestId: string | null;
  before: unknown;
  after: unknown;
  hash: string;
  text: string;
  tone: "normal" | "alert";
  organizationName?: string | null;
};

export type VerifyResult =
  | { ok: true; checked: number; brokenCount: number; broken: { seq: string; action: string }[] }
  | { ok: false; error: string };

export type AuditTimelineProps = {
  rows: TimelineRow[];
  /** Link da próxima página (cursor na URL) ou null. */
  nextHref: string | null;
  timezone: string;
  verifyAction?: () => Promise<VerifyResult>;
  showCompany?: boolean;
};
