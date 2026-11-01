import { describe, expect, it } from "vitest";
import type { ReceiptOrg } from "@/features/transactions/pdf-kit";
import { buildReportPdf } from "./pdf";
import type { MonthlyReport } from "./service";

const org: ReceiptOrg = {
  name: "Estampa Arte", legalName: null, document: null, phone: null, email: null, zipCode: null, street: null,
  number: null, complement: null, district: null, city: null, state: null, logoUrl: null, timezone: "America/Fortaleza",
};
const empty: MonthlyReport = {
  month: { year: 2026, month: 3 }, range: { from: "2026-03-01", to: "2026-03-31" },
  incomeCents: 0, expenseCents: 0, profitCents: 0, incomeByCategory: [], expenseByCategory: [],
  last6: [], toReceiveCents: 0,
  orders: { created: { count: 0, totalCents: 0 }, delivered: { count: 0, totalCents: 0 }, canceled: { count: 0, refundedCents: 0 } },
};

describe("buildReportPdf", () => {
  it("gera PDF de mês vazio sem logo", async () => {
    const bytes = await buildReportPdf(org, empty, 1, "Maria", new Date(), null);
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
  });
});
