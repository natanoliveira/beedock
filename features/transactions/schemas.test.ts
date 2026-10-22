import { describe, expect, it } from "vitest";
import { listFiltersSchema, transactionSchema } from "./schemas";

const base = {
  type: "INCOME",
  amount: "150,00",
  occurredOn: "2026-10-20",
  categoryId: "cat1",
  description: "Venda de caixas",
};

const firstError = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) =>
  r.error?.issues.find((i) => i.path[0] === field)?.message;

describe("transactionSchema", () => {
  it("aceita entrada válida e converte o valor", () => {
    const r = transactionSchema.safeParse({ ...base, paymentMethodId: "", payerName: "", payerDocument: "" });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ type: "INCOME", amountCents: 15000, paymentMethodId: undefined, payerName: undefined });
  });
  it("entrada com pagador e CPF válido", () => {
    const r = transactionSchema.safeParse({ ...base, payerName: "Maria", payerDocument: "529.982.247-25" });
    expect(r.success).toBe(true);
    expect(r.data?.payerDocument).toBe("52998224725");
  });
  it("saída com pagador dá erro em payerName", () => {
    const r = transactionSchema.safeParse({ ...base, type: "EXPENSE", payerName: "Maria" });
    expect(firstError(r, "payerName")).toBeTruthy();
  });
  it("documento inválido", () => {
    const r = transactionSchema.safeParse({ ...base, payerDocument: "111.111.111-11" });
    expect(firstError(r, "payerDocument")).toBe("CPF ou CNPJ inválido.");
  });
  it("valor zero", () => {
    expect(firstError(transactionSchema.safeParse({ ...base, amount: "0" }), "amount")).toBe(
      "Informe um valor maior que zero.",
    );
  });
  it("valor acima do máximo", () => {
    expect(firstError(transactionSchema.safeParse({ ...base, amount: "2.000.000,00" }), "amount")).toBe(
      "Valor máximo de R$ 1.000.000,00.",
    );
    expect(firstError(transactionSchema.safeParse({ ...base, amount: "abc" }), "amount")).toBe(
      "Informe um valor maior que zero.",
    );
  });
  it("descrição curta e longa", () => {
    expect(firstError(transactionSchema.safeParse({ ...base, description: "a" }), "description")).toBeTruthy();
    expect(firstError(transactionSchema.safeParse({ ...base, description: "a".repeat(121) }), "description")).toBe(
      "Máximo de 120 caracteres.",
    );
  });
  it("data inválida e categoria ausente", () => {
    expect(firstError(transactionSchema.safeParse({ ...base, occurredOn: "2026-02-30" }), "occurredOn")).toBeTruthy();
    expect(firstError(transactionSchema.safeParse({ ...base, occurredOn: "" }), "occurredOn")).toBeTruthy();
    expect(firstError(transactionSchema.safeParse({ ...base, categoryId: "" }), "categoryId")).toBe(
      "Escolha uma categoria.",
    );
  });
  it("tipo inválido", () => {
    expect(firstError(transactionSchema.safeParse({ ...base, type: "X" }), "type")).toBeTruthy();
  });
  it("removeReceipt vira boolean", () => {
    expect(transactionSchema.parse({ ...base, removeReceipt: "on" }).removeReceipt).toBe(true);
    expect(transactionSchema.parse(base).removeReceipt).toBeUndefined();
  });
});

describe("listFiltersSchema", () => {
  it("padrões", () => {
    expect(listFiltersSchema.parse({})).toEqual({ page: 1 });
  });
  it("converte parâmetros", () => {
    expect(listFiltersSchema.parse({ mes: "2026-10", tipo: "saida", categoria: "c1", pagina: "3" })).toEqual({
      month: { year: 2026, month: 10 },
      type: "EXPENSE",
      categoryId: "c1",
      page: 3,
    });
    expect(listFiltersSchema.parse({ tipo: "entrada" }).type).toBe("INCOME");
  });
  it("valores inválidos caem no padrão", () => {
    expect(listFiltersSchema.parse({ mes: "x", tipo: "y", categoria: "", pagina: "-2" })).toEqual({ page: 1 });
    expect(listFiltersSchema.parse({ pagina: "abc" }).page).toBe(1);
    expect(listFiltersSchema.parse({ pagina: "99999999999999999999" }).page).toBe(1);
    expect(listFiltersSchema.parse({ pagina: "10001" }).page).toBe(1);
    expect(listFiltersSchema.parse({ pagina: "10000" }).page).toBe(10000);
  });
});
