import { describe, expect, it } from "vitest";
import { balanceCents, canTransition, dueLabel, isOverdue } from "./rules";

describe("canTransition", () => {
  it("avança e volta livremente entre Aberto, Pronto e Entregue", () => {
    expect(canTransition("OPEN", "READY")).toBe(true);
    expect(canTransition("READY", "OPEN")).toBe(true);
    expect(canTransition("READY", "DELIVERED")).toBe(true);
    expect(canTransition("DELIVERED", "READY")).toBe(true);
    expect(canTransition("OPEN", "DELIVERED")).toBe(true);
    expect(canTransition("DELIVERED", "OPEN")).toBe(true);
  });
  it("cancela só de Aberto ou Pronto", () => {
    expect(canTransition("OPEN", "CANCELED")).toBe(true);
    expect(canTransition("READY", "CANCELED")).toBe(true);
    expect(canTransition("DELIVERED", "CANCELED")).toBe(false);
  });
  it("cancelado é final e igual→igual é recusado", () => {
    for (const to of ["OPEN", "READY", "DELIVERED", "CANCELED"] as const) {
      expect(canTransition("CANCELED", to)).toBe(false);
      expect(canTransition(to, to)).toBe(false);
    }
  });
});

describe("saldo e prazo", () => {
  it("balanceCents", () => expect(balanceCents(60_000, 20_000)).toBe(40_000));
  it("isOverdue só quando a entrega é anterior a hoje", () => {
    expect(isOverdue("2026-10-21", "2026-10-22")).toBe(true);
    expect(isOverdue("2026-10-22", "2026-10-22")).toBe(false);
    expect(isOverdue("2026-10-23", "2026-10-22")).toBe(false);
  });
  it("dueLabel", () => {
    expect(dueLabel("2026-10-22", "2026-10-22")).toBe("hoje");
    expect(dueLabel("2026-10-23", "2026-10-22")).toBe("amanhã");
    expect(dueLabel("2026-11-01", "2026-10-31")).toBe("amanhã");
    expect(dueLabel("2026-10-27", "2026-10-22")).toBe("27/10");
  });
});
