import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ withScope: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { AUDIT_HMAC_KEY: "k".repeat(32) } }));

const { canonical, computeHash, diff, sanitize } = await import("@/lib/audit");
type HashedFields = Parameters<typeof computeHash>[1];

const row: HashedFields = {
  occurredAt: new Date("2026-10-21T12:00:00.123Z"),
  organizationId: "org_a",
  userId: "u1",
  userName: "Maria",
  userRole: "ADMIN",
  action: "transaction.update",
  entityType: "Transaction",
  entityId: "t1",
  before: { amountCents: 8000, description: "Tinta" },
  after: { amountCents: 9500, description: "Tinta" },
  ip: "1.2.3.4",
  userAgent: "x",
  device: "mobile",
  result: "SUCCESS",
  requestId: "r1",
  reason: null,
};

describe("auditoria", () => {
  it("hash não depende da ordem das chaves (jsonb reordena)", () => {
    const reordered = { ...row, before: { description: "Tinta", amountCents: 8000 } };
    expect(computeHash(null, reordered)).toBe(computeHash(null, row));
    expect(canonical({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}');
  });

  it("encadeia: mudar o anterior ou o registro muda o hash", () => {
    const h1 = computeHash(null, row);
    expect(computeHash(h1, row)).not.toBe(h1);
    expect(computeHash(null, { ...row, after: { amountCents: 1 } })).not.toBe(h1);
  });

  it("nunca grava segredo e mascara dado pessoal", () => {
    const out = sanitize({ passwordHash: "x", tokenHash: "y", phone: "(86) 99876-1234", name: "Ana" });
    expect(out).toEqual({ phone: "(86) 9****-1234", name: "Ana" });
  });

  it("diff guarda só campos alterados, inclusive removidos", () => {
    expect(diff({ a: 1, b: 2, c: 9 }, { a: 1, b: 3 })).toEqual({ before: { b: 2, c: 9 }, after: { b: 3 } });
  });

  it("sanitiza objetos aninhados e remove NUL", () => {
    const out = sanitize({ customer: { phone: "(86) 99876-1234", user: [{ passwordHash: "x", name: "A\u0000na" }] } });
    expect(out).toEqual({ customer: { phone: "(86) 9****-1234", user: [{ name: "Ana" }] } });
  });

  it("hash depende da chave (HMAC)", () => {
    expect(computeHash(null, row, "a".repeat(32))).not.toBe(computeHash(null, row, "b".repeat(32)));
  });
});
