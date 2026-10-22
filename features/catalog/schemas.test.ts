import { describe, expect, it } from "vitest";
import { categorySchema, paymentMethodSchema } from "./schemas";

describe("categorySchema", () => {
  it("rejeita nome curto após trim", () => {
    const r = categorySchema.safeParse({ name: " a ", type: "EXPENSE" });
    expect(r.error?.issues[0].message).toBe("Mínimo de 2 caracteres.");
  });
  it("aceita nome válido", () => {
    expect(categorySchema.parse({ name: " Insumos ", type: "EXPENSE" })).toEqual({ name: "Insumos", type: "EXPENSE" });
  });
  it("rejeita nome longo e tipo inválido", () => {
    expect(categorySchema.safeParse({ name: "a".repeat(41), type: "INCOME" }).success).toBe(false);
    expect(categorySchema.safeParse({ name: "Vendas", type: "X" }).success).toBe(false);
  });
});

describe("paymentMethodSchema", () => {
  it("valida nome", () => {
    expect(paymentMethodSchema.parse({ name: " Pix " })).toEqual({ name: "Pix" });
    expect(paymentMethodSchema.safeParse({ name: "" }).success).toBe(false);
    expect(paymentMethodSchema.safeParse({ name: "a".repeat(41) }).error?.issues[0].message).toBe(
      "Máximo de 40 caracteres.",
    );
  });
});
