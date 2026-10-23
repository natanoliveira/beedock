import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ withScope: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { AUDIT_HMAC_KEY: "k".repeat(32) } }));

const { computeHash } = await import("@/lib/audit");
const { verifyRows } = await import("@/lib/audit-verify");
type Row = Parameters<typeof verifyRows>[0][number];

const KEY = "k".repeat(32);
const base = {
  organizationId: "org_a",
  userId: "u1",
  userName: "Maria",
  userRole: "ADMIN",
  action: "transaction.update",
  entityType: "Transaction",
  entityId: "t1",
  before: null,
  after: { amountCents: 1 },
  ip: null,
  userAgent: null,
  device: null,
  result: "SUCCESS" as const,
  requestId: null,
  reason: null,
};

function chain(n: number, org: string | null = "org_a"): Row[] {
  const rows: Row[] = [];
  let prev: string | null = null;
  for (let i = 1; i <= n; i++) {
    const fields = { ...base, organizationId: org, occurredAt: new Date(2026, 9, i) };
    const hash = computeHash(prev, fields, KEY);
    rows.push({ ...fields, seq: i, prevHash: prev, hash });
    prev = hash;
  }
  return rows;
}

describe("verifyRows", () => {
  it("cadeia íntegra", () => {
    expect(verifyRows(chain(3), undefined, KEY)).toEqual({ checked: 3, broken: [] });
  });

  it("lista vazia", () => {
    expect(verifyRows([], undefined, KEY)).toEqual({ checked: 0, broken: [] });
  });

  it("prevHash errado na 2ª", () => {
    const rows = chain(3);
    rows[1] = { ...rows[1], prevHash: "x" };
    const r = verifyRows(rows, undefined, KEY);
    expect(r.broken.map((b) => b.seq)).toContain("2");
  });

  it("hash adulterado na 3ª", () => {
    const rows = chain(3);
    rows[2] = { ...rows[2], after: { amountCents: 999 } };
    expect(verifyRows(rows, undefined, KEY).broken.map((b) => b.seq)).toEqual(["3"]);
  });

  it("evento removido do meio quebra o seguinte", () => {
    const rows = chain(3);
    rows.splice(1, 1);
    expect(verifyRows(rows, undefined, KEY).broken.map((b) => b.seq)).toEqual(["3"]);
  });

  it("lotes sucessivos com o mesmo state", () => {
    const rows = chain(4);
    const state = new Map<string | null, string | null>();
    const a = verifyRows(rows.slice(0, 2), state, KEY);
    const b = verifyRows(rows.slice(2), state, KEY);
    expect(a.broken.length + b.broken.length).toBe(0);
  });

  it("cadeias independentes por organização", () => {
    const rows = [...chain(2, "org_a"), ...chain(2, null)].map((r, i) => ({ ...r, seq: i + 1 }));
    expect(verifyRows(rows, undefined, KEY).broken).toEqual([]);
  });
});
