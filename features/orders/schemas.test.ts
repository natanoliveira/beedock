import { describe, expect, it } from "vitest";
import { cancelSchema, orderFiltersSchema, orderSchema, orderUpdateSchema, paymentSchema } from "./schemas";

const base = { customerId: "c1", productTypeId: "p1", description: "20 camisas", total: "600,00", dueDate: "2026-10-30" };

describe("orderSchema", () => {
  it("converte total para centavos", () => {
    expect(orderSchema.parse(base)).toMatchObject({ customerId: "c1", totalCents: 60_000, dueDate: "2026-10-30" });
  });
  it("recusa total zero e acima de R$ 1.000.000,00", () => {
    for (const total of ["0", "1.000.000,01", ""]) {
      expect(orderSchema.safeParse({ ...base, total }).success).toBe(false);
    }
    expect(orderSchema.safeParse({ ...base, total: "1.000.000,00" }).success).toBe(true);
  });
  it("exige exatamente um de cliente existente ou novo", () => {
    const semCliente = { ...base, customerId: undefined };
    expect(orderSchema.safeParse(semCliente).success).toBe(false);
    expect(
      orderSchema.safeParse({ ...base, newCustomerName: "Ana", newCustomerPhone: "85988887777" }).success,
    ).toBe(false);
    const novo = orderSchema.parse({ ...semCliente, newCustomerName: "Ana", newCustomerPhone: "(85) 98888-7777" });
    expect(novo.newCustomer).toEqual({ name: "Ana", phone: "85988887777" });
  });
  it("cliente novo exige telefone válido", () => {
    const semCliente = { ...base, customerId: undefined };
    expect(orderSchema.safeParse({ ...semCliente, newCustomerName: "Ana", newCustomerPhone: "123" }).success).toBe(false);
  });
  it("sinal exige forma e data e não passa do total", () => {
    const dep = { depositAmount: "200,00", depositPaymentMethodId: "m1", depositPaidAt: "2026-10-22" };
    expect(orderSchema.parse({ ...base, ...dep }).deposit).toEqual({
      amountCents: 20_000,
      paymentMethodId: "m1",
      paidAt: "2026-10-22",
    });
    expect(orderSchema.safeParse({ ...base, depositAmount: "200,00" }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, ...dep, depositAmount: "600,01" }).success).toBe(false);
    expect(orderSchema.parse({ ...base, depositAmount: "", depositPaymentMethodId: "", depositPaidAt: "" }).deposit).toBeUndefined();
  });
  it("recusa descrição curta e data inexistente", () => {
    expect(orderSchema.safeParse({ ...base, description: "a" }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, dueDate: "2026-02-31" }).success).toBe(false);
  });
});

describe("orderUpdateSchema", () => {
  it("não traz cliente novo nem sinal", () => {
    const r = orderUpdateSchema.parse({ ...base, depositAmount: "10,00" });
    expect(r).not.toHaveProperty("deposit");
    expect(r.customerId).toBe("c1");
  });
});

describe("paymentSchema", () => {
  const p = { amount: "200,00", paymentMethodId: "m1", paidAt: "2026-10-22" };
  it("converte e exige forma", () => {
    expect(paymentSchema.parse(p)).toEqual({ amountCents: 20_000, paymentMethodId: "m1", paidAt: "2026-10-22" });
    expect(paymentSchema.safeParse({ ...p, paymentMethodId: "" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...p, amount: "0" }).success).toBe(false);
  });
});

describe("cancelSchema", () => {
  it("sem estorno é válido; estorno zero é recusado", () => {
    expect(cancelSchema.parse({ reason: "" })).toEqual({});
    const refund = { refundAmount: "50,00", refundPaymentMethodId: "m1", refundPaidAt: "2026-10-22" };
    expect(cancelSchema.parse({ reason: "desistiu", ...refund })).toEqual({
      reason: "desistiu",
      refund: { amountCents: 5000, paymentMethodId: "m1", paidAt: "2026-10-22" },
    });
    expect(cancelSchema.safeParse({ ...refund, refundAmount: "0" }).success).toBe(false);
    expect(cancelSchema.safeParse({ refundAmount: "5,00" }).success).toBe(false);
  });
});

describe("orderFiltersSchema", () => {
  it("padrão em andamento; status desconhecido cai no padrão", () => {
    expect(orderFiltersSchema.parse({})).toEqual({ status: "em-andamento", page: 1 });
    expect(orderFiltersSchema.parse({ status: "xx" }).status).toBe("em-andamento");
    expect(orderFiltersSchema.parse({ status: "a-receber", q: " #12 ", tipo: "p1", pagina: "3" })).toEqual({
      status: "a-receber",
      q: "#12",
      productTypeId: "p1",
      page: 3,
    });
  });
});
