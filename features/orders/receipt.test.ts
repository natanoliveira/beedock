import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildOrderReceiptPdf, orderReceiptLines, type OrderReceiptData } from "./receipt-pdf";

const base = (): OrderReceiptData => ({
  org: {
    name: "Estampa Arte",
    legalName: null,
    document: null,
    phone: null,
    email: null,
    zipCode: null,
    street: null,
    number: null,
    complement: null,
    district: null,
    city: "Teresina",
    state: "PI",
    logoUrl: null,
    timezone: "America/Fortaleza",
  },
  order: {
    number: 12,
    description: "20 camisas time Unidos",
    productType: "Camisa",
    dueDate: "2026-10-30",
    status: "OPEN",
    totalCents: 60_000,
    paidCents: 20_000,
    balanceCents: 40_000,
  },
  customer: { name: "Ana Souza", phone: "85988887777" },
  payments: [{ paidAt: "2026-10-22", method: "Pix", amountCents: 20_000 }],
  refund: null,
  issuedAt: new Date("2026-10-22T15:30:00Z"),
});

const all = (l: ReturnType<typeof orderReceiptLines>) =>
  [l.title, ...l.info, ...l.payments, l.totals.total, l.totals.paid, l.totals.balance, l.badge, l.refund].join("\n");

describe("orderReceiptLines", () => {
  it("traz número, cliente, descrição, recebimentos e totais", () => {
    const l = orderReceiptLines(base());
    const text = all(l);
    expect(l.title).toBe("PEDIDO #12");
    expect(text).toContain("Ana Souza");
    expect(text).toContain("(85) 98888-7777");
    expect(text).toContain("20 camisas time Unidos");
    expect(l.payments).toEqual(["22/10/2026 · Pix · R$ 200,00"]);
    expect(l.totals).toEqual({ total: "R$ 600,00", paid: "R$ 200,00", balance: "R$ 400,00" });
    expect(l.badge).toBeNull();
    expect(l.refund).toBeNull();
  });

  it("QUITADO só com saldo zero e não cancelado", () => {
    const paid = base();
    paid.order = { ...paid.order, paidCents: 60_000, balanceCents: 0 };
    expect(orderReceiptLines(paid).badge).toBe("QUITADO");
    expect(orderReceiptLines(base()).badge).toBeNull();
  });

  it("CANCELADO mostra o estorno e nunca QUITADO", () => {
    const d = base();
    d.order = { ...d.order, status: "CANCELED" };
    d.refund = { amountCents: 15_000, occurredOn: "2026-10-23" };
    const l = orderReceiptLines(d);
    expect(l.badge).toBe("CANCELADO");
    expect(l.refund).toBe("Estorno de R$ 150,00 em 23/10/2026");
  });

  it("cliente anonimizado não mostra telefone; sem recebimentos diz isso", () => {
    const d = base();
    d.customer = { name: "Cliente removido #ab12", phone: null };
    d.payments = [];
    const l = orderReceiptLines(d);
    expect(all(l)).not.toContain("(85)");
    expect(l.payments).toEqual(["Nenhum recebimento registrado."]);
  });
});

describe("buildOrderReceiptPdf", () => {
  it("gera PDF de uma página", async () => {
    const bytes = await buildOrderReceiptPdf(base(), null);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("descrição longa e muitos recebimentos continuam em PDF válido", async () => {
    const d = base();
    d.order.description = "camisa ".repeat(60);
    d.payments = Array.from({ length: 30 }, (_, i) => ({ paidAt: "2026-10-22", method: "Pix", amountCents: 100 + i }));
    expect((await PDFDocument.load(await buildOrderReceiptPdf(d, null))).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
