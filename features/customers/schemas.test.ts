import { describe, expect, it } from "vitest";
import { anonymizeSchema, customerFiltersSchema, customerSchema } from "./schemas";

const ok = { name: "Maria Souza", phone: "(85) 98888-7777" };

describe("customerSchema", () => {
  it("normaliza telefone e documento para dígitos", () => {
    const r = customerSchema.parse({ ...ok, document: "529.982.247-25", email: "", address: " " });
    expect(r).toMatchObject({ name: "Maria Souza", phone: "85988887777", document: "52998224725" });
    expect(r.email).toBeUndefined();
    expect(r.address).toBeUndefined();
  });
  it("aceita telefone fixo de 10 dígitos", () => {
    expect(customerSchema.parse({ ...ok, phone: "8533334444" }).phone).toBe("8533334444");
  });
  it("recusa nome vazio, 1 letra e só espaços", () => {
    for (const name of ["", "A", "   "]) expect(customerSchema.safeParse({ ...ok, name }).success).toBe(false);
  });
  it("recusa telefone de 9 dígitos e de 12", () => {
    for (const phone of ["985555555", "859888877777"]) {
      expect(customerSchema.safeParse({ ...ok, phone }).success).toBe(false);
    }
  });
  it("recusa documento inválido e e-mail inválido", () => {
    expect(customerSchema.safeParse({ ...ok, document: "111.111.111-11" }).success).toBe(false);
    expect(customerSchema.safeParse({ ...ok, email: "x" }).success).toBe(false);
  });
});

describe("anonymizeSchema", () => {
  it("motivo de 10 a 500 caracteres", () => {
    expect(anonymizeSchema.safeParse({ reason: "123456789" }).success).toBe(false);
    expect(anonymizeSchema.safeParse({ reason: "1234567890" }).success).toBe(true);
    expect(anonymizeSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("customerFiltersSchema", () => {
  it("página inválida vira 1 e aba revisar é reconhecida", () => {
    expect(customerFiltersSchema.parse({ pagina: "x" })).toMatchObject({ page: 1 });
    expect(customerFiltersSchema.parse({ aba: "revisar", q: " ana " })).toMatchObject({ review: true, q: "ana" });
  });
});
